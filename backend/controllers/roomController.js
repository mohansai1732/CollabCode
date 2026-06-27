const { db, admin } = require('../config/firebaseAdmin');

/**
 * GET /api/rooms/user/:userId
 * Fetches all rooms associated with a specific user from Firestore
 */
async function getUserRooms(req, res, next) {
  try {
    if (!db) return res.status(500).json({ message: 'Firebase not initialized' });
    const { userId } = req.params;
    const { userName } = req.query;

    // Save or update user's name in Firestore if provided
    if (userName) {
      await db.collection('users').doc(userId).set({
        fullName: userName
      }, { merge: true });
    }

    // Read user document to get their joined room IDs
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return res.json({ rooms: [] });
    }
    const roomIds = userDoc.data().rooms || [];
    if (roomIds.length === 0) return res.json({ rooms: [] });

    // Fetch all room documents in parallel using Promise.all (clean & fast)
    const roomDocs = await Promise.all(
      roomIds.map(id => db.collection('rooms').doc(id).get())
    );

    // Filter out deleted rooms and format room data
    const rooms = roomDocs
      .filter(doc => doc.exists)
      .map(doc => ({ id: doc.id, ...doc.data() }));
    
    res.json({ rooms });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/rooms/create
 * Creates a new coding room and sets the creator as owner
 */
async function createRoom(req, res, next) {
  try {
    if (!db) return res.status(500).json({ message: 'Firebase not initialized' });
    const { userId, name, ownerName } = req.body;

    if (!userId) return res.status(400).json({ message: 'userId required' });

    // Generate a random 6-character unique Room ID (e.g. 'a7x9b2')
    const roomId = Math.random().toString(36).substring(2, 8);
    
    // Save new room document into 'rooms' collection
    await db.collection('rooms').doc(roomId).set({
      name: name || 'New Room',
      ownerId: userId,
      ownerName: ownerName || 'Unknown',
      collaborators: [userId],
      createdAt: new Date()
    });

    // Add this room ID to creator's list of joined rooms
    const userUpdate = {
      rooms: admin.firestore.FieldValue.arrayUnion(roomId)
    };
    if (ownerName) {
      userUpdate.fullName = ownerName;
    }

    await db.collection('users').doc(userId).set(userUpdate, { merge: true });

    res.status(201).json({ roomId, name });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/rooms/join
 * Adds a user as a collaborator to an existing room
 */
async function joinRoom(req, res, next) {
  try {
    if (!db) return res.status(500).json({ message: 'Firebase not initialized' });
    const { userId, roomId } = req.body;

    if (!userId || !roomId) return res.status(400).json({ message: 'userId and roomId required' });

    const roomRef = db.collection('rooms').doc(roomId);
    const roomDoc = await roomRef.get();
    
    if (!roomDoc.exists) {
      return res.status(404).json({ message: 'Room not found' });
    }

    // Add user ID to room's collaborators list
    await roomRef.update({
      collaborators: admin.firestore.FieldValue.arrayUnion(userId)
    });

    // Add room ID to user's list of active rooms
    await db.collection('users').doc(userId).set({
      rooms: admin.firestore.FieldValue.arrayUnion(roomId)
    }, { merge: true });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/rooms/:roomId
 * Fetches details for a single room by ID
 */
async function getRoomById(req, res, next) {
  try {
    if (!db) {
      return res.status(500).json({ message: 'Firebase not initialized' });
    }

    const { roomId } = req.params;
    if (!roomId) {
      return res.status(400).json({ message: 'roomId required' });
    }

    const roomDoc = await db.collection('rooms').doc(roomId).get();

    if (!roomDoc.exists) {
      return res.status(404).json({ message: 'Room not found' });
    }

    const roomData = roomDoc.data();
    let ownerName = roomData.ownerName;

    // Self-healing database lookup: fetch owner's full name if missing in room record
    if (!ownerName && roomData.ownerId) {
      const ownerDoc = await db.collection('users').doc(roomData.ownerId).get();
      if (ownerDoc.exists && ownerDoc.data().fullName) {
        ownerName = ownerDoc.data().fullName;
        try {
          await db.collection('rooms').doc(roomId).update({ ownerName });
        } catch (updateErr) {
          console.warn('Failed to update ownerName in room document:', updateErr.message);
        }
      }
    }

    res.json({
      room: {
        id: roomDoc.id,
        ...roomData,
        ownerName: ownerName || 'Unknown'
      }
    });

  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/rooms/:roomId
 * Deletes a room (if user is owner) or leaves the room (if collaborator)
 */
async function deleteRoom(req, res, next) {
  try {
    const { roomId } = req.params;
    const { userId } = req.query;

    if (!userId) return res.status(400).json({ message: 'userId required' });

    const roomRef = db.collection('rooms').doc(roomId);
    const roomDoc = await roomRef.get();

    if (!roomDoc.exists) {
      return res.status(404).json({ message: 'Room not found' });
    }

    const roomData = roomDoc.data();

    // If requester is owner, delete room + subcollections (files, messages) using batch transaction
    if (roomData.ownerId === userId) {
      const batch = db.batch();
      
      // 1. Delete all files in room
      const filesSnapshot = await roomRef.collection('files').get();
      filesSnapshot.forEach(doc => batch.delete(doc.ref));
      
      // 2. Delete all chat messages
      const msgsSnapshot = await roomRef.collection('messages').get();
      msgsSnapshot.forEach(doc => batch.delete(doc.ref));
      
      // 3. Delete room document
      batch.delete(roomRef);
      await batch.commit();
    } else {
      // If collaborator, remove user from collaborators list
      await roomRef.update({
        collaborators: admin.firestore.FieldValue.arrayRemove(userId)
      });
    }

    // Remove room from user's record
    await db.collection('users').doc(userId).update({
      rooms: admin.firestore.FieldValue.arrayRemove(roomId)
    });

    res.json({ ok: true, action: roomData.ownerId === userId ? 'deleted' : 'left' });
  } catch (err) {
    next(err);
  }
}

module.exports = { getUserRooms, createRoom, joinRoom, deleteRoom, getRoomById };

