let io = null;

function setIO(socketIO) {
  io = socketIO;
}

function getIO() {
  return io;
}

function disconnectRoomUser(roomId, userId) {
  if (!io) return;
  for (const socket of io.sockets.sockets.values()) {
    if (socket.userId === userId && socket.roomId === roomId) {
      // This leaves only the application room; it deliberately preserves the global socket session.
      socket.leave(`app:${roomId}`);
      socket.emit('room:removed', { roomId });
    }
  }
}

function closeYjsRoom(roomId) {
  // y-socket.io owns provider lifecycle. Application clients receive room:deleted and destroy providers.
  // No global Socket.IO connections are disconnected here.
  if (io) io.to(`app:${roomId}`).emit('yjs:disconnect', { roomId });
}

module.exports = {
  setIO,
  getIO,
  disconnectRoomUser,
  closeYjsRoom,
};
