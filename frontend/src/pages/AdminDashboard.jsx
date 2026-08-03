import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../utils/api';
import {
  RefreshCw, Search, X, ChevronDown, ChevronRight, HardDrive, Cpu, Database, Server,
  FolderOpen, FileText, Users, CheckCircle2, XCircle, Globe, Clock,
  Activity, Trash2, FolderPlus, Upload, Pencil, LogIn, RotateCw as RotateOwnership,
  Download, ClipboardList, Lock, FolderCog, File as FileIcon, Info, Filter,
  FileSpreadsheet, Calendar, ChevronLeft, ChevronsLeft, ChevronsRight, ShieldCheck,
  Zap, SlidersHorizontal, ArrowUpDown, ChevronUp, AlertCircle, Copy, Check
} from 'lucide-react';

// --- Reusable UI Elements ---

const Bar = ({ percent, danger = 80, warn = 60, height = "h-1.5" }) => {
  const safePercent = Math.min(Math.max(percent || 0, 0), 100);
  const color =
    safePercent >= danger
      ? 'bg-gradient-to-r from-red-500 to-rose-600'
      : safePercent >= warn
      ? 'bg-gradient-to-r from-amber-500 to-orange-500'
      : 'bg-gradient-to-r from-blue-500 to-indigo-600';

  return (
    <div className={`w-full ${height} bg-slate-100 dark:bg-slate-800/80 rounded-full overflow-hidden p-0 border border-slate-200/50 dark:border-slate-700/50`}>
      <div
        className={`h-full ${color} rounded-full transition-all duration-500 ease-out`}
        style={{ width: `${safePercent}%` }}
      />
    </div>
  );
};

const MetricCard = ({ title, icon, children, badge, className }) => (
  <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col ${className || ''}`}>
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400">
            {icon}
          </div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            {title}
          </h3>
        </div>
        {badge && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  </div>
);

const StatRow = ({ label, value, subtext, highlight }) => (
  <div className={`flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-800/60 last:border-0 text-xs ${highlight ? 'bg-blue-50/50 dark:bg-blue-900/10 -mx-1 px-1 rounded' : ''}`}>
    <span className="text-slate-500 dark:text-slate-400 font-medium">{label}</span>
    <div className="text-right">
      <span className={`text-slate-900 dark:text-white font-semibold font-mono ${highlight ? 'text-blue-600 dark:text-blue-400' : ''}`}>{value}</span>
      {subtext && <div className="text-[10px] text-slate-400 dark:text-slate-500">{subtext}</div>}
    </div>
  </div>
);

// --- Action metadata: icon + color per action type ------------------------

function getActionMeta(action) {
  const a = (action || '').toLowerCase();
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
  return { Icon: ClipboardList, chip: 'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20', iconBg: 'bg-slate-500/10 text-slate-600 dark:text-slate-400' };
}

function getTargetIcon(type) {
  if (!type) return FileIcon;
  const t = type.toLowerCase();
  if (t.includes('folder')) return FolderOpen;
  if (t.includes('user')) return Users;
  if (t.includes('download')) return Download;
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

// --- Detail View Shared Render ---

const ExpandedLogDetails = ({ log, metadataDisplay, actionLabel }) => {
  const [copied, setCopied] = useState(false);

  const copyAsJSON = () => {
    navigator.clipboard.writeText(JSON.stringify(log, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-4 bg-slate-100 text-slate-800 dark:bg-slate-950 dark:text-slate-100 border-t border-slate-200 dark:border-slate-800 font-sans text-xs space-y-3 rounded-b-md transition-colors">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
        <div className="flex items-center gap-2 font-mono text-[11px] text-blue-600 dark:text-blue-400">
          <ShieldCheck size={14} />
          <span>
            Audit Log Event Record ID:{' '}
            <strong className="text-slate-900 dark:text-white">
              {log.id || log._id || 'SYS-EVT-LOG'}
            </strong>
          </span>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            copyAsJSON();
          }}
          className="flex items-center gap-1 px-2 py-1 rounded bg-white dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 text-[11px] font-medium transition-colors shadow-sm"
          title="Copy raw log JSON payload"
        >
          {copied ? (
            <Check size={12} className="text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Copy size={12} />
          )}
          {copied ? 'Copied' : 'Copy JSON'}
        </button>
      </div>

      {/* Metadata Section */}
      {metadataDisplay.length > 0 && (
        <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-md p-3 shadow-sm">
          <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
            <ClipboardList size={12} className="text-blue-600 dark:text-blue-400" />
            Metadata Parameters & Context
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {metadataDisplay.map(({ key, value, rawKey, boolVal }) => (
              <div
                key={rawKey}
                className="flex flex-col bg-slate-50 dark:bg-slate-950/60 p-2 rounded border border-slate-200 dark:border-slate-800/80"
              >
                <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase tracking-wider font-medium">
                  {key}
                </span>
                <span
                  className={`text-xs font-mono break-all flex items-center gap-1 mt-0.5 ${
                    boolVal === true
                      ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                      : boolVal === false
                      ? 'text-red-600 dark:text-red-400 font-semibold'
                      : 'text-slate-900 dark:text-slate-200'
                  }`}
                >
                  {boolVal === true && <CheckCircle2 size={11} />}
                  {boolVal === false && <XCircle size={11} />}
                  {String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Primary Details Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-2">
        <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded p-2 shadow-sm">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold block">
            Action Key
          </span>
          <span
            className="font-mono text-slate-800 dark:text-slate-200 text-[11px] truncate block mt-0.5"
            title={log.action}
          >
            {log.action}
          </span>
        </div>
        <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded p-2 shadow-sm">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold block">
            Target Identifier
          </span>
          <span
            className="font-mono text-slate-800 dark:text-slate-200 text-[11px] truncate block mt-0.5"
            title={log.displayTarget || log.target_label || log.target_id || 'N/A'}
          >
            {log.displayTarget || log.target_label || log.target_id || 'N/A'}
          </span>
        </div>
        <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded p-2 shadow-sm">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold block">
            Target ID
          </span>
          <span
            className="font-mono text-slate-800 dark:text-slate-200 text-[11px] truncate block mt-0.5"
            title={log.target_id || 'N/A'}
          >
            {log.target_id || 'N/A'}
          </span>
        </div>
        <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded p-2 shadow-sm">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold block">
            IP Address
          </span>
          <span className="font-mono text-slate-800 dark:text-slate-200 text-[11px] truncate block mt-0.5">
            {log.ip_address || 'N/A'}
          </span>
        </div>
        <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded p-2 shadow-sm">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold block">
            MIME Type
          </span>
          <span className="font-mono text-slate-800 dark:text-slate-200 text-[11px] truncate block mt-0.5">
            {log.file_mime_type || 'N/A'}
          </span>
        </div>
        <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded p-2 shadow-sm">
          <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold block">
            Execution Duration
          </span>
          <span className="font-mono text-slate-800 dark:text-slate-200 text-[11px] truncate block mt-0.5">
            {log.duration_ms ? `${log.duration_ms}ms` : 'N/A'}
          </span>
        </div>
      </div>

      {/* File System Paths (Conditional) */}
      {(log.file_path || log.folder_full_path) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {log.file_path && (
            <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded p-2 shadow-sm">
              <span className="text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 font-semibold block">
                File System Path
              </span>
              <span className="font-mono text-slate-800 dark:text-slate-200 text-[11px] break-all block mt-0.5">
                {log.file_path}
              </span>
            </div>
          )}
          {log.folder_full_path && (
            <div className="bg-white/80 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded p-2 shadow-sm">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold block">
                Directory Path
              </span>
              <span className="font-mono text-slate-800 dark:text-slate-200 text-[11px] break-all block mt-0.5">
                {log.folder_full_path}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Footer Info */}
      <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 pt-1 border-t border-slate-200 dark:border-slate-800">
        <span className="flex items-center gap-1 font-mono">
          <Clock size={11} /> Timestamp: {log.created_at ? new Date(log.created_at).toISOString() : 'N/A'}
        </span>
        <span className="text-slate-500 dark:text-slate-400 font-mono">
          Status Code: {log.status === 'success' ? '200 OK' : '500 Internal Error'}
        </span>
      </div>
    </div>
  );
};

// --- Desktop Table Row Component -------------------------------------------

const TableLogRow = ({ log, isExpanded, onToggle }) => {
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

  const displayUser = log.displayUser || log.actor_user_id || log.user || 'System';
  const userRole = log.userRole || log.actor_role || 'user';
  const displayDetails = log.details || log.target_label || log.target_name || 'No details provided';
  const timeAgo = log.timeAgo || getTimeAgo(log.created_at);
  const metadataDisplay = getMetadataDisplay();

  return (
    <React.Fragment>
      <tr
        onClick={onToggle}
        className={`h-11 border-b border-slate-200/80 dark:border-slate-800/80 text-xs transition-colors cursor-pointer select-none ${
          isExpanded
            ? 'bg-blue-50/70 dark:bg-slate-800/80'
            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 even:bg-slate-50/30 dark:even:bg-slate-900/30'
        }`}
      >
        <td className="pl-3 pr-1 py-2 text-slate-400">
          <ChevronRight size={14} className={`transition-transform duration-200 ${isExpanded ? 'rotate-90 text-blue-600 dark:text-blue-400' : ''}`} />
        </td>
        <td className="px-2 py-2 whitespace-nowrap font-mono text-[11px] text-slate-600 dark:text-slate-300">
          <div className="flex flex-col">
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {log.created_at ? new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : 'N/A'}
            </span>
            <span className="text-[10px] text-slate-400">{timeAgo}</span>
          </div>
        </td>
        <td className="px-2 py-2 whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            <div className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 flex items-center justify-center font-bold text-[10px]">
              {displayUser.charAt(0).toUpperCase()}
            </div>
            <div className="flex flex-col truncate max-w-[120px]">
              <span className="font-medium text-slate-900 dark:text-white truncate" title={displayUser}>{displayUser}</span>
              <span className="text-[10px] text-slate-400 truncate">{userRole}</span>
            </div>
          </div>
        </td>
        <td className="px-2 py-2 whitespace-nowrap">
          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${actionChip}`}>
            <ActionIcon size={12} />
            <span className="truncate max-w-[120px]" title={actionLabel}>{actionLabel}</span>
          </span>
        </td>
        <td className="px-2 py-2 whitespace-nowrap">
          <div className="flex items-center gap-1 text-slate-600 dark:text-slate-400">
            <TargetIcon size={13} className="shrink-0 text-slate-400" />
            <span className="font-medium text-[11px] uppercase tracking-wider">{log.target_type || 'N/A'}</span>
          </div>
        </td>
        <td className="px-2 py-2 max-w-[200px] truncate font-mono text-[11px] text-slate-700 dark:text-slate-300" title={displayDetails}>
          {displayDetails}
        </td>
        <td className="px-2 py-2 whitespace-nowrap">
          <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-semibold border ${
            log.status === 'success'
              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
              : 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20'
          }`}>
            {log.status === 'success' ? <CheckCircle2 size={10} /> : <XCircle size={10} />}
            {log.status === 'success' ? 'Success' : 'Failed'}
          </span>
        </td>
        <td className="px-2 py-2 whitespace-nowrap font-mono text-[11px] text-slate-500 dark:text-slate-400">
          {log.ip_address || '—'}
        </td>
        <td className="px-2 py-2 whitespace-nowrap font-mono text-[11px] text-slate-500 dark:text-slate-400">
          {log.duration_ms ? `${log.duration_ms}ms` : '—'}
        </td>
      </tr>
      {isExpanded && (
        <tr>
          <td colSpan={9} className="p-0 border-b border-slate-300 dark:border-slate-700">
            <ExpandedLogDetails log={log} metadataDisplay={metadataDisplay} actionLabel={actionLabel} />
          </td>
        </tr>
      )}
    </React.Fragment>
  );
};

// --- Mobile List Log Component ---------------------------------------------

const MobileLogRow = ({ log, isExpanded, onToggle }) => {
  let metadata = log.metadata;
  if (typeof metadata === 'string') {
    try { metadata = JSON.parse(metadata); } catch { metadata = { raw: metadata }; }
  }

  const getMetadataDisplay = () => {
    if (!metadata || typeof metadata !== 'object') return [];
    const entries = Object.entries(metadata).filter(([key]) => key !== 'raw');
    return entries.map(([key, val]) => {
      let displayValue = val;
      if (key === 'size' && typeof val === 'number') displayValue = formatFileSize(val);
      else if (typeof val === 'boolean') displayValue = val ? 'Yes' : 'No';
      return { key, value: displayValue, boolVal: typeof val === 'boolean' ? val : null };
    });
  };

  const { Icon: ActionIcon, chip: actionChip } = getActionMeta(log.action);
  const actionLabel = getActionLabel(log.action);
  const displayUser = log.displayUser || log.actor_user_id || log.user || 'System';
  const displayDetails = log.details || log.target_label || log.target_name || 'No details provided';
  const timeAgo = log.timeAgo || getTimeAgo(log.created_at);

  return (
    <div className="border-b border-slate-200 dark:border-slate-800 last:border-0">
      <div
        onClick={onToggle}
        className={`p-3 transition-colors cursor-pointer ${isExpanded ? 'bg-blue-50/60 dark:bg-slate-800/80' : 'active:bg-slate-100 dark:active:bg-slate-800/50'}`}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded ${actionChip}`}>
              <ActionIcon size={14} />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-bold text-slate-900 dark:text-white">{displayUser}</span>
                <span className={`text-[9px] px-1.5 py-0.2 rounded font-semibold border ${
                  log.status === 'success'
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
                    : 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/20'
                }`}>
                  {log.status === 'success' ? 'OK' : 'ERR'}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400">{actionLabel}</span>
            </div>
          </div>
          <div className="text-right flex items-center gap-1">
            <span className="text-[10px] text-slate-400 font-mono">{timeAgo}</span>
            <ChevronDown size={14} className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
          </div>
        </div>

        <div className="mt-1.5 text-xs font-mono text-slate-700 dark:text-slate-300 truncate">
          {displayDetails}
        </div>
      </div>

      {isExpanded && (
        <ExpandedLogDetails
          log={log}
          metadataDisplay={getMetadataDisplay()}
          actionLabel={actionLabel}
        />
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
  const [lastUpdated, setLastUpdated] = useState(new Date());
  const [activeTab, setActiveTab] = useState('logs');
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);

  // Search & Filter States
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAction, setFilterAction] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterUser, setFilterUser] = useState('all');
  const [filterTargetType, setFilterTargetType] = useState('all');
  const [datePreset, setDatePreset] = useState('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // UI State
  const [expandedRowId, setExpandedRowId] = useState(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [jumpPageInput, setJumpPageInput] = useState('');

  const fetchStats = useCallback(async (isManual = false) => {
    if (isManual) setIsRefreshing(true);
    try {
      const res = await api.get('/admin/system-stats');
      setStats(res.data);
      setError('');
      setLastUpdated(new Date());
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
      const res = await api.get('/admin/audit-logs?limit=500');
      const logsData = res.data?.logs || res.data || [];
      setLogs(Array.isArray(logsData) ? logsData : []);
      setLastUpdated(new Date());
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

  // Comprehensive multi-field filtering logic
  const filteredLogs = useMemo(() => {
    const logsArray = Array.isArray(logs) ? logs : [];
    return logsArray.filter(log => {
      // Global multi-field text search
      const term = searchTerm.toLowerCase().trim();
      let metadataStr = '';
      if (log.metadata) {
        metadataStr = typeof log.metadata === 'string' ? log.metadata : JSON.stringify(log.metadata);
      }

      const matchesSearch = term === '' ||
        (log.user || '').toLowerCase().includes(term) ||
        (log.actor_user_id || '').toLowerCase().includes(term) ||
        (log.action || '').toLowerCase().includes(term) ||
        (log.details || '').toLowerCase().includes(term) ||
        (log.target_name || '').toLowerCase().includes(term) ||
        (log.target_label || '').toLowerCase().includes(term) ||
        (log.target_type || '').toLowerCase().includes(term) ||
        (log.ip_address || '').toLowerCase().includes(term) ||
        (log.file_path || '').toLowerCase().includes(term) ||
        (log.folder_full_path || '').toLowerCase().includes(term) ||
        metadataStr.toLowerCase().includes(term);

      const matchesAction = filterAction === 'all' || log.action === filterAction;
      const matchesStatus = filterStatus === 'all' || log.status === filterStatus;

      const logUser = log.user || log.actor_user_id || 'System';
      const matchesUser = filterUser === 'all' || logUser === filterUser;

      const matchesTargetType = filterTargetType === 'all' || (log.target_type || '').toLowerCase() === filterTargetType.toLowerCase();

      // Date Range Filtering
      let matchesDate = true;
      if (log.created_at) {
        const logDate = new Date(log.created_at);
        const now = new Date();

        if (datePreset === 'today') {
          matchesDate = logDate.toDateString() === now.toDateString();
        } else if (datePreset === 'yesterday') {
          const yest = new Date();
          yest.setDate(now.getDate() - 1);
          matchesDate = logDate.toDateString() === yest.toDateString();
        } else if (datePreset === '7days') {
          const dist = now.getTime() - logDate.getTime();
          matchesDate = dist <= 7 * 24 * 60 * 60 * 1000;
        } else if (datePreset === '30days') {
          const dist = now.getTime() - logDate.getTime();
          matchesDate = dist <= 30 * 24 * 60 * 60 * 1000;
        } else if (datePreset === 'custom') {
          if (customStartDate) {
            matchesDate = matchesDate && logDate >= new Date(customStartDate);
          }
          if (customEndDate) {
            const end = new Date(customEndDate);
            end.setHours(23, 59, 59, 999);
            matchesDate = matchesDate && logDate <= end;
          }
        }
      }

      return matchesSearch && matchesAction && matchesStatus && matchesUser && matchesTargetType && matchesDate;
    });
  }, [logs, searchTerm, filterAction, filterStatus, filterUser, filterTargetType, datePreset, customStartDate, customEndDate]);

  // Reset pagination on filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterAction, filterStatus, filterUser, filterTargetType, datePreset, customStartDate, customEndDate, pageSize]);

  // Unique options for dropdowns
  const uniqueActions = useMemo(() => {
    const logsArray = Array.isArray(logs) ? logs : [];
    return Array.from(new Set(logsArray.map(log => log.action).filter(Boolean)));
  }, [logs]);

  const uniqueUsers = useMemo(() => {
    const logsArray = Array.isArray(logs) ? logs : [];
    return Array.from(new Set(logsArray.map(log => log.user || log.actor_user_id || 'System').filter(Boolean)));
  }, [logs]);

  const uniqueTargetTypes = useMemo(() => {
    const logsArray = Array.isArray(logs) ? logs : [];
    return Array.from(new Set(logsArray.map(log => log.target_type).filter(Boolean)));
  }, [logs]);

  // Analytics Metrics
  const analytics = useMemo(() => {
    const logsArray = Array.isArray(logs) ? logs : [];
    const total = logsArray.length;
    const success = logsArray.filter(l => l?.status === 'success').length;
    const failed = logsArray.filter(l => l?.status === 'failed').length;
    const usersCount = new Set(logsArray.map(l => l?.user || l?.actor_user_id).filter(Boolean)).size;

    // Action counts for most common action
    const actionCounts = {};
    logsArray.forEach(l => {
      if (l?.action) actionCounts[l.action] = (actionCounts[l.action] || 0) + 1;
    });

    let mostCommon = 'N/A';
    let maxCount = 0;
    Object.entries(actionCounts).forEach(([action, count]) => {
      if (count > maxCount) {
        maxCount = count;
        mostCommon = action;
      }
    });

    const successRate = total > 0 ? ((success / total) * 100).toFixed(1) : '0';

    return { total, success, failed, usersCount, mostCommon, successRate };
  }, [logs]);

  // Pagination Calculation
  const totalPages = Math.ceil(filteredLogs.length / pageSize) || 1;
  const paginatedLogs = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLogs.slice(start, start + pageSize);
  }, [filteredLogs, currentPage, pageSize]);

  const handleExportCSV = () => {
    const logsToExport = filteredLogs.length > 0 ? filteredLogs : logs;
    const headers = ['Timestamp', 'User', 'Action', 'Target Type', 'Target Name', 'Status', 'IP Address', 'Duration (ms)'];
    const rows = logsToExport.map(l => [
      l.created_at ? new Date(l.created_at).toISOString() : '',
      `"${l.user || l.actor_user_id || 'System'}"`,
      `"${l.action || ''}"`,
      `"${l.target_type || ''}"`,
      `"${l.target_label || l.details || ''}"`,
      l.status || '',
      l.ip_address || '',
      l.duration_ms || ''
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `audit_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleClearFilters = () => {
    setSearchTerm('');
    setFilterAction('all');
    setFilterStatus('all');
    setFilterUser('all');
    setFilterTargetType('all');
    setDatePreset('all');
    setCustomStartDate('');
    setCustomEndDate('');
  };

  const handleJumpPage = (e) => {
    e.preventDefault();
    const p = parseInt(jumpPageInput, 10);
    if (p >= 1 && p <= totalPages) {
      setCurrentPage(p);
      setJumpPageInput('');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[450px] gap-3 text-slate-500 text-xs">
        <RefreshCw className="animate-spin text-blue-600 dark:text-blue-400" size={24} />
        <span className="font-semibold tracking-wider uppercase">Loading Audit Security Console...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="m-4 p-4 rounded-md bg-red-500/10 border border-red-500/20 text-red-500 text-xs flex items-center gap-3">
        <AlertCircle size={18} className="shrink-0" />
        <span>{error}</span>
      </div>
    );
  }

  if (!stats) return null;

  const { disk, memory, cpu, database, application } = stats;
  const totalTableGB = database.largestTables?.reduce((acc, t) => acc + (t.sizeGB || 0), 0) || 0;
  const queueItems = Object.entries(application?.uploadQueue || {});
  const totalQueue = queueItems.reduce((acc, [, val]) => acc + (Number(val) || 0), 0);

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans text-xs pb-10">

      {/* --- Sticky Enterprise Header Toolbar --- */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 shadow-sm px-4 py-2.5">
        <div className="max-w-[1600px] mx-auto flex flex-col gap-2">

          {/* Top Bar: Title, Auto-refresh status, Core Global Actions */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck size={20} className="text-blue-600 dark:text-blue-400" />
                <h1 className="text-base font-bold text-slate-900 dark:text-white tracking-tight">Enterprise Audit Log System</h1>
              </div>

              <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                Live Polling (15s)
              </span>

              <span className="text-[11px] text-slate-500 dark:text-slate-400 hidden lg:inline">
                Last refreshed: {lastUpdated.toLocaleTimeString()}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => { fetchStats(true); fetchLogs(); }}
                disabled={isRefreshing || logsLoading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-semibold transition-colors disabled:opacity-50"
                title="Manual System Sync"
              >
                <RefreshCw size={13} className={isRefreshing || logsLoading ? 'animate-spin text-blue-600' : ''} />
                <span className="hidden sm:inline">Refresh</span>
              </button>

              <button
                onClick={handleExportCSV}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-sm transition-colors"
                title="Export Filtered Logs to CSV"
              >
                <FileSpreadsheet size={13} />
                <span className="hidden sm:inline">Export CSV</span>
              </button>
            </div>
          </div>

          {/* Compact Control & Filter Toolbar */}
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-100 dark:border-slate-800/80 overflow-x-auto custom-scrollbar">

            {/* Tab Toggle Buttons */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-0.5 rounded border border-slate-200 dark:border-slate-700 shrink-0">
              <button
                onClick={() => setActiveTab('logs')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold transition-all ${
                  activeTab === 'logs'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <ClipboardList size={13} />
                Audit Trail
                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-500/10 text-blue-600 dark:text-blue-400 font-mono">
                  {filteredLogs.length}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('overview')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-bold transition-all ${
                  activeTab === 'overview'
                    ? 'bg-white dark:bg-slate-900 text-blue-600 dark:text-blue-400 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Activity size={13} />
                System Diagnostics
              </button>
            </div>

            {/* Inline Quick Search & Basic Filters */}
            {activeTab === 'logs' && (
              <div className="flex items-center gap-2 shrink-0">
                <div className="relative w-48 lg:w-64">
                  <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search logs, IPs, users, paths..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-8 pr-7 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
                  />
                  {searchTerm && (
                    <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      <X size={12} />
                    </button>
                  )}
                </div>

                <select
                  value={filterAction}
                  onChange={(e) => setFilterAction(e.target.value)}
                  className="hidden md:inline-block px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs"
                >
                  <option value="all">All Actions</option>
                  {uniqueActions.map(act => <option key={act} value={act}>{act}</option>)}
                </select>

                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className="hidden md:inline-block px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs"
                >
                  <option value="all">All Status</option>
                  <option value="success">Success</option>
                  <option value="failed">Failed</option>
                </select>

                <button
                  onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
                  className="md:hidden flex items-center gap-1 px-2.5 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold"
                >
                  <SlidersHorizontal size={13} />
                  <span>Filters</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Container Content */}
      <main className="max-w-[1600px] mx-auto p-3 sm:p-5 space-y-4">

        {activeTab === 'overview' ? (
          <div className="space-y-4">
            {/* Health Quick Status */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-lg shadow-sm">
                <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Disk Utilization</div>
                <div className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-0.5">{disk?.usedPercent || 0}%</div>
                <div className="text-[10px] text-slate-500 mt-1 font-mono">{disk?.usedGB || 0} / {disk?.totalGB || 0} GB</div>
                <div className="mt-2"><Bar percent={disk?.usedPercent || 0} /></div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-lg shadow-sm">
                <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">RAM Memory</div>
                <div className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-0.5">{memory?.usedPercent || 0}%</div>
                <div className="text-[10px] text-slate-500 mt-1 font-mono">{memory?.usedGB || 0} / {memory?.totalGB || 0} GB</div>
                <div className="mt-2"><Bar percent={memory?.usedPercent || 0} /></div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-lg shadow-sm">
                <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">DB Connections</div>
                <div className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-0.5">{database?.connections?.active || 0}</div>
                <div className="text-[10px] text-slate-500 mt-1">Pool Total: {database?.connections?.total || 0}</div>
                <div className="mt-2"><Bar percent={((database?.connections?.active || 0) / (database?.connections?.total || 1)) * 100} /></div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-lg shadow-sm">
                <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Managed Files</div>
                <div className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-0.5">{application?.totalFiles?.toLocaleString() || 0}</div>
                <div className="text-[10px] text-slate-500 mt-1">{application?.totalFolders?.toLocaleString() || 0} Directory Folders</div>
              </div>

              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-lg shadow-sm col-span-2 sm:col-span-1">
                <div className="text-[11px] text-slate-400 font-semibold uppercase tracking-wider">Upload Queue</div>
                <div className="text-xl font-bold font-mono text-slate-900 dark:text-white mt-0.5">{totalQueue}</div>
                <div className="text-[10px] text-slate-500 mt-1">{queueItems.length} Categories Active</div>
              </div>
            </div>

            {/* Detailed System Infrastructure Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <MetricCard title="Storage Infrastructure" badge={`${disk?.freeGB || 0} GB Free`} icon={<HardDrive size={16} />}>
                <div className="space-y-2">
                  <div className="flex justify-between items-end text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">Disk Partition Status</span>
                    <span className="font-mono text-slate-500">{disk?.usedGB || 0} / {disk?.totalGB || 0} GB</span>
                  </div>
                  <Bar percent={disk?.usedPercent || 0} height="h-2" />
                  <div className="p-2 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                    <span className="text-[10px] font-mono text-slate-500 block truncate">
                      Mount Path: {disk?.pathChecked || 'N/A'}
                    </span>
                  </div>
                </div>
              </MetricCard>

              <MetricCard title="Memory & Process Footprint" badge={`RSS: ${memory?.processRssMB || 0} MB`} icon={<Server size={16} />}>
                <div className="space-y-2">
                  <div className="flex justify-between items-end text-xs">
                    <span className="font-semibold text-slate-700 dark:text-slate-300">RAM Utilization</span>
                    <span className="font-mono text-slate-500">{memory?.usedGB || 0} / {memory?.totalGB || 0} GB</span>
                  </div>
                  <Bar percent={memory?.usedPercent || 0} height="h-2" />
                  <StatRow label="Node.js Process RSS" value={`${memory?.processRssMB || 0} MB`} />
                </div>
              </MetricCard>

              <MetricCard title="CPU Compute Specs" badge={`${cpu?.cores || 0} Cores`} icon={<Cpu size={16} />}>
                <div className="space-y-1">
                  <StatRow label="Processor Model" value={cpu?.model || 'Standard CPU'} />
                  <StatRow label="Logical Core Threads" value={`${cpu?.cores || 0} Threads`} />
                  <div className="flex items-start gap-1.5 p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-[11px] mt-2">
                    <Info size={13} className="shrink-0 mt-0.5" />
                    Detailed core load available in enterprise hypervisor dashboard.
                  </div>
                </div>
              </MetricCard>

              <MetricCard title="File System Metadata" icon={<FolderCog size={16} />}>
                <div className="space-y-0.5">
                  <StatRow label="Total Stored Files" value={application?.totalFiles?.toLocaleString() || 0} />
                  <StatRow label="Directory Containers" value={application?.totalFolders?.toLocaleString() || 0} />
                  <StatRow label="Historical Audit Logs" value={application?.totalDownloadLogs?.toLocaleString() || 0} />
                  <StatRow label="Active Upload Queues" value={totalQueue} subtext={`${queueItems.length} active types`} />
                </div>
              </MetricCard>

              <MetricCard title="Database Cluster" badge={`${database?.sizeGB || 0} GB`} icon={<Database size={16} />}>
                <div className="space-y-2">
                  <StatRow label="Database Pool" value={`${database?.connections?.total || 0} Total (${database?.connections?.active || 0} Active)`} />
                  <div className="pt-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                      Top Partitioned Tables
                    </div>
                    <div className="space-y-1.5">
                      {database?.largestTables?.map((t) => {
                        const share = totalTableGB > 0 ? Math.round(((t.sizeGB || 0) / totalTableGB) * 100) : 0;
                        return (
                          <div key={t.name} className="space-y-0.5">
                            <div className="flex justify-between text-[11px]">
                              <span className="font-mono text-slate-700 dark:text-slate-300">{t.name}</span>
                              <span className="text-slate-400">{t.sizeGB} GB · {t.rows?.toLocaleString() || 0} rows</span>
                            </div>
                            <Bar percent={share} height="h-1" />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </MetricCard>

              <MetricCard title="Active Queue Monitor" badge={totalQueue > 0 ? `${totalQueue} Items` : 'Clear'} icon={<Upload size={16} />}>
                <div className="space-y-1.5">
                  {queueItems.length > 0 ? (
                    queueItems.map(([key, val]) => (
                      <div key={key} className="flex items-center justify-between p-2 rounded bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
                        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 capitalize">{key}</span>
                        <span className="text-xs font-bold px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 font-mono">
                          {String(val)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-6 text-xs text-slate-400">
                      Upload queue is fully synchronized and empty.
                    </div>
                  )}
                </div>
              </MetricCard>
            </div>
          </div>
        ) : (
          /* Audit Logs Tab */
          <div className="space-y-3">

            {/* Compact Analytics Summary Bar */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2.5 rounded-md shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Total Logs</span>
                <span className="text-lg font-bold font-mono text-slate-900 dark:text-white">{analytics.total.toLocaleString()}</span>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2.5 rounded-md shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Success Rate</span>
                <span className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">{analytics.successRate}%</span>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2.5 rounded-md shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Successful</span>
                <span className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">{analytics.success.toLocaleString()}</span>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2.5 rounded-md shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Failed Actions</span>
                <span className="text-lg font-bold font-mono text-red-600 dark:text-red-400">{analytics.failed.toLocaleString()}</span>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2.5 rounded-md shadow-sm">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Unique Users</span>
                <span className="text-lg font-bold font-mono text-purple-600 dark:text-purple-400">{analytics.usersCount}</span>
              </div>
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-2.5 rounded-md shadow-sm col-span-2 sm:col-span-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">Top Event Action</span>
                <span className="text-xs font-bold font-mono text-blue-600 dark:text-blue-400 truncate block mt-1" title={analytics.mostCommon}>
                  {analytics.mostCommon}
                </span>
              </div>
            </div>

            {/* Desktop Filters Bar */}
            <div className={`bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md p-3 shadow-sm ${mobileFiltersOpen ? 'block' : 'hidden md:block'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2.5">

                <div className="flex flex-wrap items-center gap-2">
                  {/* Date Preset Selector */}
                  <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 text-xs">
                    <Calendar size={13} className="text-slate-400" />
                    <select
                      value={datePreset}
                      onChange={(e) => setDatePreset(e.target.value)}
                      className="bg-transparent text-slate-800 dark:text-slate-200 font-medium focus:outline-none"
                    >
                      <option value="all">All Time</option>
                      <option value="today">Today</option>
                      <option value="yesterday">Yesterday</option>
                      <option value="7days">Last 7 Days</option>
                      <option value="30days">Last 30 Days</option>
                      <option value="custom">Custom Range</option>
                    </select>
                  </div>

                  {datePreset === 'custom' && (
                    <div className="flex items-center gap-1">
                      <input
                        type="date"
                        value={customStartDate}
                        onChange={(e) => setCustomStartDate(e.target.value)}
                        className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs"
                      />
                      <span className="text-slate-400 text-xs">to</span>
                      <input
                        type="date"
                        value={customEndDate}
                        onChange={(e) => setCustomEndDate(e.target.value)}
                        className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs"
                      />
                    </div>
                  )}

                  {/* Filter Selectors */}
                  <select
                    value={filterUser}
                    onChange={(e) => setFilterUser(e.target.value)}
                    className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-medium"
                  >
                    <option value="all">All Users</option>
                    {uniqueUsers.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>

                  <select
                    value={filterTargetType}
                    onChange={(e) => setFilterTargetType(e.target.value)}
                    className="px-2 py-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-xs font-medium"
                  >
                    <option value="all">All Targets</option>
                    {uniqueTargetTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleClearFilters}
                    className="px-2.5 py-1 rounded bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-semibold transition-colors"
                  >
                    Clear All Filters
                  </button>
                </div>

              </div>
            </div>

            {/* Enterprise Log Viewer Container */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md shadow-sm overflow-hidden">

              {/* Desktop Table View (Hidden on mobile) */}
              <div className="hidden md:block overflow-x-auto max-h-[620px] overflow-y-auto custom-scrollbar">
                <table className="w-full text-left border-collapse min-w-[1000px]">
                  <thead className="sticky top-0 z-10 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 font-bold uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="w-8 pl-3 py-2.5"></th>
                      <th className="px-2 py-2.5">Timestamp</th>
                      <th className="px-2 py-2.5">User</th>
                      <th className="px-2 py-2.5">Action</th>
                      <th className="px-2 py-2.5">Resource Type</th>
                      <th className="px-2 py-2.5">Resource / Details</th>
                      <th className="px-2 py-2.5">Status</th>
                      <th className="px-2 py-2.5">IP Address</th>
                      <th className="px-2 py-2.5">Duration</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedLogs.length > 0 ? (
                      paginatedLogs.map((log, index) => {
                        const rowId = log.id || log._id || index;
                        const isExpanded = expandedRowId === rowId;
                        return (
                          <TableLogRow
                            key={rowId}
                            log={log}
                            isExpanded={isExpanded}
                            onToggle={() => setExpandedRowId(isExpanded ? null : rowId)}
                          />
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={9} className="text-center py-16 text-slate-400">
                          <Search size={36} className="mx-auto mb-2 opacity-40" />
                          <p className="text-base font-medium">No matching audit logs found</p>
                          <p className="text-xs mt-1">Adjust your search parameters or date filters</p>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Mobile List View (Hidden on Desktop) */}
              <div className="md:hidden divide-y divide-slate-200 dark:divide-slate-800 max-h-[550px] overflow-y-auto">
                {paginatedLogs.length > 0 ? (
                  paginatedLogs.map((log, index) => {
                    const rowId = log.id || log._id || index;
                    const isExpanded = expandedRowId === rowId;
                    return (
                      <MobileLogRow
                        key={rowId}
                        log={log}
                        isExpanded={isExpanded}
                        onToggle={() => setExpandedRowId(isExpanded ? null : rowId)}
                      />
                    );
                  })
                ) : (
                  <div className="text-center py-12 text-slate-400">
                    <Search size={32} className="mx-auto mb-2 opacity-40" />
                    <p className="text-sm font-medium">No audit logs found</p>
                  </div>
                )}
              </div>

              {/* Full Enterprise Pagination Bar */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex items-center gap-3">
                  <span>
                    Showing <strong className="text-slate-900 dark:text-white font-mono">{filteredLogs.length > 0 ? (currentPage - 1) * pageSize + 1 : 0}</strong>–<strong className="text-slate-900 dark:text-white font-mono">{Math.min(currentPage * pageSize, filteredLogs.length)}</strong> of <strong className="text-slate-900 dark:text-white font-mono">{filteredLogs.length.toLocaleString()}</strong> logs
                  </span>

                  <div className="flex items-center gap-1.5 ml-2 border-l border-slate-300 dark:border-slate-700 pl-3">
                    <span className="hidden lg:inline text-slate-400">Per page:</span>
                    <select
                      value={pageSize}
                      onChange={(e) => setPageSize(Number(e.target.value))}
                      className="px-2 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 font-mono text-xs"
                    >
                      <option value={25}>25</option>
                      <option value={50}>50</option>
                      <option value={100}>100</option>
                      <option value={250}>250</option>
                      <option value={500}>500</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage(1)}
                      disabled={currentPage === 1}
                      className="p-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
                      title="First Page"
                    >
                      <ChevronsLeft size={14} />
                    </button>
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="p-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
                      title="Previous Page"
                    >
                      <ChevronLeft size={14} />
                    </button>

                    <span className="px-2 font-mono text-xs">
                      Page <strong>{currentPage}</strong> of <strong>{totalPages}</strong>
                    </span>

                    <button
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className="p-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
                      title="Next Page"
                    >
                      <ChevronRight size={14} />
                    </button>
                    <button
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={currentPage === totalPages}
                      className="p-1 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition-colors"
                      title="Last Page"
                    >
                      <ChevronsRight size={14} />
                    </button>
                  </div>

                  <form onSubmit={handleJumpPage} className="hidden sm:flex items-center gap-1 border-l border-slate-300 dark:border-slate-700 pl-2">
                    <input
                      type="number"
                      placeholder="Go to"
                      min={1}
                      max={totalPages}
                      value={jumpPageInput}
                      onChange={(e) => setJumpPageInput(e.target.value)}
                      className="w-14 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 text-xs font-mono"
                    />
                  </form>
                </div>
              </div>

            </div>

          </div>
        )}
      </main>
    </div>
  );
}