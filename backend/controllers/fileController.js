const { db } = require('../config/firebaseAdmin');

/**
 * Helper function: Ensures a room document exists in Firestore before adding files to it
 */
async function ensureRoom(roomId) {
  if (!roomId || typeof roomId !== 'string') return;
  const roomRef = db.collection('rooms').doc(roomId);
  const doc = await roomRef.get();
  if (!doc.exists) {
    await roomRef.set({
      roomId,
      name: roomId,
      createdAt: new Date(),
      collaborators: []
    });
  }
}

/**
 * GET /api/files?roomId=xxx
 * Lists all files inside a specific room
 */
async function listFiles(req, res, next) {
  try {
    if (!db) return res.status(500).json({ message: 'Firebase not initialized' });
    const { roomId } = req.query;

    if (!roomId) {
      return res.status(400).json({ message: 'roomId query required' });
    }
    // Fetch files subcollection inside the room document ordered by latest update
    const filesSnapshot = await db.collection('rooms').doc(roomId).collection('files').orderBy('updatedAt', 'desc').get();
    const files = [];
    filesSnapshot.forEach(doc => {
      files.push({ id: doc.id, ...doc.data() });
    });
    res.json({ files });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/files
 * Creates a new code file inside a room
 */
async function createFile(req, res, next) {
  try {
    if (!db) return res.status(500).json({ message: 'Firebase not initialized' });
    const { roomId, filename, language, content } = req.body;

    if (!roomId || !filename) {
      return res.status(400).json({ message: 'roomId and filename required' });
    }
    await ensureRoom(roomId);
    
    // Create an auto-generated document ID in the files subcollection
    const fileRef = db.collection('rooms').doc(roomId).collection('files').doc();
    const newFile = {
      roomId,
      filename: String(filename).trim(),
      language: language || 'javascript',
      content: content ?? '',
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    await fileRef.set(newFile);
    res.status(201).json({ file: { id: fileRef.id, ...newFile } });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/files/:id
 * Updates an existing file (e.g. rename, change programming language, or save content)
 */
async function updateFile(req, res, next) {
  try {
    if (!db) return res.status(500).json({ message: 'Firebase not initialized' });
    const { id } = req.params;

    const { roomId, filename, language, content } = req.body;
    if (!roomId) return res.status(400).json({ message: 'roomId required' });

    const fileRef = db.collection('rooms').doc(roomId).collection('files').doc(id);
    const update = { updatedAt: new Date() };
    if (filename !== undefined) update.filename = String(filename).trim();
    if (language !== undefined) update.language = language;
    if (content !== undefined) update.content = content;

    await fileRef.update(update);
    const updatedDoc = await fileRef.get();
    res.json({ file: { id: updatedDoc.id, ...updatedDoc.data() } });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/files/:id?roomId=xxx
 * Deletes a code file from a room
 */
async function deleteFile(req, res, next) {
  try {
    const { id } = req.params;
    const { roomId } = req.query;
    if (!roomId) return res.status(400).json({ message: 'roomId query required' });

    await db.collection('rooms').doc(roomId).collection('files').doc(id).delete();
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

module.exports = { listFiles, createFile, updateFile, deleteFile };

