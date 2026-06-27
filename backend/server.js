require('dotenv').config(); // Load environment variables (like PORT, URLs) from .env file

const http = require('http'); // Built-in Node.js HTTP server module
const express = require('express'); // Express framework to build Web API routes easily
const cors = require('cors'); // Middleware to allow frontend (browser) to connect to backend from different domains/ports
const { Server } = require('socket.io'); // Socket.IO library for real-time double-way communication (chat, user count)
const { YSocketIO } = require('y-socket.io/dist/server'); // Yjs real-time collaboration server for code synchronization
const routes = require('./routes'); // Import all API endpoints (rooms, files)
const { errorHandler } = require('./middleware/errorHandler'); // Centralized error handling middleware

// Initialize express application
const app = express();

// Set up frontend origin URL (e.g., http://localhost:5173 or Vercel deployment)
const clientOrigin = process.env.CLIENT_URL || 'http://localhost:5173';

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

// Attach all REST API routes under the '/api' prefix (e.g., /api/rooms, /api/files)
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
  socket.on('room:join', (roomId) => {
    if (joinedRoom) {
      socket.leave(`app:${joinedRoom}`);
      emitAppRoomCount(io, joinedRoom);
    }
    joinedRoom = String(roomId || '');
    if (!joinedRoom) return;
    socket.join(`app:${joinedRoom}`);
    emitAppRoomCount(io, joinedRoom);
  });

  // Listen when a user sends a chat message in the room
  socket.on('chat:message', async (payload) => {
    const rid = String(payload?.roomId || '');
    if (!rid || !joinedRoom || rid !== joinedRoom) return;
    
    const { db } = require('./config/firebaseAdmin');
    
    const msg = {
      id: `${socket.id}-${Date.now()}`,
      user: String(payload.user || 'Guest'),
      text: String(payload.text || ''),
      ts: Date.now(),
    };

    // Save chat message asynchronously to Cloud Firestore database
    try {
      await db.collection('rooms').doc(rid).collection('messages').add(msg);
    } catch (err) {
      console.error('Failed to save message to Firestore:', err.message);
    }

    // Broadcast message live to all active collaborators in the room
    io.to(`app:${rid}`).emit('chat:message', msg);
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

function start() {
  server.listen(PORT, () => {
    console.log(`API: http://localhost:${PORT}/api`);
    console.log(`Socket.IO + Yjs namespaces: /yjs|<roomId>`);
  });
}

start();

