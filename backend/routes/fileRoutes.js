import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import {
  listFiles,
  createFile,
  updateFile,
  deleteFile,
} from '../controllers/fileController.js';

const router = express.Router();

// Require authentication for all file operations
router.use(requireAuth);

router.get('/', listFiles);
router.post('/', createFile);
router.put('/:id', updateFile);
router.delete('/:id', deleteFile);

export default router;
