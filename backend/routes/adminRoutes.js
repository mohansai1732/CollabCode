import express from 'express';
import { requireAdminSession } from '../middleware/authMiddleware.js';
import { 
  adminLogin, 
  verifySessionEndpoint, 
  adminLogout 
} from '../controllers/adminAuthController.js';
import { 
  getAdminStats, 
  getAllRooms, 
  deleteRoomAdmin, 
  getAllUsers,
  deleteUserAdmin,
  updateSubscription 
} from '../controllers/adminController.js';

const router = express.Router();

// 1. Dedicated Admin Authentication Endpoints
router.post('/login', adminLogin);
router.get('/verify-session', verifySessionEndpoint);
router.post('/logout', adminLogout);

// 2. Protected Admin Portal APIs (require valid Admin Session)
router.use(requireAdminSession);

router.get('/stats', getAdminStats);
router.get('/rooms', getAllRooms);
router.delete('/rooms/:roomId', deleteRoomAdmin);

router.get('/users', getAllUsers);
router.delete('/users/:userId', deleteUserAdmin);
router.post('/users/:userId/subscription', updateSubscription);

export default router;