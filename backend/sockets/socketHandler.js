const jwt = require('jsonwebtoken');

const setupSockets = (io) => {
  // Auth middleware for sockets
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) return next(new Error('Authentication required'));

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`🔌 Socket connected: ${socket.user.user_id}`);

    socket.join(`user:${socket.user.user_id}`);

    socket.on('disconnect', () => {
      console.log(`🔌 Socket disconnected: ${socket.user.user_id}`);
    });
  });

  return io;
};

module.exports = { setupSockets };