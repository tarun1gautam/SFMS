/**
 * UploadModal.jsx  (SFMS — Multi-file Collision Detection Edition)
 *
 * Collision detection now works for ALL files, not just single uploads:
 *  1. Before uploading, ALL files are checked for filename collisions in parallel
 *  2. If any collide → show a conflict panel listing every conflicting file
 *     (Rename / Overwrite / Skip)
 *  3. Once filename conflicts are resolved, the remaining files (the ones
 *     that are actually going to be uploaded) are hash-checked against the
 *     whole server for duplicate CONTENT
 *  4. If any duplicate content is found → show a hash panel, user picks
 *     Skip / Upload Anyway per file (their call entirely)
 *  5. "Apply to all" buttons resolve all conflicts / duplicates at once
 */

import React, { useEffect, useState, useRef } from 'react';
import api from '../../utils/api';
import { validateFreeText, validateUsername } from '../../utils/inputGuard';
import { toast } from 'react-hot-toast';
import { io as socketIO } from 'socket.io-client';
import { sha256 } from 'js-sha256';

// ─── Cross-mount "keep uploading in background" tracking ──────────────────
// This map lives OUTSIDE the component so it survives the modal being
// hidden (isOpen=false) and shown again — the component itself is expected
// to stay mounted, not unmount, between opens (that's what makes it safe to
// NOT reset state on close; see requestClose/confirmKeepInBackground below).
// Keyed by folder + filename + size, so a fresh file pick that matches an
// upload already running in the background gets caught before it ever
// reaches the server — this is the client-side half of the duplicate-upload
// fix (the server has its own matching guard as a second line of defense).
const activeUploadRegistry = new Map(); // dedupeKey -> { uploadId, fileName, startedAt }

function dedupeKeyFor(folderKey, fileName, size) {
  return `${folderKey || ''}::${String(fileName || '').toLowerCase()}::${size || 0}`;
}

function makeUploadId() {
  return (typeof window !== 'undefined' && window.crypto?.randomUUID?.())
    || `up_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

// axios.isCancel needs the axios module; we only ever import it dynamically
// inside uploadOneFile, so stash a reference here the first time that
// happens and fall back to duck-typing (axios sets `err.message ===
// 'cancelled'`/a `__CANCEL__` flag depending on version) if it isn't loaded
// yet for some reason.
let _axiosRef = null;
function axios_isCancel(err) {
  if (_axiosRef?.isCancel) return _axiosRef.isCancel(err);
  return !!(err && (err.__CANCEL__ || err.message === 'cancelled' || err.message === 'user-cancelled'));
}

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

// SHA-256 hash of a File, computed client-side via Web Crypto.
async function calculateFileHash(file) {
  const buffer = await file.arrayBuffer();
  return sha256(buffer); // sync, no crypto.subtle needed
}

const makeFileState = (file) => ({
  file,
  uploadId:   makeUploadId(),
  progress:   0,
  speed:      0,
  eta:        0,
  elapsed:    0,
  // pending | queued | uploading | processing | done | error | skipped
  // 'processing' = network transfer is done (100%) but the server is still
  // hashing / OCR'ing / thumbnailing / saving — this is the state that used
  // to be invisible and looked like the modal was "stuck" at 100%.
  status:     'pending',
  stage:        null,   // received | extracting_text | hashing | thumbnail | saving | completed | duplicate | cancelled | error
  stageMessage: null,
  queuePos:   null,
  queueTotal: null,
  error:      null,
  dbRow:      null,
  cancelRef:  { cancel: null },
});

export default function UploadModal({ isOpen, onClose, user, expoFolder, currentFolderId, onUploadSuccess, initialFiles }) {
  // ── File list ─────────────────────────────────────────────────────────────
  const [fileStates,  setFileStates]  = useState([]);
  const [activeIndex, setActiveIndex] = useState(0);

  // ── Shared upload options ─────────────────────────────────────────────────
  const [visibility,         setVisibility]         = useState('public');
  const [targetUsersInput,   setTargetUsersInput]   = useState('');
  const [fileDescription,    setFileDescription]    = useState('');
  const [selectedFolder,     setSelectedFolder]     = useState(user.base_path);
  const [folderid,           setFolderId]           = useState(user.base_path);
  const [folderpath,           setFolderPath]           = useState(user.base_path);
  const [folders,            setFolders]            = useState([]);
  const [filteredFolders,    setfilteredFolders]    = useState([]);
  const [showFolderDropdown, setShowFolderDropdown] = useState(false);
  const [selectedUsers,      setSelectedUsers]      = useState([]);
  const [targetUsersInputval,setTargetUsersInputval]= useState('');
  const [suggestions,        setSuggestions]        = useState([]);

  // Destination Folder is locked (read-only) by default — it's driven by
  // visibility/expoFolder via the effects below, so most uploads should
  // never need to touch it. The pencil button unlocks it for the cases
  // where someone genuinely wants to redirect the upload elsewhere.
  const [isDestEditable, setIsDestEditable] = useState(false);
  const destInputRef = useRef(null);

  // ── Multi-file filename conflict state ────────────────────────────────────
  // conflicts: [{ idx, fileName, uploadedBy, uploadedAt, existingSize, foundInFolder }]
  const [conflicts,         setConflicts]         = useState([]);
  // resolutions: { [idx]: 'rename' | 'replace' | 'skip' }
  const [resolutions,       setResolutions]       = useState({});
  const [showConflictPanel, setShowConflictPanel] = useState(false);

  // ── Hash (whole-server content) duplicate state ───────────────────────────
  // hashDuplicates: [{ idx, hash, fileName, uploadedBy, uploadedAt, foundInFolder }]
  const [hashDuplicates,  setHashDuplicates]  = useState([]);
  const [showHashPanel,   setShowHashPanel]   = useState(false);
  // hashResolutions: { [idx]: 'skip' | 'upload' }
  const [hashResolutions, setHashResolutions] = useState({});
  // the upload plan (idx + filename-conflict strategy) awaiting hash resolution
  const [pendingPlan,     setPendingPlan]     = useState([]);

  // ── Global upload state ───────────────────────────────────────────────────
  const [isUploading,  setIsUploading]  = useState(false);
  const [isChecking,   setIsChecking]   = useState(false); // collision check in progress
  // Shown when the person tries to close while something is still
  // uploading/processing, so closing the X can't silently orphan a
  // still-running backend job (see requestClose below).
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

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

    // Real backend processing-stage updates (hashing / OCR / thumbnail /
    // saving), matched by uploadId so it always lands on the right row even
    // if two files share a name. This is what replaces the "green bar but
    // nothing happens" gap between 100% network transfer and the file
    // actually being ready.
    sock.on('upload_stage', ({ uploadId, fileName, stage, message, file, error }) => {
      setFileStates(prev => prev.map(fs => {
        if (fs.uploadId !== uploadId) return fs;
        if (stage === 'completed') {
          return { ...fs, status: 'done', progress: 100, stage, stageMessage: message, dbRow: file || fs.dbRow };
        }
        if (stage === 'duplicate') {
          return { ...fs, status: 'error', stage, stageMessage: message, error: message };
        }
        if (stage === 'cancelled') {
          return { ...fs, status: 'error', stage, stageMessage: message, error: 'Cancelled' };
        }
        if (stage === 'error') {
          return { ...fs, status: 'error', stage, stageMessage: message, error: error || message };
        }
        // received | extracting_text | hashing | thumbnail | saving
        return { ...fs, status: 'processing', progress: 100, stage, stageMessage: message };
      }));
    });

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

  useEffect(() => {
    if (isOpen && initialFiles && initialFiles.length > 0) {
      // Route through addFiles so files handed in via the `initialFiles`
      // prop get the same in-flight dedupe check as picker/drop selections.
      addFiles(initialFiles);
    }
  }, [isOpen, initialFiles]);

  useEffect(()=>{
      const foundFolder = folders.find(f =>
      f.full_path.trim().toLowerCase() === selectedFolder.trim().toLowerCase()
  );
  setFolderId(foundFolder?.folder_id);
  setFolderPath(foundFolder?.full_path);
  },[selectedFolder,folders])

  // Warn before an accidental tab close/refresh while something is still
  // uploading or being processed — losing the tab means losing the ability
  // to see it finish (and, for a still-queued network request, may abort it
  // outright), so a native confirm is worth the interruption here.
  useEffect(() => {
    const anyInFlight = fileStates.some(fs => fs.status === 'uploading' || fs.status === 'processing');
    if (!anyInFlight) return;
    const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [fileStates]);

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
    setHashDuplicates([]);
    setHashResolutions({});
    setShowHashPanel(false);
    setPendingPlan([]);
    setFileDescription('');
    setIsDestEditable(false);
    setShowCloseConfirm(false);
    Object.values(timerRef.current).forEach(clearInterval);
    timerRef.current = {};
  };

  const inFlightFiles = fileStates.filter(fs => fs.status === 'uploading' || fs.status === 'processing');

  // Actually stop a single upload: aborts the HTTP request AND tells the
  // backend to bail out at its next checkpoint (axios cancel alone doesn't
  // stop server-side OCR/hashing — see fileController.js's /cancel-upload).
  const cancelSingleUpload = (idx) => {
    const fs_item = fileStates[idx];
    if (!fs_item) return;
    if (fs_item.cancelRef.cancel) fs_item.cancelRef.cancel('user-cancelled');
    api.post('/files/cancel-upload', { upload_id: fs_item.uploadId }).catch(() => {});
    activeUploadRegistry.delete(dedupeKeyFor(selectedFolder, fs_item.file.name, fs_item.file.size));
    stopTimer(idx);
    setFileStates(prev => prev.map((fs, i) =>
      i === idx ? { ...fs, status: 'error', error: 'Cancelled', stage: 'cancelled' } : fs
    ));
  };

  // The X button / "Close" footer button both call this. If nothing is
  // actually in flight it closes immediately like before. If something IS
  // in flight, it asks first instead of silently cancelling — that silent
  // cancel-on-close (axios abort only, server job kept running) is exactly
  // what used to let a re-upload of the same file land twice.
  const requestClose = () => {
    if (inFlightFiles.length === 0) {
      resetState();
      onClose();
      return;
    }
    setShowCloseConfirm(true);
  };

  // "Keep uploading in background" — hide the modal but change nothing
  // else. Uploads keep running (this component stays mounted even while
  // isOpen is false), and reopening the modal will show their live status
  // exactly where it left off instead of resetting.
  const confirmKeepInBackground = () => {
    setShowCloseConfirm(false);
    onClose();
  };

  // "Cancel uploads & close" — actually stop every in-flight file (client
  // AND server side) before resetting, so nothing keeps running unseen.
  const confirmCancelAndClose = () => {
    fileStates.forEach((fs, idx) => {
      if (fs.status === 'uploading' || fs.status === 'processing') {
        cancelSingleUpload(idx);
      }
    });
    resetState();
    onClose();
  };

  // ── Toggle destination folder field lock ────────────────────
  const toggleDestEditable = () => {
    if (isUploading) return; // never allow redirecting mid-upload
    setIsDestEditable((prev) => {
      const next = !prev;
      if (next) {
        setTimeout(() => {
          destInputRef.current?.focus();
          setShowFolderDropdown(true);
          handleFolderFiltering(selectedFolder || '');
        }, 0);
      } else {
        setShowFolderDropdown(false);
      }
      return next;
    });
  };

  // Shared by the file picker and the drop zone. Filters out anything that's
  // already uploading (this tab's registry, or a currently in-flight row) so
  // re-picking the same file mid-OCR can't fire a second request — this is
  // the client-side half of the duplicate-upload fix.
  const addFiles = (incomingFiles) => {
    if (!incomingFiles.length) return;

    const rejected = [];
    const accepted = [];
    incomingFiles.forEach(file => {
      const key = dedupeKeyFor(selectedFolder, file.name, file.size);
      if (activeUploadRegistry.has(key)) {
        rejected.push(file.name);
      } else {
        accepted.push(file);
      }
    });

    if (rejected.length) {
      toast.error(
        rejected.length === 1
          ? `"${rejected[0]}" is already uploading — skipping duplicate.`
          : `${rejected.length} file(s) are already uploading — skipping duplicates.`
      );
    }
    if (!accepted.length) return;

    setFileStates(accepted.map(makeFileState));
    setActiveIndex(0);
    setConflicts([]);
    setResolutions({});
    setShowConflictPanel(false);
    setHashDuplicates([]);
    setHashResolutions({});
    setShowHashPanel(false);
    setPendingPlan([]);
  };

  const handleFileChange = (e) => {
    if (!e.target.files.length) return;
    addFiles(Array.from(e.target.files));
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

  // ─── Hash-based whole-server duplicate check ──────────────────────────────
  // Only checks the files that are actually still slated to upload
  // (i.e. the indices in the current plan), not ones already skipped
  // for filename-conflict reasons.
  const checkHashDuplicates = async (indices) => {
    const targets = indices.map(idx => ({ idx, file: fileStates[idx].file }));
    if (!targets.length) return [];

    const hashed = await Promise.all(
      targets.map(async t => ({
        idx: t.idx,
        file: t.file,
        hash: await calculateFileHash(t.file),
      }))
    );

    const { data } = await api.post('/files/check-hashes-batch', {
      hashes: hashed.map(x => x.hash),
    });

    const duplicates = [];
    data.results.forEach((result, i) => {
      if (result.exists) {
        const { idx, file } = hashed[i];
        duplicates.push({
          idx,
          hash: result.hash,
          fileName: file.name,
          uploadedBy: result.details.uploadedBy,
          uploadedAt: result.details.uploadedAt,
          foundInFolder: decodeURIComponent(result.details.foundInFolder || ''),
        });
      }
    });

    return duplicates;
  };

  // ─── Upload a single file ──────────────────────────────────────────────────
  const uploadOneFile = async (idx, resolutionStrategy = null) => {
    const fs_item   = fileStates[idx];
    const file      = fs_item.file;
    const uploadId  = fs_item.uploadId;
    const dedupeKey = dedupeKeyFor(selectedFolder, file.name, file.size);

    const formData = new FormData();
    formData.append('file',         file);
    formData.append('upload_id',    uploadId);
    formData.append('visibility',   visibility);
    formData.append('description',  fileDescription);
    formData.append('virtual_path', folderid);
    formData.append('folder_path',folderpath);
    formData.append('shared_label', JSON.stringify(buildSharedLabel()));
    formData.append('target_users', JSON.stringify(selectedUsers));
    if (folderid)           formData.append('folder_id', folderid);
    if (resolutionStrategy) formData.append('conflict_resolution', resolutionStrategy);

    setFileStates(prev => prev.map((fs, i) =>
      i === idx ? { ...fs, progress: 0, elapsed: 0, status: 'uploading', error: null, stage: null, stageMessage: null } : fs
    ));
    startTimer(idx);

    // Claim this (folder, filename, size) so a fresh file pick elsewhere in
    // this tab can be recognized as "already uploading" instead of firing a
    // second request. Released in `finally` below no matter how this ends.
    activeUploadRegistry.set(dedupeKey, { uploadId, fileName: file.name, startedAt: Date.now() });

    const startTs   = Date.now();
    const cancelRef = fileStates[idx].cancelRef;

    try {
      const { default: axios } = await import('axios');
      _axiosRef = axios;
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
          setFileStates(prev => prev.map((fs, i) => {
            if (i !== idx) return fs;
            // Network transfer complete but the server still has to hash /
            // OCR / thumbnail / save the file — show that explicitly as
            // "processing" instead of leaving the bar sitting at a green
            // 100% with nothing else happening. The upload_stage socket
            // listener will fill in the real stage/message moments later;
            // this is just the instant, no-socket-required fallback.
            if (pct >= 100) {
              return { ...fs, progress: 100, speed, eta: 0, status: 'processing', stage: fs.stage || 'received', stageMessage: fs.stageMessage || 'Upload received — starting processing…' };
            }
            return { ...fs, progress: pct, speed, eta: remaining, status: 'uploading' };
          }));
        },
      });

      stopTimer(idx);
      setFileStates(prev => prev.map((fs, i) =>
        i === idx ? { ...fs, status: 'done', progress: 100, stage: 'completed', stageMessage: 'Upload complete', dbRow: response.data.file } : fs
      ));
      return response.data.file;
    } catch (err) {
      stopTimer(idx);
      const cancelled = axios_isCancel(err);
      const duplicateInFlight = err?.response?.data?.duplicateInFlight;
      const errorMsg = cancelled
        ? 'Cancelled'
        : duplicateInFlight
          ? 'Already uploading elsewhere — skipped duplicate.'
          : (err?.response?.data?.error || err.message || 'Upload failed');
      setFileStates(prev => prev.map((fs, i) =>
        i === idx ? { ...fs, status: 'error', error: errorMsg, stage: cancelled ? 'cancelled' : (duplicateInFlight ? 'duplicate' : 'error') } : fs
      ));
      throw err;
    } finally {
      activeUploadRegistry.delete(dedupeKey);
    }
  };

  // ─── STEP 1: Check ALL files for filename collisions in parallel ──────────
  const checkAllCollisions = async () => {
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
              foundInFolder: decodeURIComponent(data.fileDetails?.foundInFolder || '/'),
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

    const descCheck = validateFreeText(fileDescription, { label: 'Description' });
    if (!descCheck.valid) { toast.error(descCheck.message); return; }

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

    // Normal flow: check filename collisions first
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

    // No filename conflicts — every file is still slated to upload as-is.
    const plan = fileStates.map((_, idx) => ({ idx, strategy: null }));

    // STEP: now check that same plan for whole-server hash duplicates
    const duplicates = await checkHashDuplicates(plan.map(p => p.idx));

    if (duplicates.length) {
      setHashDuplicates(duplicates);
      setPendingPlan(plan);
      const defaults = {};
      duplicates.forEach(d => { defaults[d.idx] = 'upload'; });
      setHashResolutions(defaults);
      setShowHashPanel(true);
      setIsUploading(false);
      return;
    }

    await runUploads(plan);
  };

  // ─── STEP 3: User confirmed filename-conflict resolutions, proceed ────────
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

    // Only hash-check the files that are actually still going to upload
    const duplicates = await checkHashDuplicates(plan.map(p => p.idx));

    if (duplicates.length) {
      setHashDuplicates(duplicates);
      setPendingPlan(plan);
      const defaults = {};
      duplicates.forEach(d => { defaults[d.idx] = 'upload'; });
      setHashResolutions(defaults);
      setShowHashPanel(true);
      setIsUploading(false);
      return;
    }

    await runUploads(plan);
  };

  // ─── STEP 4: User confirmed hash-duplicate resolutions, proceed ───────────
  const proceedWithHashResolutions = async () => {
    setShowHashPanel(false);
    setIsUploading(true);

    const finalPlan = pendingPlan.filter(p => {
      const dup = hashDuplicates.find(d => d.idx === p.idx);
      if (!dup) return true; // not a duplicate, keep as-is
      return hashResolutions[p.idx] !== 'skip';
    });

    const skippedIndices = pendingPlan
      .filter(p => {
        const dup = hashDuplicates.find(d => d.idx === p.idx);
        return dup && hashResolutions[p.idx] === 'skip';
      })
      .map(p => p.idx);

    if (skippedIndices.length > 0) {
      setFileStates(prev => prev.map((fs, i) =>
        skippedIndices.includes(i) ? { ...fs, status: 'skipped' } : fs
      ));
    }

    await runUploads(finalPlan);
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


const handleFolderFiltering = (inputValue) => {
  const typed = inputValue.toLowerCase().trim();
  // if (!typed || typed === '/') {
  //   setfilteredFolders(folders.filter(f => f.parent_path === '/'));
  //   return;
  // }
if (!typed || typed === '/') {
  setfilteredFolders(
    folders.filter(f => f.parent_path === '/' && f.full_path !== '/')
  );
  return;
}
  const filtered = folders.filter(f => {
    const fullPath   = f.full_path?.toLowerCase() || '';
    const parentPath = f.parent_path?.toLowerCase() || '/';

    if (!typed.endsWith('/')) {
      return fullPath.startsWith(typed) && 
             fullPath.slice(typed.length).indexOf('/') === fullPath.slice(typed.length).lastIndexOf('/');
    }
    return parentPath === typed && fullPath !== typed;
  });

  setfilteredFolders(filtered);
};

  // ─── Computed state ────────────────────────────────────────────────────────
  const hasFiles      = fileStates.length > 0;
  const allDone       = hasFiles && fileStates.every(fs => fs.status === 'done' || fs.status === 'skipped');
  const anyQueued     = fileStates.some(fs => fs.status === 'queued');
  const uploadableFiles = fileStates.filter(fs => fs.status !== 'skipped');
const totalProgress = uploadableFiles.length
  ? Math.round(uploadableFiles.reduce((sum, fs) => sum + fs.progress, 0) / uploadableFiles.length)
  : 0;
  const activeFile = fileStates[activeIndex];

  const statusBadge = (fs) => {
    if (fs.status === 'done')       return <span className="text-emerald-400 text-xs font-bold">✓ Done</span>;
    if (fs.status === 'skipped')    return <span className="text-gray-500 dark:text-gray-500 text-xs font-bold">⊘ Skipped</span>;
    if (fs.status === 'error')      return <span className="text-red-400 text-xs font-bold">✗ {fs.error || 'Failed'}</span>;
    // Network transfer is done but the server is still hashing / OCR'ing /
    // saving — deliberately NOT green yet, and NOT just "100%" with nothing
    // else, since that's exactly the "stuck" feeling being fixed here.
    if (fs.status === 'processing') return <span className="text-indigo-400 text-xs font-bold animate-pulse">⚙ {fs.stageMessage || 'Processing…'}</span>;
    if (fs.status === 'uploading')  return <span className="text-blue-400 text-xs font-bold animate-pulse">↑ {fs.progress}%</span>;
    if (fs.status === 'queued')     return <span className="text-amber-400 text-xs font-bold">⧗ #{fs.queuePos}</span>;
    return <span className="text-gray-500 dark:text-gray-500 text-xs">Pending</span>;
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6 space-y-5 shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-gray-900 dark:text-white font-bold text-lg">
            {showCloseConfirm ? 'Uploads still in progress' : showConflictPanel ? '⚠ Duplicate Files Found' : showHashPanel ? '🔍 Duplicate Content Found' : 'Upload Files'}
          </h2>
          <div className="flex items-center gap-3">
            <div className="text-xs text-gray-500 dark:text-gray-500 bg-gray-200 dark:bg-gray-800 rounded-lg px-2 py-1">
              <span className="text-blue-400">{queueStats.active}</span> active ·{' '}
              <span className="text-amber-400">{queueStats.waiting}</span> waiting
            </div>
            <button onClick={requestClose} className="text-faint dark:text-gray-500 hover:text-ink dark:hover:text-white transition-colors text-xl leading-none">×</button>
          </div>
        </div>

        {/* ══════════════════════════════════════════════════════════════════
            CLOSE CONFIRMATION — shown when the X/Close is clicked while
            files are still uploading or being processed server-side.
        ══════════════════════════════════════════════════════════════════ */}
        {showCloseConfirm ? (
          <div className="space-y-4">
            <div className="bg-amber-100/60 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800/60 rounded-xl p-4 space-y-2">
              <p className="text-sm text-amber-800 dark:text-amber-300">
                <span className="font-semibold">{inFlightFiles.length} file{inFlightFiles.length > 1 ? 's are' : ' is'}</span> still uploading or being processed.
              </p>
              <p className="text-xs text-amber-700/80 dark:text-amber-400/80">
                Closing won't stop {inFlightFiles.length > 1 ? 'them' : 'it'} — {inFlightFiles.length > 1 ? 'they' : 'it'} will keep going in the background and finish on their own.
                Reopen this dialog any time to see progress, or cancel {inFlightFiles.length > 1 ? 'them' : 'it'} now instead.
              </p>
            </div>

            <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
              {inFlightFiles.map((fs) => (
                <div key={fs.uploadId} className="flex items-center justify-between text-xs bg-gray-200/50 dark:bg-gray-800/50 rounded-lg px-3 py-2">
                  <span className="text-gray-700 dark:text-gray-300 truncate max-w-[70%]">{fs.file.name}</span>
                  <span className="text-amber-500 font-semibold">{fs.stageMessage || (fs.status === 'uploading' ? `${fs.progress}%` : 'Processing…')}</span>
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <button
                onClick={confirmCancelAndClose}
                className="flex-1 py-2.5 text-sm font-semibold bg-red-950/30 hover:bg-red-900/40 text-red-400 rounded-xl border border-red-900/50"
              >
                Cancel uploads &amp; close
              </button>
              <button
                onClick={confirmKeepInBackground}
                className="flex-1 py-2.5 text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow transition-all"
              >
                Keep uploading in background
              </button>
            </div>
          </div>

        ) : showConflictPanel ? (
          <div className="space-y-4">

            <p className="text-sm text-gray-600 dark:text-gray-400">
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
                className="flex-1 py-1.5 text-xs font-bold bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg border border-gray-300 dark:border-gray-700"
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
                className="flex-1 py-1.5 text-xs font-bold bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-500 rounded-lg border border-gray-300 dark:border-gray-700"
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
                  <div key={conflict.idx} className="bg-gray-200/60 dark:bg-gray-800/60 border border-gray-300 dark:border-gray-700 rounded-xl p-3 space-y-2">
                    {/* File info row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-gray-900 dark:text-white text-xs font-semibold truncate">{conflict.fileName}</p>
                        <p className="text-gray-500 dark:text-gray-500 text-[10px] mt-0.5">
                          Uploaded by <span className="text-gray-600 dark:text-gray-400">{conflict.uploadedBy}</span>
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
                          {' · in '}<span className="text-blue-400 font-mono break-all">{conflict.foundInFolder}</span>
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
      :                           'bg-gray-400 dark:bg-gray-600 text-gray-900 dark:text-white border-gray-500 dark:border-gray-500'
      : 'bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 hover:border-gray-500 dark:hover:border-gray-500';

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
            <div className="bg-gray-200/40 dark:bg-gray-800/40 rounded-xl p-3 text-xs text-gray-600 dark:text-gray-400 space-y-1">
              {['rename', 'replace', 'skip'].map(action => {
                const count = conflicts.filter(c => (resolutions[c.idx] || 'rename') === action).length;
                if (count === 0) return null;
                const labels = { rename: '🔤 Renamed', replace: '♻ Replaced', skip: '⊘ Skipped' };
                return <p key={action}>{labels[action]}: <span className="text-gray-900 dark:text-white font-semibold">{count} file{count > 1 ? 's' : ''}</span></p>;
              })}
              {fileStates.length - conflicts.length > 0 && (
                <p>✓ No conflict: <span className="text-emerald-400 font-semibold">{fileStates.length - conflicts.length} file{fileStates.length - conflicts.length > 1 ? 's' : ''}</span> upload normally</p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowConflictPanel(false)}
                className="flex-1 py-2.5 text-sm font-semibold bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
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

        ) : showHashPanel ? (
        /* ══════════════════════════════════════════════════════════════════
            HASH PANEL — same file content already exists somewhere on the
            server (different name/folder). Purely the user's call: skip
            uploading this copy, or upload it anyway. Same layout as the
            conflict panel, just violet-shaded so it reads as a different
            kind of check at a glance.
        ══════════════════════════════════════════════════════════════════ */
          <div className="space-y-4">

            <p className="text-sm text-gray-600 dark:text-gray-400">
              <span className="text-violet-400 font-semibold">{hashDuplicates.length} file{hashDuplicates.length > 1 ? 's' : ''}</span>
              {' '}match content already on the server (elsewhere in your scope). This is just a heads-up — upload anyway if you want a separate copy.
            </p>

            {/* Apply-to-all shortcuts */}
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const all = {};
                  hashDuplicates.forEach(d => { all[d.idx] = 'upload'; });
                  setHashResolutions(all);
                }}
                className="flex-1 py-1.5 text-xs font-bold bg-violet-600 hover:bg-violet-500 text-white rounded-lg border border-violet-500"
              >
                Upload All Anyway
              </button>
              <button
                onClick={() => {
                  const all = {};
                  hashDuplicates.forEach(d => { all[d.idx] = 'skip'; });
                  setHashResolutions(all);
                }}
                className="flex-1 py-1.5 text-xs font-bold bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-500 rounded-lg border border-gray-300 dark:border-gray-700"
              >
                Skip All
              </button>
            </div>

            {/* Per-file duplicate rows */}
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {hashDuplicates.map((dup) => {
                const res = hashResolutions[dup.idx] || 'upload';
                return (
                  <div key={dup.idx} className="bg-gray-200/60 dark:bg-gray-800/60 border border-gray-300 dark:border-gray-700 rounded-xl p-3 space-y-2">
                    <div className="min-w-0">
                      <p className="text-gray-900 dark:text-white text-xs font-semibold truncate">{dup.fileName}</p>
                      <p className="text-gray-500 dark:text-gray-500 text-[10px] mt-0.5">
                        Same content already uploaded by <span className="text-gray-600 dark:text-gray-400">{dup.uploadedBy}</span>
                        {dup.uploadedAt && (
                          <> · {new Date(dup.uploadedAt).toLocaleDateString()}</>
                        )}
                        {' · found in '}<span className="text-violet-400 font-mono break-all">{dup.foundInFolder}</span>
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      {[
                        { value: 'upload', label: 'Upload Anyway' },
                        { value: 'skip',   label: 'Skip' },
                      ].map(opt => {
                        const isActive = res === opt.value;
                        const color = isActive
                          ? opt.value === 'upload'
                            ? 'bg-violet-600 text-white border-violet-500'
                            : 'bg-gray-400 dark:bg-gray-600 text-gray-900 dark:text-white border-gray-500 dark:border-gray-500'
                          : 'bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400 border-gray-300 dark:border-gray-700 hover:border-gray-500 dark:hover:border-gray-500';

                        return (
                          <button
                            key={opt.value}
                            onClick={() => setHashResolutions(prev => ({ ...prev, [dup.idx]: opt.value }))}
                            className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg border transition-colors ${color}`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary + Proceed */}
            <div className="bg-gray-200/40 dark:bg-gray-800/40 rounded-xl p-3 text-xs text-gray-600 dark:text-gray-400 space-y-1">
              {['upload', 'skip'].map(action => {
                const count = hashDuplicates.filter(d => (hashResolutions[d.idx] || 'upload') === action).length;
                if (count === 0) return null;
                const labels = { upload: '↑ Uploaded anyway', skip: '⊘ Skipped' };
                return <p key={action}>{labels[action]}: <span className="text-gray-900 dark:text-white font-semibold">{count} file{count > 1 ? 's' : ''}</span></p>;
              })}
              {pendingPlan.length - hashDuplicates.length > 0 && (
                <p>✓ No duplicate content: <span className="text-emerald-400 font-semibold">{pendingPlan.length - hashDuplicates.length} file{pendingPlan.length - hashDuplicates.length > 1 ? 's' : ''}</span> upload normally</p>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowHashPanel(false)}
                className="flex-1 py-2.5 text-sm font-semibold bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
              >
                Back
              </button>
              <button
                onClick={proceedWithHashResolutions}
                className="flex-1 py-2.5 text-sm font-semibold bg-violet-600 hover:bg-violet-500 text-white rounded-xl shadow transition-all"
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
            <label
  onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); }}
  onDragEnter={(e) => { e.preventDefault(); e.stopPropagation(); }}
  onDrop={(e) => {
    e.preventDefault();
    e.stopPropagation();
    if (isUploading) return;
    const droppedFiles = Array.from(e.dataTransfer.files);
    addFiles(droppedFiles);
  }}
  className="block"
>
  <div className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-colors
    ${hasFiles ? 'border-blue-700 bg-blue-950/20' : 'border-gray-300 dark:border-gray-700 hover:border-gray-500 dark:hover:border-gray-500'}`}>
    <input type="file" multiple className="hidden" onChange={handleFileChange} disabled={isUploading} />
    {!hasFiles ? (
      <>
        <p className="text-gray-600 dark:text-gray-400 text-sm">Click or drag & drop files here</p>
        <p className="text-gray-400 dark:text-gray-600 text-xs mt-1">Multiple files supported · Max 500 MB each</p>
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
                      ${activeIndex === idx ? 'border-blue-700 bg-blue-950/20' : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'}`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-gray-900 dark:text-white text-xs font-medium truncate max-w-[50%]">{fs.file.name}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 dark:text-gray-500 text-xs">{formatBytes(fs.file.size)}</span>
                        {statusBadge(fs)}
                        {(fs.status === 'uploading' || fs.status === 'processing') && (
                          <button
                            onClick={(e) => { e.stopPropagation(); cancelSingleUpload(idx); }}
                            title="Cancel this upload"
                            className="text-gray-400 hover:text-red-400 text-xs leading-none px-1"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                    {(fs.status === 'uploading' || fs.status === 'processing' || fs.status === 'done') && (
                      <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-1.5">
                        <div
                          className={`h-1.5 rounded-full transition-all duration-300 ${
                            fs.status === 'done'       ? 'bg-emerald-500' :
                            fs.status === 'processing' ? 'bg-indigo-500 animate-pulse' :
                                                          'bg-blue-500'
                          }`}
                          style={{ width: `${fs.progress}%` }}
                        />
                      </div>
                    )}
                    {fs.status === 'processing' && (
                      <p className="text-indigo-400/80 text-xs mt-1 truncate">{fs.stageMessage || 'Processing on the server…'}</p>
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
            {(isUploading || inFlightFiles.length > 0) && hasFiles && (
              <div>
                <div className="flex justify-between text-xs text-gray-500 dark:text-gray-500 mb-1">
                  <span>Overall progress</span>
                  <span>{totalProgress}%</span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-2">
                  <div className="h-2 rounded-full bg-gradient-to-r from-blue-600 to-blue-400 transition-all duration-300"
                    style={{ width: `${totalProgress}%` }} />
                </div>
              </div>
            )}

            {/* Active file speed/eta — network transfer only */}
            {activeFile && activeFile.status === 'uploading' && (
              <div className="bg-gray-200/50 dark:bg-gray-800/50 rounded-xl p-3 text-xs text-gray-600 dark:text-gray-400 grid grid-cols-3 gap-2">
                <div><p className="text-gray-500 dark:text-gray-500">Speed</p><p className="text-gray-900 dark:text-white">{formatBytes(activeFile.speed)}/s</p></div>
                <div><p className="text-gray-500 dark:text-gray-500">ETA</p><p className="text-gray-900 dark:text-white">{formatTime(activeFile.eta)}</p></div>
                <div><p className="text-gray-500 dark:text-gray-500">Elapsed</p><p className="text-gray-900 dark:text-white">{formatTime(activeFile.elapsed)}</p></div>
              </div>
            )}

            {/* Active file processing status — this is the part that used to
                be invisible: the upload itself is done (100%, but not green
                yet) and the server is still working on it. */}
            {activeFile && activeFile.status === 'processing' && (
              <div className="bg-indigo-950/20 border border-indigo-900/40 rounded-xl p-3 text-xs text-gray-600 dark:text-gray-400">
                <div className="flex items-center justify-between mb-1">
                  <p className="text-indigo-400 font-semibold flex items-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-indigo-400 animate-pulse" />
                    Processing on the server
                  </p>
                  <p className="text-gray-500 dark:text-gray-500">{formatTime(activeFile.elapsed)} elapsed</p>
                </div>
                <p className="text-gray-700 dark:text-gray-300">{activeFile.stageMessage || 'Extracting text and generating a preview…'}</p>
                <p className="text-gray-500 dark:text-gray-500 mt-1">Upload finished — this step (text extraction / OCR) can take a bit longer for scanned documents or large images.</p>
              </div>
            )}

            {/* Folder selection & Description form */}
            <div className="space-y-3 pt-2 border-t border-gray-200 dark:border-gray-800">
              <div>
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Description (Optional)</label>
                <input
                  type="text"
                  value={fileDescription}
                  onChange={(e) => setFileDescription(e.target.value)}
                  placeholder="Add a short description for these files..."
                  className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
                  disabled={isUploading}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">Destination Folder</label>
                  <button
                    onClick={toggleDestEditable}
                    type="button"
                    className="text-[10px] text-blue-400 hover:text-blue-300 font-medium"
                    disabled={isUploading}
                  >
                    {isDestEditable ? 'Lock folder' : 'Change destination ✎'}
                  </button>
                </div>
                <div className="relative">
                  <input
                    ref={destInputRef}
                    type="text"
                    value={selectedFolder}
                    onChange={(e) => {
                      setSelectedFolder(e.target.value);
                      handleFolderFiltering(e.target.value);
                    }}
                    onFocus={() => { if (isDestEditable) setShowFolderDropdown(true); }}
                    readOnly={!isDestEditable}
                    className={`w-full bg-white dark:bg-gray-950 border rounded-xl px-3 py-2 text-xs text-gray-900 dark:text-white focus:outline-none
                      ${isDestEditable ? 'border-blue-500' : 'border-gray-200 dark:border-gray-800 opacity-80 cursor-not-allowed'}`}
                  />
                  {showFolderDropdown && filteredFolders.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-xl max-h-40 overflow-y-auto z-20">
                      {filteredFolders.map((f) => (
                        <div
                          key={f.folder_id}
                          onClick={() => {
                            setSelectedFolder(f.full_path);
                            setShowFolderDropdown(false);
                          }}
                          className="px-3 py-2 text-xs text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer truncate"
                        >
                          {f.full_path}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Action footer */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={requestClose}
                className="flex-1 py-2.5 text-sm font-semibold bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-all"
                disabled={isChecking}
              >
                Cancel
              </button>
              <button
                onClick={() => handleUploadAll(null)}
                disabled={!hasFiles || isUploading || isChecking || allDone}
                className="flex-1 py-2.5 text-sm font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl shadow transition-all flex items-center justify-center gap-2"
              >
                {isChecking ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Checking collisions…
                  </>
                ) : isUploading ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Uploading…
                  </>
                ) : allDone ? (
                  'All Done'
                ) : (
                  `Upload ${fileStates.length} file${fileStates.length > 1 ? 's' : ''}`
                )}
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}