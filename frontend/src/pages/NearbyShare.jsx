import React, { useEffect, useRef, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import { io as socketIO } from 'socket.io-client';
import { toast } from 'react-hot-toast';
import {
  Smartphone, Monitor, Wifi, WifiOff, Upload, Download, X,
  CheckCircle2, AlertTriangle, Loader2, RefreshCw, Send, HardDrive, Laptop
} from 'lucide-react';
import { ShareTransfer } from '../utils/p2pTransfer 2';
import { generateTransferId } from '../utils/uuid';
import api, { baseURL } from '../utils/api';
import FilePickerModal from '../components/chat/FilePickerModal'; // Import reusable modal

const backendUrl = baseURL.replace('/api', '');

function detectPlatform() {
  const ua = navigator.userAgent || '';
  if (/Mobi|Android|iPhone|iPad/i.test(ua)) return 'mobile';
  return 'desktop';
}

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return '—';
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

const STATUS_LABEL = {
  idle: 'Idle',
  'waiting-for-acceptance': 'Waiting for peer to accept…',
  incoming: 'Incoming request',
  connecting: 'Connecting (direct)…',
  'connecting-relay': 'Connecting (relay)…',
  transferring: 'Sending directly (P2P)',
  'transferring-relay': 'Sending via relay',
  'paused-reconnecting': 'Wi-Fi dropped — reconnecting…',
  verifying: 'Verifying integrity…',
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

  // --- Modal & Peer State ---
  const [selectedPeer, setSelectedPeer] = useState(null);
  const [showSourceModal, setShowSourceModal] = useState(false);
  const [showSfmsModal, setShowSfmsModal] = useState(false);
  const [sfmsDownloading, setSfmsDownloading] = useState(false);

  // ── Connect socket + announce presence ────────────────────────────────
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
    localStorage.setItem('sfms_share_device_name', deviceName);
    setEditingName(false);
    socketRef.current?.emit('share:hello', { deviceName, platform: detectPlatform() });
  };

  // ── Transfer bookkeeping ─────────────────────────────────────────────
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

  // ── Helper to trigger sending process ───────────────────────────────
  const initiateFileTransfer = (file, peer) => {
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
    });
    attachSessionEvents(session, transferId, { fileName: file.name });
    session.start();
  };

  // ── Device Click Handler ─────────────────────────────────────────────
  const handlePeerClick = (peer) => {
    setSelectedPeer(peer);
    setShowSourceModal(true);
  };

  const handleChooseLocal = () => {
    setShowSourceModal(false);
    fileInputRef.current?.click();
  };

  const onLocalFileChosen = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file && selectedPeer) {
      initiateFileTransfer(file, selectedPeer);
    }
  };

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
    
    // Pass token explicitly if your Axios instance doesn't add it automatically
    const response = await api.get(`/files/download/${fileRecord.id}`, {
      responseType: 'blob',
      headers: {
      Authorization: `Bearer ${token}`
    },
      params: {
        token: token // Alternative fallback query param supported by downloadFile
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

  // ── Receiving ────────────────────────────────────────────────────────
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
    });
    attachSessionEvents(session, req.transferId, { fileName: req.fileName });
    session.start();
  };

  const declineIncoming = (req) => {
    setIncomingRequests((prev) => prev.filter((r) => r.transferId !== req.transferId));
    socketRef.current.emit('share:response', { to: req.from, transferId: req.transferId, accepted: false });
  };

  const cancelTransfer = (transferId) => {
    sessionsRef.current.get(transferId)?.cancel();
  };

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="p-6 space-y-6">
      <input type="file" ref={fileInputRef} className="hidden" onChange={onLocalFileChosen} />

      {/* Header / device identity */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
        <div>
          <p className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">This Device</p>
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && saveDeviceName()}
                className="bg-white dark:bg-gray-950 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-1.5 text-sm text-gray-900 dark:text-white outline-none focus:border-blue-500"
              />
              <button onClick={saveDeviceName} className="text-sm px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg">
                Save
              </button>
            </div>
          ) : (
            <button onClick={() => setEditingName(true)} className="flex items-center gap-2 text-gray-900 dark:text-white font-semibold hover:text-blue-400 transition-colors cursor-pointer">
              {detectPlatform() === 'mobile' ? <Smartphone className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
              {deviceName}
            </button>
          )}
        </div>
        <div className={`flex items-center gap-2 text-sm font-medium ${connected ? 'text-green-400' : 'text-red-400'}`}>
          {connected ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />}
          {connected ? 'On local network' : 'Reconnecting…'}
        </div>
      </div>

      {/* Incoming requests */}
      {incomingRequests.map((req) => (
        <div key={req.transferId} className="bg-blue-500/10 border border-blue-500/30 rounded-2xl p-5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Download className="h-6 w-6 text-blue-400 shrink-0" />
            <div>
              <p className="text-sm text-gray-900 dark:text-white font-semibold">{req.fromDeviceName} wants to send you a file</p>
              <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">{req.fileName} · {formatBytes(req.fileSize)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => acceptIncoming(req)} className="px-4 py-2 text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-xl">
              Accept
            </button>
            <button onClick={() => declineIncoming(req)} className="px-4 py-2 text-sm font-semibold bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-xl">
              Decline
            </button>
          </div>
        </div>
      ))}

      {/* Nearby devices */}
      <div className="bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5">
        <p className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-4">Nearby Devices</p>
        {peers.length === 0 ? (
          <div className="text-center py-10 text-gray-500 dark:text-gray-500 text-sm flex flex-col items-center gap-3">
            <RefreshCw className="h-6 w-6 animate-spin" />
            Looking for devices on your network…
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {peers.map((peer) => (
              <button
                key={peer.socketId}
                onClick={() => handlePeerClick(peer)}
                className="flex items-center gap-3 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 hover:border-blue-500/50 rounded-xl p-4 text-left transition-colors cursor-pointer group"
              >
                <div className="p-3 bg-blue-500/10 rounded-xl text-blue-400 border border-blue-500/20 group-hover:bg-blue-500/20">
                  {peer.platform === 'mobile' ? <Smartphone className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{peer.deviceName}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-500">{peer.userId}</p>
                </div>
                <Send className="h-4 w-4 text-gray-400 dark:text-gray-600 group-hover:text-blue-400 ml-auto shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Active / recent transfers */}
      {transfers.length > 0 && (
        <div className="bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-5 space-y-3">
          <p className="text-xs font-bold text-gray-600 dark:text-gray-400 uppercase tracking-wider mb-1">Transfers</p>
          {transfers.slice().reverse().map((t) => {
            const pct = t.fileSize ? Math.min(100, Math.round((t.bytesDone / t.fileSize) * 100)) : 0;
            const isDone = t.status === 'complete';
            const isFailed = t.status === 'failed' || t.status === 'cancelled' || t.status === 'rejected';
            const isPaused = t.status === 'paused-reconnecting';
            return (
              <div key={t.transferId} className="bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {t.direction === 'send' ? <Upload className="h-4 w-4 text-blue-400 shrink-0" /> : <Download className="h-4 w-4 text-purple-400 shrink-0" />}
                    <p className="text-sm text-gray-900 dark:text-white font-medium truncate">{t.fileName}</p>
                    <span className="text-xs text-gray-500 dark:text-gray-500 shrink-0">{t.direction === 'send' ? '→' : '←'} {t.peerName}</span>
                  </div>
                  {!isDone && !isFailed && (
                    <button onClick={() => cancelTransfer(t.transferId)} className="text-gray-500 dark:text-gray-500 hover:text-red-400 shrink-0">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
                <div className="w-full h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${isFailed ? 'bg-red-500' : isDone ? 'bg-green-500' : isPaused ? 'bg-yellow-500' : 'bg-blue-500'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-2 text-xs">
                  <span className={`flex items-center gap-1.5 font-medium ${isFailed ? 'text-red-400' : isDone ? 'text-green-400' : isPaused ? 'text-yellow-400' : 'text-gray-600 dark:text-gray-400'}`}>
                    {isDone && <CheckCircle2 className="h-3.5 w-3.5" />}
                    {isFailed && <AlertTriangle className="h-3.5 w-3.5" />}
                    {!isDone && !isFailed && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {STATUS_LABEL[t.status] || t.status}
                    {t.method === 'relay' && !isDone && ' (relay fallback)'}
                  </span>
                  <span className="text-gray-500 dark:text-gray-500">{formatBytes(t.bytesDone)} / {formatBytes(t.fileSize)} · {pct}%</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* --- SOURCE SELECTOR MODAL --- */}
      {showSourceModal &&
  ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9999] bg-black/50 flex items-center justify-center">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl w-full max-w-sm p-5 shadow-2xl space-y-4">
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-gray-800 pb-3">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white">Send File</h3>
            <p className="text-xs text-gray-500">To: {selectedPeer?.deviceName}</p>
          </div>
          <button 
            onClick={() => setShowSourceModal(false)} 
            className="text-gray-400 hover:text-gray-600 dark:hover:text-white"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-3 pt-1">
          <button
            onClick={handleChooseLocal}
            className="flex items-center gap-3 p-3.5 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-blue-500 hover:bg-blue-500/5 transition-all text-left group"
          >
            <div className="p-2.5 rounded-lg bg-blue-500/10 text-blue-500 group-hover:scale-105 transition-transform">
              <Laptop size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Upload from Computer</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Choose a file from device filesystem</p>
            </div>
          </button>

          <button
            onClick={handleChooseSfms}
            className="flex items-center gap-3 p-3.5 rounded-xl border border-gray-200 dark:border-gray-800 hover:border-blue-500 hover:bg-blue-500/5 transition-all text-left group"
          >
            <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-500 group-hover:scale-105 transition-transform">
              <HardDrive size={20} />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900 dark:text-white">Send from SFMS Storage</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Pick a file stored in SFMS cloud</p>
            </div>
          </button>
        </div>
      </div>
    </div>,
    document.body // 2. Renders target directly in <body>
  )}

      {/* --- SFMS FILE PICKER MODAL --- */}
      <FilePickerModal
        isOpen={showSfmsModal}
        onClose={() => setShowSfmsModal(false)}
        user={user}
        onSelectFile={handleSfmsFileSelect}
      />
    </div>
  );
}