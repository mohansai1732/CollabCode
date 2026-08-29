import dotenv from 'dotenv';
dotenv.config();

import http from 'http';
import express from 'express';
import cors from 'cors';
import routes from './routes/index.js';
import adminRoutes from './routes/adminRoutes.js';
import { clerkMiddleware } from '@clerk/express';
import { Server } from 'socket.io';
import { YSocketIO } from 'y-socket.io/dist/server';
import { errorHandler } from './middleware/errorHandler.js';
import { setIO } from './sockets/socketManager.js';
import { validId } from './utils/validation.js';
import { db } from './config/firebaseAdmin.js';
import { isMember } from './controllers/roomController.js';

const app = express();

// Basic HTTP Request Logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

function corsOrigin(origin, callback) {
  if (!origin) {
    return callback(null, true);
  }

  if (process.env.CLIENT_URL && origin.replace(/\/$/, '') === process.env.CLIENT_URL.replace(/\/$/, '')) {
    return callback(null, true);
  }

  console.warn(`Blocked CORS request from origin: ${origin}`);
  callback(null, false);
}

app.use(
  cors({
    origin: corsOrigin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Role'],
  }),
);

app.use(express.json({ limit: process.env.JSON_LIMIT }));

app.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
        req.auth = {
          userId: payload.sub || payload.userId || payload.id,
          sessionClaims: payload,
          ...payload
        };
      }
    } catch (e) {
    }
  }

  if (process.env.CLERK_SECRET_KEY) {
    return clerkMiddleware()(req, res, next);
  }

  next();
});

app.use('/api/admin', adminRoutes);
app.use('/api', routes);
app.use(errorHandler);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: true,
    credentials: true,
    methods: ['GET', 'POST'],
  },
  transports: ['websocket', 'polling'],
});
setIO(io);

const ysocketio = new YSocketIO(io, { gcEnabled: true });
ysocketio.initialize();

function emitAppRoomCount(ioInstance, roomId) {
  const room = `app:${roomId}`;
  const size = ioInstance.sockets.adapter.rooms.get(room)?.size ?? 0;
  ioInstance.to(room).emit('room:count', { count: size });
}

io.on('connection', (socket) => {
  console.log(`[Socket.IO] New connection established: ${socket.id}`);
  let joinedRoom = null;

  socket.on('room:join', async ({ roomId, userId }) => {
    console.log(`[Socket.IO] User ${userId} attempting to join room ${roomId} on socket ${socket.id}`);
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

  socket.on('chat:message', async (payload) => {
    const rid = String(payload?.roomId || joinedRoom || '');
    if (!rid) return;

    console.log(`[Socket.IO] Chat message received in room ${rid} from user ${payload.user || 'Guest'}`);

    const text = String(payload?.text || '').trim().slice(0, 4000);
    if (!text) return;

    const msg = {
      id: `${socket.id}-${Date.now()}`,
      user: String(payload.user || 'Guest').slice(0, 120),
      text,
      ts: Date.now(),
    };

    io.to(`app:${rid}`).emit('chat:message', msg);

    try {
      await db.collection('rooms').doc(rid).collection('messages').add(msg);
    } catch (err) {
      console.error('Failed to save message to Firestore:', err.message);
    }
  });

  socket.on('disconnecting', () => {
    if (!joinedRoom) return;
    const rid = joinedRoom;
    socket.once('disconnect', () => {
      emitAppRoomCount(io, rid);
    });
  });

  socket.on('disconnect', () => {
    console.log(`[Socket.IO] Socket disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT;

server.listen(PORT, () => {
  console.log(`API server running on port ${PORT}`);
  console.log(`Socket.IO + Yjs namespaces: /yjs|<roomId>`);
});