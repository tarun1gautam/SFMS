/**
 * UploadModal.jsx  (SFMS — Multi-file Collision Detection Edition)
 *
 * Collision detection now works for ALL files, not just single uploads:
 *  1. Before uploading, ALL files are checked for collisions in parallel
 *  2. If any collide → show a conflict panel listing every conflicting file
 *  3. User picks a resolution per-file: Rename / Overwrite / Skip
 *  4. "Apply to all" button resolves all conflicts at once
 *  5. Non-conflicting files upload immediately while conflicts wait
 */

import React, { useEffect, useState, useRef } from 'react';
import api from '../../utils/api';
import { toast } from 'react-hot-toast';
import { io as socketIO } from 'socket.io-client';

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function formatTime(seconds) {
  if (!seconds || seconds < 0) return '--';
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  const m = Math.floor(seconds / 60), s = Math.floor(seconds % 60);
  return `${m}m ${s}s`;
}

const makeFileState = (file) => ({
  file,
  progress:   0,
  speed:      0,
  eta:        0,
  elapsed:    0,
  status:     'pending',  // pending | queued | uploading | done | error | skipped
  queuePos:   null,
  queueTotal: null,
  error:      null,
  dbRow:      null,
  cancelRef:  { cancel: null },
});

export default function UploadModal({ isOpen, onClose, user, expoFolder, currentFolderId, onUploadSuccess }) {
  // ── File list ─────────────────────────────────────────────────────────────
  const [fileStates,  setFileStates]  = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);

  // ── Shared upload options ─────────────────────────────────────────────────
  const [visibility,         setVisibility]         = useState('public');
  const [targetUsersInput,   setTargetUsersInput]   = useState('');
  const [fileDescription,    setFileDescription]    = useState('');
  const [selectedFolder,     setSelectedFolder]     = useState(user.base_path);
  const [folderid,           setFolderId]           = useState(user.base_path);
  const [folders,            setFolders]            = useState([]);
  const [filteredFolders,    setfilteredFolders]    = useState([]);
  const [showFolderDropdown, setShowFolderDropdown] = useState(false);
  const [selectedUsers,      setSelectedUsers]      = useState([]);
  const [targetUsersInputval,setTargetUsersInputval]= useState('');
  const [suggestions,        setSuggestions]        = useState([]);

  // ── Multi-file conflict state ─────────────────────────────────────────────
  // conflicts: [{ idx, fileName, uploadedBy, uploadedAt, existingSize, foundInFolder }]
  const [conflicts,         setConflicts]         = useState([]);
  // resolutions: { [idx]: 'rename' | 'replace' | 'skip' }
  const [resolutions,       setResolutions]       = useState({});
  const [showConflictPanel, setShowConflictPanel] = useState(false);

  // ── Global upload state ───────────────────────────────────────────────────
  const [isUploading,  setIsUploading]  = useState(false);
  const [isChecking,   setIsChecking]   = useState(false); // collision check in progress

  // ── Queue stats ───────────────────────────────────────────────────────────
  const [queueStats, setQueueStats] = useState({ active: 0, waiting: 0, maxConcurrent: 20 });

  // ── Socket.io ─────────────────────────────────────────────────────────────
  const socketRef   = useRef(null);
  const socketIdRef = useRef(null);
  const timerRef    = useRef({});

  // ─── Socket setup ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    const backendUrl = import.meta.env.VITE_API_URL?.replace('/api', '') || 'http://localhost:5000';
    const sock = socketIO(backendUrl, { transports: ['websocket', 'polling'] });
    socketRef.current = sock;

    sock.on('connect', () => { socketIdRef.current = sock.id; });

    sock.on('upload_queue_position', ({ fileName, position, total }) => {
      setFileStates(prev => prev.map(fs =>
        fs.file.name === fileName
          ? { ...fs, status: 'queued', queuePos: position, queueTotal: total }
          : fs
      ));
    });

    sock.on('upload_queue_started', ({ fileName }) => {
      setFileStates(prev => prev.map(fs =>
        fs.file.name === fileName
          ? { ...fs, status: 'uploading', queuePos: null }
          : fs
      ));
    });

    sock.on('upload_queue_stats', (stats) => setQueueStats(stats));

    return () => { sock.disconnect(); socketRef.current = null; };
  }, [isOpen]);

  // ─── Load folders ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    api.get('/folders',{params: { fetch_all: true } }).then(res => {
      const decoded = res.data.folders.map(f => ({
        ...f, full_path: decodeURIComponent(f.full_path)
      }));
      setFolders(decoded);
      setfilteredFolders(decoded.filter(f => f.parent_path === user.base_path));
    }).catch(console.error);
  }, [isOpen]);

  useEffect(() => {
    if (visibility === 'public') setSelectedFolder('/public/');
    else setSelectedFolder(expoFolder);
  }, [visibility]);

  useEffect(() => {
    if (expoFolder !== '/public/') { setVisibility('directory'); setSelectedFolder(expoFolder); }
    else setVisibility('public');
  }, [expoFolder]);

  useEffect(()=>{
      const foundFolder = folders.find(f =>
      f.full_path.trim().toLowerCase() === selectedFolder.trim().toLowerCase()
  );
  setFolderId(foundFolder?.folder_id);
  },[selectedFolder,folders])

  if (!isOpen) return null;

  // ─── Reset ─────────────────────────────────────────────────────────────────
  const resetState = () => {
    setFileStates([]);
    setActiveIndex(0);
    setIsUploading(false);
    setIsChecking(false);
    setConflicts([]);
    setResolutions({});
    setShowConflictPanel(false);
    setFileDescription('');
    Object.values(timerRef.current).forEach(clearInterval);
    timerRef.current = {};
  };

  const handleClose = () => {
    fileStates.forEach(fs => { if (fs.cancelRef.cancel) fs.cancelRef.cancel('cancelled'); });
    resetState();
    onClose();
  };

  const handleFileChange = (e) => {
    if (!e.target.files.length) return;
    setFileStates(Array.from(e.target.files).map(makeFileState));
    setActiveIndex(0);
    setConflicts([]);
    setResolutions({});
    setShowConflictPanel(false);
  };

  const buildSharedLabel = () => {
    if (visibility === 'public') return ['Public'];
    if (visibility === 'directory') return ['Directory'];
    return selectedUsers.length > 0 ? selectedUsers : ['—'];
  };

  // ─── Per-file elapsed timer ────────────────────────────────────────────────
  const startTimer = (idx) => {
    timerRef.current[idx] = setInterval(() => {
      setFileStates(prev => prev.map((fs, i) =>
        i === idx ? { ...fs, elapsed: fs.elapsed + 1 } : fs
      ));
    }, 1000);
  };

  const stopTimer = (idx) => {
    clearInterval(timerRef.current[idx]);
    delete timerRef.current[idx];
  };

  // ─── Upload a single file ──────────────────────────────────────────────────
  const uploadOneFile = async (idx, resolutionStrategy = null) => {
    const fs_item = fileStates[idx];
    const file    = fs_item.file;

    const formData = new FormData();
    formData.append('file',         file);
    formData.append('visibility',   visibility);
    formData.append('description',  fileDescription);
    formData.append('virtual_path', folderid);
    formData.append('shared_label', JSON.stringify(buildSharedLabel()));
    formData.append('target_users', JSON.stringify(selectedUsers));
    if (folderid)           formData.append('folder_id', folderid);
    if (resolutionStrategy) formData.append('conflict_resolution', resolutionStrategy);

    setFileStates(prev => prev.map((fs, i) =>
      i === idx ? { ...fs, progress: 0, elapsed: 0, status: 'uploading', error: null } : fs
    ));
    startTimer(idx);

    const startTs   = Date.now();
    const cancelRef = fileStates[idx].cancelRef;

    try {
      const { default: axios } = await import('axios');
      const source = axios.CancelToken.source();
      cancelRef.cancel = source.cancel;

      const headers = {};
      if (socketIdRef.current) headers['x-socket-id'] = socketIdRef.current;

      const response = await api.post('/files/upload', formData, {
        headers,
        cancelToken: source.token,
        onUploadProgress: (event) => {
          if (!event.total) return;
          const pct       = Math.round((event.loaded / event.total) * 100);
          const elapsed   = (Date.now() - startTs) / 1000;
          const speed     = elapsed > 0 ? event.loaded / elapsed : 0;
          const remaining = speed > 0 ? (event.total - event.loaded) / speed : 0;
          setFileStates(prev => prev.map((fs, i) =>
            i === idx ? { ...fs, progress: pct, speed, eta: remaining, status: 'uploading' } : fs
          ));
        },
      });

      stopTimer(idx);
      setFileStates(prev => prev.map((fs, i) =>
        i === idx ? { ...fs, status: 'done', progress: 100, dbRow: response.data.file } : fs
      ));
      return response.data.file;
    } catch (err) {
      stopTimer(idx);
      const errorMsg = err?.response?.data?.error || err.message || 'Upload failed';
      setFileStates(prev => prev.map((fs, i) =>
        i === idx ? { ...fs, status: 'error', error: errorMsg } : fs
      ));
      throw err;
    }
  };

  // ─── STEP 1: Check ALL files for collisions in parallel ───────────────────
  const checkAllCollisions = async () => {
    console.log(folderid);
    setIsChecking(true);
    const checks = await Promise.all(
      fileStates.map(async (fs, idx) => {
        try {
          const { data } = await api.get('/files/check-collision', {
            params: { filename: fs.file.name, folder_id:  folderid}
          });
          if (data.exists) {
            return {
              idx,
              fileName:      fs.file.name,
              uploadedBy:    data.fileDetails?.uploadedBy    || 'unknown',
              uploadedAt:    data.fileDetails?.uploadTimestamp || null,
              existingSize:  data.fileDetails?.filesize       || 0,
              foundInFolder: data.fileDetails?.foundInFolder  || '/',
              filevis: data.fileDetails?.filevis  || 'public',
            };
          }
          return null;
        } catch {
          return null; // if check fails, allow upload
        }
      })
    );
    setIsChecking(false);
    return checks.filter(Boolean); // only the conflicting ones
  };

  // ─── STEP 2: Main upload handler ──────────────────────────────────────────
  const handleUploadAll = async (presetResolution = null) => {
    if (!fileStates.length) return;
    if(!folderid){
      toast.error("Folder not exists or may be out of your scope");
      return
    }

    // If called from "Proceed" button on conflict panel, use per-file resolutions
    if (showConflictPanel && !presetResolution) {
      await proceedWithResolutions();
      return;
    }

    // If a single resolution was applied to everything (apply-to-all), skip check
    if (presetResolution) {
      await runUploads(fileStates.map((_, idx) => ({ idx, strategy: presetResolution })));
      return;
    }

    // Normal flow: check all files first
    setIsUploading(true);
    const found = await checkAllCollisions();

    if (found.length > 0) {
      // Pause and show conflict panel — don't start any uploads yet
      setConflicts(found);
      // Pre-fill resolutions with 'rename' as safe default
      const defaultRes = {};
      found.forEach(c => { defaultRes[c.idx] = 'rename'; });
      setResolutions(defaultRes);
      setShowConflictPanel(true);
      setIsUploading(false);
      return;
    }

    // No conflicts — upload everything
    await runUploads(fileStates.map((_, idx) => ({ idx, strategy: null })));
  };

  // ─── STEP 3: User confirmed resolutions, proceed ──────────────────────────
  const proceedWithResolutions = async () => {
    setShowConflictPanel(false);
    setIsUploading(true);

    const plan = fileStates.map((_, idx) => {
      const conflict = conflicts.find(c => c.idx === idx);
      if (!conflict) return { idx, strategy: null }; // no conflict
      const res = resolutions[idx] || 'rename';
      return { idx, strategy: res };
    }).filter(p => p.strategy !== 'skip');

    // Mark skipped files
    const skippedIndices = fileStates
      .map((_, idx) => idx)
      .filter(idx => {
        const conflict = conflicts.find(c => c.idx === idx);
        return conflict && resolutions[idx] === 'skip';
      });

    if (skippedIndices.length > 0) {
      setFileStates(prev => prev.map((fs, i) =>
        skippedIndices.includes(i) ? { ...fs, status: 'skipped' } : fs
      ));
    }

    await runUploads(plan);
  };

  // ─── Core: run the upload plan ────────────────────────────────────────────
  const runUploads = async (plan) => {
    setIsUploading(true);

    const promises = plan.map(({ idx, strategy }) =>
      uploadOneFile(idx, strategy)
        .then(row  => ({ status: 'fulfilled', idx, row }))
        .catch(err => ({ status: 'rejected',  idx, error: err.message }))
    );

    const results  = await Promise.all(promises);
    const successes = results.filter(r => r.status === 'fulfilled');
    const failures  = results.filter(r => r.status === 'rejected');

    setIsUploading(false);

    if (successes.length > 0) {
      onUploadSuccess?.();
      toast.success(
        successes.length === 1
          ? `"${fileStates[successes[0].idx].file.name}" uploaded successfully`
          : `${successes.length} of ${fileStates.length} files uploaded`
      );
    }
    if (failures.length > 0) {
      toast.error(`${failures.length} file(s) failed`);
    }

    const allSettled = fileStates.every((_, i) => {
      const inPlan   = plan.find(p => p.idx === i);
      const skipped  = !inPlan;
      const result   = results.find(r => r.idx === i);
      return skipped || (result && result.status === 'fulfilled');
    });

    if (allSettled && failures.length === 0) {
      resetState();
      onUploadSuccess();
      onClose();
    }
  };

  // ── User search (same pattern as FolderModal) ──────────────────────────
const handleSearchChange = async (e) => {
  const value = e.target.value;
  setTargetUsersInputval(value);
  if (!value.length) { setSuggestions([]); return; }

  try {
    const res = await api.get(`/auth/users/search?query=${encodeURIComponent(value)}`);
    setSuggestions(res.data.users.filter(u => !selectedUsers.includes(u)));
  } catch (err) {
    console.error('Error fetching users:', err);
  }
};

  // ─── Computed state ────────────────────────────────────────────────────────
  const hasFiles      = fileStates.length > 0;
  const allDone       = hasFiles && fileStates.every(fs => fs.status === 'done' || fs.status === 'skipped');
  const anyQueued     = fileStates.some(fs => fs.status === 'queued');
  const totalProgress = hasFiles
    ? Math.round(fileStates.reduce((sum, fs) => sum + fs.progress, 0) / fileStates.length)
    : 0;
  const activeFile = fileStates[activeIndex];

  const statusBadge = (fs) => {
    if (fs.status === 'done')      return <span className="text-emerald-400 text-xs font-bold">✓ Done</span>;
    if (fs.status === 'skipped')   return <span className="text-gray-500 text-xs font-bold">⊘ Skipped</span>;
    if (fs.status === 'error')     return <span className="text-red-400 text-xs font-bold">✗ Failed</span>;
    if (fs.status === 'uploading') return <span className="text-blue-400 text-xs font-bold animate-pulse">↑ {fs.progress}%</span>;
    if (fs.status === 'queued')    return <span className="text-amber-400 text-xs font-bold">⧗ #{fs.queuePos}</span>;
    return <span className="text-gray-500 text-xs">Pending</span>;
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-white font-bold text-lg">
            {showConflictPanel ? '⚠ Duplicate Files Found' : 'Upload Files'}
          </h2>
          <div className="flex items-center gap-3">
            <div className="text-xs text-gray-500 bg-gray-800 rounded-lg px-2 py-1">
              <span className="text-blue-400">{queueStats.active}</span> active ·{' '}
              <span className="text-amber-400">{queueStats.waiting}</span> waiting
            </div>
            <button onClick={handleClose} className="text-gray-500 hover:text-white transition-colors text-xl leading-none">×</button>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            CONFLICT PANEL — shown when duplicates found across any files
        ══════════════════════════════════════════════════════════════════ */}
        {showConflictPanel ? (
          <div className="space-y-4">

            <p className="text-sm text-gray-400">
              <span className="text-amber-400 font-semibold">{conflicts.length} file{conflicts.length > 1 ? 's' : ''}</span>
              {' '}already exist on the server. Choose what to do with each one.
              Non-conflicting files will upload normally.
            </p>

            {/* Apply-to-all shortcuts */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const all = {};
                  conflicts.forEach(c => { all[c.idx] = 'rename'; });
                  setResolutions(all);
                }}
                className="flex-1 py-1.5 text-xs font-bold bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg border border-gray-700"
              >
                Rename All
              </button>
              {conflicts.every(c => c.uploadedBy === user.username) && (
  <button
    onClick={() => {
      const all = {};
      conflicts.forEach(c => { all[c.idx] = 'replace'; });
      setResolutions(all);
    }}
    className="flex-1 py-1.5 text-xs font-bold bg-red-950/30 hover:bg-red-900/40 text-red-400 rounded-lg border border-red-900/50"
  >
    Replace All
  </button>
)}
              <button
                onClick={() => {
                  const all = {};
                  conflicts.forEach(c => { all[c.idx] = 'skip'; });
                  setResolutions(all);
                }}
                className="flex-1 py-1.5 text-xs font-bold bg-gray-800 hover:bg-gray-700 text-gray-500 rounded-lg border border-gray-700"
              >
                Skip All
              </button>
            </div>

            {/* Per-file conflict rows */}
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {conflicts.map((conflict) => {
                const fileState = fileStates[conflict.idx];
                const res = resolutions[conflict.idx] || 'rename';
                const sizeDiff = fileState
                  ? fileState.file.size - Number(conflict.existingSize)
                  : 0;

                return (
                  <div key={conflict.idx} className="bg-gray-800/60 border border-gray-700 rounded-xl p-3 space-y-2">
                    {/* File info row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-white text-xs font-semibold truncate">{conflict.fileName}</p>
                        <p className="text-gray-500 text-[10px] mt-0.5">
                          Uploaded by <span className="text-gray-400">{conflict.uploadedBy}</span>
                          {conflict.uploadedAt && (
                            <> · {new Date(conflict.uploadedAt).toLocaleDateString()}</>
                          )}
                          {' · '}
                          {sizeDiff === 0
                            ? 'same size'
                            : sizeDiff > 0
                              ? <span className="text-amber-400">+{formatBytes(Math.abs(sizeDiff))} larger</span>
                              : <span className="text-blue-400">{formatBytes(Math.abs(sizeDiff))} smaller</span>
                          }
                          {' · in '}<span className="text-blue-400 font-mono">{conflict.foundInFolder}</span>
                        </p>
                      </div>
                    </div>
                    {/* Resolution picker */}
                    <div className="flex gap-1.5">
                      {[
  { value: 'rename',  label: 'Rename',  always: true },
  { value: 'replace', label: 'Replace', always: false }, // ← gated
  { value: 'skip',    label: 'Skip',    always: true },
].filter(opt => opt.always || conflict.uploadedBy === user.username) // or user.id
 .map(opt => {
    const isActive =
      opt.value === 'rename'  ? res === 'rename'  :
      opt.value === 'replace' ? res === 'replace' :
      res === 'skip';

    const color = isActive
      ? opt.value === 'replace' ? 'bg-red-700 text-white border-red-600'
      : opt.value === 'rename'  ? 'bg-blue-600 text-white border-blue-500'
      :                           'bg-gray-600 text-white border-gray-500'
      : 'bg-gray-900 text-gray-400 border-gray-700 hover:border-gray-500';

    return (
      <button
        key={opt.value}
        onClick={() => setResolutions(prev => ({ ...prev, [conflict.idx]: opt.value }))}
        className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg border transition-colors ${color}`}
      >
        {opt.label}
      </button>
    );
  })
}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary + Proceed */}
            <div className="bg-gray-800/40 rounded-xl p-3 text-xs text-gray-400 space-y-1">
              {['rename', 'replace', 'skip'].map(action => {
                const count = conflicts.filter(c => (resolutions[c.idx] || 'rename') === action).length;
                if (count === 0) return null;
                const labels = { rename: '🔤 Renamed', replace: '♻ Replaced', skip: '⊘ Skipped' };
                return <p key={action}>{labels[action]}: <span className="text-white font-semibold">{count} file{count > 1 ? 's' : ''}</span></p>;
              })}
              {fileStates.length - conflicts.length > 0 && (
                <p>✓ No conflict: <span className="text-emerald-400 font-semibold">{fileStates.length - conflicts.length} file{fileStates.length - conflicts.length > 1 ? 's' : ''}</span> upload normally</p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowConflictPanel(false)}
                className="flex-1 py-2.5 text-sm font-semibold bg-gray-950 border border-gray-800 rounded-xl hover:bg-gray-800 text-gray-400"
              >
                Back
              </button>
              <button
                onClick={() => handleUploadAll(null)}
                className="flex-1 py-2.5 text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow transition-all"
              >
                Proceed with Upload
              </button>
            </div>
          </div>

        ) : (
        /* ══════════════════════════════════════════════════════════════════
            NORMAL UPLOAD PANEL
        ══════════════════════════════════════════════════════════════════ */
          <div className="space-y-4">

            {/* File drop zone */}
            <label className="block">
              <div className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors
                ${hasFiles ? 'border-blue-700 bg-blue-950/20' : 'border-gray-700 hover:border-gray-500'}`}>
                <input type="file" multiple className="hidden" onChange={handleFileChange} disabled={isUploading} />
                {!hasFiles ? (
                  <>
                    <p className="text-gray-400 text-sm">Click or drag & drop files here</p>
                    <p className="text-gray-600 text-xs mt-1">Multiple files supported · Max 500 MB each</p>
                  </>
                ) : (
                  <p className="text-blue-400 text-sm font-medium">
                    {fileStates.length} file{fileStates.length > 1 ? 's' : ''} selected — click to change
                  </p>
                )}
              </div>
            </label>

            {/* File list */}
            {hasFiles && (
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {fileStates.map((fs, idx) => (
                  <div
                    key={idx}
                    onClick={() => setActiveIndex(idx)}
                    className={`p-2.5 rounded-xl border cursor-pointer transition-colors
                      ${activeIndex === idx ? 'border-blue-700 bg-blue-950/20' : 'border-gray-800 hover:border-gray-700'}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-white text-xs font-medium truncate max-w-[60%]">{fs.file.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 text-xs">{formatBytes(fs.file.size)}</span>
                        {statusBadge(fs)}
                      </div>
                    </div>
                    {(fs.status === 'uploading' || fs.status === 'done') && (
                      <div className="w-full bg-gray-800 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all duration-300 ${fs.status === 'done' ? 'bg-emerald-500' : 'bg-blue-500'}`}
                          style={{ width: `${fs.progress}%` }}
                        />
                      </div>
                    )}
                    {fs.status === 'queued' && (
                      <p className="text-amber-400/70 text-xs mt-1">Position {fs.queuePos} of {fs.queueTotal} in queue</p>
                    )}
                    {fs.status === 'error' && (
                      <p className="text-red-400 text-xs mt-1">{fs.error}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Overall progress */}
            {isUploading && hasFiles && (
              <div>
                <div className="flex justify-between text-xs text-gray-500 mb-1">
                  <span>Overall progress</span>
                  <span>{totalProgress}%</span>
                </div>
                <div className="w-full bg-gray-800 rounded-full h-2">
                  <div className="h-2 rounded-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-300"
                    style={{ width: `${totalProgress}%` }} />
                </div>
              </div>
            )}

            {/* Active file speed/eta */}
            {activeFile && activeFile.status === 'uploading' && (
              <div className="bg-gray-800/50 rounded-xl p-3 text-xs text-gray-400 grid grid-cols-3 gap-2">
                <div><p className="text-gray-500">Speed</p><p className="text-white">{formatBytes(activeFile.speed)}/s</p></div>
                <div><p className="text-gray-500">ETA</p><p className="text-white">{formatTime(activeFile.eta)}</p></div>
                <div><p className="text-gray-500">Elapsed</p><p className="text-white">{formatTime(activeFile.elapsed)}</p></div>
              </div>
            )}

            {/* Visibility */}
            <div>
              <label className="text-xs text-gray-400 font-medium block mb-1">Visibility</label>
              <select value={visibility} onChange={(e) => setVisibility(e.target.value)} disabled={isUploading}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-600">
                <option value="public">Public</option>
                <option value="private">Private</option>
                <option value="directory">Directory</option>
              </select>
            </div>

            {(visibility === 'private' || visibility === 'group') && (
  <div>
    <label className="text-xs text-gray-400 font-medium block mb-1">Target Users</label>

    {/* Selected chips */}
    <div className="flex flex-wrap gap-2 mb-2">
      {selectedUsers.map(u => (
        <span key={u} className="bg-blue-500/20 text-blue-300 px-2 py-1 rounded text-xs flex items-center gap-1">
          {u}
          <button
            onClick={() => setSelectedUsers(selectedUsers.filter(x => x !== u))}
            className="text-red-400 hover:text-red-300"
          >×</button>
        </span>
      ))}
    </div>

    {/* Search */}
    <div className="relative">
      <input
        type="text"
        value={targetUsersInputval}
        onChange={handleSearchChange}
        disabled={isUploading}
        placeholder="Type to search users..."
        className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-600"
      />
      {suggestions.length > 0 && (
        <ul className="absolute z-10 w-full bg-gray-900 border border-gray-800 mt-1 rounded-lg shadow-xl max-h-40 overflow-y-auto">
          {suggestions.map(u => (
            <li
              key={u}
              onClick={() => {
                setSelectedUsers([...selectedUsers, u]);
                setTargetUsersInputval('');
                setSuggestions([]);
              }}
              className="px-4 py-2 hover:bg-gray-800 cursor-pointer text-sm text-white"
            >
              {u}
            </li>
          ))}
        </ul>
      )}
    </div>
  </div>
)}

            {/* Description */}
            <div>
              <label className="text-xs text-gray-400 font-medium block mb-1">Description (optional)</label>
              <textarea value={fileDescription} onChange={(e) => setFileDescription(e.target.value)}
                rows={2} disabled={isUploading} placeholder="Add a note about these files..."
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-3 py-2 text-sm resize-none focus:outline-none focus:border-blue-600" />
            </div>

            {/* Folder selector */}
            <div className="relative">
              <label className="text-xs text-gray-400 font-medium block mb-1">Destination Folder</label>
              <input type="text" value={selectedFolder}
                onFocus={() => setShowFolderDropdown(true)}
                onBlur={() => setTimeout(() => setShowFolderDropdown(false), 200)}
                // onChange={(e) => {
                //   setSelectedFolder(e.target.value);
                //   const q = e.target.value.toLowerCase();
                //   const foundFolder = folders.find((f) =>{
                //     return f.full_path.trim().toLowerCase() === q.trim()
                //   });
                //   setFolderId(foundFolder?.folder_id);
                //   setfilteredFolders(folders.filter(f => f.full_path.toLowerCase().includes(q)));
                //   setShowFolderDropdown(true);
                // }}
                onChange={(e) => {
  const val = e.target.value;
  setSelectedFolder(val);
  setShowFolderDropdown(true);
  const typed = val.toLowerCase().trim();

  const filtered = folders.filter(f => {
  const fullPath   = f.full_path?.toLowerCase() || '';
  const parentPath = f.parent_path?.toLowerCase() || '/';

  if (!typed || typed === '/') {
    // Show only root-level folders
    return parentPath === '/';
  }

  // If typed is incomplete (doesn't end with "/"):
  // show folders whose full_path starts with typed but no extra "/" after
  // e.g. "/s" → /SPMU/ yes, /SPMU/Folder1/ no
  if (!typed.endsWith('/')) {
    return fullPath.startsWith(typed) && 
           fullPath.slice(typed.length).indexOf('/') === fullPath.slice(typed.length).lastIndexOf('/');
           // only one "/" allowed after typed portion = direct level only
  }

  // If typed ends with "/" (complete path like "/spmu/"):
  // show direct children only (parent_path === typed)
  return parentPath === typed && fullPath !== typed;
});

  setfilteredFolders(filtered);
}}
                disabled={isUploading}
                className="w-full bg-gray-800 border border-gray-700 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-blue-600" />
              {showFolderDropdown && filteredFolders.length > 0 && (
                <div className="absolute z-10 w-full bg-gray-800 border border-gray-700 rounded-xl mt-1 max-h-40 overflow-y-auto shadow-xl">
                  {filteredFolders.map((f, i) => (
                    <div key={i}
                      onMouseDown={() => { setSelectedFolder(f.full_path); setShowFolderDropdown(false); }}
                      className="px-3 py-2 text-sm text-gray-300 hover:bg-gray-700 cursor-pointer truncate">
                      {f.full_path}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-1">
              <button onClick={handleClose}
                className="flex-1 py-2.5 text-sm font-semibold bg-gray-950 border border-gray-800 rounded-xl hover:bg-gray-800 text-gray-400 cursor-pointer">
                {isUploading ? 'Cancel' : 'Close'}
              </button>
              <button
                disabled={!hasFiles || isUploading || isChecking}
                onClick={() => handleUploadAll(null)}
                className="flex-1 py-2.5 text-sm font-semibold bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-600 text-white rounded-xl shadow transition-all cursor-pointer">
                {isChecking
                  ? `Checking ${fileStates.length} files…`
                  : isUploading
                    ? anyQueued
                      ? `Queued (${fileStates.filter(f => f.status === 'queued').length} waiting)`
                      : `Uploading ${fileStates.filter(f => f.status === 'uploading').length}/${fileStates.length}…`
                    : allDone
                      ? '✓ All Done'
                      : `Upload ${fileStates.length > 1 ? `${fileStates.length} Files` : 'File'}`
                }
              </button>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}