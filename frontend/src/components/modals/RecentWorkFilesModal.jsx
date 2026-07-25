/**
 * RecentWorkFilesModal.jsx  (SFMS — Agent-Powered Local Folder Scan, v8)
 *
 * On top of v7:
 *  - Every icon is now a real lucide-react component (color-coded per file
 *    type) instead of emoji.
 *  - Duplicate detection is now content-based (SHA-256 hash), not just
 *    name+size. The Agent hashes every scanned file; this modal sends those
 *    hashes to /files/check-hashes-batch and shows EXACTLY where a match
 *    already lives on the server (folder path + uploader), system-wide —
 *    not just within the currently-open folder.
 *  - Falls back to the old name+size heuristic (via the `existingFiles`
 *    prop) only for files the Agent couldn't hash (e.g. oversized files).
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'react-hot-toast';
import {
  FileText, FileSpreadsheet, FileImage, FileVideo, FileAudio,
  FileArchive, FileCode2, FileJson2, FileCog, Presentation, File as FileIcon,
  Star, FolderOpen, FolderPlus, RotateCw, X, Loader2, User, MapPin,
  CheckCircle2, Monitor, Calendar,
} from 'lucide-react';
import {
  isAgentRunning, getWatchedFolders, addWatchedFolder,
  removeWatchedFolder, scanRecentFiles, readAgentFile,
} from '../../utils/sfmsAgent';
import api from '../../utils/api';

const AGENT_DOWNLOAD_URL = `${api.defaults.baseURL}/files/downloads/sfms-agent`;
const PAGE_SIZE = 8;

function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
function formatTime(iso) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
function formatDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ── File-type icon + color, using real lucide-react components ─────────
const ICON_MAP = {
  pdf:  { Icon: FileText,       className: 'text-red-500' },
  doc:  { Icon: FileText,       className: 'text-blue-500' },
  docx: { Icon: FileText,       className: 'text-blue-500' },
  txt:  { Icon: FileText,       className: 'text-gray-500' },
  rtf:  { Icon: FileText,       className: 'text-gray-500' },

  xls:  { Icon: FileSpreadsheet, className: 'text-emerald-500' },
  xlsx: { Icon: FileSpreadsheet, className: 'text-emerald-500' },
  csv:  { Icon: FileSpreadsheet, className: 'text-emerald-500' },

  ppt:  { Icon: Presentation,    className: 'text-orange-500' },
  pptx: { Icon: Presentation,    className: 'text-orange-500' },

  json: { Icon: FileJson2,       className: 'text-amber-500' },

  png:  { Icon: FileImage,       className: 'text-pink-500' },
  jpg:  { Icon: FileImage,       className: 'text-pink-500' },
  jpeg: { Icon: FileImage,       className: 'text-pink-500' },
  gif:  { Icon: FileImage,       className: 'text-pink-500' },

  mp4:  { Icon: FileVideo,       className: 'text-purple-500' },
  mp3:  { Icon: FileAudio,       className: 'text-fuchsia-500' },

  zip:  { Icon: FileArchive,     className: 'text-amber-600' },
  rar:  { Icon: FileArchive,     className: 'text-amber-600' },
  '7z': { Icon: FileArchive,     className: 'text-amber-600' },

  exe:  { Icon: FileCog,         className: 'text-gray-400' },
  msi:  { Icon: FileCog,         className: 'text-gray-400' },
  dmg:  { Icon: FileCog,         className: 'text-gray-400' },
  apk:  { Icon: FileCog,         className: 'text-gray-400' },
  bat:  { Icon: FileCog,         className: 'text-gray-400' },
  sh:   { Icon: FileCog,         className: 'text-gray-400' },

  js:   { Icon: FileCode2,       className: 'text-cyan-500' },
  ts:   { Icon: FileCode2,       className: 'text-cyan-500' },
  jsx:  { Icon: FileCode2,       className: 'text-cyan-500' },
  tsx:  { Icon: FileCode2,       className: 'text-cyan-500' },
  py:   { Icon: FileCode2,       className: 'text-cyan-500' },
};
const DEFAULT_ICON = { Icon: FileIcon, className: 'text-gray-400' };

function iconFor(fileName) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return ICON_MAP[ext] || DEFAULT_ICON;
}

// ── Importance ranking ────────────────────────────────────────────────
const IMPORTANT_EXTS = new Set([
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'pdf',
  'txt', 'csv', 'rtf', 'odt', 'ods', 'odp',
]);
const LOW_SIGNAL_EXTS = new Set([
  'exe', 'msi', 'dmg', 'apk', 'bat', 'sh', 'zip', 'rar', '7z', 'iso', 'dll',
]);

function importanceOf(fileName) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (IMPORTANT_EXTS.has(ext)) return 'important';
  if (LOW_SIGNAL_EXTS.has(ext)) return 'low';
  return 'normal';
}

// ── Duplicate / version comparison ──────────────────────────────────────
// Priority 1: content hash match, system-wide (via /files/check-hashes-batch)
//             — authoritative, tells you exactly where it already lives.
// Priority 2: name+size heuristic against the currently-open folder only
//             (via the `existingFiles` prop) — fallback for files the Agent
//             couldn't hash (e.g. oversized).
function computeMatchStatus(item, existingFiles, hashMatches) {
  if (item.file_hash && hashMatches && hashMatches[item.file_hash]?.exists) {
    const details = hashMatches[item.file_hash].details;
    return {
      kind: 'duplicate',
      source: 'hash',
      uploadedBy: details.uploadedBy,
      uploadedAt: details.uploadedAt,
      foundInFolder: details.foundInFolder,
      existingFileName: details.fileName,
    };
  }

  if (!existingFiles || existingFiles.length === 0) return null;

  const match = existingFiles.find(
    f => f.file_name?.toLowerCase() === item.file_name?.toLowerCase()
  );
  if (!match) return null;

  const existingSize = Number(match.file_size) || 0;
  const newSize = Number(item.size_bytes) || 0;

  if (existingSize === newSize) {
    return { kind: 'duplicate', source: 'heuristic', existingSize };
  }
  const diff = Math.abs(newSize - existingSize);
  return {
    kind: newSize > existingSize ? 'larger' : 'smaller',
    source: 'heuristic',
    existingSize,
    diffBytes: diff,
  };
}

function MatchBadge({ matchStatus }) {
  if (!matchStatus) {
    return (
      <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
        <CheckCircle2 size={10} /> New
      </span>
    );
  }
  if (matchStatus.kind === 'duplicate') {
    return (
      <span className="shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-gray-400/10 dark:bg-gray-600/10 text-gray-600 dark:text-gray-400 border border-gray-400/20 dark:border-gray-600/20">
        Already uploaded
      </span>
    );
  }
  const label = matchStatus.kind === 'larger'
    ? `Larger by ${formatBytes(matchStatus.diffBytes)}`
    : `Smaller by ${formatBytes(matchStatus.diffBytes)}`;
  return (
    <span className="shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wide bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
      {label}
    </span>
  );
}

// Location subtext — only shown for hash-based matches, since only those
// carry real folder/uploader information (the heuristic fallback doesn't).
// Location subtext — only shown for hash-based matches, since only those
// carry real folder/date/uploader information (the heuristic fallback doesn't).
function DuplicateLocation({ matchStatus }) {
  if (!matchStatus || matchStatus.kind !== 'duplicate' || matchStatus.source !== 'hash') return null;
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-gray-500 dark:text-gray-500 mt-0.5">
      <span className="flex items-center gap-1">
        <FolderOpen size={11} className="shrink-0" />
        <span className="truncate max-w-[160px]" title={matchStatus.foundInFolder}>
          {matchStatus.foundInFolder}
        </span>
      </span>
      <span className="flex items-center gap-1">
        <User size={11} className="shrink-0" />
        {matchStatus.uploadedBy}
      </span>
      {matchStatus.uploadedAt && (
        <span className="flex items-center gap-1">
          <Calendar size={11} className="shrink-0" />
          {formatDate(matchStatus.uploadedAt)}
        </span>
      )}
    </p>
  );
}

function groupByRecency(files) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);
  const startOfWeek = new Date(startOfToday);
  startOfWeek.setDate(startOfWeek.getDate() - 7);

  const buckets = { Today: [], Yesterday: [], 'This Week': [], Older: [] };
  for (const f of files) {
    const mod = new Date(f.modified_at);
    if (mod >= startOfToday) buckets.Today.push(f);
    else if (mod >= startOfYesterday) buckets.Yesterday.push(f);
    else if (mod >= startOfWeek) buckets['This Week'].push(f);
    else buckets.Older.push(f);
  }
  return Object.entries(buckets).filter(([, items]) => items.length > 0);
}

export default function RecentWorkFilesModal({ isOpen, onClose, onFilesSelected, existingFiles = [] }) {
  const [agentOnline, setAgentOnline] = useState(null);

  const [watchedFolders, setWatchedFolders] = useState([]);
  const [newFolderPath, setNewFolderPath]   = useState('');
  const [folderBusy, setFolderBusy]         = useState(false);
  const [showFolderManager, setShowFolderManager] = useState(false);

  const [daysWindow, setDaysWindow]     = useState(7);
  const [isScanning, setIsScanning]     = useState(false);
  const [hasScannedOnce, setHasScannedOnce] = useState(false);
  const [scannedFiles, setScannedFiles] = useState([]);
  const [selectedPaths, setSelectedPaths] = useState(new Set());
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [showLowSignal, setShowLowSignal] = useState(false);
  const [showUploaded, setShowUploaded] = useState(false);

  // ── System-wide content-hash duplicate lookup ─────────────────────────
  const [hashMatches, setHashMatches] = useState({}); // { [hash]: { exists, details } }
  const [isCheckingHashes, setIsCheckingHashes] = useState(false);

  // ── Reading files off disk via the Agent before handoff ──────────────
  const [isPreparing, setIsPreparing]   = useState(false);
  const [prepareStatus, setPrepareStatus] = useState('');

  const refreshAgentState = useCallback(async () => {
    const online = await isAgentRunning();
    setAgentOnline(online);
    if (online) {
      try { return await getWatchedFolders(); } catch { toast.error('Failed to load watched folders'); }
    }
    return [];
  }, []);

  const checkHashesAgainstServer = useCallback(async (files) => {
    const hashes = [...new Set(files.map(f => f.file_hash).filter(Boolean))];
    if (hashes.length === 0) { setHashMatches({}); return; }

    setIsCheckingHashes(true);
    try {
      const { data } = await api.post('/files/check-hashes-batch', { hashes });
      const map = {};
      data.results.forEach(r => { map[r.hash] = r; });
      setHashMatches(map);
    } catch (err) {
      console.error('Hash check failed:', err);
      setHashMatches({});
    } finally {
      setIsCheckingHashes(false);
    }
  }, []);

  const runScan = useCallback(async (days, { silent = false } = {}) => {
    setIsScanning(true);
    try {
      const result = await scanRecentFiles(days);
      const sorted = result.files.sort((a, b) => new Date(b.modified_at) - new Date(a.modified_at));
      setScannedFiles(sorted);
      setSelectedPaths(new Set());
      setVisibleCount(PAGE_SIZE);
      setHasScannedOnce(true);
      if (!silent) {
        if (sorted.length === 0) toast(`No files modified in the last ${days} day${days > 1 ? 's' : ''}.`, { icon: 'ℹ️' });
        else toast.success(`Found ${sorted.length} file${sorted.length > 1 ? 's' : ''}.`);
      }
      // Fire-and-forget: enrich with server-side duplicate info once files are in
      checkHashesAgainstServer(sorted);
    } catch (err) {
      if (!silent) toast.error(err.message || 'Scan failed');
    } finally {
      setIsScanning(false);
    }
  }, [checkHashesAgainstServer]);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      const folders = await refreshAgentState();
      if (cancelled) return;
      setWatchedFolders(folders);
      if (folders.length > 0) runScan(daysWindow, { silent: true });
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const resetScanState = () => {
    setScannedFiles([]);
    setSelectedPaths(new Set());
    setVisibleCount(PAGE_SIZE);
    setHasScannedOnce(false);
    setIsPreparing(false);
    setPrepareStatus('');
    setShowLowSignal(false);
    setShowUploaded(false);
    setHashMatches({});
  };

  const handleClose = () => {
    resetScanState();
    onClose();
  };

  const handleAddFolder = async () => {
    const trimmed = newFolderPath.trim();
    if (!trimmed) return;
    setFolderBusy(true);
    try {
      await addWatchedFolder(trimmed);
      toast.success('Folder added');
      setNewFolderPath('');
      const folders = await getWatchedFolders();
      setWatchedFolders(folders);
      runScan(daysWindow, { silent: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setFolderBusy(false);
    }
  };

  const handleRemoveFolder = async (path) => {
    setFolderBusy(true);
    try {
      await removeWatchedFolder(path);
      const folders = await getWatchedFolders();
      setWatchedFolders(folders);
      if (folders.length > 0) runScan(daysWindow, { silent: true });
      else setScannedFiles([]);
    } catch {
      toast.error('Failed to remove folder');
    } finally {
      setFolderBusy(false);
    }
  };

  const handleDaysChange = (days) => {
    setDaysWindow(days);
    if (watchedFolders.length > 0) runScan(days);
  };

  // Any file can be selected/uploaded, including already-uploaded ones.
  const toggleSelect = (filePath) => {
    setSelectedPaths(prev => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath); else next.add(filePath);
      return next;
    });
  };

  // ── Enrich every scanned file once, with importance + match status ────
  const enrichedFiles = useMemo(() => {
    return scannedFiles.map(f => ({
      ...f,
      _importance: importanceOf(f.file_name),
      _matchStatus: computeMatchStatus(f, existingFiles, hashMatches),
    }));
  }, [scannedFiles, existingFiles, hashMatches]);

  const uploadedFiles = useMemo(
    () => enrichedFiles.filter(f => f._matchStatus?.kind === 'duplicate'),
    [enrichedFiles]
  );
  const notUploadedFiles = useMemo(
    () => enrichedFiles.filter(f => f._matchStatus?.kind !== 'duplicate'),
    [enrichedFiles]
  );

  const importantFiles = useMemo(
    () => notUploadedFiles.filter(f => f._importance !== 'low'),
    [notUploadedFiles]
  );
  const lowSignalFiles = useMemo(
    () => notUploadedFiles.filter(f => f._importance === 'low'),
    [notUploadedFiles]
  );

  // "Select all" only affects the currently-visible (non-hidden) set.
  const currentlyVisibleFiles = useMemo(() => {
    let set = [...importantFiles];
    if (showLowSignal) set = [...set, ...lowSignalFiles];
    if (showUploaded) set = [...set, ...uploadedFiles];
    return set;
  }, [importantFiles, lowSignalFiles, uploadedFiles, showLowSignal, showUploaded]);

  const allSelected = currentlyVisibleFiles.length > 0 && currentlyVisibleFiles.every(f => selectedPaths.has(f.file_path));
  const toggleSelectAll = () => {
    setSelectedPaths(prev => allSelected ? new Set() : new Set(currentlyVisibleFiles.map(f => f.file_path)));
  };

  const hasFiles = scannedFiles.length > 0;

  const orderedForDisplay = useMemo(() => {
    const importantSorted = [...importantFiles].sort((a, b) => new Date(b.modified_at) - new Date(a.modified_at));
    const lowSorted = [...lowSignalFiles].sort((a, b) => new Date(b.modified_at) - new Date(a.modified_at));
    const uploadedSorted = [...uploadedFiles].sort((a, b) => new Date(b.modified_at) - new Date(a.modified_at));

    let result = [...importantSorted];
    if (showLowSignal) result = [...result, ...lowSorted];
    if (showUploaded) result = [...result, ...uploadedSorted];
    return result;
  }, [importantFiles, lowSignalFiles, uploadedFiles, showLowSignal, showUploaded]);

  const groupedVisible = useMemo(() => {
    return groupByRecency(orderedForDisplay.slice(0, visibleCount));
  }, [orderedForDisplay, visibleCount]);

  const remainingCount = orderedForDisplay.length - visibleCount;

  const handleContinue = async () => {
    const selectedFiles = scannedFiles.filter(f => selectedPaths.has(f.file_path));
    if (selectedFiles.length === 0) return;

    setIsPreparing(true);
    try {
      const fileObjects = [];
      for (let i = 0; i < selectedFiles.length; i++) {
        const f = selectedFiles[i];
        setPrepareStatus(`Reading ${i + 1} of ${selectedFiles.length}: ${f.file_name}`);
        const blob = await readAgentFile(f.file_path);
        fileObjects.push(new File([blob], f.file_name, { lastModified: new Date(f.modified_at).getTime() }));
      }
      onFilesSelected(fileObjects);
      resetScanState();
    } catch (err) {
      toast.error(err.message || 'Failed to read one or more files from disk.');
      setIsPreparing(false);
      setPrepareStatus('');
    }
  };

  // ── All hooks are above this line — early returns only after ──────────
  if (!isOpen) return null;

  if (agentOnline === false) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-blue-500/10 flex items-center justify-center">
            <Monitor size={28} className="text-blue-500" />
          </div>
          <h2 className="text-gray-900 dark:text-white font-bold text-lg mb-1">SFMS Agent Not Running</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-5">
            Install the lightweight SFMS Agent on this computer to scan local folders and fetch recent work files directly.
          </p>
          <a href={AGENT_DOWNLOAD_URL} className="block w-full py-2.5 text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow transition-all mb-2">
            Download SFMS Agent
          </a>
          <p className="text-[11px] text-gray-500 dark:text-gray-500 mb-4">
            Run the installer once — it starts automatically after that, every time you log in.
          </p>
          <div className="flex gap-3">
            <button onClick={handleClose} className="flex-1 py-2.5 text-sm font-semibold bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400">
              Close
            </button>
            <button onClick={refreshAgentState} className="flex-1 py-2.5 text-sm font-semibold bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl">
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl w-full max-w-2xl h-[85vh] shadow-2xl flex flex-col">

        {/* Header — shrink-0, never scrolls */}
        <div className="flex items-center justify-between p-6 pb-4 shrink-0">
          <div>
            <h2 className="text-gray-900 dark:text-white font-bold text-lg">Recent Work Files</h2>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5 flex items-center gap-1.5">
              {agentOnline === null ? 'Checking for SFMS Agent…' : 'Pulled from folders on this computer — documents first.'}
              {isCheckingHashes && <Loader2 size={11} className="animate-spin text-blue-500" />}
            </p>
          </div>
          <button onClick={handleClose} className="text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white">
            <X size={20} />
          </button>
        </div>

        {/* Controls — shrink-0, never scrolls */}
        <div className="px-6 space-y-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={daysWindow}
              onChange={(e) => handleDaysChange(Number(e.target.value))}
              disabled={isScanning}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-blue-600"
            >
              <option value={1}>Last 1 day</option>
              <option value={3}>Last 3 days</option>
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
            </select>

            <button
              onClick={() => runScan(daysWindow)}
              disabled={isScanning || watchedFolders.length === 0}
              className="flex items-center gap-1.5 text-xs font-semibold bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 disabled:opacity-40 text-gray-700 dark:text-gray-300 px-3 py-1.5 rounded-lg"
            >
              {isScanning ? <Loader2 size={13} className="animate-spin" /> : <RotateCw size={13} />}
              {isScanning ? 'Scanning…' : 'Rescan'}
            </button>

            <button
              onClick={() => setShowFolderManager(v => !v)}
              className="text-xs font-medium text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 ml-auto"
            >
              {showFolderManager ? 'Hide folders' : `Manage folders (${watchedFolders.length})`}
            </button>
          </div>

          {showFolderManager && (
            <div className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl p-3 space-y-2">
              {watchedFolders.map(f => (
                <div key={f.id} className="flex items-center justify-between text-xs">
                  <span className="text-gray-700 dark:text-gray-300 font-mono truncate">{f.path}</span>
                  <button onClick={() => handleRemoveFolder(f.path)} disabled={folderBusy} className="text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 ml-2 disabled:opacity-40">
                    <X size={14} />
                  </button>
                </div>
              ))}
              {watchedFolders.length === 0 && <p className="text-xs text-gray-500 dark:text-gray-600">No folders watched yet.</p>}
              <div className="flex gap-2 pt-1">
                <input
                  value={newFolderPath}
                  onChange={e => setNewFolderPath(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAddFolder()}
                  placeholder="e.g. C:\Users\you\Documents"
                  disabled={folderBusy}
                  className="flex-1 bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-1.5 text-xs text-gray-900 dark:text-white font-mono focus:outline-none focus:border-blue-500"
                />
                <button onClick={handleAddFolder} disabled={folderBusy || !newFolderPath.trim()} className="flex items-center gap-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg">
                  <FolderPlus size={13} />
                  Add
                </button>
              </div>
            </div>
          )}

          {hasFiles && (
            <div className="flex flex-wrap items-center gap-3 text-xs bg-gray-200/60 dark:bg-gray-800/60 rounded-xl px-3 py-2">
              <span className="text-gray-600 dark:text-gray-400 font-medium">{notUploadedFiles.length} to review</span>
              <span className="text-gray-400 dark:text-gray-600">·</span>
              <span className="text-gray-600 dark:text-gray-400">{importantFiles.length} documents</span>

              {lowSignalFiles.length > 0 && (
                <>
                  <span className="text-gray-400 dark:text-gray-600">·</span>
                  <button
                    onClick={() => setShowLowSignal(v => !v)}
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {showLowSignal ? 'Hide' : 'Show'} {lowSignalFiles.length} other file{lowSignalFiles.length > 1 ? 's' : ''}
                  </button>
                </>
              )}

              {uploadedFiles.length > 0 && (
                <>
                  <span className="text-gray-400 dark:text-gray-600">·</span>
                  <button
                    onClick={() => setShowUploaded(v => !v)}
                    className="text-gray-500 dark:text-gray-500 hover:underline"
                  >
                    {showUploaded ? 'Hide' : 'Show'} {uploadedFiles.length} already uploaded
                  </button>
                </>
              )}

              <label className="flex items-center gap-1.5 ml-auto cursor-pointer">
                <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="w-3.5 h-3.5 accent-blue-500 cursor-pointer" />
                <span className="text-gray-600 dark:text-gray-400">Select all</span>
              </label>
            </div>
          )}
        </div>

        {/* Scrollable file list — the ONLY region that scrolls */}
        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-3">
          {watchedFolders.length === 0 && !showFolderManager && (
            <div className="text-center py-8">
              <FolderOpen size={32} className="mx-auto mb-3 text-gray-400 dark:text-gray-600" />
              <p className="text-sm text-gray-500 dark:text-gray-500 mb-3">No folders being watched yet.</p>
              <button onClick={() => setShowFolderManager(true)} className="text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl">
                Add a folder to get started
              </button>
            </div>
          )}

          {isScanning && !hasScannedOnce && watchedFolders.length > 0 && (
            <div className="text-center py-10">
              <Loader2 size={24} className="mx-auto mb-3 text-blue-500 animate-spin" />
              <p className="text-sm text-gray-500 dark:text-gray-500">Scanning your folders…</p>
            </div>
          )}

          {hasScannedOnce && !isScanning && !hasFiles && (
            <div className="text-center py-10">
              <p className="text-sm text-gray-500 dark:text-gray-500">
                No files modified in the last {daysWindow} day{daysWindow > 1 ? 's' : ''}.
              </p>
            </div>
          )}

          {hasFiles && orderedForDisplay.length === 0 && (
            <div className="text-center py-10">
              <p className="text-sm text-gray-500 dark:text-gray-500">
                {notUploadedFiles.length === 0
                  ? 'Every file found in this window has already been uploaded.'
                  : 'No document-type files found in this window — only installers/archives.'}
              </p>
              {notUploadedFiles.length === 0 && uploadedFiles.length > 0 && (
                <button onClick={() => setShowUploaded(true)} className="mt-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                  Show already-uploaded files
                </button>
              )}
              {notUploadedFiles.length > 0 && lowSignalFiles.length > 0 && (
                <button onClick={() => setShowLowSignal(true)} className="mt-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                  Show them anyway
                </button>
              )}
            </div>
          )}

          {hasFiles && orderedForDisplay.length > 0 && (
            <div className="space-y-4">
              {groupedVisible.map(([label, items]) => (
                <div key={label}>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-500 mb-1.5 px-0.5">{label}</p>
                  <div className="space-y-1">
                    {items.map(item => {
                      const isDuplicate = item._matchStatus?.kind === 'duplicate';
                      const isSelected = selectedPaths.has(item.file_path);
                      const isImportant = item._importance === 'important';
                      const { Icon, className: iconClassName } = iconFor(item.file_name);
                      return (
                        <div
                          key={item.file_path}
                          onClick={() => toggleSelect(item.file_path)}
                          className={`flex items-center gap-3 px-3 py-2 rounded-xl border cursor-pointer transition-colors
                            ${isSelected
                              ? 'bg-blue-500/10 border-blue-500/40'
                              : isDuplicate
                                ? 'bg-gray-50 dark:bg-gray-900/40 border-transparent hover:border-gray-200 dark:hover:border-gray-800'
                                : 'bg-white dark:bg-gray-950/40 border-transparent hover:border-gray-200 dark:hover:border-gray-800'
                            }
                            ${isImportant && !isSelected ? 'ring-1 ring-blue-500/10' : ''}`}
                        >
                          <span className="shrink-0 relative flex items-center justify-center w-6 h-6">
                            <Icon size={20} className={iconClassName} />
                            {isImportant && (
                              <Star
                                size={9}
                                className="absolute -top-1 -right-1.5 fill-amber-400 text-amber-400"
                                title="Work document"
                              />
                            )}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className={`text-xs font-medium truncate ${isDuplicate ? 'text-gray-600 dark:text-gray-400' : 'text-gray-900 dark:text-white'}`} title={item.file_path}>
                              {item.file_name}
                            </p>
                            <p className="text-[10px] text-gray-500 dark:text-gray-500 mt-0.5">
                              {formatBytes(item.size_bytes)} · {formatDate(item.modified_at)} at {formatTime(item.modified_at)}
                            </p>
                            <DuplicateLocation matchStatus={item._matchStatus} />
                          </div>
                          <MatchBadge matchStatus={item._matchStatus} />
                          <input
                            type="checkbox"
                            checked={isSelected}
                            readOnly
                            className="w-4 h-4 accent-blue-500 pointer-events-none shrink-0"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {remainingCount > 0 && (
                <button
                  onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                  className="w-full py-2 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 border border-dashed border-gray-300 dark:border-gray-700 rounded-xl"
                >
                  Show {Math.min(PAGE_SIZE, remainingCount)} more ({remainingCount} remaining)
                </button>
              )}
            </div>
          )}
        </div>

        {/* Footer — shrink-0, never scrolls */}
        <div className="flex gap-3 p-6 pt-4 shrink-0 border-t border-gray-200 dark:border-gray-800">
          <button onClick={handleClose} disabled={isPreparing} className="flex-1 py-2.5 text-sm font-semibold bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 cursor-pointer disabled:opacity-40">
            Close
          </button>
          <button
            onClick={handleContinue}
            disabled={selectedPaths.size === 0 || isPreparing}
            className="flex items-center justify-center gap-2 flex-1 py-2.5 text-sm font-semibold bg-blue-600 hover:bg-blue-500 disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 dark:disabled:text-gray-600 text-white rounded-xl shadow transition-all cursor-pointer"
          >
            {isPreparing && <Loader2 size={15} className="animate-spin" />}
            {isPreparing
              ? (prepareStatus || 'Reading files…')
              : selectedPaths.size > 0
                ? `Continue with ${selectedPaths.size} file${selectedPaths.size > 1 ? 's' : ''}`
                : 'Select files to continue'}
          </button>
        </div>

      </div>
    </div>
  );
}