import dotenv from 'dotenv';
dotenv.config();

import http from 'http'; 
import express from 'express';
import cors from 'cors'; 
import routes from './routes/index.js'; 
import adminRoutes from './routes/adminRoutes.js';

import { Server } from 'socket.io';
import { YSocketIO } from 'y-socket.io/dist/server'; 
import { errorHandler } from './middleware/errorHandler.js';
import { setIO } from './sockets/socketManager.js';
import { validId } from './utils/validation.js';
import { db } from './config/firebaseAdmin.js';
import { isMember } from './controllers/roomController.js';

// Initialize express application
const app = express();

const clientOrigin = 'http://localhost:5173';

/**
 * CORS Configuration: Security policy that checks if the request comes from an allowed frontend domain.
 */
function corsOrigin(origin, callback) {
  if (!origin) {
    return callback(null, true); // Allow server-to-server or Postman requests without origin header
  }
  const isLocalhost = /^http:\/\/localhost:\d+$/.test(origin);
  const isVercel = origin.endsWith('.vercel.app');
  const isConfiguredClient = origin === clientOrigin;

  if (isLocalhost || isVercel || isConfiguredClient) {
    callback(null, true); // Allow connection
  } else {
    callback(null, false); // Block unauthorized origins safely
  }
}

// Attach CORS middleware to Express app
app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
  }),
);

// Enable JSON body parsing for incoming requests (limit 4mb for code files)
app.use(express.json({ limit: '4mb' }));

// Attach REST API routes (placed AFTER cors and express.json)
app.use('/api/admin', adminRoutes);
app.use('/api', routes);

// Attach global error handler for any uncaught errors in routes
app.use(errorHandler);

// Create standard Node.js HTTP server wrapped around our Express app
const server = http.createServer(app);

// Initialize Socket.IO server on top of HTTP server for real-time websocket connections
const io = new Server(server, {
  cors: {
    origin: true, // Allow frontend socket connection
    credentials: true,
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
});
setIO(io);

// Initialize Yjs real-time collaborative editing server over Socket.IO
const ysocketio = new YSocketIO(io, { gcEnabled: true });
ysocketio.initialize();

/**
 * Helper function: Broadcasts how many users are currently connected in a room
 */
function emitAppRoomCount(ioInstance, roomId) {
  const room = `app:${roomId}`;
  const size = ioInstance.sockets.adapter.rooms.get(room)?.size ?? 0;
  ioInstance.to(room).emit('room:count', { count: size });
}

/**
 * Real-Time Socket.IO event listeners for Room Presence and Live Chat
 */
io.on('connection', (socket) => {
  let joinedRoom = null;

  // Listen when a user joins a specific room
  socket.on('room:join', async ({ roomId, userId }) => {
    if (!validId(roomId) || !validId(userId)) return socket.emit('room:error', { message: 'A valid roomId and userId are required.' });
    
    socket.userId = String(userId);
    socket.roomId = String(roomId);
    socket.join(`user:${userId}`);

    if (joinedRoom && joinedRoom !== roomId) {
      socket.leave(`app:${joinedRoom}`);
      emitAppRoomCount(io, joinedRoom);
    }
    joinedRoom = String(roomId);
    socket.join(`app:${joinedRoom}`);
    emitAppRoomCount(io, joinedRoom);

    try {
      const roomDoc = await db.collection('rooms').doc(roomId).get();
      if (!roomDoc.exists || !isMember(roomDoc.data(), userId)) {
        socket.leave(`app:${joinedRoom}`);
        joinedRoom = null;
        return socket.emit('room:error', { message: 'You are not a collaborator in this room.' });
      }
    } catch (err) {
      console.error('Membership verification error:', err);
    }
  });

  // Listen when a user sends a chat message in the room
  socket.on('chat:message', async (payload) => {
    const rid = String(payload?.roomId || joinedRoom || '');
    if (!rid) return;
    
    const text = String(payload?.text || '').trim().slice(0, 4000);
    if (!text) return;

    const msg = {
      id: `${socket.id}-${Date.now()}`,
      user: String(payload.user || 'Guest').slice(0, 120),
      text,
      ts: Date.now(),
    };

    // Broadcast message live to all active collaborators in the room
    io.to(`app:${rid}`).emit('chat:message', msg);

    // Save chat message asynchronously to Cloud Firestore database
    try {
      await db.collection('rooms').doc(rid).collection('messages').add(msg);
    } catch (err) {
      console.error('Failed to save message to Firestore:', err.message);
    }
  });

  // Handle user disconnect (updating live user count)
  socket.on('disconnecting', () => {
    if (!joinedRoom) return;
    const rid = joinedRoom;
    socket.once('disconnect', () => {
      emitAppRoomCount(io, rid);
    });
  });
});

// Start listening on configured PORT (default: 5001)
const PORT = Number(process.env.PORT) || 5001;

server.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
  console.log(`Socket.IO + Yjs namespaces: /yjs|<roomId>`);
});