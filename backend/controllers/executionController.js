import axios from 'axios';
import { db } from '../config/firebaseAdmin.js';
import { isMember } from './roomController.js';
import { getIO } from '../sockets/socketManager.js';

export async function executeCode(req, res, next) {
  const startTime = Date.now();

  try {
    const { roomId, language, code, stdin = '', broadcast = false } = req.body;

    console.log(`[EXECUTE] Request received for room: ${roomId || 'none'}`);
    console.log(`[EXECUTE] Authenticated user: ${req.userId}`);

    if (!language || typeof language !== 'string') {
      return res.status(400).json({ success: false, error: 'Language is required.' });
    }

    if (code === undefined || typeof code !== 'string') {
      return res.status(400).json({ success: false, error: 'Code is required.' });
    }

    console.log(`[EXECUTE] Language: ${language}, code length: ${code.length} chars, stdin length: ${stdin ? stdin.length : 0}`);

    // If roomId is provided, verify room membership
    if (roomId) {
      const roomDoc = await db.collection('rooms').doc(roomId).get();
      if (!roomDoc.exists) {
        return res.status(404).json({ success: false, error: 'Room not found.' });
      }
      const roomData = roomDoc.data();
      if (!isMember(roomData, req.userId)) {
        return res.status(403).json({ success: false, error: 'You are not a member of this room.' });
      }
    }

    const sandboxBaseUrl = (process.env.SANDBOX_SERVICE_URL || '').replace(/\/+$/, '');
    if (!sandboxBaseUrl) {
      console.error('[EXECUTE] Execution failed: SANDBOX_SERVICE_URL is not configured in environment variables');
      return res.status(500).json({
        success: false,
        error: 'SANDBOX_SERVICE_URL is not configured in the environment variables.',
      });
    }

    const executeEndpoint = `${sandboxBaseUrl}/execute`;
    console.log(`[EXECUTE] Execution started dispatching to sandbox: ${executeEndpoint}`);

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
          timeout: 40000, // 40s backend-to-sandbox timeout to accommodate container spin-up & compilation
          headers: {
            'Content-Type': 'application/json',
            ...(process.env.SANDBOX_API_SECRET ? { 'x-sandbox-secret': process.env.SANDBOX_API_SECRET } : {}),
          },
        }
      );
    } catch (err) {
      const elapsed = Date.now() - startTime;
      console.error(`[EXECUTE] Execution failed after ${elapsed}ms: ${err.message}`);

      // Handle Axios client-side timeout
      if (err.code === 'ECONNABORTED') {
        return res.status(504).json({
          success: false,
          error: 'Code execution timed out waiting for sandbox response.',
          details: err.message,
        });
      }

      // Handle connection refused or host not found
      if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
        return res.status(503).json({
          success: false,
          error: 'Code execution service is currently unreachable. Please ensure the sandbox container is active.',
          details: err.message,
        });
      }

      // Handle HTTP responses from downstream sandbox or reverse proxy
      if (err.response) {
        const status = err.response.status;

        // Downstream gateway errors (502 Bad Gateway, 503 Unavailable, 504 Gateway Timeout)
        if ([502, 503, 504].includes(status)) {
          return res.status(503).json({
            success: false,
            error: 'Execution sandbox is warming up or temporarily unavailable. Please retry shortly.',
            status,
          });
        }

        // Structured JSON payload returned by sandbox (e.g. 400 validation error)
        if (typeof err.response.data === 'object' && err.response.data !== null) {
          return res.status(status).json(err.response.data);
        }

        // If downstream returned non-JSON / HTML, wrap it cleanly
        return res.status(status).json({
          success: false,
          error: 'Execution service returned an unexpected response format.',
          status,
        });
      }

      return res.status(500).json({
        success: false,
        error: 'Failed to communicate with execution sandbox.',
        details: err.message,
      });
    }

    const result = sandboxResponse.data;
    const elapsed = Date.now() - startTime;
    console.log(`[EXECUTE] Execution completed in ${elapsed}ms (Sandbox exitCode: ${result.exitCode})`);

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
    console.error(`[EXECUTE] Execution failed with unexpected error:`, err);
    next(err);
  }
}
