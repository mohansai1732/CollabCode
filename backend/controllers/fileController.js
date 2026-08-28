import { db } from '../config/firebaseAdmin.js';
import { isMember } from './roomController.js';

function valid(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

const EXT_TO_LANG = {
  js: 'javascript',
  py: 'python',
  java: 'java',
  cpp: 'cpp',
};

function detectLanguage(filename, explicitLang) {
  if (explicitLang && explicitLang !== 'auto') return explicitLang;
  if (!filename) return 'javascript';
  const parts = filename.split('.');
  if (parts.length > 1) {
    const ext = parts.pop().toLowerCase();
    if (EXT_TO_LANG[ext]) return EXT_TO_LANG[ext];
  }
  return 'javascript';
}

export async function listFiles(req, res, next) {
  try {
    const { roomId } = req.query;
    if (!valid(roomId)) {
      return res.status(400).json({ message: 'roomId query parameter is required.' });
    }

    const roomDoc = await db.collection('rooms').doc(roomId).get();
    if (!roomDoc.exists) {
      return res.status(404).json({ message: 'Room not found.' });
    }
    const roomData = roomDoc.data();
    if (!isMember(roomData, req.userId)) {
      return res.status(403).json({ message: 'You are not a member of this room.' });
    }

    const snapshot = await db.collection('files').where('roomId', '==', roomId).get();

    if (snapshot.empty) {
      // Create initial default file for room if none exist
      let defaultLang = 'python';
      let defaultFilename = 'main.py';

      if (roomData?.language) {
        defaultLang = roomData.language;
        if (defaultLang === 'javascript') {
          defaultFilename = 'main.js';
        } else if (defaultLang === 'python') {
          defaultFilename = 'main.py';
        } else if (['cpp14', 'cpplatest'].includes(defaultLang)) {
          defaultFilename = 'main.cpp';
        } else if (['java11', 'javalatest'].includes(defaultLang)) {
          defaultFilename = 'Main.java';
        } else {
          defaultFilename = 'main.txt';
        }
      }

      const fileRef = db.collection('files').doc();
      const initialFile = {
        roomId,
        filename: defaultFilename,
        language: defaultLang,
        content: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await fileRef.set(initialFile);
      return res.json({ files: [{ id: fileRef.id, ...initialFile }] });
    }

    const files = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    // Sort in memory by createdAt ascending so the primary file is first
    files.sort((a, b) => {
      const timeA = new Date(a.createdAt || 0).getTime();
      const timeB = new Date(b.createdAt || 0).getTime();
      return timeA - timeB;
    });

    return res.json({ files });
  } catch (error) {
    next(error);
  }
}

export async function createFile(req, res, next) {
  try {
    const { roomId, filename, language, content } = req.body;
    if (!valid(roomId) || !valid(filename)) {
      return res.status(400).json({ message: 'roomId and filename are required.' });
    }

    const roomDoc = await db.collection('rooms').doc(roomId).get();
    if (!roomDoc.exists) {
      return res.status(404).json({ message: 'Room not found.' });
    }
    const roomData = roomDoc.data();
    if (!isMember(roomData, req.userId)) {
      return res.status(403).json({ message: 'You are not a member of this room.' });
    }

    const cleanFilename = filename.trim();

    // Validate that filename includes an extension
    const parts = cleanFilename.split('.');
    if (parts.length < 2 || !parts[parts.length - 1].trim()) {
      return res.status(400).json({
        message: 'Please include a valid file extension (e.g. script.js, index.py).'
      });
    }

    const ext = parts[parts.length - 1].trim().toLowerCase();
    const allowedExtensions = ['js', 'py', 'cpp', 'java'];
    if (!allowedExtensions.includes(ext)) {
      return res.status(400).json({
        message: 'no extensions found or lanagues not supported'
      });
    }

    // Check for duplicate filename in same room
    const existing = await db.collection('files')
      .where('roomId', '==', roomId)
      .where('filename', '==', cleanFilename)
      .get();

    if (!existing.empty) {
      return res.status(400).json({ message: `A file named "${cleanFilename}" already exists in this room.` });
    }

    const lang = detectLanguage(cleanFilename, language);
    const ref = db.collection('files').doc();
    const file = {
      roomId,
      filename: cleanFilename,
      language: lang,
      content: typeof content === 'string' ? content : '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await ref.set(file);
    return res.status(201).json({ file: { id: ref.id, ...file } });
  } catch (error) {
    next(error);
  }
}

export async function updateFile(req, res, next) {
  try {
    const { id } = req.params;
    const { roomId, filename, language, content } = req.body;

    if (!valid(id)) {
      return res.status(400).json({ message: 'File id is required.' });
    }

    const ref = db.collection('files').doc(id);
    const doc = await ref.get();

    if (!doc.exists) {
      return res.status(404).json({ message: 'File not found.' });
    }

    const existingData = doc.data();
    const targetRoomId = roomId || existingData.roomId;

    if (targetRoomId) {
      const roomDoc = await db.collection('rooms').doc(targetRoomId).get();
      if (!roomDoc.exists || !isMember(roomDoc.data(), req.userId)) {
        return res.status(403).json({ message: 'You are not authorized to update files in this room.' });
      }
    }

    const update = { updatedAt: new Date().toISOString() };

    if (filename !== undefined) {
      const cleanFilename = String(filename).trim();
      if (!cleanFilename) {
        return res.status(400).json({ message: 'Filename cannot be empty.' });
      }

      const parts = cleanFilename.split('.');
      if (parts.length < 2 || !parts[parts.length - 1].trim()) {
        return res.status(400).json({
          message: 'Please include a valid file extension (e.g. script.js, index.py , main.java , main.cpp).'
        });
      }

      const ext = parts[parts.length - 1].trim().toLowerCase();
      const allowedExtensions = ['js', 'py', 'cpp', 'java'];
      if (!allowedExtensions.includes(ext)) {
        return res.status(400).json({
          message: 'no extensions found or lanagues not supported'
        });
      }

      // If renaming, check for conflict
      if (cleanFilename !== existingData.filename && targetRoomId) {
        const dup = await db.collection('files')
          .where('roomId', '==', targetRoomId)
          .where('filename', '==', cleanFilename)
          .get();

        if (!dup.empty && dup.docs[0].id !== id) {
          return res.status(400).json({ message: `A file named "${cleanFilename}" already exists in this room.` });
        }
      }

      update.filename = cleanFilename;
      if (!language) {
        update.language = detectLanguage(cleanFilename, existingData.language);
      }
    }

    if (language !== undefined) {
      update.language = language;
    }

    if (content !== undefined) {
      update.content = content;
    }

    await ref.update(update);
    const updatedDoc = await ref.get();

    return res.json({ file: { id: updatedDoc.id, ...updatedDoc.data() } });
  } catch (error) {
    next(error);
  }
}

export async function deleteFile(req, res, next) {
  try {
    const { id } = req.params;
    if (!valid(id)) {
      return res.status(400).json({ message: 'File id is required.' });
    }

    const ref = db.collection('files').doc(id);
    const doc = await ref.get();

    if (!doc.exists) {
      return res.status(404).json({ message: 'File not found.' });
    }

    const fileData = doc.data();
    if (fileData.roomId) {
      const roomDoc = await db.collection('rooms').doc(fileData.roomId).get();
      if (!roomDoc.exists || !isMember(roomDoc.data(), req.userId)) {
        return res.status(403).json({ message: 'You are not authorized to delete files in this room.' });
      }
    }

    await ref.delete();
    return res.json({ ok: true, id });
  } catch (error) {
    next(error);
  }
}
