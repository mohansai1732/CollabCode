import admin from '../config/firebaseAdmin.js';
import { clerkClient } from '@clerk/express';

const db = admin.firestore();

// 1. Get Admin Overview Stats
export const getAdminStats = async (req, res) => {
  try {
    let usersCount = 0;
    let roomsCount = 0;
    let activeSubsCount = 0;

    // Users Count
    try {
      usersCount = (await db.collection('users').count().get()).data().count;
    } catch (e) {
      const snap = await db.collection('users').get();
      usersCount = snap.size;
    }

    // Rooms Count
    try {
      roomsCount = (await db.collection('rooms').count().get()).data().count;
    } catch (e) {
      const snap = await db.collection('rooms').get();
      roomsCount = snap.size;
    }

    // Active Subscriptions Count (users with active pro or active subscriptions)
    try {
      const usersSnap = await db.collection('users').get();
      usersSnap.docs.forEach(doc => {
        const sub = doc.data()?.subscription;
        if (sub && (sub.status === 'active' || sub.tier === 'pro' || sub.plan === 'pro')) {
          activeSubsCount++;
        }
      });
    } catch (e) {
      console.warn('Subscription count calculation warning:', e.message);
    }

    // Fallback: If Clerk secret key is available, ensure we also count Clerk-registered users
    if (process.env.CLERK_SECRET_KEY) {
      try {
        const clerkRes = await clerkClient.users.getUserList({ limit: 100 });
        const count = Array.isArray(clerkRes) ? clerkRes.length : (clerkRes?.data?.length || clerkRes?.totalCount || 0);
        usersCount = Math.max(usersCount, count);
      } catch (err) {
        // Clerk lookup optional fallback
      }
    }

    res.json({ usersCount, roomsCount, activeSubsCount });
  } catch (error) {
    console.error('Error fetching admin stats:', error);
    res.status(500).json({ error: 'Failed to fetch admin stats' });
  }
};

// 2. Get All Users (merged with subscription and profile details)
export const getAllUsers = async (req, res) => {
  try {
    const userMap = new Map();

    // Fetch from Firestore
    try {
      const snapshot = await db.collection('users').get();
      snapshot.docs.forEach(doc => {
        const data = doc.data() || {};
        let createdAtFormatted = 'N/A';
        if (data.createdAt) {
          if (typeof data.createdAt.toDate === 'function') {
            createdAtFormatted = data.createdAt.toDate().toLocaleString();
          } else if (data.createdAt._seconds) {
            createdAtFormatted = new Date(data.createdAt._seconds * 1000).toLocaleString();
          } else if (typeof data.createdAt === 'string' || typeof data.createdAt === 'number') {
            createdAtFormatted = new Date(data.createdAt).toLocaleString();
          }
        }

        userMap.set(doc.id, {
          ...data,
          id: doc.id,
          name: data.fullName || data.name || data.displayName || 'Unknown User',
          fullName: data.fullName || data.name || data.displayName || 'Unknown User',
          email: data.email || 'N/A',
          role: data.role || (data.isAdmin ? 'admin' : 'user'),
          subscription: data.subscription || { plan: 'free', tier: 'free', status: 'active' },
          roomsCount: Array.isArray(data.rooms) ? data.rooms.length : 0,
          createdAt: createdAtFormatted
        });
      });
    } catch (err) {
      console.warn('Firestore fetch users warning:', err.message);
    }

    // Enrich with Clerk users if available
    if (process.env.CLERK_SECRET_KEY) {
      try {
        const clerkRes = await clerkClient.users.getUserList({ limit: 100 });
        const clerkUsers = Array.isArray(clerkRes) ? clerkRes : (clerkRes?.data || []);

        clerkUsers.forEach(cu => {
          const existing = userMap.get(cu.id) || {};
          const primaryEmail = cu.emailAddresses?.find(e => e.id === cu.primaryEmailAddressId)?.emailAddress
            || cu.emailAddresses?.[0]?.emailAddress
            || existing.email
            || 'N/A';
          const name = [cu.firstName, cu.lastName].filter(Boolean).join(' ') 
            || cu.username 
            || existing.fullName 
            || existing.name 
            || 'User';

          userMap.set(cu.id, {
            ...existing,
            id: cu.id,
            email: primaryEmail,
            name: name,
            fullName: name,
            role: cu.publicMetadata?.role || existing.role || 'user',
            subscription: existing.subscription || { 
              plan: cu.publicMetadata?.plan || 'free', 
              tier: cu.publicMetadata?.plan || 'free', 
              status: cu.publicMetadata?.subscriptionStatus || 'active' 
            },
            imageUrl: cu.imageUrl || null,
            createdAt: cu.createdAt ? new Date(cu.createdAt).toLocaleString() : existing.createdAt || 'N/A'
          });
        });
      } catch (err) {
        console.warn('Clerk user list enrichment skipped:', err.message);
      }
    }

    const users = Array.from(userMap.values());
    res.json(users);
  } catch (error) {
    console.error('Error fetching users:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
};

// 3. Get All Rooms
export const getAllRooms = async (req, res) => {
  try {
    const snapshot = await db.collection('rooms').get();
    const rooms = snapshot.docs.map(doc => {
      const data = doc.data() || {};
      let createdAtFormatted = 'N/A';
      if (data.createdAt) {
        if (typeof data.createdAt.toDate === 'function') {
          createdAtFormatted = data.createdAt.toDate().toLocaleString();
        } else if (data.createdAt._seconds) {
          createdAtFormatted = new Date(data.createdAt._seconds * 1000).toLocaleString();
        } else if (typeof data.createdAt === 'string' || typeof data.createdAt === 'number') {
          createdAtFormatted = new Date(data.createdAt).toLocaleString();
        }
      }

      return {
        ...data,
        id: doc.id,
        name: data.name || 'Untitled Room',
        ownerId: data.ownerId || data.createdBy || 'Unknown',
        ownerName: data.ownerName || 'Host',
        collaboratorsCount: Array.isArray(data.collaborators) ? data.collaborators.length : 0,
        createdAt: createdAtFormatted
      };
    });

    res.json(rooms);
  } catch (error) {
    console.error('Error fetching rooms:', error);
    res.status(500).json({ error: 'Failed to fetch rooms' });
  }
};

// 4. Terminate / Delete Room (Admin)
export const deleteRoomAdmin = async (req, res) => {
  try {
    const { roomId } = req.params;
    const roomRef = db.collection('rooms').doc(roomId);
    const doc = await roomRef.get();

    if (doc.exists) {
      const data = doc.data() || {};
      const userIds = [data.ownerId, ...(Array.isArray(data.collaborators) ? data.collaborators.map(c => typeof c === 'string' ? c : c.userId) : [])].filter(Boolean);
      for (const uid of userIds) {
        await db.collection('users').doc(uid).set({
          rooms: admin.firestore.FieldValue.arrayRemove(roomId)
        }, { merge: true }).catch(() => null);
      }
      await roomRef.delete();
    }

    res.json({ success: true, message: 'Room terminated successfully' });
  } catch (error) {
    console.error('Error deleting room:', error);
    res.status(500).json({ error: 'Failed to delete room' });
  }
};

// 5. Delete User (Admin)
export const deleteUserAdmin = async (req, res) => {
  try {
    const { userId } = req.params;

    // Delete from Firebase Firestore
    await db.collection('users').doc(userId).delete();

    // Delete from Clerk Authentication if configured
    if (process.env.CLERK_SECRET_KEY) {
      try {
        await clerkClient.users.deleteUser(userId);
      } catch (err) {
        console.warn('Clerk delete user skipped:', err.message);
      }
    }

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
};

// 6. Update User Subscription (Admin)
export const updateSubscription = async (req, res) => {
  try {
    const { userId } = req.params;
    const { plan, status, expiresAt } = req.body;

    if (!plan || !status) {
      return res.status(400).json({ error: 'Plan and status are required' });
    }

    const subscriptionData = {
      plan,
      tier: plan,
      status,
      expiresAt: expiresAt || null,
      updatedAt: new Date().toISOString()
    };

    // 1. Update subscription in Firestore
    await db.collection('users').doc(userId).set(
      { subscription: subscriptionData },
      { merge: true }
    );

    // 2. Sync subscription role/plan with Clerk public metadata if available
    if (process.env.CLERK_SECRET_KEY) {
      try {
        await clerkClient.users.updateUserMetadata(userId, {
          publicMetadata: {
            plan,
            subscriptionStatus: status
          }
        });
      } catch (err) {
        console.warn('Clerk update metadata skipped:', err.message);
      }
    }

    res.json({
      success: true,
      message: 'Subscription updated successfully',
      subscription: subscriptionData
    });
  } catch (error) {
    console.error('Error updating subscription:', error);
    res.status(500).json({ error: 'Failed to update subscription' });
  }
};