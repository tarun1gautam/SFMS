/**
 * sockets/socketHandler.js
 */
const jwt = require('jsonwebtoken');

let socketIO = null;

const setSocketIO = (io) => {
  socketIO = io;
};

const getSocketIO = () => {
  return socketIO;
};

const setupSockets = (io) => {
  setSocketIO(io);

  // Auth middleware for Socket.IO
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      next();
    } catch (err) {
      next(new Error('Invalid authentication token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected for user: ${socket.user?.user_id}`);

    if (socket.user?.user_id) {
      socket.join(`user:${socket.user.user_id}`);
    }

    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected for user: ${socket.user?.user_id}`);
    });
  });

  return io;
};

module.exports = {
  setupSockets,
  getSocketIO,
  setSocketIO
};