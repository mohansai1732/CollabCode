import crypto from 'crypto';
import admin, { db } from '../config/firebaseAdmin.js';
import { clerkClient } from '@clerk/express';
import { getIO, disconnectRoomUser, closeYjsRoom } from '../sockets/socketManager.js';
import { validId, requireUserId } from '../utils/validation.js';

const TIERS = {
  free: { rooms: 10, maxParticipants: 10 },
  pro: { rooms: Infinity, maxParticipants: Infinity },
};

const now = () => admin.firestore.Timestamp.now();
const array = value => Array.isArray(value) ? value : [];
const collaboratorId = entry => typeof entry === 'string' ? entry : entry?.userId;
const normalizeCollaborators = value => array(value).map(entry => typeof entry === 'string'
  ? { userId: entry, joinedAt: now(), muted: false, mutedReason: null }
  : { muted: false, mutedReason: null, ...entry });

export function isProUser(userData) {
  if (!userData) return false;
  const subscription = userData.subscription || {};
  const tier = String(subscription.tier || subscription.plan || 'free').toLowerCase().trim();
  if (tier !== 'pro') return false;

  const status = String(subscription.status || '').toLowerCase().trim();
  if (status !== 'active') {
    return false;
  }

  const endRaw = subscription.endDate || subscription.expiresAt || subscription.endsAt;
  if (endRaw) {
    let endDate;
    if (typeof endRaw.toDate === 'function') {
      endDate = endRaw.toDate();
    } else if (typeof endRaw === 'number') {
      endDate = new Date(endRaw);
    } else if (typeof endRaw === 'string') {
      endDate = new Date(endRaw);
    } else if (endRaw instanceof Date) {
      endDate = endRaw;
    }

    if (endDate && !isNaN(endDate.getTime()) && endDate.getTime() < Date.now()) {
      return false;
    }
  }

  return true;
}

export function subscriptionFor(user) {
  const activePro = isProUser(user);
  const subscription = user?.subscription || {};
  const status = (subscription.status || 'active').toLowerCase();
  const isCancelled = status === 'cancelled' || status === 'canceled';

  return {
    tier: activePro ? 'pro' : 'free',
    plan: activePro ? 'pro' : 'free',
    status: activePro
      ? (isCancelled ? 'cancelled' : 'active')
      : ((subscription.tier === 'pro' || subscription.plan === 'pro') ? 'expired' : 'active'),
    startDate: subscription.startDate || subscription.startedAt || null,
    endDate: subscription.endDate || subscription.expiresAt || null,
    invoice: subscription.invoice || null,
  };
}

export function isMember(room, userId) {
  return room.ownerId === userId || normalizeCollaborators(room.collaborators).some(c => c.userId === userId);
}

function publicRoom(doc) { return { id: doc.id, ...doc.data(), collaborators: normalizeCollaborators(doc.data().collaborators) }; }
function audit(action, actorId, targetId, roomId) { console.info(JSON.stringify({ audit: action, actorId, targetId: targetId || null, roomId, timestamp: new Date().toISOString() })); }

export async function recalculateEditAccess(roomRef, room, transaction) {
  const owner = await transaction.get(db.collection('users').doc(room.ownerId));
  const isOwnerPro = isProUser(owner.data());
  const limit = isOwnerPro ? TIERS.pro.maxParticipants : TIERS.free.maxParticipants;
  const collaborators = normalizeCollaborators(room.collaborators).sort((a, b) => (a.joinedAt?.toMillis?.() || 0) - (b.joinedAt?.toMillis?.() || 0));
  // The owner is an editor; earliest joined collaborators receive remaining slots.
  const updated = collaborators.map((c, index) => index < limit - 1
    ? (c.mutedReason === 'planLimit' ? { ...c, muted: false, mutedReason: null } : c)
    : { ...c, muted: true, mutedReason: 'planLimit' });
  transaction.update(roomRef, { collaborators: updated });
  return updated;
}

function emitRoom(roomId, event, payload) { getIO()?.to(`app:${roomId}`).emit(event, payload); }

export async function getUserRooms(req, res, next) {
  try {
    const userId = req.params.userId;
    if (!requireUserId(userId, res)) return;
    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return res.json({ rooms: [], subscription: { tier: 'free', plan: 'free', status: 'active' } });
    const data = userDoc.data();
    const roomDocs = await Promise.all(array(data.rooms).map(id => db.collection('rooms').doc(id).get()));
    res.json({ rooms: roomDocs.filter(doc => doc.exists).map(publicRoom), subscription: subscriptionFor(data) });
  } catch (error) { next(error); }
}

async function countCreatedRooms(userId, userDocData) {
  const ownedRoomIds = new Set();
  const uid = String(userId).trim();

  // 1. Inspect all room IDs listed under user's profile
  const userRoomIds = array(userDocData?.rooms).map(id => String(id).trim()).filter(Boolean);
  if (userRoomIds.length > 0) {
    const roomDocs = await Promise.all(
      userRoomIds.map(id => db.collection('rooms').doc(id).get().catch(() => null))
    );
    for (const doc of roomDocs) {
      if (doc && doc.exists) {
        const data = doc.data() || {};
        const isCollaborator = normalizeCollaborators(data.collaborators).some(
          c => String(c.userId || c).trim() === uid
        );
        const isExplicitOwner = String(data.ownerId || data.createdBy || data.hostId || data.creatorId || '').trim() === uid;

        // If explicitly owner OR not listed as a joined collaborator (creator is host, not in collaborators)
        if (isExplicitOwner || !isCollaborator) {
          ownedRoomIds.add(doc.id);
        }
      }
    }
  }

  // 2. Query rooms collection across all owner identifier fields (ownerId, createdBy, hostId, creatorId)
  try {
    const [ownerSnap, createdBySnap, hostSnap, creatorSnap] = await Promise.allSettled([
      db.collection('rooms').where('ownerId', '==', uid).get(),
      db.collection('rooms').where('createdBy', '==', uid).get(),
      db.collection('rooms').where('hostId', '==', uid).get(),
      db.collection('rooms').where('creatorId', '==', uid).get()
    ]);
    [ownerSnap, createdBySnap, hostSnap, creatorSnap].forEach(res => {
      if (res.status === 'fulfilled' && res.value) {
        res.value.forEach(doc => {
          if (doc.exists) ownedRoomIds.add(doc.id);
        });
      }
    });
  } catch (err) {
    console.warn('Rooms collection query warning:', err.message);
  }

  return ownedRoomIds.size;
}

export async function createRoom(req, res, next) {
  try {
    const userId = req.body.userId;
    if (!requireUserId(userId, res)) return;
    const name = String(req.body.name || 'New Room').trim().slice(0, 120);
    const ownerName = String(req.body.ownerName || 'Unknown').trim().slice(0, 120);
    if (!name) return res.status(400).json({ message: 'Room name required.' });

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    const userData = userDoc.exists ? userDoc.data() : {};
    const isPro = isProUser(userData);

    if (!isPro) {
      const owned = await countCreatedRooms(userId, userData);
      if (owned >= TIERS.free.rooms) {
        return res.status(403).json({
          message: 'Free plan allows a maximum of 10 created rooms. Upgrade to Pro for unlimited rooms.'
        });
      }
    }

    const roomId = crypto.randomBytes(4).toString('hex').slice(0, 6);
    await db.runTransaction(async transaction => {
      const latestUserDoc = await transaction.get(userRef);
      const latestData = latestUserDoc.exists ? latestUserDoc.data() : {};
      const latestIsPro = isProUser(latestData);
      
      if (!latestIsPro) {
        const owned = await countCreatedRooms(userId, latestData);
        if (owned >= TIERS.free.rooms) {
          const error = new Error('Free plan allows a maximum of 10 created rooms. Upgrade to Pro for unlimited rooms.');
          error.status = 403;
          throw error;
        }
      }

      transaction.set(db.collection('rooms').doc(roomId), {
        name,
        ownerId: userId,
        createdBy: userId,
        ownerName,
        collaborators: [],
        pendingRequests: [],
        createdAt: now()
      });
      transaction.set(userRef, {
        fullName: ownerName,
        rooms: admin.firestore.FieldValue.arrayUnion(roomId),
        subscription: latestData.subscription || { tier: 'free', status: 'active' }
      }, { merge: true });
    });
    audit('room.create', userId, null, roomId);
    res.status(201).json({ roomId, name });
  } catch (error) { next(error); }
}

export async function getRoomById(req, res, next) {
  try {
    const roomId = req.params.roomId;
    if (!validId(roomId)) return res.status(400).json({ message: 'Invalid room ID.' });
    const doc = await db.collection('rooms').doc(roomId).get();
    if (!doc.exists) return res.status(404).json({ message: 'Room not found.' });
    const userId = req.query.userId;
    if (!requireUserId(userId, res)) return;
    if (!isMember(doc.data(), userId)) return res.status(403).json({ message: 'You are not a collaborator in this room.' });
    res.json({ room: publicRoom(doc) });
  } catch (error) { next(error); }
}

export async function requestJoin(req, res, next) {
  try {
    const userId = req.body?.userId;
    const roomId = typeof req.body?.roomId === 'string' ? req.body.roomId.trim() : '';
    if (!requireUserId(userId, res)) return;
    if (!roomId) return res.status(400).json({ message: 'Missing: roomId.' });
    if (!validId(roomId)) return res.status(400).json({ message: 'Invalid room ID.' });
    let ownerId;
    await db.runTransaction(async transaction => {
      const ref = db.collection('rooms').doc(roomId);
      const doc = await transaction.get(ref);
      if (!doc.exists) { const error = new Error('Room not found.'); error.status = 404; throw error; }
      const room = doc.data();
      ownerId = room.ownerId;
      if (isMember(room, userId) || array(room.pendingRequests).some(r => r.userId === userId)) return;

      const owner = await transaction.get(db.collection('users').doc(room.ownerId));
      const isOwnerPro = isProUser(owner.data());
      const totalParticipants = 1 + normalizeCollaborators(room.collaborators).length; // Host (1) + existing collaborators
      const maxParticipants = isOwnerPro ? TIERS.pro.maxParticipants : TIERS.free.maxParticipants;
      if (totalParticipants >= maxParticipants) {
        const error = new Error('This room has reached the maximum of 10 users for the Free plan.');
        error.status = 403;
        throw error;
      }

      // Maintain both the detailed object array and the simple string array for Firestore querying
      transaction.update(ref, {
        pendingRequests: [...array(room.pendingRequests), { id: crypto.randomUUID(), userId, requestedAt: now() }],
        pendingUserIds: admin.firestore.FieldValue.arrayUnion(userId)
      });
    });
    // Application socket only: notifications and membership state never use Yjs.
    emitRoom(roomId, 'room:request-created', { roomId, userId, ownerId });
    res.json({ ok: true });
  } catch (error) { next(error); }
}

export async function listRequests(req, res, next) {
  try {
    const roomId = req.params.roomId; const doc = await db.collection('rooms').doc(roomId).get();
    if (!doc.exists) return res.status(404).json({ message: 'Room not found.' });
    const userId = req.query.userId;
    if (!requireUserId(userId, res)) return;
    if (doc.data().ownerId !== userId) return res.status(403).json({ message: 'Only the room owner can view requests.' });
    res.json({ requests: array(doc.data().pendingRequests) });
  } catch (error) { next(error); }
}

export async function fetchMyRequests(req, res, next) {
  try {
    const userId = req.params.userId;

    if (!requireUserId(userId, res)) return;

    const snapshot = await db.collection('rooms')
      .where('pendingUserIds', 'array-contains', userId)
      .get();

    const requests = [];

    snapshot.docs.forEach(doc => {
      const room = doc.data();

      const request = array(room.pendingRequests).find(
        r => r.userId === userId
      );

      if (!request) return;

      requests.push({
        id: request.id,
        roomId: doc.id,
        roomName: room.name || 'Unnamed Room',
        ownerId: room.ownerId,
        ownerName: room.ownerName || 'Unknown',
        requestedAt: request.requestedAt,
      });
    });

    res.json({ requests });

  } catch (error) {
    next(error);
  }
}

export async function decideRequest(req, res, next) {
  try {
    const { roomId, userId: targetUserId } = req.params; const actorId = req.body.userId; const accepted = req.body.accept === true;
    if (!validId(roomId) || !validId(targetUserId) || !requireUserId(actorId, res)) return res.status(400).json({ message: 'Invalid identifier.' });
    let collaborators;
    await db.runTransaction(async transaction => {
      const ref = db.collection('rooms').doc(roomId); const doc = await transaction.get(ref);
      if (!doc.exists) { const error = new Error('Room not found.'); error.status = 404; throw error; }
      const room = doc.data();
      if (room.ownerId !== actorId) { const error = new Error('Only the room owner can manage requests.'); error.status = 403; throw error; }
      const pending = array(room.pendingRequests);
      if (!pending.some(r => r.userId === targetUserId)) return;
      collaborators = normalizeCollaborators(room.collaborators);
      if (accepted) {
        const owner = await transaction.get(db.collection('users').doc(room.ownerId));
        const isOwnerPro = isProUser(owner.data());
        const totalParticipants = 1 + collaborators.length; // Host (1) + existing collaborators
        const maxParticipants = isOwnerPro ? TIERS.pro.maxParticipants : TIERS.free.maxParticipants;
        if (totalParticipants >= maxParticipants) {
          const error = new Error('This room has reached the maximum of 10 users for the Free plan.');
          error.status = 403;
          throw error;
        }
        collaborators.push({ userId: targetUserId, joinedAt: now(), muted: false, mutedReason: null });
        transaction.set(db.collection('users').doc(targetUserId), { rooms: admin.firestore.FieldValue.arrayUnion(roomId) }, { merge: true });
      }
      transaction.update(ref, {
        pendingRequests: pending.filter(r => r.userId !== targetUserId),
        pendingUserIds: admin.firestore.FieldValue.arrayRemove(targetUserId),
        collaborators
      });
    });
    audit(accepted ? 'request.accept' : 'request.reject', actorId, targetUserId, roomId);
    emitRoom(roomId, accepted ? 'room:member-joined' : 'room:request-rejected', { roomId, userId: targetUserId, collaborators });
    getIO()?.to(`user:${targetUserId}`).emit(accepted ? 'room:request-accepted' : 'room:request-rejected', { roomId });
    res.json({ ok: true });
  } catch (error) { next(error); }
}

export async function cancelJoinRequest(req, res, next) {
  try {
    const requestId = req.params.requestId; const actorId = req.body.userId;
    if (!validId(requestId) || !requireUserId(actorId, res)) return res.status(400).json({ message: 'Invalid identifier.' });
    let roomId;
    await db.runTransaction(async transaction => {
      const roomsSnapshot = await transaction.get(db.collection('rooms').where('pendingUserIds', 'array-contains', actorId));
      const roomDoc = roomsSnapshot.docs.find(doc => array(doc.data().pendingRequests).some(r => r.userId === actorId && r.id === requestId));
      if (!roomDoc) { const error = new Error('Join request not found.'); error.status = 404; throw error; }
      roomId = roomDoc.id;
      const pending = array(roomDoc.data().pendingRequests);
      transaction.update(roomDoc.ref, {
        pendingRequests: pending.filter(r => r.userId !== actorId || r.id !== requestId),
        pendingUserIds: admin.firestore.FieldValue.arrayRemove(actorId)
      });
    });
    audit('request.cancel', actorId, null, roomId);
    emitRoom(roomId, 'room:request-cancelled', { roomId, userId: actorId });
    res.json({ ok: true });
  } catch (error) { next(error); }
}

export async function removeCollaborator(req, res, next) {
  try {
    const { roomId, userId } = req.params; const actorId = req.body.userId;
    if (!requireUserId(actorId, res)) return;
    if (actorId === userId) return res.status(400).json({ message: 'Room owners cannot remove themselves.' });
    let ownerName = 'Host';
    await db.runTransaction(async transaction => {
      const ref = db.collection('rooms').doc(roomId); const doc = await transaction.get(ref);
      if (!doc.exists) { const error = new Error('Room not found.'); error.status = 404; throw error; }
      const room = doc.data();
      ownerName = room.ownerName || 'Host';
      if (room.ownerId !== actorId) { const error = new Error('Only the room owner can remove collaborators.'); error.status = 403; throw error; }
      transaction.update(ref, { collaborators: normalizeCollaborators(room.collaborators).filter(c => c.userId !== userId) });
      transaction.set(db.collection('users').doc(userId), { rooms: admin.firestore.FieldValue.arrayRemove(roomId) }, { merge: true });
    });
    audit('collaborator.remove', actorId, userId, roomId);
    // Application socket room membership and Yjs document provider are independently cleaned up.
    getIO()?.to(`user:${userId}`).emit('room:removed', { roomId, hostName: ownerName }); disconnectRoomUser(roomId, userId, ownerName);
    emitRoom(roomId, 'room:member-removed', { roomId, userId });
    res.json({ ok: true });
  } catch (error) { next(error); }
}

export async function setMute(req, res, next) {
  try {
    const { roomId, userId } = req.params; const actorId = req.body.userId; const muted = req.body.muted === true;
    if (!requireUserId(actorId, res)) return;
    if (actorId === userId) return res.status(400).json({ message: 'Room owners cannot mute themselves.' });
    let collaborator;
    await db.runTransaction(async transaction => {
      const ref = db.collection('rooms').doc(roomId); const doc = await transaction.get(ref);
      if (!doc.exists) { const error = new Error('Room not found.'); error.status = 404; throw error; }
      const room = doc.data(); if (room.ownerId !== actorId) { const error = new Error('Only the room owner can mute collaborators.'); error.status = 403; throw error; }
      const collaborators = normalizeCollaborators(room.collaborators); collaborator = collaborators.find(c => c.userId === userId);
      if (!collaborator) { const error = new Error('Collaborator not found.'); error.status = 404; throw error; }
      if (collaborator.mutedReason === 'planLimit') { const error = new Error('Upgrade to Pro to restore edit access for more collaborators.'); error.status = 403; throw error; }
      collaborator.muted = muted; collaborator.mutedReason = muted ? 'host' : null; transaction.update(ref, { collaborators });
    });
    audit(muted ? 'collaborator.mute' : 'collaborator.unmute', actorId, userId, roomId);
    emitRoom(roomId, 'room:member-updated', { roomId, collaborator });
    res.json({ ok: true, collaborator });
  } catch (error) { next(error); }
}

export async function deleteRoom(req, res, next) {
  try {
    const roomId = req.params.roomId; const actorId = req.query.userId; let userIds = [];
    if (!requireUserId(actorId, res)) return;
    await db.runTransaction(async transaction => {
      const ref = db.collection('rooms').doc(roomId); const doc = await transaction.get(ref);
      if (!doc.exists) { const error = new Error('Room not found.'); error.status = 404; throw error; }
      const room = doc.data(); if (room.ownerId !== actorId) { const error = new Error('Only the room owner can delete a room.'); error.status = 403; throw error; }
      userIds = [room.ownerId, ...normalizeCollaborators(room.collaborators).map(c => c.userId)];
      userIds.forEach(id => transaction.set(db.collection('users').doc(id), { rooms: admin.firestore.FieldValue.arrayRemove(roomId) }, { merge: true }));
      transaction.delete(ref);
    });
    audit('room.delete', actorId, null, roomId);
    userIds.forEach(id => getIO()?.to(`user:${id}`).emit('room:deleted', { roomId })); closeYjsRoom(roomId); emitRoom(roomId, 'room:deleted', { roomId });
    res.json({ ok: true, action: 'deleted' });
  } catch (error) { next(error); }
}

export async function upgradeSubscription(req, res, next) {
  try {
    const userId = req.body.userId;
    const clientIsAdmin = req.body.isAdmin === true;
    if (!requireUserId(userId, res)) return;

    // Verify admin role
    let isAdmin = clientIsAdmin;
    try {
      if (process.env.CLERK_SECRET_KEY) {
        const clerkUser = await clerkClient.users.getUser(userId);
        isAdmin = clerkUser?.publicMetadata?.role === 'admin' || clerkUser?.privateMetadata?.role === 'admin';
      }
    } catch (e) {
      console.warn('Clerk user lookup error for admin verification:', e.message);
    }

    if (!isAdmin) {
      return res.status(403).json({ message: 'This feature is currently unavailable.' });
    }

    const startDate = now();
    const endDate = admin.firestore.Timestamp.fromDate(new Date(Date.now() + 90 * 86400_000));
    const subscription = {
      tier: 'pro',
      plan: 'pro',
      status: 'active',
      startDate,
      endDate,
      invoice: {
        invoiceId: crypto.randomUUID(),
        amount: '$0.00 (Admin Trial)',
        date: startDate,
        validUntil: endDate
      }
    };
    await db.collection('users').doc(userId).set({ subscription }, { merge: true });
    audit('subscription.upgrade', userId, null, null);
    getIO()?.to(`user:${userId}`).emit('subscription:updated', subscription);
    res.json({ subscription });
  } catch (error) { next(error); }
}

export async function cancelSubscription(req, res, next) {
  try {
    const userId = req.body.userId;
    if (!requireUserId(userId, res)) return;

    const userRef = db.collection('users').doc(userId);
    const userDoc = await userRef.get();
    if (!userDoc.exists) return res.status(404).json({ message: 'User not found.' });

    const currentSub = userDoc.data().subscription || {};
    const updatedSub = {
      ...currentSub,
      status: 'cancelled',
    };

    await userRef.set({ subscription: updatedSub }, { merge: true });
    audit('subscription.cancel', userId, null, null);
    getIO()?.to(`user:${userId}`).emit('subscription:updated', updatedSub);
    res.json({ subscription: subscriptionFor({ subscription: updatedSub }) });
  } catch (error) { next(error); }
}

export async function leaveRoom(req, res, next) {
  try {
    const roomId = req.params.roomId;
    const userId = req.query.userId;

    if (!requireUserId(userId, res)) return;

    await db.runTransaction(async transaction => {
      const ref = db.collection('rooms').doc(roomId);
      const doc = await transaction.get(ref);

      if (!doc.exists) {
        const error = new Error('Room not found.');
        error.status = 404;
        throw error;
      }

      const room = doc.data();

      if (room.ownerId === userId) {
        const error = new Error('Room owners cannot leave their own room.');
        error.status = 400;
        throw error;
      }

      const collaborators = normalizeCollaborators(room.collaborators);

      transaction.update(ref, {
        collaborators: collaborators.filter(c => c.userId !== userId)
      });

      transaction.set(
        db.collection('users').doc(userId),
        { rooms: admin.firestore.FieldValue.arrayRemove(roomId) },
        { merge: true }
      );
    });

    audit('room.leave', userId, null, roomId);

    getIO()?.to(`user:${userId}`).emit('room:removed', { roomId });
    disconnectRoomUser(roomId, userId);
    emitRoom(roomId, 'room:member-removed', { roomId, userId });

    res.json({ ok: true, action: 'left' });
  } catch (error) {
    next(error);
  }
}

// Fetch basic metadata for invite links / validation
export const getRoomInviteInfo = async (req, res) => {
  try {
    const { roomId } = req.params;
    const roomRef = db.collection('rooms').doc(roomId);
    const snap = await roomRef.get();

    if (!snap.exists) {
      return res.status(404).json({ message: 'Room not found' });
    }

    const data = snap.data();

    return res.json({
      room: {
        id: snap.id,
        name: data.name,
        language: data.language,
        ownerId: data.ownerId,
        ownerName: data.ownerName || 'Host'
      }
    });
  } catch (err) {
    console.error('Error fetching invite room info:', err);
    return res.status(500).json({ message: 'Failed to fetch room metadata' });
  }
};