import express from 'express';
import {
  listFiles,
  createFile,
  updateFile,
  deleteFile,
} from '../controllers/fileController.js';

const router = express.Router();

router.get('/', listFiles);
router.post('/', createFile);
router.put('/:id', updateFile);
router.delete('/:id', deleteFile);

export default router;
