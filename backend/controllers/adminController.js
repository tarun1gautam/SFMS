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

const getAuditLogs = async (req, res) => {
  try {
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const limit  = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;

    const { actor, action, targetType, status, dateFrom, dateTo } = req.query;
    const conditions = [];
    const params = [];

    if (actor)      { params.push(actor);      conditions.push(`al.actor_user_id ILIKE '%' || $${params.length} || '%'`); }
    if (action)     { params.push(action);     conditions.push(`al.action ILIKE '%' || $${params.length} || '%'`); }
    if (targetType) { params.push(targetType); conditions.push(`al.target_type = $${params.length}`); }
    if (status)     { params.push(status);     conditions.push(`al.status = $${params.length}`); }
    if (dateFrom)   { params.push(dateFrom);   conditions.push(`al.created_at >= $${params.length}::timestamptz`); }
    if (dateTo)     { params.push(dateTo);     conditions.push(`al.created_at <= $${params.length}::timestamptz`); }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    // First, get the audit logs
    const countRes = await pool.query(`
      SELECT COUNT(*) 
      FROM audit_logs al
      ${whereClause}
    `, params);
    const total = parseInt(countRes.rows[0].count);

    // Get the logs with pagination
    const logsRes = await pool.query(`
      SELECT 
        al.*
      FROM audit_logs al
      ${whereClause}
      ORDER BY al.created_at DESC 
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, limit, offset]);

    // Process each log and fetch related data separately
    const processedLogs = await Promise.all(logsRes.rows.map(async (log) => {
      // Parse metadata if it exists
      let metadata = log.metadata;
      if (typeof metadata === 'string') {
        try {
          metadata = JSON.parse(metadata);
        } catch {
          metadata = { raw: metadata };
        }
      }

      // Check if target_id is a valid UUID
      const isValidUUID = (str) => {
        return str && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
      };

      let fileData = null;
      let folderData = null;
      let downloadData = null;
      let userData = null;

      // Fetch user data
      if (log.actor_user_id) {
        try {
          const userRes = await pool.query(
            'SELECT user_id, role FROM users WHERE user_id = $1',
            [log.actor_user_id]
          );
          if (userRes.rows.length > 0) {
            userData = userRes.rows[0];
          }
        } catch (err) {
          console.warn('Failed to fetch user data:', err.message);
        }
      }

      // Fetch related data based on target_type and valid UUID
      if (log.target_type === 'file' && isValidUUID(log.target_id)) {
        try {
          const fileRes = await pool.query(
            'SELECT file_name, original_name, file_path, file_size, mime_type, virtual_path, visibility, uploaded_by, uploader_ip FROM files WHERE id = $1::uuid',
            [log.target_id]
          );
          if (fileRes.rows.length > 0) {
            fileData = fileRes.rows[0];
          }
        } catch (err) {
          console.warn('Failed to fetch file data:', err.message);
        }
      } else if (log.target_type === 'folder' && isValidUUID(log.target_id)) {
        try {
          const folderRes = await pool.query(
            'SELECT folder_name, parent_path, full_path, visibility, download_only FROM virtual_folders WHERE folder_id = $1::uuid',
            [log.target_id]
          );
          if (folderRes.rows.length > 0) {
            folderData = folderRes.rows[0];
          }
        } catch (err) {
          console.warn('Failed to fetch folder data:', err.message);
        }
      } else if (log.target_type === 'download' && isValidUUID(log.target_id)) {
        try {
          const downloadRes = await pool.query(
            'SELECT file_id, user_id, downloader_ip, downloaded_at FROM download_logs WHERE id = $1::uuid',
            [log.target_id]
          );
          if (downloadRes.rows.length > 0) {
            downloadData = downloadRes.rows[0];
          }
        } catch (err) {
          console.warn('Failed to fetch download data:', err.message);
        }
      }

      // Build human-readable details based on action type
      let details = log.target_label || '';
      let targetDisplayName = '';
      let targetPath = '';

      if (log.target_type === 'file' && fileData) {
        targetDisplayName = fileData.file_name || log.target_label || 'Unknown file';
        targetPath = fileData.file_path || fileData.virtual_path || '';
        if (targetPath) {
          details = `${targetDisplayName} (${targetPath})`;
        } else {
          details = targetDisplayName;
        }
      } else if (log.target_type === 'folder' && folderData) {
        targetDisplayName = folderData.folder_name || log.target_label || 'Unknown folder';
        targetPath = folderData.full_path || folderData.parent_path || '';
        if (targetPath) {
          details = `${targetDisplayName} (${targetPath})`;
        } else {
          details = targetDisplayName;
        }
      } else if (log.target_type === 'download' && downloadData) {
        targetDisplayName = log.target_label || 'Download record';
        details = `Download by ${downloadData.downloader_ip || log.ip_address || 'unknown IP'}`;
      } else {
        targetDisplayName = log.target_label || log.target_id || 'N/A';
        details = targetDisplayName;
      }

      // Add additional context based on action
      if (log.action) {
        if (log.action.includes('upload') && metadata) {
          if (metadata.virtual_path) {
            details = `Uploaded "${targetDisplayName}" to ${metadata.virtual_path}`;
          } else if (metadata.size) {
            const sizeMB = (metadata.size / (1024 * 1024)).toFixed(1);
            details = `Uploaded "${targetDisplayName}" (${sizeMB} MB)`;
          }
        }

        if (log.action.includes('edit') && metadata) {
          if (metadata.newName && metadata.oldName) {
            details = `Renamed from "${metadata.oldName}" to "${metadata.newName}"`;
          }
          if (metadata.newVisibility) {
            details = details ? `${details} • Visibility: ${metadata.newVisibility}` : `Visibility changed to ${metadata.newVisibility}`;
          }
          if (metadata.downloadOnlyChanged !== undefined) {
            const status = metadata.downloadOnlyChanged ? 'enabled' : 'disabled';
            details = details ? `${details} • Download only ${status}` : `Download only ${status}`;
          }
        }

        if (log.action.includes('delete') && metadata) {
          if (metadata.size) {
            const sizeMB = (metadata.size / (1024 * 1024)).toFixed(1);
            details = `Deleted "${targetDisplayName}" (${sizeMB} MB)`;
          } else {
            details = `Deleted "${targetDisplayName}"`;
          }
        }

        if (log.action.includes('create') && metadata) {
          if (metadata.visibility) {
            details = `Created "${targetDisplayName}" with visibility: ${metadata.visibility}`;
          }
        }

        if (log.action.includes('ownership') && metadata) {
          if (metadata.toOwner) {
            details = `Transferred ownership of "${targetDisplayName}" to ${metadata.toOwner}`;
          }
        }

        if (log.action.includes('login')) {
          details = `Login by ${log.actor_user_id || 'unknown user'}`;
          if (metadata && metadata.role) {
            details += ` (Role: ${metadata.role})`;
          }
        }
      }

      // Get user display name
      const userDisplay = log.actor_user_id || 'System';
      const userRole = userData?.role || log.actor_role || 'user';

      return {
        ...log,
        metadata: metadata,
        // Human-readable fields
        displayUser: userDisplay,
        userRole: userRole,
        displayTarget: targetDisplayName,
        targetPath: targetPath,
        details: details || log.target_label || 'No additional details',
        // File specific
        fileDisplayName: fileData?.file_name || log.target_label,
        fileSizeFormatted: fileData?.file_size ? formatFileSize(fileData.file_size) : null,
        // Folder specific
        folderDisplayName: folderData?.folder_name || log.target_label,
        folderPath: folderData?.full_path || folderData?.parent_path,
        // Format timestamp for display
        formattedTime: log.created_at ? new Date(log.created_at).toLocaleString() : 'N/A',
        timeAgo: log.created_at ? getTimeAgo(log.created_at) : 'N/A'
      };
    }));

    res.json({ 
      logs: processedLogs, 
      pagination: { 
        total, 
        page, 
        limit, 
        totalPages: Math.ceil(total / limit) 
      } 
    });
  } catch (err) {
    console.error('Audit logs fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
};

// Helper function to format file size
function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

// Helper function to get time ago
function getTimeAgo(timestamp) {
  const diff = Date.now() - new Date(timestamp).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

module.exports = { getSystemStats, getAuditLogs };