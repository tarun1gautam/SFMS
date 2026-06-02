require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');


const { initializeDatabase } = require('./config/initDb');
const { setupSockets } = require('./sockets/socketHandler');
const { startCleanupCron } = require('./utils/cronCleanup');
const { getLocalIpAddress } = require('./utils/network');

const authRoutes = require('./routes/auth');
const fileRoutes = require('./routes/files');

const app = express();
const httpServer = http.createServer(app);

const PORT = parseInt(process.env.PORT || '5000');
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// Socket.io
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});
setupSockets(io);

// Middleware


const corsOptions = {
  origin: function (origin, callback) {
    // 1. Allow server-to-server requests or tools like Postman (where origin is undefined)
    if (!origin) return callback(null, true);

    // 2. Define standard regex rules for local environments
    const isLocalhost = origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1');
    const isLocalNetwork = origin.startsWith('http://10.') || origin.startsWith('http://192.168.');

    if (isLocalhost || isLocalNetwork) {
      // Allow the connection dynamically
      callback(null, true); 
    } else {
      // Reject any unknown external internet domain
      callback(new Error('Blocked by Dynamic CORS Security Policies'));
    }
  },
  credentials: true // Crucial if you are passing JWT tokens in HTTP-Only cookies
};

app.use(cors(corsOptions));

// app.use(cors({ origin: '*', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/files', fileRoutes(io));

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: new Date().toISOString() }));

// 404 handlers
app.use((req, res) => res.status(404).json({ error: 'Route not found' }));

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const startServer = async () => {
  try {
    await initializeDatabase();

    httpServer.listen(PORT, '0.0.0.0', () => {
      const localIp = getLocalIpAddress();
      console.log('\n========================================');
      console.log('🚀 SFMS Backend Server Running');
      console.log('========================================');
      console.log(`📡 Local:    http://localhost:${PORT}`);
      console.log(`🌐 Network:  http://${localIp}:${PORT}`);
      console.log('========================================\n');
    });

    startCleanupCron();
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

startServer();