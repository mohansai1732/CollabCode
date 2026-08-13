const express = require('express');

const {
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
} = require('../controllers/roomController');

const { rateLimit } = require('../middleware/rateLimit');

const router = express.Router();

router.get('/find/:roomId', getRoomById);

router.get('/:userId', getUserRooms);

router.post('/', createRoom);

router.post('/join', rateLimit(), requestJoin);

router.get('/:roomId/requests', listRequests);

router.get('/my-requests/:userId', fetchMyRequests);

router.delete('/my-requests/:requestId', rateLimit(), cancelJoinRequest);

router.post('/:roomId/requests/:userId', rateLimit(), decideRequest);

router.delete('/:roomId', deleteRoom);

router.delete('/:roomId/collaborators/:userId', rateLimit(), removeCollaborator);

router.patch('/:roomId/collaborators/:userId/mute', rateLimit(), setMute);

router.post('/subscription/upgrade', rateLimit(), upgradeSubscription);

module.exports = router;