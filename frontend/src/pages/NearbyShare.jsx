import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import ReactDOM from 'react-dom';
import { io as socketIO } from 'socket.io-client';
import { toast } from 'react-hot-toast';
import {
  Smartphone, Monitor, Wifi, WifiOff, Upload, Download, X,
  CheckCircle2, AlertTriangle, Loader2, RefreshCw, Send, HardDrive, Laptop,
  FileText, Image as ImageIcon, Film, Music, Archive, FileCode, Table, File,
  Sun, Check, Trash2, ArrowRight, ShieldCheck, Layers, Radio, CheckCheck, XCircle
} from 'lucide-react';
import { ShareTransfer } from '../utils/p2pTransfer 2';
import { generateTransferId } from '../utils/uuid';
import api, { baseURL } from '../utils/api';
import FilePickerModal from '../components/chat/FilePickerModal';

const backendUrl = baseURL.replace('/api', '');

function detectPlatform() {
  const ua = navigator.userAgent || '';
  if (/Mobi|Android|iPhone|iPad/i.test(ua)) return 'mobile';
  return 'desktop';
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function getFileIcon(fileName = '', mimeType = '') {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'bmp'].includes(ext) || mimeType.startsWith('image/')) {
    return <ImageIcon className="h-5 w-5 text-emerald-500" />;
  }
  if (['mp4', 'mkv', 'webm', 'mov', 'avi'].includes(ext) || mimeType.startsWith('video/')) {
    return <Film className="h-5 w-5 text-purple-500" />;
  }
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext) || mimeType.startsWith('audio/')) {
    return <Music className="h-5 w-5 text-pink-500" />;
  }
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) {
    return <Archive className="h-5 w-5 text-amber-500" />;
  }
  if (['js', 'jsx', 'ts', 'tsx', 'json', 'html', 'css', 'py', 'java', 'cpp', 'c', 'go', 'rs'].includes(ext)) {
    return <FileCode className="h-5 w-5 text-cyan-500" />;
  }
  if (['xls', 'xlsx', 'csv'].includes(ext)) {
    return <Table className="h-5 w-5 text-green-600" />;
  }
  if (['pdf', 'doc', 'docx', 'txt', 'rtf'].includes(ext)) {
    return <FileText className="h-5 w-5 text-blue-500" />;
  }
  return <File className="h-5 w-5 text-gray-400" />;
}

const STATUS_LABEL = {
  idle: 'Idle',
  'waiting-for-acceptance': 'Waiting for peer to accept…',
  incoming: 'Incoming request',
  connecting: 'Connecting directly (P2P)…',
  'connecting-relay': 'Connecting via relay…',
  transferring: 'Sending directly',
  'transferring-relay': 'Sending via relay',
  'paused-reconnecting': 'Connection interrupted — reconnecting…',
  verifying: 'Verifying file integrity…',
  complete: 'Complete ✓',
  failed: 'Failed',
  cancelled: 'Cancelled',
  rejected: 'Declined',
};

export default function NearbyShare({ user }) {
  const socketRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const [peers, setPeers] = useState([]);
  const [deviceName, setDeviceName] = useState(
    () => localStorage.getItem('sfms_share_device_name') || `${detectPlatform() === 'mobile' ? 'Mobile' : 'Desktop'}-${Math.floor(Math.random() * 900 + 100)}`
  );
  const [editingName, setEditingName] = useState(false);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [transfers, setTransfers] = useState([]);
  const sessionsRef = useRef(new Map());
  const fileInputRef = useRef(null);

  // --- Modal, Peer & Multi-file State ---
  const [selectedPeer, setSelectedPeer] = useState(null);
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [showSfmsModal, setShowSfmsModal] = useState(false);
  const [sfmsDownloading, setSfmsDownloading] = useState(false);

  const [selectedFiles, setSelectedFiles] = useState([]);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [isDragging, setIsDragging] = useState(false);

  // --- Screen Wake Lock ---
  const wakeLockRef = useRef(null);
  const [isWakeLockActive, setIsWakeLockActive] = useState(false);

  const activeTransfersCount = useMemo(() => {
    return transfers.filter((t) =>
      ['waiting-for-acceptance', 'connecting', 'connecting-relay', 'transferring', 'transferring-relay', 'paused-reconnecting', 'verifying', 'incoming'].includes(t.status)
    ).length;
  }, [transfers]);

  const requestWakeLock = useCallback(async () => {
    if ('wakeLock' in navigator) {
      try {
        if (!wakeLockRef.current) {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
          setIsWakeLockActive(true);
          wakeLockRef.current.addEventListener('release', () => {
            setIsWakeLockActive(false);
            wakeLockRef.current = null;
          });
        }
      } catch (err) {
        setIsWakeLockActive(false);
      }
    }
  }, []);

  const releaseWakeLock = useCallback(async () => {
    if (wakeLockRef.current) {
      try {
        await wakeLockRef.current.release();
      } catch (err) {
        // Safe fallback
      } finally {
        wakeLockRef.current = null;
        setIsWakeLockActive(false);
      }
    }
  }, []);

  useEffect(() => {
    if (activeTransfersCount > 0) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }
  }, [activeTransfersCount, requestWakeLock, releaseWakeLock]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && activeTransfersCount > 0) {
        requestWakeLock();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseWakeLock();
    };
  }, [activeTransfersCount, requestWakeLock, releaseWakeLock]);

  // ── Socket Connection & Presence ─────────────────────────────────────
  useEffect(() => {
    const token = localStorage.getItem('sfms_token');
    const sock = socketIO(backendUrl, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    socketRef.current = sock;

    sock.on('connect', () => {
      setConnected(true);
      sock.emit('share:hello', { deviceName, platform: detectPlatform() });
    });
    sock.on('disconnect', () => setConnected(false));
    sock.on('connect_error', () => setConnected(false));
    sock.on('share:peers', (list) => setPeers(list));

    sock.on('share:request', (req) => {
      setIncomingRequests((prev) => [...prev, req]);
      toast(`${req.fromDeviceName} wants to send "${req.fileName}"`, { icon: '📥' });
    });

    return () => sock.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const saveDeviceName = () => {
    if (!deviceName.trim()) return;
    localStorage.setItem('sfms_share_device_name', deviceName);
    setEditingName(false);
    socketRef.current?.emit('share:hello', { deviceName, platform: detectPlatform() });
  };

  // ── Transfer Bookkeeping ──────────────────────────────────────────────
  const upsertTransfer = useCallback((transferId, patch) => {
    setTransfers((prev) => {
      const idx = prev.findIndex((t) => t.transferId === transferId);
      if (idx === -1) return [...prev, { transferId, ...patch }];
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }, []);

  const attachSessionEvents = (session, transferId, extra) => {
    session.addEventListener('status', (e) => {
      upsertTransfer(transferId, { status: e.detail.status, reason: e.detail.reason });
      if (e.detail.status === 'complete') toast.success(`"${extra.fileName}" transferred successfully`);
      if (e.detail.status === 'failed') toast.error(`Transfer failed: ${e.detail.reason || 'unknown error'}`);
    });
    session.addEventListener('progress', (e) => {
      upsertTransfer(transferId, { bytesDone: e.detail.bytesDone, method: e.detail.method });
    });
    session.addEventListener('file-ready', (e) => {
      const url = URL.createObjectURL(e.detail.blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = e.detail.fileName;
      a.click();
      URL.revokeObjectURL(url);
    });
  };

  // ── Single & Queue Transfer Executor ─────────────────────────────────
  const initiateFileTransfer = useCallback((file, peer) => {
    if (!file || !peer) return;

    const transferId = generateTransferId();
    const session = new ShareTransfer({
      socket: socketRef.current,
      role: 'sender',
      transferId,
      peerSocketId: peer.socketId,
      file,
    });
    sessionsRef.current.set(transferId, session);

    upsertTransfer(transferId, {
      direction: 'send',
      peerName: peer.deviceName,
      fileName: file.name,
      fileSize: file.size,
      bytesDone: 0,
      status: 'waiting-for-acceptance',
      method: null,
      mimeType: file.type,
    });
    attachSessionEvents(session, transferId, { fileName: file.name });
    session.start();
  }, [upsertTransfer]);

  // Sequential queue processor for multi-file batches
  const executeFileBatch = useCallback(async (files, peer) => {
    if (!files.length || !peer) return;
    toast.success(`Queued ${files.length} file${files.length > 1 ? 's' : ''} for sending.`);
    for (const file of files) {
      initiateFileTransfer(file, peer);
      // Brief delay to allow socket signaling & webRTC session initialization stability
      await new Promise((res) => setTimeout(res, 300));
    }
  }, [initiateFileTransfer]);

  // ── Peer Selection & Source Handlers ─────────────────────────────────
  const handlePeerClick = (peer) => {
    setSelectedPeer(peer);
    setShowSourceModal(true);
  };

  const handleChooseLocal = () => {
    setShowSourceModal(false);
    fileInputRef.current?.click();
  };

  const onLocalFilesChosen = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length > 0 && selectedPeer) {
      if (files.length === 1) {
        initiateFileTransfer(files[0], selectedPeer);
      } else {
        setSelectedFiles(files);
        setShowReviewModal(true);
      }
    }
  };

  // Drag and Drop Handling
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0 && selectedPeer) {
      if (files.length === 1) {
        initiateFileTransfer(files[0], selectedPeer);
      } else {
        setSelectedFiles(files);
        setShowReviewModal(true);
      }
    }
  };

  const removeFileFromBatch = (index) => {
    setSelectedFiles((prev) => {
      const next = [...prev];
      next.splice(index, 1);
      if (next.length === 0) setShowReviewModal(false);
      return next;
    });
  };

  const handleConfirmBatchSend = () => {
    if (selectedFiles.length > 0 && selectedPeer) {
      executeFileBatch(selectedFiles, selectedPeer);
      setSelectedFiles([]);
      setShowReviewModal(false);
    }
  };

  // ── SFMS Storage Flow ────────────────────────────────────────────────
  const handleChooseSfms = () => {
    setShowSourceModal(false);
    setShowSfmsModal(true);
  };

  const handleSfmsFileSelect = async (fileRecord) => {
    setShowSfmsModal(false);
    const toastId = toast.loading(`Preparing "${fileRecord.original_name || fileRecord.file_name}"…`);

    try {
      setSfmsDownloading(true);
      const token = localStorage.getItem('sfms_token');

      const response = await api.get(`/files/download/${fileRecord.id}`, {
        responseType: 'blob',
        headers: {
          Authorization: `Bearer ${token}`
        },
        params: {
          token: token
        }
      });

      const fileName = fileRecord.original_name || fileRecord.file_name || 'file';
      const file = new File([response.data], fileName, {
        type: response.headers['content-type'] || 'application/octet-stream',
      });

      toast.dismiss(toastId);
      initiateFileTransfer(file, selectedPeer);
    } catch (err) {
      console.error('Failed to prepare SFMS file:', err);
      toast.error('Failed to fetch file from SFMS storage.', { id: toastId });
    } finally {
      setSfmsDownloading(false);
    }
  };

  // ── Receiving Actions ────────────────────────────────────────────────
  const acceptIncoming = (req) => {
    setIncomingRequests((prev) => prev.filter((r) => r.transferId !== req.transferId));
    socketRef.current.emit('share:response', { to: req.from, transferId: req.transferId, accepted: true });

    const session = new ShareTransfer({
      socket: socketRef.current,
      role: 'receiver',
      transferId: req.transferId,
      peerSocketId: req.from,
      meta: { fileName: req.fileName, fileSize: req.fileSize, mimeType: req.mimeType },
    });
    sessionsRef.current.set(req.transferId, session);

    upsertTransfer(req.transferId, {
      direction: 'receive',
      peerName: req.fromDeviceName,
      fileName: req.fileName,
      fileSize: req.fileSize,
      bytesDone: 0,
      status: 'connecting',
      method: null,
      mimeType: req.mimeType,
    });
    attachSessionEvents(session, req.transferId, { fileName: req.fileName });
    session.start();
  };

  const declineIncoming = (req) => {
    setIncomingRequests((prev) => prev.filter((r) => r.transferId !== req.transferId));
    socketRef.current.emit('share:response', { to: req.from, transferId: req.transferId, accepted: false });
  };

  // Batch action handlers for multi-file receiving
  const acceptAllIncomingFromSender = (senderSocketId) => {
    const targets = incomingRequests.filter((r) => r.from === senderSocketId);
    targets.forEach((req, idx) => {
      setTimeout(() => {
        acceptIncoming(req);
      }, idx * 200);
    });
  };

  const declineAllIncomingFromSender = (senderSocketId) => {
    const targets = incomingRequests.filter((r) => r.from === senderSocketId);
    targets.forEach((req) => declineIncoming(req));
  };

  const cancelTransfer = (transferId) => {
    sessionsRef.current.get(transferId)?.cancel();
  };

  // Group incoming requests by sender socket ID
  const groupedIncomingRequests = useMemo(() => {
    const map = new Map();
    incomingRequests.forEach((req) => {
      if (!map.has(req.from)) {
        map.set(req.from, []);
      }
      map.get(req.from).push(req);
    });
    return Array.from(map.entries()).map(([fromSocketId, requests]) => ({
      fromSocketId,
      deviceName: requests[0]?.fromDeviceName || 'Unknown Device',
      requests,
      totalSize: requests.reduce((acc, r) => acc + (r.fileSize || 0), 0),
    }));
  }, [incomingRequests]);

  // Filter transfers for clean workspace visual grouping
  const activeTransfers = transfers.filter((t) => !['complete', 'failed', 'cancelled', 'rejected'].includes(t.status));
  const completedTransfers = transfers.filter((t) => t.status === 'complete');
  const failedTransfers = transfers.filter((t) => ['failed', 'cancelled', 'rejected'].includes(t.status));

  const totalBatchSize = useMemo(() => {
    return selectedFiles.reduce((acc, f) => acc + f.size, 0);
  }, [selectedFiles]);

  return (
    <div className="max-w-6xl mx-auto p-4 sm:p-6 space-y-6 text-gray-900 dark:text-gray-100 transition-colors">
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        multiple
        onChange={onLocalFilesChosen}
      />

      {/* ── 1. HEADER / CONNECTION STATUS ──────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-5 sm:p-6 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-blue-500/10 dark:bg-blue-500/20 rounded-2xl text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0">
            {detectPlatform() === 'mobile' ? <Smartphone className="h-6 w-6" /> : <Monitor className="h-6 w-6" />}
          </div>
          <div>
            <span className="text-[10px] font-extrabold tracking-wider text-blue-600 dark:text-blue-400 uppercase">Your Device</span>
            {editingName ? (
              <div className="flex items-center gap-2 mt-0.5">
                <input
                  autoFocus
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && saveDeviceName()}
                  className="bg-gray-50 dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-1 text-sm font-semibold text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button onClick={saveDeviceName} className="text-xs font-semibold px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors">
                  Save
                </button>
              </div>
            ) : (
              <button
                onClick={() => setEditingName(true)}
                className="flex items-center gap-2 text-lg font-bold text-gray-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors group cursor-pointer"
              >
                <span>{deviceName}</span>
                <span className="text-xs text-gray-400 group-hover:text-blue-500 transition-colors">✎</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Wake Lock Status Indicator */}
          {isWakeLockActive && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs font-medium animate-pulse">
              <Sun className="h-3.5 w-3.5" />
              <span>Screen awake active</span>
            </div>
          )}

          {/* Socket Connection Pill */}
          <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-semibold border ${
            connected
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-600 dark:text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-600 dark:text-rose-400'
          }`}>
            <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            {connected ? (
              <span className="flex items-center gap-1.5"><Wifi className="h-3.5 w-3.5" /> Connected · Local network</span>
            ) : (
              <span className="flex items-center gap-1.5"><WifiOff className="h-3.5 w-3.5" /> Reconnecting…</span>
            )}
          </div>
        </div>
      </div>

      {/* ── 2. INCOMING REQUEST CARDS (GROUPED & MULTI-FILE READY) ───────────────── */}
      {groupedIncomingRequests.map((group) => (
        <div key={group.fromSocketId} className="bg-gradient-to-r from-blue-500/10 via-indigo-500/10 to-transparent border border-blue-500/30 rounded-3xl p-5 sm:p-6 shadow-md space-y-4 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-blue-500/10 pb-4">
            <div className="flex items-center gap-4 min-w-0">
              <div className="p-3.5 bg-blue-600 text-white rounded-2xl shadow-lg shrink-0">
                <Download className="h-6 w-6 animate-bounce" />
              </div>
              <div className="min-w-0">
                <span className="text-[10px] font-extrabold tracking-wider text-blue-600 dark:text-blue-400 uppercase">Incoming Transfer Request</span>
                <h4 className="text-base font-bold text-gray-900 dark:text-white truncate mt-0.5">
                  <span className="text-blue-600 dark:text-blue-400">{group.deviceName}</span> wants to send you {group.requests.length} {group.requests.length === 1 ? 'file' : 'files'}
                </h4>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 font-medium">
                  Total Size: <span className="font-bold text-gray-800 dark:text-gray-200">{formatBytes(group.totalSize)}</span>
                </p>
              </div>
            </div>

            {/* Batch Level Actions */}
            <div className="flex items-center gap-2.5 w-full sm:w-auto shrink-0 justify-end">
              <button
                onClick={() => declineAllIncomingFromSender(group.fromSocketId)}
                className="px-4 py-2.5 text-xs font-bold text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 rounded-xl transition-all"
              >
                Decline All
              </button>
              {group.requests.length > 1 && (
                <button
                  onClick={() => acceptAllIncomingFromSender(group.fromSocketId)}
                  className="px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/25 rounded-xl transition-all flex items-center gap-2"
                >
                  <CheckCheck className="h-4 w-4" />
                  <span>Accept All ({group.requests.length})</span>
                </button>
              )}
            </div>
          </div>

          {/* Individual Items List */}
          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
            {group.requests.map((req) => (
              <div key={req.transferId} className="flex items-center justify-between p-3 bg-white/60 dark:bg-gray-900/60 border border-gray-200/60 dark:border-gray-800/60 rounded-2xl">
                <div className="flex items-center gap-3 min-w-0">
                  {getFileIcon(req.fileName, req.mimeType)}
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{req.fileName}</p>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">{formatBytes(req.fileSize)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => declineIncoming(req)}
                    className="p-1.5 text-gray-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors"
                    title="Decline file"
                  >
                    <XCircle className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => acceptIncoming(req)}
                    className="px-3 py-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/50 rounded-lg transition-colors flex items-center gap-1"
                  >
                    <span>Accept</span>
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* ── 3. NEARBY DEVICES DISCOVERY ────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <span>Nearby Devices</span>
              {peers.length > 0 && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 font-semibold">
                  {peers.length}
                </span>
              )}
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Select a peer device to start sharing files</p>
          </div>
          <Radio className="h-5 w-5 text-gray-400 animate-pulse" />
        </div>

        {peers.length === 0 ? (
          <div className="py-12 px-4 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-800 text-center flex flex-col items-center justify-center space-y-3">
            <div className="p-4 bg-gray-100 dark:bg-gray-800/60 rounded-full text-blue-500">
              <RefreshCw className="h-6 w-6 animate-spin text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900 dark:text-white">Looking for nearby devices</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm">
                Ensure both devices are on the same network and have Nearby Share open.
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {peers.map((peer) => (
              <button
                key={peer.socketId}
                onClick={() => handlePeerClick(peer)}
                className="flex items-center justify-between p-4 bg-gray-50 hover:bg-blue-50/50 dark:bg-gray-950 dark:hover:bg-gray-800/50 border border-gray-200 dark:border-gray-800 hover:border-blue-500/50 rounded-2xl text-left transition-all group cursor-pointer shadow-xs hover:shadow-md"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div className="p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl text-blue-600 dark:text-blue-400 group-hover:scale-105 transition-transform shrink-0">
                    {peer.platform === 'mobile' ? <Smartphone className="h-5 w-5" /> : <Laptop className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-gray-900 dark:text-white truncate group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                      {peer.deviceName}
                    </p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                      <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400 capitalize">{peer.platform || 'Device'} • Available</span>
                    </div>
                  </div>
                </div>
                <div className="p-2 text-gray-400 group-hover:text-blue-600 dark:group-hover:text-blue-400 group-hover:translate-x-0.5 transition-all shrink-0">
                  <Send className="h-4 w-4" />
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── 4. TRANSFERS WORKSPACE ─────────────────────────────────────────── */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl p-5 sm:p-6 shadow-sm space-y-5">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-4">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Transfer Workspace</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Monitor real-time progress and completed transfers</p>
          </div>
          {transfers.length > 0 && (
            <div className="flex items-center gap-2 text-xs font-semibold text-gray-500">
              <Layers className="h-4 w-4 text-blue-500" />
              <span>{transfers.length} Total Session{transfers.length > 1 ? 's' : ''}</span>
            </div>
          )}
        </div>

        {transfers.length === 0 ? (
          <div className="py-10 text-center text-gray-400 dark:text-gray-600 text-xs">
            No transfers yet. Select a device above to initiate file sharing.
          </div>
        ) : (
          <div className="space-y-6">
            {/* Active Queue */}
            {activeTransfers.length > 0 && (
              <div className="space-y-3">
                <span className="text-[11px] font-extrabold text-blue-600 dark:text-blue-400 tracking-wider uppercase">
                  Active Transfers ({activeTransfers.length})
                </span>
                <div className="grid grid-cols-1 gap-3">
                  {activeTransfers.map((t) => {
                    const pct = t.fileSize ? Math.min(100, Math.round((t.bytesDone / t.fileSize) * 100)) : 0;
                    const isPaused = t.status === 'paused-reconnecting';
                    return (
                      <div key={t.transferId} className="bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="p-2.5 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shrink-0">
                              {getFileIcon(t.fileName, t.mimeType)}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-bold text-gray-900 dark:text-white truncate">{t.fileName}</p>
                              <p className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1.5 mt-0.5">
                                <span>{t.direction === 'send' ? 'Sending to' : 'Receiving from'} <strong>{t.peerName}</strong></span>
                                {t.method && <span className="px-1.5 py-0.2 rounded bg-gray-200 dark:bg-gray-800 text-[10px] font-bold uppercase">{t.method}</span>}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => cancelTransfer(t.transferId)}
                            className="p-1.5 text-gray-400 hover:text-rose-500 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors shrink-0"
                            title="Cancel Transfer"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>

                        {/* Progress bar */}
                        <div className="space-y-1.5">
                          <div className="w-full h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all duration-300 rounded-full ${isPaused ? 'bg-amber-500' : 'bg-blue-600'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <div className="flex items-center justify-between text-xs text-gray-500">
                            <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400 font-medium">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              {STATUS_LABEL[t.status] || t.status}
                            </span>
                            <span className="font-semibold text-gray-700 dark:text-gray-300">
                              {formatBytes(t.bytesDone)} / {formatBytes(t.fileSize)} ({pct}%)
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Completed Queue */}
            {completedTransfers.length > 0 && (
              <div className="space-y-3">
                <span className="text-[11px] font-extrabold text-emerald-600 dark:text-emerald-400 tracking-wider uppercase">
                  Completed ({completedTransfers.length})
                </span>
                <div className="grid grid-cols-1 gap-2.5">
                  {completedTransfers.slice().reverse().map((t) => (
                    <div key={t.transferId} className="flex items-center justify-between p-3.5 bg-emerald-500/5 border border-emerald-500/20 rounded-xl">
                      <div className="flex items-center gap-3 min-w-0">
                        <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{t.fileName}</p>
                          <p className="text-[11px] text-gray-500">{t.direction === 'send' ? 'Sent to' : 'Received from'} {t.peerName} • {formatBytes(t.fileSize)}</p>
                        </div>
                      </div>
                      <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 shrink-0">✓ Transferred</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Failed / Declined Queue */}
            {failedTransfers.length > 0 && (
              <div className="space-y-3">
                <span className="text-[11px] font-extrabold text-rose-600 dark:text-rose-400 tracking-wider uppercase">
                  Failed or Cancelled ({failedTransfers.length})
                </span>
                <div className="grid grid-cols-1 gap-2.5">
                  {failedTransfers.slice().reverse().map((t) => (
                    <div key={t.transferId} className="flex items-center justify-between p-3.5 bg-rose-500/5 border border-rose-500/20 rounded-xl">
                      <div className="flex items-center gap-3 min-w-0">
                        <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{t.fileName}</p>
                          <p className="text-[11px] text-gray-500">{STATUS_LABEL[t.status] || t.status} {t.reason ? `(${t.reason})` : ''}</p>
                        </div>
                      </div>
                      <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 shrink-0">Failed</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── 5. MODAL 1: SOURCE SELECTOR ────────────────────────────────────── */}
      {showSourceModal &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl w-full max-w-md p-6 shadow-2xl space-y-5">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-4">
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">Send Files</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Target: <span className="font-semibold text-blue-600 dark:text-blue-400">{selectedPeer?.deviceName}</span>
                  </p>
                </div>
                <button
                  onClick={() => setShowSourceModal(false)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* Drag and Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`p-4 rounded-2xl border-2 border-dashed text-center transition-all ${
                  isDragging
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950'
                }`}
              >
                <p className="text-xs font-bold text-gray-700 dark:text-gray-300">Drag & Drop files here</p>
                <p className="text-[11px] text-gray-400 mt-0.5">Supports single or multi-file batches</p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                <button
                  onClick={handleChooseLocal}
                  className="flex items-center gap-4 p-4 rounded-2xl border border-gray-200 dark:border-gray-800 hover:border-blue-500 hover:bg-blue-500/5 transition-all text-left group cursor-pointer"
                >
                  <div className="p-3 rounded-xl bg-blue-500/10 text-blue-600 dark:text-blue-400 group-hover:scale-105 transition-transform shrink-0">
                    <Laptop size={22} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">Upload from Device</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Select single or multiple local files</p>
                  </div>
                </button>

                <button
                  onClick={handleChooseSfms}
                  className="flex items-center gap-4 p-4 rounded-2xl border border-gray-200 dark:border-gray-800 hover:border-blue-500 hover:bg-blue-500/5 transition-all text-left group cursor-pointer"
                >
                  <div className="p-3 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 group-hover:scale-105 transition-transform shrink-0">
                    <HardDrive size={22} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900 dark:text-white">Send from SFMS Storage</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Pick a file stored in SFMS Cloud</p>
                  </div>
                </button>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ── 6. MODAL 2: MULTI-FILE REVIEW DRAWER ────────────────────────────── */}
      {showReviewModal &&
        ReactDOM.createPortal(
          <div className="fixed inset-0 z-[9999] bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-3xl w-full max-w-lg p-6 shadow-2xl space-y-5">
              <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-4">
                <div>
                  <h3 className="text-base font-bold text-gray-900 dark:text-white">Review Selected Files</h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                    Sending to <span className="font-semibold text-blue-600 dark:text-blue-400">{selectedPeer?.deviceName}</span>
                  </p>
                </div>
                <button
                  onClick={() => setShowReviewModal(false)}
                  className="p-1.5 text-gray-400 hover:text-gray-600 dark:hover:text-white rounded-xl hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              {/* File Item List */}
              <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                {selectedFiles.map((file, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl">
                    <div className="flex items-center gap-3 min-w-0">
                      {getFileIcon(file.name, file.type)}
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-gray-900 dark:text-white truncate">{file.name}</p>
                        <p className="text-[11px] text-gray-500">{formatBytes(file.size)}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => removeFileFromBatch(idx)}
                      className="p-1 text-gray-400 hover:text-rose-500 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors shrink-0"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Batch Summary Footer */}
              <div className="pt-3 border-t border-gray-100 dark:border-gray-800 space-y-4">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-gray-500">Total Size ({selectedFiles.length} files)</span>
                  <span className="text-gray-900 dark:text-white font-bold">{formatBytes(totalBatchSize)}</span>
                </div>

                <div className="flex items-center gap-3 justify-end">
                  <button
                    onClick={() => setShowReviewModal(false)}
                    className="px-4 py-2.5 text-xs font-bold text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-xl transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirmBatchSend}
                    className="px-5 py-2.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 shadow-lg shadow-blue-500/25 rounded-xl transition-all flex items-center gap-2"
                  >
                    <span>Send {selectedFiles.length} File{selectedFiles.length > 1 ? 's' : ''}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}

      {/* ── 7. SFMS STORAGE PICKER MODAL ───────────────────────────────────── */}
      <FilePickerModal
        isOpen={showSfmsModal}
        onClose={() => setShowSfmsModal(false)}
        user={user}
        onSelectFile={handleSfmsFileSelect}
      />
    </div>
  );
}