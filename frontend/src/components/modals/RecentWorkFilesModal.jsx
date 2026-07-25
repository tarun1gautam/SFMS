/**
 * RecentWorkFilesModal.jsx  (SFMS — Agent-Powered Local Folder Scan, v4)
 *
 * Pure picker: scans watched folders via the Agent, lets the user select
 * files, reads their bytes from the Agent, converts them into real browser
 * File objects, then hands the selection off to the existing UploadModal via
 * onFilesSelected — no separate upload UI, no separate backend route.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'react-hot-toast';
import {
  isAgentRunning, getWatchedFolders, addWatchedFolder,
  removeWatchedFolder, scanRecentFiles, readAgentFile,
} from '../../utils/sfmsAgent';
const AGENT_DOWNLOAD_URL = '/downloads/SFMS_Agent_Setup.zip';
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

const EXT_ICON = {
  pdf: '📄', doc: '📝', docx: '📝', xls: '📊', xlsx: '📊',
  ppt: '📑', pptx: '📑', png: '🖼️', jpg: '🖼️', jpeg: '🖼️', gif: '🖼️',
  zip: '🗜️', rar: '🗜️', mp4: '🎬', mp3: '🎵', txt: '📃', csv: '📊',
  exe: '⚙️', msi: '⚙️', dmg: '⚙️', apk: '⚙️', bat: '⚙️', sh: '⚙️',
  json: '🧾', js: '💻', ts: '💻', jsx: '💻', tsx: '💻', py: '💻',
};
function iconFor(fileName) {
  const ext = fileName.split('.').pop()?.toLowerCase();
  return EXT_ICON[ext] || '📃';
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

export default function RecentWorkFilesModal({ isOpen, onClose, onFilesSelected }) {
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
    } catch (err) {
      if (!silent) toast.error(err.message || 'Scan failed');
    } finally {
      setIsScanning(false);
    }
  }, []);

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

  const toggleSelect = (filePath) => {
    setSelectedPaths(prev => {
      const next = new Set(prev);
      if (next.has(filePath)) next.delete(filePath); else next.add(filePath);
      return next;
    });
  };

  const allSelected = scannedFiles.length > 0 && scannedFiles.every(f => selectedPaths.has(f.file_path));
  const toggleSelectAll = () => {
    setSelectedPaths(prev => allSelected ? new Set() : new Set(scannedFiles.map(f => f.file_path)));
  };

  const hasFiles = scannedFiles.length > 0;
  const groupedVisible = useMemo(() => {
    return groupByRecency(scannedFiles.slice(0, visibleCount));
  }, [scannedFiles, visibleCount]);
  const remainingCount = scannedFiles.length - visibleCount;

  // Read each selected file's bytes from the Agent, turn them into real
  // browser File objects, then hand off to the parent — which opens the
  // existing UploadModal pre-populated with these. No separate upload
  // logic here; UploadModal's collision/progress/resolution UI is reused
  // completely unchanged.
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
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-blue-500/10 flex items-center justify-center text-3xl">🖥️</div>
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
      {/* Fixed-height flex column: header/controls/footer never scroll,
          only the file list region does. This is what fixes the
          scrollbar/overflow bug. */}
      <div className="bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl w-full max-w-2xl h-[85vh] shadow-2xl flex flex-col">

        {/* Header — shrink-0, never scrolls */}
        <div className="flex items-center justify-between p-6 pb-4 shrink-0">
          <div>
            <h2 className="text-gray-900 dark:text-white font-bold text-lg">Recent Work Files</h2>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">
              {agentOnline === null ? 'Checking for SFMS Agent…' : 'Pulled from folders on this computer.'}
            </p>
          </div>
          <button onClick={handleClose} className="text-gray-500 dark:text-gray-500 hover:text-gray-900 dark:hover:text-white text-xl leading-none">×</button>
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
              className="text-xs font-semibold bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 disabled:opacity-40 text-gray-700 dark:text-gray-300 px-3 py-1.5 rounded-lg"
            >
              {isScanning ? 'Scanning…' : '↻ Rescan'}
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
                  <button onClick={() => handleRemoveFolder(f.path)} disabled={folderBusy} className="text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 ml-2 disabled:opacity-40">×</button>
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
                <button onClick={handleAddFolder} disabled={folderBusy || !newFolderPath.trim()} className="text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white px-3 py-1.5 rounded-lg">
                  Add
                </button>
              </div>
            </div>
          )}

          {hasFiles && (
            <div className="flex items-center gap-3 text-xs bg-gray-200/60 dark:bg-gray-800/60 rounded-xl px-3 py-2">
              <span className="text-gray-600 dark:text-gray-400 font-medium">{scannedFiles.length} found</span>
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
              <p className="text-sm text-gray-500 dark:text-gray-500 mb-3">No folders being watched yet.</p>
              <button onClick={() => setShowFolderManager(true)} className="text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-xl">
                Add a folder to get started
              </button>
            </div>
          )}

          {isScanning && !hasScannedOnce && watchedFolders.length > 0 && (
            <div className="text-center py-10">
              <div className="inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-3" />
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

          {hasFiles && (
            <div className="space-y-4">
              {groupedVisible.map(([label, items]) => (
                <div key={label}>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-500 mb-1.5 px-0.5">{label}</p>
                  <div className="space-y-1">
                    {items.map(item => {
                      const isSelected = selectedPaths.has(item.file_path);
                      return (
                        <div
                          key={item.file_path}
                          onClick={() => toggleSelect(item.file_path)}
                          className={`flex items-center gap-3 px-3 py-2 rounded-xl border transition-colors cursor-pointer
                            ${isSelected ? 'bg-blue-500/10 border-blue-500/40' : 'bg-white dark:bg-gray-950/40 border-transparent hover:border-gray-200 dark:hover:border-gray-800'}`}
                        >
                          <span className="text-lg shrink-0">{iconFor(item.file_name)}</span>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-gray-900 dark:text-white truncate" title={item.file_path}>{item.file_name}</p>
                            <p className="text-[10px] text-gray-500 dark:text-gray-500 mt-0.5">
                              {formatBytes(item.size_bytes)} · {formatDate(item.modified_at)} at {formatTime(item.modified_at)}
                            </p>
                          </div>
                          <input type="checkbox" checked={isSelected} readOnly className="w-4 h-4 accent-blue-500 pointer-events-none shrink-0" />
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

        {/* Footer — shrink-0, never scrolls, no sticky hack needed */}
        <div className="flex gap-3 p-6 pt-4 shrink-0 border-t border-gray-200 dark:border-gray-800">
          <button onClick={handleClose} disabled={isPreparing} className="flex-1 py-2.5 text-sm font-semibold bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 cursor-pointer disabled:opacity-40">
            Close
          </button>
          <button
            onClick={handleContinue}
            disabled={selectedPaths.size === 0 || isPreparing}
            className="flex-1 py-2.5 text-sm font-semibold bg-blue-600 hover:bg-blue-500 disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 dark:disabled:text-gray-600 text-white rounded-xl shadow transition-all cursor-pointer"
          >
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