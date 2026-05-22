const { db, admin } = require('../config/firebaseAdmin');

async function getUserRooms(req, res, next) {
  try {
    if (!db) return res.status(500).json({ message: 'Firebase not initialized' });
    const { userId } = req.params;
    const { userName } = req.query;

    if (userName) {
      await db.collection('users').doc(userId).set({
        fullName: userName
      }, { merge: true });
    }

    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return res.json({ rooms: [] });
    }
    const roomIds = userDoc.data().rooms || [];
    if (roomIds.length === 0) return res.json({ rooms: [] });

    // Firestore 'in' query is limited to 10 items. For simplicity, we handle it here.
    // If you have more than 10 rooms, you might need a different approach.
    const chunks = [];
    for (let i = 0; i < roomIds.length; i += 10) {
      chunks.push(roomIds.slice(i, i + 10));
    }

    const rooms = [];
    for (const chunk of chunks) {
      const snapshot = await db.collection('rooms').where(admin.firestore.FieldPath.documentId(), 'in', chunk).get();
      snapshot.forEach(doc => rooms.push({ id: doc.id, ...doc.data() }));
    }
    
    res.json({ rooms });
  } catch (err) {
    next(err);
  }
}

async function createRoom(req, res, next) {
  try {
    if (!db) return res.status(500).json({ message: 'Firebase not initialized' });
    const { userId, name, ownerName } = req.body;

    if (!userId) return res.status(400).json({ message: 'userId required' });

    const roomId = Math.random().toString(36).substring(2, 8);
    
    await db.collection('rooms').doc(roomId).set({
      name: name || 'New Room',
      ownerId: userId,
      ownerName: ownerName || 'Unknown',
      collaborators: [userId],
      createdAt: new Date()
    });

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

    await roomRef.update({
      collaborators: admin.firestore.FieldValue.arrayUnion(userId)
    });

    await db.collection('users').doc(userId).set({
      rooms: admin.firestore.FieldValue.arrayUnion(roomId)
    }, { merge: true });

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function getRoomById(req, res, next) {

  try {

    if (!db) {
      return res.status(500).json({
        message: 'Firebase not initialized'
      });
    }

    const { roomId } = req.params;

    if (!roomId) {
      return res.status(400).json({
        message: 'roomId required'
      });
    }

    const roomDoc =
      await db.collection('rooms')
      .doc(roomId)
      .get();

    if (!roomDoc.exists) {
      return res.status(404).json({
        message: 'Room not found'
      });
    }

    const roomData = roomDoc.data();
    let ownerName = roomData.ownerName;

    // Self-healing database lookup for owner name
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

    // If requester is owner, delete the entire room
    if (roomData.ownerId === userId) {
      const batch = db.batch();
      
      // 1. Delete all files in the room
      const filesSnapshot = await roomRef.collection('files').get();
      filesSnapshot.forEach(doc => batch.delete(doc.ref));
      
      // 2. Delete all messages
      const msgsSnapshot = await roomRef.collection('messages').get();
      msgsSnapshot.forEach(doc => batch.delete(doc.ref));
      
      // 3. Delete room document
      batch.delete(roomRef);
      await batch.commit();
    } else {
      // If requester is NOT owner, just leave the room
      await roomRef.update({
        collaborators: admin.firestore.FieldValue.arrayRemove(userId)
      });
    }

    // Always remove from the specific user's room list
    await db.collection('users').doc(userId).update({
      rooms: admin.firestore.FieldValue.arrayRemove(roomId)
    });

    res.json({ ok: true, action: roomData.ownerId === userId ? 'deleted' : 'left' });
  } catch (err) {
    next(err);
  }
}

module.exports = { getUserRooms, createRoom, joinRoom, deleteRoom, getRoomById };
