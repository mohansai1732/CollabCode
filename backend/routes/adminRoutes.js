import express from 'express';
import { requireAuth, requireAdmin } from '../middleware/authMiddleware.js';
import { 
  getAdminStats, 
  getAllRooms, 
  deleteRoomAdmin, 
  getAllUsers,
  deleteUserAdmin,
  updateSubscription 
} from '../controllers/adminController.js';

const router = express.Router();

// Apply BOTH authentication AND admin authorization to every admin route
router.use(requireAuth, requireAdmin);

router.get('/stats', getAdminStats);
router.get('/rooms', getAllRooms);
router.delete('/rooms/:roomId', deleteRoomAdmin);

router.get('/users', getAllUsers);
router.delete('/users/:userId', deleteUserAdmin);
router.post('/users/:userId/subscription', updateSubscription);

export default router;