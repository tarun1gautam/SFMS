const os = require('os');
const path = require('path');
const pool = require('../config/db');
// Handle CJS export variation safely across Node environments
const checkDiskSpace = require('check-disk-space').default || require('check-disk-space');
const uploadQueue = require('../queues/uploadQueue');
const { storageBase } = require('../config/multer');

const bytesToGB = (b) => +(b / (1024 ** 3)).toFixed(2);

const getSystemStats = async (req, res) => {
  console.log('--- EXECUTING GET SYSTEM STATS HANDLER ---');
  try {
    // ── Disk — the drive actually holding uploaded files ────────────
    const targetPath = path.resolve(storageBase || './uploads');
    let diskInfo = { size: 0, free: 0 };

    try {
      diskInfo = await checkDiskSpace(targetPath);
    } catch (diskErr) {
      console.warn('Warning: Failed to retrieve disk metrics via checkDiskSpace:', diskErr.message);
    }

    // ── Memory ───────────────────────────────────────────────────────
    const totalMem = os.totalmem();
    const freeMem  = os.freemem();
    const usedMem  = totalMem - freeMem;

    // ── CPU ──────────────────────────────────────────────────────────
    const cpus = os.cpus();

    // ── Database ─────────────────────────────────────────────────────
    const [dbSizeRes, connRes, tableSizesRes] = await Promise.all([
      pool.query(`SELECT pg_database_size(current_database()) AS size`),
      pool.query(`
        SELECT count(*) AS total,
               count(*) FILTER (WHERE state = 'active') AS active,
               count(*) FILTER (WHERE state = 'idle')   AS idle
        FROM pg_stat_activity WHERE datname = current_database()`),
      pool.query(`
        SELECT relname AS table_name,
               pg_total_relation_size(relid) AS size_bytes,
               n_live_tup AS row_estimate
        FROM pg_stat_user_tables
        ORDER BY pg_total_relation_size(relid) DESC
        LIMIT 5`),
    ]);

    // ── App-level counts ─────────────────────────────────────────────
    const [fileCount, folderCount, downloadLogCount] = await Promise.all([
      pool.query('SELECT COUNT(*) FROM files'),
      pool.query('SELECT COUNT(*) FROM virtual_folders'),
      pool.query('SELECT COUNT(*) FROM download_logs'),
    ]);

    // ── Safe Queue Stats Evaluation ─────────────────────────────────
    let queueStats = { active: 0, waiting: 0, total: 0 };
    try {
      if (uploadQueue && typeof uploadQueue.stats === 'function') {
        queueStats = uploadQueue.stats();
      }
    } catch (queueErr) {
      console.warn('Warning: uploadQueue.stats() failed or called shell command:', queueErr.message);
    }

    const totalDisk = diskInfo.size || 1; // Prevent division by zero
    const freeDisk = diskInfo.free || 0;
    const usedDisk = totalDisk - freeDisk;

    res.json({
      disk: {
        pathChecked : targetPath,
        totalGB     : bytesToGB(totalDisk),
        freeGB      : bytesToGB(freeDisk),
        usedGB      : bytesToGB(usedDisk),
        usedPercent : +((usedDisk / totalDisk) * 100).toFixed(1),
      },
      memory: {
        totalGB       : bytesToGB(totalMem),
        freeGB        : bytesToGB(freeMem),
        usedGB        : bytesToGB(usedMem),
        usedPercent   : +((usedMem / totalMem) * 100).toFixed(1),
        processRssMB  : +(process.memoryUsage().rss / (1024 ** 2)).toFixed(1),
      },
      cpu: {
        cores     : cpus.length,
        model     : cpus[0]?.model || 'unknown',
        loadAvg1m : os.loadavg()[0], // NOTE: always 0 on Windows
      },
      database: {
        sizeGB       : bytesToGB(parseInt(dbSizeRes.rows[0]?.size || 0)),
        connections  : connRes.rows[0] || { total: 0, active: 0, idle: 0 },
        largestTables: tableSizesRes.rows.map(t => ({
          name  : t.table_name,
          sizeGB: bytesToGB(parseInt(t.size_bytes)),
          rows  : parseInt(t.row_estimate),
        })),
      },
      application: {
        totalFiles       : parseInt(fileCount.rows[0]?.count || 0),
        totalFolders     : parseInt(folderCount.rows[0]?.count || 0),
        totalDownloadLogs: parseInt(downloadLogCount.rows[0]?.count || 0),
        uploadQueue      : queueStats,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('System stats error:', err);
    res.status(500).json({ error: 'Failed to gather system stats' });
  }
};

module.exports = { getSystemStats };