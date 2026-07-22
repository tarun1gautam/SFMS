/**
 * server.js  (SFMS — Production Concurrent Upload Edition)
 *
 * Changes from original:
 *  1. Attaches uploadQueue to Socket.io so the queue can push position updates
 *  2. Adds express-rate-limit on the upload endpoint (per-IP throttle)
 *  3. Adds compression middleware (saves ~60-70% bandwidth on JSON responses)
 *  4. Enhanced /health endpoint shows queue depth and system memory
 *  5. Graceful shutdown — waits for active uploads before exiting
 */

require('dotenv').config();
const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const cors       = require('cors');
const path       = require('path');
const os         = require('os');

// ── Conditionally load optional middleware ──────────────────────────────────
let rateLimit, compression;
try { rateLimit   = require('express-rate-limit'); } catch (_) {}
try { compression = require('compression');        } catch (_) {}

const { initializeDatabase } = require('./config/initDb');
const { setupSockets }       = require('./sockets/socketHandler');
const { setupShareSockets }  = require('./sockets/shareHandler');
const { startCleanupCron }   = require('./utils/cronCleanup');
const { getLocalIpAddress }  = require('./utils/network');
const uploadQueue             = require('./queues/uploadQueue');

const authRoutes   = require('./routes/auth');
const fileRoutes   = require('./routes/files');
const folderRoutes = require('./routes/folders');
const toolsRoutes  = require('./routes/tools');
const shareRoutes  = require('./routes/share');

const app        = express();
const httpServer = http.createServer(app);

const PORT         = parseInt(process.env.PORT || '5000');
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:80';

// ── Socket.io ───────────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors:               { origin: '*', methods: ['GET', 'POST'] },
  maxHttpBufferSize:  1e6,        // 1 MB — sockets are for events, not file data
  pingTimeout:        60000,
  pingInterval:       25000,
});
setupSockets(io);
setupShareSockets(io); // Nearby Share: LAN discovery + WebRTC signaling + relay fallback

// Attach io to the upload queue so it can push position events
uploadQueue.attachIo(io);

// ── CORS ─────────────────────────────────────────────────────────────────────
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    const isLocalhost    = origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1');
    const isLocalNetwork = origin.startsWith('http://10.') || origin.startsWith('http://192.168.');
    if (isLocalhost || isLocalNetwork) return callback(null, true);
    callback(new Error('Blocked by CORS policy'));
  },
  credentials: true,
};
app.use(cors(corsOptions));

// ── Compression (optional) ───────────────────────────────────────────────────
if (compression) {
  app.use(compression({ threshold: 1024 }));
}

// ── Body parsers ────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── Rate limiting on uploads (optional — graceful degradation if not installed) ──
if (rateLimit) {
  const uploadLimiter = rateLimit({
    windowMs: 60 * 1000,                          // 1 minute window
    max:      parseInt(process.env.UPLOAD_RATE_LIMIT_PER_MIN || '30'), // 30 uploads/min per IP
    standardHeaders: true,
    legacyHeaders:   false,
    message: { error: 'Too many upload requests. Please wait before retrying.' },
    skip: (req) => req.user?.role === 'admin',    // admins bypass rate limit
  });
  app.use('/api/files/upload', uploadLimiter);
  app.use('/api/files/upload-batch', uploadLimiter);
}

// ── Request logger ───────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  if (process.env.NODE_ENV !== 'production') {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  }
  next();
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth',       authRoutes);
app.use('/api/files',      fileRoutes(io));
app.use('/api/folders',    folderRoutes);
app.use('/api/createFolder', folderRoutes);
app.use('/api/tools',      toolsRoutes);
app.use('/api/share',      shareRoutes);

// ── Health check (enhanced) ─────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  const memTotal = os.totalmem();
  const memFree  = os.freemem();
  res.json({
    status:    'ok',
    timestamp: new Date().toISOString(),
    uptime:    Math.floor(process.uptime()),
    queue:     uploadQueue.stats(),
    memory: {
      totalGB: (memTotal / 1e9).toFixed(1),
      freeGB:  (memFree  / 1e9).toFixed(1),
      usedPct: Math.round((1 - memFree / memTotal) * 100),
    },
    cpuLoad:   os.loadavg(),
  });
});

// ── 404 handler ──────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));

// ── Global error handler ─────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start server ─────────────────────────────────────────────────────────────
const startServer = async () => {
  try {
    await initializeDatabase();
    httpServer.listen(PORT, '0.0.0.0', () => {
      const localIp = getLocalIpAddress();
      console.log('\n========================================');
      console.log('🚀 SFMS Backend — Production Mode');
      console.log('========================================');
      console.log(`📡 Local:    http://localhost:${PORT}`);
      console.log(`🌐 Network:  http://${localIp}:${PORT}`);
      console.log(`🔁 Queue:    max ${process.env.MAX_CONCURRENT_UPLOADS || 20} concurrent uploads`);
      console.log('========================================\n');
    });
    startCleanupCron();
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
};

// ── Graceful shutdown ────────────────────────────────────────────────────────
const gracefulShutdown = (signal) => {
  console.log(`\n${signal} received — waiting for active uploads to finish...`);
  const checkAndExit = () => {
    const { active } = uploadQueue.stats();
    if (active === 0) {
      console.log('All uploads complete. Shutting down.');
      httpServer.close(() => process.exit(0));
    } else {
      console.log(`  ${active} upload(s) still active, waiting 3s...`);
      setTimeout(checkAndExit, 3000);
    }
  };
  checkAndExit();
  // Force-exit after 2 minutes regardless
  setTimeout(() => { console.log('Force exit.'); process.exit(1); }, 120_000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

startServer();