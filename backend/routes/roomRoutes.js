import express from 'express';
import { rateLimit } from '../middleware/rateLimit.js';
import {
  getUserRooms,
  createRoom,
  deleteRoom,
  getRoomById,
  requestJoin,
  listRequests,
  fetchMyRequests,
  decideRequest,
  cancelJoinRequest,
  removeCollaborator,
  setMute,
  upgradeSubscription,
  leaveRoom,
  getRoomInviteInfo,
} from '../controllers/roomController.js';


const router = express.Router();

router.get('/find/:roomId', getRoomById);

router.get('/:userId', getUserRooms);

router.post('/', rateLimit(), createRoom);

router.post('/join', rateLimit(), requestJoin);

router.get('/:roomId/requests', listRequests);

router.get('/my-requests/:userId', fetchMyRequests);

router.get('/invite/:roomId', getRoomInviteInfo);

router.delete('/my-requests/:requestId', rateLimit(), cancelJoinRequest);

router.post('/:roomId/requests/:userId', rateLimit(), decideRequest);

router.delete('/:roomId', rateLimit(), deleteRoom);

router.delete('/:roomId/leave', rateLimit(), leaveRoom);

router.delete('/:roomId/collaborators/:userId', rateLimit(), removeCollaborator);

router.patch('/:roomId/collaborators/:userId/mute', rateLimit(), setMute);

router.post('/subscription/upgrade', rateLimit(), upgradeSubscription);

export default router;