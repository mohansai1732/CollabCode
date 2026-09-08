import axios from 'axios';
import { db } from '../config/firebaseAdmin.js';
import { isMember } from './roomController.js';
import { getIO } from '../sockets/socketManager.js';

export async function executeCode(req, res, next) {
  try {
    const { roomId, language, code, stdin = '', broadcast = false } = req.body;

    if (!language || typeof language !== 'string') {
      return res.status(400).json({ message: 'Language is required.' });
    }

    if (code === undefined || typeof code !== 'string') {
      return res.status(400).json({ message: 'Code is required.' });
    }

    // If roomId is provided, verify room membership
    if (roomId) {
      const roomDoc = await db.collection('rooms').doc(roomId).get();
      if (!roomDoc.exists) {
        return res.status(404).json({ message: 'Room not found.' });
      }
      const roomData = roomDoc.data();
      if (!isMember(roomData, req.userId)) {
        return res.status(403).json({ message: 'You are not a member of this room.' });
      }
    }

    const sandboxBaseUrl = (process.env.SANDBOX_SERVICE_URL || '').replace(/\/+$/, '');
    if (!sandboxBaseUrl) {
      return res.status(500).json({
        message: 'SANDBOX_SERVICE_URL is not configured in the environment variables.',
      });
    }
    const executeEndpoint = `${sandboxBaseUrl}/execute`;

    let sandboxResponse;
    try {
      sandboxResponse = await axios.post(
        executeEndpoint,
        {
          language,
          code,
          stdin,
          timeoutMs: 5000,
        },
        {
          timeout: 15000, // 15s HTTP timeout to allow compilation & run
          headers: {
            'Content-Type': 'application/json',
            ...(process.env.SANDBOX_API_SECRET ? { 'x-sandbox-secret': process.env.SANDBOX_API_SECRET } : {}),
          },
        }
      );
    } catch (err) {
      if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        return res.status(503).json({
          message: 'Code execution service is currently unavailable. Please verify the sandbox Docker container is running.',
          error: err.message,
        });
      }

      if (err.response) {
        return res.status(err.response.status).json(err.response.data);
      }

      return res.status(500).json({
        message: 'Failed to communicate with execution sandbox.',
        error: err.message,
      });
    }

    const result = sandboxResponse.data;

    // Optional: Broadcast execution result to room collaborators so all members see output
    if (roomId && broadcast) {
      const io = getIO();
      if (io) {
        io.to(`app:${roomId}`).emit('code:output', {
          userId: req.userId,
          language,
          ...result,
          ts: Date.now(),
        });
      }
    }

    return res.status(200).json(result);
  } catch (err) {
    next(err);
  }
}
