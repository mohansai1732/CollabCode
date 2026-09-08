import express from 'express';
import { requireAuth } from '../middleware/authMiddleware.js';
import { rateLimit } from '../middleware/rateLimit.js';
import { executeCode } from '../controllers/executionController.js';

const router = express.Router();

// Require authentication for all code execution requests
router.use(requireAuth);

// Rate limit: max 20 runs per minute per user/IP
router.post('/', rateLimit({ windowMs: 60_000, max: 20 }), executeCode);

export default router;
