import express from 'express';
import { executeCode } from '../controllers/executeController.js';
import { requireAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// Option: protect this route with requireAuth if desired
// For now, allow logged-in users to execute code
router.post('/', requireAuth, executeCode);

export default router;
