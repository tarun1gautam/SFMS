import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import {
  RefreshCw, Search, X, ChevronDown, HardDrive, Cpu, Database, Server,
  FolderOpen, FileText, Users, CheckCircle2, XCircle, Globe, Clock,
  Activity, Trash2, FolderPlus, Upload, Pencil, LogIn, RotateCw as RotateOwnership,
  Download, ClipboardList, Lock, FolderCog, File as FileIcon, Info,
} from 'lucide-react';

// --- Reusable UI Elements ---

const Bar = ({ percent, danger = 80, warn = 60, height = "h-2" }) => {
  const safePercent = Math.min(Math.max(percent || 0, 0), 100);
  const color =
    safePercent >= danger
      ? 'bg-gradient-to-r from-red-500 to-rose-600'
      : safePercent >= warn
      ? 'bg-gradient-to-r from-amber-500 to-orange-500'
      : 'bg-gradient-to-r from-blue-500 to-indigo-600';

  return (
    <div className={`w-full ${height} bg-field dark:bg-gray-800 rounded-full overflow-hidden p-0.5 border border-line dark:border-gray-700/30`}>
      <div
        className={`h-full ${color} rounded-full transition-all duration-500 ease-out`}
        style={{ width: `${safePercent}%` }}
      />
    </div>
  );
};

const MetricCard = ({ title, icon, children, badge, className }) => (
  <div className={`bg-surface dark:bg-gray-900 border border-line dark:border-gray-800/80 rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col ${className || ''}`}>
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-field dark:bg-gray-800 text-blue-600 dark:text-blue-400">
            {icon}
          </div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-subtle dark:text-gray-400">
            {title}
          </h3>
        </div>
        {badge && (
          <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  </div>
);

const StatRow = ({ label, value, subtext, highlight }) => (
  <div className={`flex items-center justify-between py-1 border-b border-line/60 dark:border-gray-800/50 last:border-0 text-sm ${highlight ? 'bg-blue-50/50 dark:bg-blue-900/10 -mx-2 px-2 rounded-lg' : ''}`}>
    <span className="text-subtle dark:text-gray-400 font-medium">{label}</span>
    <div className="text-right">
      <span className={`text-ink dark:text-white font-semibold ${highlight ? 'text-blue-600 dark:text-blue-400' : ''}`}>{value}</span>
      {subtext && <div className="text-[11px] text-faint dark:text-gray-500">{subtext}</div>}
    </div>
  </div>
);

// --- Action metadata: icon + color per action type ------------------------

function getActionMeta(action) {
  const a = action || '';
  if (a.includes('delete')) {
    return { Icon: Trash2, chip: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20', iconBg: 'bg-red-500/10 text-red-600 dark:text-red-400' };
  }
  if (a.includes('create') && a.includes('folder')) {
    return { Icon: FolderPlus, chip: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20', iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' };
  }
  if (a.includes('upload') || a.includes('create')) {
    return { Icon: Upload, chip: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20', iconBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' };
  }
  if (a.includes('edit') || a.includes('update')) {
    return { Icon: Pencil, chip: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20', iconBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400' };
  }
  if (a.includes('login')) {
    return { Icon: LogIn, chip: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20', iconBg: 'bg-purple-500/10 text-purple-600 dark:text-purple-400' };
  }
  if (a.includes('ownership')) {
    return { Icon: RotateOwnership, chip: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20', iconBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' };
  }
  if (a.includes('download')) {
    return { Icon: Download, chip: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20', iconBg: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' };
  }
  return { Icon: ClipboardList, chip: 'bg-gray-400/10 dark:bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-400/20 dark:border-gray-500/20', iconBg: 'bg-gray-400/10 dark:bg-gray-500/10 text-gray-600 dark:text-gray-400' };
}

function getTargetIcon(type) {
  if (!type) return FileIcon;
  if (type.includes('folder')) return FolderOpen;
  if (type.includes('user')) return Users;
  if (type.includes('download')) return Download;
  return FileIcon;
}

function getActionLabel(action) {
  if (!action) return 'Unknown';
  return action
    .split('.')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' • ');
}

function formatFileSize(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function getTimeAgo(dateStr) {
  if (!dateStr) return 'N/A';
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// --- Enhanced Log Entry Component ------------------------------------------

const LogEntry = ({ log }) => {
  const [expanded, setExpanded] = useState(false);

  let metadata = log.metadata;
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata); } catch { metadata = { raw: metadata }; }
  }

  const getMetadataDisplay = () => {
    if (!metadata || typeof metadata !== 'object') return [];
    const entries = Object.entries(metadata).filter(([key]) => key !== 'raw');

    const keyMap = {
      size: 'File Size', mimeType: 'File Type', virtual_path: 'Virtual Path',
      visibility: 'Visibility', conflict_resolution: 'Conflict Resolution',
      newName: 'New Name', oldName: 'Old Name', newVisibility: 'New Visibility',
      oldVisibility: 'Old Visibility', toOwner: 'New Owner',
      downloadOnlyChanged: 'Download Only Changed', ip: 'IP Address',
      userAgent: 'User Agent', role: 'Role',
    };

    return entries.map(([key, val]) => {
      let displayValue = val;
      const displayKey = keyMap[key] || key.charAt(0).toUpperCase() + key.slice(1);

      if (key === 'size' && typeof val === 'number') displayValue = formatFileSize(val);
      else if (typeof val === 'boolean') displayValue = val ? 'Yes' : 'No';
      else if (typeof val === 'object') displayValue = JSON.stringify(val, null, 2);

      return { key: displayKey, value: displayValue, rawKey: key, boolVal: typeof val === 'boolean' ? val : null };
    });
  };

  const { Icon: ActionIcon, chip: actionChip, iconBg } = getActionMeta(log.action);
  const actionLabel = getActionLabel(log.action);
  const TargetIcon = getTargetIcon(log.target_type);

  const displayUser = log.displayUser || log.actor_user_id || 'System';
  const userRole = log.userRole || log.actor_role || 'user';
  const displayDetails = log.details || log.target_label || 'No details provided';
  const timeAgo = log.timeAgo || getTimeAgo(log.created_at);
  const targetPath = log.targetPath || log.file_virtual_path || log.folder_full_path || '';
  const metadataDisplay = getMetadataDisplay();

  return (
    <div
      className={`group p-4 rounded-xl border ${actionChip} hover:shadow-lg transition-all duration-300 cursor-pointer ${expanded ? 'ring-2 ring-blue-500/30' : ''}`}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${iconBg}`}>
            <ActionIcon size={18} strokeWidth={2.2} />
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="text-sm font-semibold text-ink dark:text-white flex items-center gap-1.5">
              {displayUser}
              <span className="text-[10px] font-normal text-faint dark:text-gray-500">
                • {userRole}
              </span>
            </span>

            <span className="text-[10px] px-2 py-0.5 rounded-full bg-field dark:bg-gray-700 text-subtle dark:text-gray-300 font-medium">
              {actionLabel}
            </span>

            <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium ${
              log.status === 'success'
                ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                : 'bg-red-500/15 text-red-700 dark:text-red-400'
            }`}>
              {log.status === 'success' ? <CheckCircle2 size={11} /> : <XCircle size={11} />}
              {log.status === 'success' ? 'Success' : 'Failed'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs text-subtle dark:text-gray-400 mb-1.5">
            <span className="flex items-center gap-1">
              <TargetIcon size={12} className="text-faint dark:text-gray-500" />
              <span className="font-medium">{log.target_type || 'N/A'}</span>
            </span>
            {log.target_id && (
              <span className="font-mono bg-field dark:bg-gray-800 px-1.5 py-0.5 rounded text-[10px]">
                ID: {log.target_id.slice(0, 8)}...
              </span>
            )}
            {log.ip_address && (
              <span className="flex items-center gap-1">
                <Globe size={11} className="text-faint dark:text-gray-600" />
                {log.ip_address}
              </span>
            )}
            {log.target_type === 'file' && log.file_size && (
              <span className="flex items-center gap-1">
                <Activity size={11} className="text-faint dark:text-gray-600" />
                {formatFileSize(log.file_size)}
              </span>
            )}
            {log.target_type === 'folder' && log.folder_visibility && (
              <span className="flex items-center gap-1">
                <Info size={11} className="text-faint dark:text-gray-600" />
                {log.folder_visibility}
              </span>
            )}
            {log.target_type === 'folder' && log.folder_download_only !== undefined && (
              <span className="flex items-center gap-1">
                {log.folder_download_only
                  ? (<><Lock size={11} className="text-faint dark:text-gray-600" /> Download Only</>)
                  : (<><FolderCog size={11} className="text-faint dark:text-gray-600" /> Read/Write</>)}
              </span>
            )}
          </div>

          <div className="text-sm font-medium text-ink/90 dark:text-gray-300">
            {displayDetails}
          </div>

          {targetPath && (
            <div className="flex items-center gap-1 text-xs text-faint dark:text-gray-500 mt-1 font-mono truncate">
              <FolderOpen size={11} className="shrink-0" />
              {targetPath}
            </div>
          )}
        </div>

        <div className="flex-shrink-0 text-right">
          <div className="flex items-center justify-end gap-1 text-[11px] font-medium text-subtle dark:text-gray-400 whitespace-nowrap">
            <Clock size={11} />
            {timeAgo}
          </div>
          <div className="text-[10px] text-faint dark:text-gray-500 mt-0.5">
            {log.formattedTime || (log.created_at ? new Date(log.created_at).toLocaleString() : 'N/A')}
          </div>
          <div className="mt-1 text-faint dark:text-gray-600 flex justify-end">
            <ChevronDown size={16} className={`transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`} />
          </div>
        </div>
      </div>

      {/* Expanded Details */}
      {expanded && (
        <div className="mt-3 pt-3 border-t border-line dark:border-gray-700/50 space-y-2">
          {metadataDisplay.length > 0 && (
            <div className="bg-field/60 dark:bg-gray-800/50 rounded-lg p-3 space-y-1.5">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-subtle dark:text-gray-400 mb-2">
                <ClipboardList size={12} />
                Metadata Details
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {metadataDisplay.map(({ key, value, rawKey, boolVal }) => (
                  <div key={rawKey} className="flex flex-col">
                    <span className="text-[10px] text-faint dark:text-gray-500 uppercase tracking-wider">
                      {key}
                    </span>
                    <span className={`text-xs font-mono break-all flex items-center gap-1 ${
                      boolVal === true ? 'text-emerald-600 dark:text-emerald-400' :
                      boolVal === false ? 'text-red-500 dark:text-red-400' :
                      'text-ink/90 dark:text-gray-300'
                    }`}>
                      {boolVal === true && <CheckCircle2 size={11} />}
                      {boolVal === false && <XCircle size={11} />}
                      {String(value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
            <div className="bg-field/60 dark:bg-gray-800/50 rounded-lg p-2">
              <span className="text-subtle dark:text-gray-400">Action</span>
              <div className="font-mono text-ink/90 dark:text-gray-300 mt-0.5">{log.action}</div>
            </div>
            <div className="bg-field/60 dark:bg-gray-800/50 rounded-lg p-2">
              <span className="text-subtle dark:text-gray-400">Target</span>
              <div className="font-mono text-ink/90 dark:text-gray-300 mt-0.5 text-[10px]">
                {log.displayTarget || log.target_label || log.target_id || 'N/A'}
              </div>
            </div>
            {log.target_id && (
              <div className="bg-field/60 dark:bg-gray-800/50 rounded-lg p-2">
                <span className="text-subtle dark:text-gray-400">Target ID</span>
                <div className="font-mono text-ink/90 dark:text-gray-300 mt-0.5 text-[10px] break-all">
                  {log.target_id}
                </div>
              </div>
            )}
            {log.ip_address && (
              <div className="bg-field/60 dark:bg-gray-800/50 rounded-lg p-2">
                <span className="text-subtle dark:text-gray-400">IP Address</span>
                <div className="font-mono text-ink/90 dark:text-gray-300 mt-0.5 text-[10px]">
                  {log.ip_address}
                </div>
              </div>
            )}
            {log.file_path && (
              <div className="bg-field/60 dark:bg-gray-800/50 rounded-lg p-2 col-span-2">
                <span className="text-subtle dark:text-gray-400">File Path</span>
                <div className="font-mono text-ink/90 dark:text-gray-300 mt-0.5 text-[10px] break-all">
                  {log.file_path}
                </div>
              </div>
            )}
            {log.folder_full_path && (
              <div className="bg-field/60 dark:bg-gray-800/50 rounded-lg p-2 col-span-2">
                <span className="text-subtle dark:text-gray-400">Folder Path</span>
                <div className="font-mono text-ink/90 dark:text-gray-300 mt-0.5 text-[10px] break-all">
                  {log.folder_full_path}
                </div>
              </div>
            )}
            {log.file_mime_type && (
              <div className="bg-field/60 dark:bg-gray-800/50 rounded-lg p-2">
                <span className="text-subtle dark:text-gray-400">MIME Type</span>
                <div className="font-mono text-ink/90 dark:text-gray-300 mt-0.5 text-[10px]">
                  {log.file_mime_type}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 text-[10px] text-faint dark:text-gray-500 mt-1">
            <Clock size={10} />
            Full timestamp: {log.created_at ? new Date(log.created_at).toLocaleString() : 'N/A'}
          </div>
        </div>
      )}
    </div>
  );
};

// --- Main Dashboard Component ------------------------------------------------

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAction, setFilterAction] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');

  const fetchStats = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const res = await api.get('/admin/system-stats');
      setStats(res.data);
      setError('');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load system stats');
    } finally {
      setLoading(false);
      if (isManual) setTimeout(() => setIsRefreshing(false), 500);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    setLogsLoading(true);
    try {
      const res = await api.get('/admin/audit-logs?limit=100');
      const logsData = res.data?.logs || res.data || [];
      setLogs(Array.isArray(logsData) ? logsData : []);
    } catch (err) {
      console.error('Failed to fetch logs:', err);
      setLogs([]);
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchLogs();
    const interval = setInterval(() => {
      fetchStats(false);
      fetchLogs();
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchStats, fetchLogs]);

  const filteredLogs = React.useMemo(() => {
    const logsArray = Array.isArray(logs) ? logs : [];
    return logsArray.filter(log => {
      const matchesSearch = searchTerm === '' ||
        (log.user || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.action || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.details || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (log.target_name || '').toLowerCase().includes(searchTerm.toLowerCase());

      const matchesAction = filterAction === 'all' || log.action === filterAction;
      const matchesStatus = filterStatus === 'all' || log.status === filterStatus;

      return matchesSearch && matchesAction && matchesStatus;
    });
  }, [logs, searchTerm, filterAction, filterStatus]);

  const uniqueActions = React.useMemo(() => {
    const logsArray = Array.isArray(logs) ? logs : [];
    const actions = new Set(logsArray.map(log => log.action).filter(Boolean));
    return Array.from(actions);
  }, [logs]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4 text-subtle dark:text-gray-400 text-sm">
        <RefreshCw className="animate-spin text-blue-600" size={28} />
        <span>Gathering system diagnostics...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="m-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm flex items-center gap-3">
        <XCircle size={20} className="shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  if (!stats) return null;

  const { disk, memory, cpu, database, application } = stats;
  const totalTableGB = database.largestTables?.reduce((acc, t) => acc + (t.sizeGB || 0), 0) || 0;
  const queueItems = Object.entries(application?.uploadQueue || {});
  const totalQueue = queueItems.reduce((acc, [, val]) => acc + (Number(val) || 0), 0);

  const logsArray = Array.isArray(logs) ? logs : [];
  const totalActions = logsArray.length;
  const successfulActions = logsArray.filter(l => l?.status === 'success').length;
  const failedActions = logsArray.filter(l => l?.status === 'failed').length;
  const uniqueUsers = new Set(logsArray.map(l => l?.user).filter(Boolean)).size;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface dark:bg-gray-900 border border-line dark:border-gray-800 p-5 rounded-2xl shadow-sm">
        <div className="flex items-center gap-3">
          <div className="relative">
            <span className="flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
            </span>
          </div>
          <div>
            <h1 className="text-lg font-bold text-ink dark:text-white">System Health & Activity Overview</h1>
            <p className="text-xs text-subtle dark:text-gray-400">
              Auto-refreshing every 15 seconds • {logsArray.length} total logs loaded
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs text-faint dark:text-gray-500 hidden md:inline">
            Updated {stats.timestamp ? new Date(stats.timestamp).toLocaleTimeString() : 'N/A'}
          </span>
          <button
            onClick={() => { fetchStats(true); fetchLogs(); }}
            disabled={isRefreshing}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-field hover:bg-line dark:bg-gray-800 dark:hover:bg-gray-700 text-xs font-semibold text-subtle dark:text-gray-200 transition-colors"
          >
            <RefreshCw size={13} className={isRefreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-line dark:border-gray-800 pb-2">
        <button
          onClick={() => setActiveTab('overview')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'overview'
              ? 'bg-blue-500 text-white shadow-md'
              : 'text-subtle dark:text-gray-400 hover:bg-field dark:hover:bg-gray-800'
          }`}
        >
          <Activity size={14} />
          Overview
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
            activeTab === 'logs'
              ? 'bg-blue-500 text-white shadow-md'
              : 'text-subtle dark:text-gray-400 hover:bg-field dark:hover:bg-gray-800'
          }`}
        >
          <ClipboardList size={14} />
          Activity Logs
          <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-white/20">
            {filteredLogs.length}
          </span>
        </button>
      </div>

      {activeTab === 'overview' ? (
        <>
          {/* Quick Status Bar */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="bg-surface dark:bg-gray-900 border border-line dark:border-gray-800 p-4 rounded-2xl">
              <div className="text-xs text-subtle dark:text-gray-400 font-medium">Disk Used</div>
              <div className="text-xl font-bold text-ink dark:text-white mt-1">{disk?.usedPercent || 0}%</div>
              <div className="text-[11px] text-faint mt-0.5">{disk?.usedGB || 0} / {disk?.totalGB || 0} GB</div>
            </div>
            <div className="bg-surface dark:bg-gray-900 border border-line dark:border-gray-800 p-4 rounded-2xl">
              <div className="text-xs text-subtle dark:text-gray-400 font-medium">RAM Used</div>
              <div className="text-xl font-bold text-ink dark:text-white mt-1">{memory?.usedPercent || 0}%</div>
              <div className="text-[11px] text-faint mt-0.5">{memory?.usedGB || 0} / {memory?.totalGB || 0} GB</div>
            </div>
            <div className="bg-surface dark:bg-gray-900 border border-line dark:border-gray-800 p-4 rounded-2xl">
              <div className="text-xs text-subtle dark:text-gray-400 font-medium">Active DB Conns</div>
              <div className="text-xl font-bold text-ink dark:text-white mt-1">{database?.connections?.active || 0}</div>
              <div className="text-[11px] text-faint mt-0.5">Total: {database?.connections?.total || 0}</div>
            </div>
            <div className="bg-surface dark:bg-gray-900 border border-line dark:border-gray-800 p-4 rounded-2xl">
              <div className="text-xs text-subtle dark:text-gray-400 font-medium">Files Managed</div>
              <div className="text-xl font-bold text-ink dark:text-white mt-1">{application?.totalFiles?.toLocaleString() || 0}</div>
              <div className="text-[11px] text-faint mt-0.5">{application?.totalFolders?.toLocaleString() || 0} folders</div>
            </div>
            <div className="bg-surface dark:bg-gray-900 border border-line dark:border-gray-800 p-4 rounded-2xl">
              <div className="text-xs text-subtle dark:text-gray-400 font-medium">Queue Items</div>
              <div className="text-xl font-bold text-ink dark:text-white mt-1">{totalQueue}</div>
              <div className="text-[11px] text-faint mt-0.5">{queueItems.length} categories</div>
            </div>
          </div>

          {/* Activity Summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-gradient-to-r from-blue-500/10 to-indigo-500/10 border border-blue-500/20 rounded-2xl p-4">
              <div className="text-xs text-subtle dark:text-gray-400 font-medium">Total Actions</div>
              <div className="text-2xl font-bold text-ink dark:text-white mt-1">{totalActions}</div>
              <div className="text-[11px] text-faint mt-0.5">All time</div>
            </div>
            <div className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border border-emerald-500/20 rounded-2xl p-4">
              <div className="text-xs text-subtle dark:text-gray-400 font-medium">Successful</div>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{successfulActions}</div>
              <div className="text-[11px] text-faint mt-0.5">{totalActions > 0 ? Math.round((successfulActions/totalActions)*100) : 0}% success rate</div>
            </div>
            <div className="bg-gradient-to-r from-red-500/10 to-rose-500/10 border border-red-500/20 rounded-2xl p-4">
              <div className="text-xs text-subtle dark:text-gray-400 font-medium">Failed</div>
              <div className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">{failedActions}</div>
              <div className="text-[11px] text-faint mt-0.5">{totalActions > 0 ? Math.round((failedActions/totalActions)*100) : 0}% failure rate</div>
            </div>
            <div className="bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20 rounded-2xl p-4">
              <div className="text-xs text-subtle dark:text-gray-400 font-medium">Unique Users</div>
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">{uniqueUsers}</div>
              <div className="text-[11px] text-faint mt-0.5">Active users</div>
            </div>
          </div>

          {/* Main Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            <MetricCard title="Storage Architecture" badge={`${disk?.freeGB || 0} GB Free`} icon={<HardDrive size={18} />}>
              <div className="space-y-3">
                <div className="flex justify-between items-end">
                  <div>
                    <span className="text-2xl font-bold text-ink dark:text-white">{disk?.usedPercent || 0}%</span>
                    <span className="text-xs text-subtle dark:text-gray-400 ml-1.5">Capacity Allocated</span>
                  </div>
                  <span className="text-xs font-semibold text-subtle dark:text-gray-300">{disk?.usedGB || 0} / {disk?.totalGB || 0} GB</span>
                </div>
                <Bar percent={disk?.usedPercent || 0} height="h-3" />
                <div className="p-2.5 rounded-xl bg-field dark:bg-gray-950 border border-line dark:border-gray-800/80">
                  <span className="text-[11px] font-mono text-subtle dark:text-gray-400 block truncate">
                    Path: {disk?.pathChecked || 'N/A'}
                  </span>
                </div>
              </div>
            </MetricCard>

            <MetricCard title="System Memory" badge={`RSS: ${memory?.processRssMB || 0} MB`} icon={<Server size={18} />}>
              <div className="space-y-3">
                <div className="flex justify-between items-end">
                  <div>
                    <span className="text-2xl font-bold text-ink dark:text-white">{memory?.usedPercent || 0}%</span>
                    <span className="text-xs text-subtle dark:text-gray-400 ml-1.5">RAM Utilization</span>
                  </div>
                  <span className="text-xs font-semibold text-subtle dark:text-gray-300">{memory?.usedGB || 0} / {memory?.totalGB || 0} GB</span>
                </div>
                <Bar percent={memory?.usedPercent || 0} height="h-3" />
                <StatRow label="Node.js Process Memory" value={`${memory?.processRssMB || 0} MB`} />
              </div>
            </MetricCard>

            <MetricCard title="Processing Unit" badge={`${cpu?.cores || 0} Cores`} icon={<Cpu size={18} />}>
              <div className="space-y-3">
                <StatRow label="Processor Architecture" value={cpu?.model || 'Standard CPU'} />
                <StatRow label="Available Hardware Threads" value={`${cpu?.cores || 0} Cores`} />
                <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs">
                  <Info size={14} className="shrink-0 mt-0.5" />
                  OS load details are best verified directly within Task Manager / Hypervisor metrics.
                </div>
              </div>
            </MetricCard>

            <MetricCard title="Application Footprint" icon={<FolderCog size={18} />}>
              <div className="space-y-1">
                <StatRow label="Total Files Stored" value={application?.totalFiles?.toLocaleString() || 0} />
                <StatRow label="Total Directory Folders" value={application?.totalFolders?.toLocaleString() || 0} />
                <StatRow label="Audit / Download Logs" value={application?.totalDownloadLogs?.toLocaleString() || 0} />
                <StatRow label="Upload Queue Items" value={totalQueue} subtext={`${queueItems.length} categories`} />
              </div>
            </MetricCard>

            <MetricCard title="Database Infrastructure" badge={`${database?.sizeGB || 0} GB`} icon={<Database size={18} />}>
              <div className="space-y-3">
                <StatRow label="Connection Pool" value={`${database?.connections?.total || 0} Total (${database?.connections?.active || 0} Active)`} />
                <div className="pt-2">
                  <div className="text-xs font-bold uppercase tracking-wider text-subtle dark:text-gray-400 mb-2">
                    Top Data Tables
                  </div>
                  <div className="space-y-2">
                    {database?.largestTables?.map((t) => {
                      const share = totalTableGB > 0 ? Math.round(((t.sizeGB || 0) / totalTableGB) * 100) : 0;
                      return (
                        <div key={t.name} className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="font-mono text-subtle dark:text-gray-300">{t.name}</span>
                            <span className="text-faint">{t.sizeGB} GB · {t.rows?.toLocaleString() || 0} rows</span>
                          </div>
                          <Bar percent={share} height="h-1.5" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </MetricCard>

            <MetricCard title="Upload Queue Activity" badge={totalQueue > 0 ? `${totalQueue} Active` : 'Idle'} icon={<Upload size={18} />}>
              <div className="space-y-2">
                {queueItems.length > 0 ? (
                  queueItems.map(([key, val]) => (
                    <div key={key} className="flex items-center justify-between p-2.5 rounded-xl bg-field dark:bg-gray-950 border border-line dark:border-gray-800">
                      <span className="text-xs font-semibold text-subtle dark:text-gray-400 capitalize">{key}</span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400">
                        {String(val)}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-6 text-xs text-faint dark:text-gray-600">
                    Queue is clear and empty.
                  </div>
                )}
              </div>
            </MetricCard>

          </div>
        </>
      ) : (
        <div className="space-y-4">
          {/* Filters & Stats */}
          <div className="bg-surface dark:bg-gray-900 border border-line dark:border-gray-800 rounded-2xl p-4">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint dark:text-gray-500" />
                  <input
                    type="text"
                    placeholder="Search logs..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-10 pr-10 py-2 rounded-xl border border-line dark:border-gray-700 bg-field dark:bg-gray-800 text-ink dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm('')}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-subtle dark:hover:text-gray-300"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex gap-2 flex-wrap">
                <select
                  value={filterAction}
                  onChange={(e) => setFilterAction(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-line dark:border-gray-700 bg-field dark:bg-gray-800 text-ink dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Actions</option>
                  {uniqueActions.map(action => (
                    <option key={action} value={action}>{action}</option>
                  ))}
                </select>

                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="px-3 py-2 rounded-xl border border-line dark:border-gray-700 bg-field dark:bg-gray-800 text-ink dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="all">All Status</option>
                  <option value="success">Success</option>
                  <option value="failed">Failed</option>
                </select>

                <button
                  onClick={() => { setSearchTerm(''); setFilterAction('all'); setFilterStatus('all'); }}
                  className="px-3 py-2 rounded-xl bg-field hover:bg-line dark:bg-gray-800 dark:hover:bg-gray-700 text-subtle dark:text-gray-400 text-sm transition-colors"
                >
                  Clear Filters
                </button>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-line dark:border-gray-800">
              <span className="text-xs text-subtle dark:text-gray-400">
                Showing {filteredLogs.length} of {logsArray.length} logs
              </span>
              <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 size={12} />
                {filteredLogs.filter(l => l?.status === 'success').length} successful
              </span>
              <span className="flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
                <XCircle size={12} />
                {filteredLogs.filter(l => l?.status === 'failed').length} failed
              </span>
              {logsLoading && (
                <span className="text-xs text-faint flex items-center gap-1">
                  <RefreshCw size={12} className="animate-spin" />
                  Updating...
                </span>
              )}
            </div>
          </div>

          {/* Logs List */}
          <div className="bg-surface dark:bg-gray-900 border border-line dark:border-gray-800 rounded-2xl p-5">
            <div className="space-y-3 max-h-[800px] overflow-y-auto pr-2 custom-scrollbar">
              {filteredLogs.length > 0 ? (
                filteredLogs.map((log, index) => (
                  <LogEntry key={log.id || index} log={log} />
                ))
              ) : (
                <div className="text-center py-16 text-faint dark:text-gray-600">
                  <Search size={40} className="mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No logs found</p>
                  <p className="text-sm mt-1">Try adjusting your search or filters</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}