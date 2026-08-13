// const { db } = require('../config/firebaseAdmin');

// function valid(value) { return typeof value === 'string' && value.trim().length > 0; }

// async function listFiles(req, res, next) {
//   try {
//     const { roomId } = req.query;
//     if (!valid(roomId)) return res.status(400).json({ message: 'roomId query required.' });
//     const snapshot = await db.collection('rooms').doc(roomId).collection('files').orderBy('updatedAt', 'desc').get();
//     res.json({ files: snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) });
//   } catch (error) { next(error); }
// }

// async function createFile(req, res, next) {
//   try {
//     const { roomId, filename, language, content } = req.body;
//     if (!valid(roomId) || !valid(filename)) return res.status(400).json({ message: 'roomId and filename are required.' });
//     const ref = db.collection('rooms').doc(roomId).collection('files').doc();
//     const file = { roomId, filename: filename.trim(), language: language || 'javascript', content: content || '', createdAt: new Date(), updatedAt: new Date() };
//     await ref.set(file); res.status(201).json({ file: { id: ref.id, ...file } });
//   } catch (error) { next(error); }
// }

// async function updateFile(req, res, next) {
//   try {
//     const { id } = req.params; const { roomId, filename, language, content } = req.body;
//     if (!valid(roomId) || !valid(id)) return res.status(400).json({ message: 'roomId and file id are required.' });
//     const update = { updatedAt: new Date() };
//     if (filename !== undefined) update.filename = String(filename).trim();
//     if (language !== undefined) update.language = language;
//     if (content !== undefined) update.content = content;
//     const ref = db.collection('rooms').doc(roomId).collection('files').doc(id); await ref.update(update);
//     const doc = await ref.get(); res.json({ file: { id: doc.id, ...doc.data() } });
//   } catch (error) { next(error); }
// }

// async function deleteFile(req, res, next) {
//   try {
//     const { id } = req.params; const { roomId } = req.query;
//     if (!valid(roomId) || !valid(id)) return res.status(400).json({ message: 'roomId and file id are required.' });
//     await db.collection('rooms').doc(roomId).collection('files').doc(id).delete(); res.json({ ok: true });
//   } catch (error) { next(error); }
// }

// module.exports = { listFiles, createFile, updateFile, deleteFile };
