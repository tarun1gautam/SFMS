/**
 * FileTable.jsx (SFMS v2 — Enhanced with Decoupled Lazy Thumbnails & Infinite Scroll Observer)
 */

import React, { useEffect, useState, useRef, useMemo } from 'react';
import EditFileModal from './modals/EditFileModal';
import { Download, Folder, Pencil, Trash2, Archive, Printer, Sparkles, MoreVertical, X, Copy, Check, QrCode, Shield, Wifi } from 'lucide-react';
import PrinterManagerModal from './PrinterManagerModal';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'react-hot-toast';
import api from '../utils/api';

// ─── Sub-components ──────────────────────────────────────────────────────────

/**
 * FileIconOrThumbnail — Decoupled lazy-loading thumbnail component.
 * Fetches thumbnail on demand from GET /files/:id/thumbnail using auth headers.
 */
function FileIconOrThumbnail({ file, onPreview }) {
  const [thumbUrl, setThumbUrl] = useState(null);
  const [loading, setLoading] = useState(true);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    // Check if file qualifies for a thumbnail
    const isImageOrPdf =
      file?.mime_type?.startsWith('image/') ||
      file?.mime_type?.includes('pdf') ||
      file?.mime_type?.includes('officedocument');

    if (!isImageOrPdf) {
      setLoading(false);
      return;
    }

    let isMounted = true;
    const token = localStorage.getItem('sfms_token');

    // Lazy load the thumbnail image blob individually
    fetch(`${api.defaults.baseURL}/files/${file.id}/thumbnail`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('No thumbnail');
        return res.blob();
      })
      .then((blob) => {
        if (isMounted) {
          setThumbUrl(URL.createObjectURL(blob));
          setLoading(false);
        }
      })
      .catch(() => {
        if (isMounted) {
          setImgError(true);
          setLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [file?.id, file?.mime_type]);

  if (loading) {
    return (
      <div className="w-8 h-8 rounded border border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-800 animate-pulse shrink-0" />
    );
  }

  if (thumbUrl && !imgError) {
    return (
      <div
        onClick={(e) => {
          e.stopPropagation();
          if (onPreview) onPreview({ ...file, thumbnail: thumbUrl });
        }}
        className="w-8 h-8 rounded shrink-0 overflow-hidden border border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-gray-900 flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-blue-500/50 hover:scale-105 transition-all duration-150"
        title="Click to enlarge preview"
      >
        <img
          src={thumbUrl}
          alt={file.file_name || 'Thumbnail'}
          className="w-full h-full object-cover"
          loading="lazy"
          onError={() => setImgError(true)}
        />
      </div>
    );
  }

  // Fallback to MIME badge
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border shrink-0 ${getMimeColor(
        file.mime_type
      )}`}
    >
      {getMimeLabel(file.mime_type)}
    </span>
  );
}

/**
 * SharedToBadges — renders shared_label array as coloured chips.
 */
function SharedToBadges({ sharedLabel, visibility, type }) {
  let labels = [];

  const parseSharedLabel = (input) => {
    if (!input) return [];
    if (Array.isArray(input)) return input;

    if (typeof input === 'string') {
      if (input.startsWith('{') && input.endsWith('}')) {
        let content = input.slice(1, -1);
        const matches = content.match(/'([^']*)'/g);
        if (matches) return matches.map((m) => m.slice(1, -1));
        return content
          .split(',')
          .map((s) => s.trim().replace(/['"]/g, ''))
          .filter((s) => s);
      }

      try {
        const parsed = JSON.parse(input);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {}

      if (input.includes(',')) {
        return input
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s);
      }

      if (input && input !== 'null' && input !== 'undefined') {
        return [input];
      }
    }

    return [];
  };

  const parsedLabels = parseSharedLabel(sharedLabel);

  if (parsedLabels.length > 0) {
    labels = parsedLabels;
  } else if (visibility === 'public') {
    labels = ['Public'];
  } else if (visibility === 'private') {
    labels = ['Private'];
  } else if (visibility === 'directory') {
    labels = ['Directory'];
  } else {
    labels = ['—'];
  }

  if (labels.length === 1 && (labels[0] === 'Public' || labels[0] === 'public')) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
        🌐 Public
      </span>
    );
  }

  if (labels.length === 1 && (labels[0] === 'Directory' || labels[0] === 'directory')) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-gray-400/10 dark:bg-gray-600/10 text-gray-600 dark:text-gray-400 border border-gray-400/20 dark:border-gray-600/20">
        📂 Directory
      </span>
    );
  }

  if (labels.length === 1 && (labels[0] === 'Private' || labels[0] === 'private')) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-gray-400/10 dark:bg-gray-600/10 text-gray-600 dark:text-gray-400 border border-gray-400/20 dark:border-gray-600/20">
        🔒 Private
      </span>
    );
  }

  if (labels.length === 1 && labels[0] === '—') {
    return <span className="text-gray-400 dark:text-gray-600 text-xs">—</span>;
  }

  const uniqueLabels = [...new Set(labels.filter((l) => l && l !== 'null' && l !== 'undefined'))];

  if (uniqueLabels.length === 0) {
    return <span className="text-gray-400 dark:text-gray-600 text-xs">—</span>;
  }

  const MAX_VISIBLE = 3;
  const visible = uniqueLabels.slice(0, MAX_VISIBLE);
  const overflow = uniqueLabels.length - MAX_VISIBLE;

  return (
    <div className="flex flex-wrap gap-1 max-w-[180px]">
      {visible.map((label, i) => (
        <span
          key={i}
          title={label}
          className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold
                     bg-blue-500/10 text-blue-300 border border-blue-500/20 truncate max-w-[80px]"
        >
          {label}
        </span>
      ))}
      {overflow > 0 && (
        <span
          title={uniqueLabels.slice(MAX_VISIBLE).join(', ')}
          className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold
                     bg-gray-300/60 dark:bg-gray-700/60 text-gray-600 dark:text-gray-400 border border-gray-400/30 dark:border-gray-600/30 cursor-help"
        >
          +{overflow} more
        </span>
      )}
    </div>
  );
}

/**
 * SortableHeader
 */
function SortableHeader({ children, sortKey, currentSort, currentOrder, onSort, className = '' }) {
  const isActive = currentSort === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`py-3 px-3 select-none cursor-pointer group/th transition-colors
                  hover:text-gray-800 dark:hover:text-gray-200 ${isActive ? 'text-blue-400' : 'text-gray-600 dark:text-gray-400'} ${className}`}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <span className="text-[10px] opacity-60 group-hover/th:opacity-100 transition-opacity">
          {isActive ? (
            currentOrder === 'asc' ? (
              '↑'
            ) : (
              '↓'
            )
          ) : (
            <span className="text-gray-400 dark:text-gray-600">⇅</span>
          )}
        </span>
      </span>
    </th>
  );
}

// ─── Format helpers ───────────────────────────────────────────────────────────

const formatDate = (ts) => {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const formatTime = (ts) => {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatBytes = (bytes) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const NEW_BADGE_WINDOW_MS = 1 * 60 * 60 * 1000;

const isRecentlyAdded = (timestamp) => {
  if (!timestamp) return false;
  const ageMs = Date.now() - new Date(timestamp).getTime();
  return ageMs >= 0 && ageMs < NEW_BADGE_WINDOW_MS;
};

const getMimeLabel = (mimeType) => {
  if (!mimeType) return '?';
  if (mimeType.includes('pdf')) return 'PDF';
  if (mimeType.includes('wordprocessingml')) return 'DOCX';
  if (mimeType.includes('spreadsheetml')) return 'XLSX';
  if (mimeType.includes('presentationml')) return 'PPTX';
  if (mimeType.startsWith('image/')) return mimeType.split('/')[1]?.toUpperCase() || 'IMG';
  if (mimeType.startsWith('video/')) return 'VIDEO';
  if (mimeType.startsWith('audio/')) return 'AUDIO';
  if (mimeType.includes('zip')) return 'ZIP';
  if (mimeType.includes('rar')) return 'RAR';
  if (mimeType.includes('text/plain')) return 'TXT';
  if (mimeType.includes('csv')) return 'CSV';
  if (mimeType.includes('json')) return 'JSON';
  return mimeType.split('/').pop()?.slice(0, 6).toUpperCase() || '?';
};

const MIME_COLORS = {
  PDF: 'bg-red-500/10 text-red-400 border-red-500/20',
  DOCX: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
  XLSX: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  PPTX: 'bg-orange-500/10 text-orange-400 border-orange-500/20',
  ZIP: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  RAR: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  TXT: 'bg-gray-500/10 dark:bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20 dark:border-gray-500/20',
  CSV: 'bg-teal-500/10 text-teal-400 border-teal-500/20',
  JSON: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
  VIDEO: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  AUDIO: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
};

const getMimeColor = (mime) =>
  MIME_COLORS[getMimeLabel(mime)] ||
  'bg-gray-500/10 dark:bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20 dark:border-gray-500/20';

// ─── Network / QR link helpers ─────────────────────────────────────────────
//
// SFMS is reachable on two interfaces:
//  - SECURE (office/VPN) network: 10.31.0.93
//  - LAN (local, un-VPN'd) network: 10.43.8.136
// The scoped download token from fetchSecureLink is host-agnostic (it's just
// signed with fileId/userId/purpose), so the same token works no matter
// which of the two hosts serves the request — we only need to swap the
// hostname in the URL to match whichever network the *scanning device* is
// actually on. Port/protocol/path/query are left untouched.
const QR_NETWORKS = {
  secure: { label: 'Secure', host: '10.31.0.93' },
  lan: { label: 'LAN', host: '10.43.8.136' },
};

const rewriteUrlHost = (rawUrl, newHost) => {
  if (!rawUrl) return rawUrl;
  try {
    const parsed = new URL(rawUrl);
    parsed.hostname = newHost;
    return parsed.toString();
  } catch (err) {
    return rawUrl; // not a valid absolute URL — leave as-is rather than break the modal
  }
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FileTable({
  files,
  onPin,
  onPinFolder,
  onDelete,
  // NOTE: the old `onDownload` prop (which built a URL using the raw
  // session token, e.g. `?token=${localStorage.sfms_token}`) has been
  // removed. All downloads/views/QR/print now go through `fetchSecureLink`,
  // which fetches a short-lived, single-file, download-only token from
  // POST /files/:id/download-token so the long-lived auth token is never
  // exposed in a URL, browser history, or referrer header.
  fetchSecureLink,
  sortField = 'default',
  sortOrder = 'desc',
  onSortChange = () => {},
  isFiltered = false,
  onRefresh,
  user,
  folders,
  expoFolder,
  setFolder,
  isDeleting,
  searchTerm,
  setIsDeleting,
  currentFolderId,
  setLoading,
  loading,
  selectedFileIds = new Set(),
  selectedFolderIds = new Set(),
  onToggleFileSelect = () => {},
  onToggleFolderSelect = () => {},
  onDownloadFolderZip = () => {},
  select,
  setFileCount,
  isAdmin,
  isPrintFetching,
  setIsPrintFetching,
  isLoading,
  // Infinite Scroll Props
  hasMore,
  loadMore,
  isFetchingMore,
}) {
  const [activeFile, setActiveFile] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [printFile, setPrintFile] = useState(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [activeMobileMenuId, setActiveMobileMenuId] = useState(null);
  const [activeDesktopMenuId, setActiveDesktopMenuId] = useState(null);
  
  // State for Thumbnail Preview Modal
  const [previewThumbnail, setPreviewThumbnail] = useState(null);
  const [qrModalFile, setQrModalFile] = useState(null);
  const [qrDownloadUrl, setQrDownloadUrl] = useState('');
  const [isGeneratingQr, setIsGeneratingQr] = useState(false);
  const [isLinkCopied, setIsLinkCopied] = useState(false);
  const [qrNetworkTab, setQrNetworkTab] = useState('secure'); // 'secure' | 'lan'

  // Tracks which file IDs currently have a secure-download fetch in flight,
  // so the button can show a spinner / avoid duplicate clicks.
  const [downloadingIds, setDownloadingIds] = useState(new Set());

  /**
   * performSecureDownload — single choke point for every download/view action.
   *
   * Previously the "Download" button built its own URL client-side using the
   * user's long-lived session token from localStorage
   * (e.g. `${baseURL}/files/download/:id?token=${sfms_token}`). That token
   * ends up in the browser address bar, history, referrer headers, and any
   * server access log the request passes through — effectively leaking the
   * user's full session credential every time someone downloads a file.
   *
   * Instead, every download now goes through `fetchSecureLink(fileId, duration)`
   * (POST /files/:id/download-token), which mints a short-lived, single-file,
   * download-only JWT server-side. Only that scoped token — never the raw
   * session token — ever appears in a URL, so a leaked/shared/QR-scanned link
   * can't be used to do anything but download this one file, and only until
   * it expires.
   */
  const performSecureDownload = async (fileId, originalName, mode = 'download') => {
    if (!fetchSecureLink) {
      toast.error('Secure download is not configured.');
      return;
    }
    if (downloadingIds.has(fileId)) return; // already fetching a link for this file

    setDownloadingIds((prev) => new Set(prev).add(fileId));
    try {
      // Short-lived link: 1h is plenty for an immediate view/download click.
      const secureUrl = await fetchSecureLink(fileId, '1h');
      if (!secureUrl) {
        toast.error('Failed to generate secure download link.');
        return;
      }

      if (mode === 'view') {
        window.open(secureUrl, '_blank', 'noopener,noreferrer');
      } else {
        const link = document.createElement('a');
        link.href = secureUrl;
        link.rel = 'noopener noreferrer';
        if (originalName) link.setAttribute('download', originalName);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err) {
      toast.error('Failed to generate secure download link.');
    } finally {
      setDownloadingIds((prev) => {
        const next = new Set(prev);
        next.delete(fileId);
        return next;
      });
    }
  };

  // Intersection Observer Sentinel for Infinite Scrolling
  const observerTarget = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !isFetchingMore) {
          loadMore();
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [hasMore, isFetchingMore, loadMore]);

  const openEditModal = (file) => {
    setActiveFile(file);
    setIsEditModalOpen(true);
  };

  const openQrModal = async (file) => {
    setQrModalFile(file);
    setIsGeneratingQr(true);
    setQrDownloadUrl('');
    setIsLinkCopied(false);
    setQrNetworkTab('secure');
    try {
      // 24h scoped, download-only link — safe to embed in a QR code since it
      // can never be used for anything but downloading this one file. The
      // hostname gets swapped per-tab at render time (see displayedQrUrl).
      const url = await fetchSecureLink(file.id, '24h');
      if (!url) throw new Error('No download URL returned');
      setQrDownloadUrl(url);
    } catch (err) {
      toast.error('Failed to generate secure download QR link.');
      setQrModalFile(null);
    } finally {
      setIsGeneratingQr(false);
    }
  };

  const closeQrModal = () => {
    setQrModalFile(null);
    setQrDownloadUrl('');
    setIsLinkCopied(false);
    setQrNetworkTab('secure');
  };

  // The link actually shown/encoded, rewritten to whichever network's host
  // the user has selected in the tab switcher.
  const displayedQrUrl = useMemo(
    () => rewriteUrlHost(qrDownloadUrl, QR_NETWORKS[qrNetworkTab].host),
    [qrDownloadUrl, qrNetworkTab]
  );

  const handleCopyQrLink = async () => {
    if (!displayedQrUrl) return;
    try {
      await navigator.clipboard.writeText(displayedQrUrl);
      setIsLinkCopied(true);
      toast.success(`${QR_NETWORKS[qrNetworkTab].label} link copied to clipboard.`);
      setTimeout(() => setIsLinkCopied(false), 2000);
    } catch (err) {
      toast.error('Could not copy link. Please copy it manually.');
    }
  };

  const filteredFolders = folders.filter((f) => {
    if (f.full_path === '/public/') return false;
    if (f.full_path === '/shared/') return false;

    if (f.visibility?.toLowerCase() === 'public') return true;

    if (f.visibility?.toLowerCase() === 'private') {
      if (isAdmin) return true;
      if (!f.target_users || f.target_users.length === 0) return true;
      return f.target_users.some((t) => t === user.user_id) || f.created_by_name === user.user_id;
    }

    return false;
  });

  const combinedItems = [
    ...filteredFolders.map((f) => ({ ...f, type: 'folder' })),
    ...files.map((f) => ({ ...f, type: 'file' })),
  ].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'folder' ? -1 : 1;
    }
    if (a.type === 'folder') {
      if (a.is_pinned !== b.is_pinned) return b.is_pinned - a.is_pinned;
      const nameA = a.folder_name || a.name || '';
      const nameB = b.folder_name || b.name || '';
      return nameA.localeCompare(nameB);
    }
    return 0;
  });

  const filterfiles = combinedItems.filter((f) => {
    if (!expoFolder) return false;
    const normalizedExpo = expoFolder.endsWith('/') ? expoFolder : `${expoFolder}/`;
    const isSharedView = normalizedExpo.toLowerCase() === '/shared/';
    if (isSharedView) {
      return true;
    }

    const decodedFullPath = f.full_path;
    if (f.type === 'folder') {
      const normalizedFolder = decodedFullPath.endsWith('/') ? decodedFullPath : `${decodedFullPath}/`;
      const isInside = normalizedFolder.startsWith(normalizedExpo) && normalizedFolder !== normalizedExpo;
      const expoSlashCount = (normalizedExpo.match(/\//g) || []).length;
      const folderSlashCount = (normalizedFolder.match(/\//g) || []).length;
      return isInside && folderSlashCount === expoSlashCount + 1;
    } else {
      if (searchTerm.length > 0) {
        return true;
      } else {
        return f.virtual_path === currentFolderId;
      }
    }
  });

  const fileCount = filterfiles.filter((f) => f.type !== 'folder').length;

  useEffect(() => {
    setFileCount(fileCount);
  }, [fileCount, setFileCount]);

  const handleDeleteFolder = async (fileId) => {
    if (!window.confirm('Are you sure you want to permanently erase this asset from disk storage?')) return;
    setIsDeleting(true);
    try {
      const response = await api.delete(`/folders/delete/${fileId}`);
      if (response.status === 200) {
        toast.success('Asset deleted successfully.');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erase operation failed.');
    } finally {
      setIsDeleting(false);
      onRefresh();
    }
  };

  const PRINTABLE_MIME_PATTERNS = ['pdf'];
  const isPrintable = (mimeType) => {
    if (!mimeType) return false;
    return PRINTABLE_MIME_PATTERNS.some((p) => mimeType.includes(p));
  };

  const handlePrintFile = async (file) => {
    setIsPrintFetching(true);
    try {
      const secureUrl = await fetchSecureLink(file.id, '1h');
      if (!secureUrl) throw new Error('No download URL returned');
      const res = await fetch(secureUrl);
      if (!res.ok) throw new Error('Failed to fetch file for printing.');
      const blob = await res.blob();

      setPrintFile({
        blob,
        name: file.original_name || file.file_name,
        mime: file.mime_type,
      });
      setIsPrintModalOpen(true);
    } catch (err) {
      toast.error('Could not load file for printing.');
    } finally {
      setIsPrintFetching(false);
    }
  };

  if (filterfiles.length === 0) {
    return (
      <div className="p-12 text-center text-gray-500 dark:text-gray-500">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-12 w-12 mx-auto mb-3 opacity-30"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0a2 2 0 01-2 2H6a2 2 0 01-2-2m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
          />
        </svg>
        <span className="text-sm font-medium block">
          {isFiltered
            ? 'No files match your current search/filter criteria.'
            : 'No storage entities available under your present login session clearance.'}
        </span>
        {isFiltered && (
          <span className="text-xs text-gray-400 dark:text-gray-600 mt-1 block">
            Try adjusting or clearing your filters.
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* 1. DESKTOP VIEW */}
      <div className="hidden md:block w-full overflow-x-auto">
        <table className="w-full text-left border-collapse min-w-[900px]">
          <thead>
            <tr className="bg-white/60 dark:bg-gray-950/60 border-b border-gray-200 dark:border-gray-800 text-[11px] font-bold uppercase tracking-wider">
              {select ? (
                <th className="py-1 px-3 w-8 text-gray-600 dark:text-gray-400">
                  <input
                    type="checkbox"
                    className="w-3.5 h-3.5 accent-blue-500 cursor-pointer"
                    checked={
                      filterfiles.filter((item) => item.type !== 'folder').length > 0 &&
                      filterfiles
                        .filter((item) => item.type !== 'folder')
                        .every((file) => selectedFileIds.has(file.id))
                    }
                    onChange={(e) => {
                      e.stopPropagation();
                      const filesOnly = filterfiles.filter((f) => f.type !== 'folder');
                      if (filesOnly.length === 0) return;
                      const allFilesChecked = filesOnly.every((f) => selectedFileIds.has(f.id));
                      filesOnly.forEach((f) => {
                        const isSelected = selectedFileIds.has(f.id);
                        if (allFilesChecked && isSelected) {
                          onToggleFileSelect(f.id);
                        } else if (!allFilesChecked && !isSelected) {
                          onToggleFileSelect(f.id);
                        }
                      });
                    }}
                  />
                </th>
              ) : (
                <th className="py-3 px-3 w-10 text-gray-600 dark:text-gray-400"></th>
              )}

              <SortableHeader sortKey="name" currentSort={sortField} currentOrder={sortOrder} onSort={onSortChange}>
                File Reference Asset
              </SortableHeader>

              <SortableHeader sortKey="uploader" currentSort={sortField} currentOrder={sortOrder} onSort={onSortChange}>
                Added By
              </SortableHeader>

              <SortableHeader sortKey="upload_date" currentSort={sortField} currentOrder={sortOrder} onSort={onSortChange}>
                Upload Date
              </SortableHeader>

              <SortableHeader sortKey="size" currentSort={sortField} currentOrder={sortOrder} onSort={onSortChange} className="text-center">
                Size / Status
              </SortableHeader>

              <th className="py-3 px-3 text-center text-gray-600 dark:text-gray-400 select-none">
                Operations Terminal
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-gray-200/40 dark:divide-gray-800/40">
            {filterfiles.map((file) => {
              const isFolder = file.type === 'folder';
              const isSelected = isFolder
                ? selectedFolderIds.has(file.folder_id)
                : selectedFileIds.has(file.id);
              const isNew = isFolder
                ? isRecentlyAdded(file.created_at)
                : isRecentlyAdded(file.upload_timestamp);

              return (
                <tr
                  key={file.id || file.folder_id}
                  className={`group transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-blue-500/10 dark:bg-blue-500/15 shadow-[inset_2px_0_0_0_theme(colors.blue.500)]'
                      : `hover:bg-gray-200/30 dark:hover:bg-gray-800/30 ${
                          file.is_pinned ? 'bg-blue-600/[0.03]' : ''
                        }`
                  }`}
                  onClick={
                    isFolder
                      ? () => setFolder(decodeURIComponent(file.full_path))
                      : () =>
                          select
                            ? isFolder
                              ? onToggleFolderSelect(file.folder_id)
                              : onToggleFileSelect(file.id)
                            : undefined
                  }
                >
                  <td className="py-3 -px-3 w-12 text-center" onClick={(e) => e.stopPropagation()}>
                    {select && !isFolder ? (
                      <div className="flex items-center justify-center">
                        <input
                          type="checkbox"
                          className="w-3.5 h-3.5 accent-blue-500 cursor-pointer"
                          checked={selectedFileIds.has(file.id)}
                          onChange={() => onToggleFileSelect(file.id)}
                        />
                      </div>
                    ) : (
                      <button
                        onClick={() => isFolder ? onPinFolder(file.folder_id) : onPin(file.id)}
                        className={`transition-colors cursor-pointer text-base leading-none ${
                          file.is_pinned
                            ? 'text-yellow-500'
                            : 'text-gray-400 dark:text-gray-600 group-hover:text-gray-600 dark:group-hover:text-gray-400'
                        }`}
                        title={file.is_pinned ? 'Unpin' : 'Pin to top'}
                      >
                        ★
                      </button>
                    )}
                  </td>

                  {/* ── File Reference ─────────────────────── */}
                  <td className="py-3 -px-3 max-w-[240px]">
                    <div className="flex items-center gap-2.5">
                      {isFolder ? (
                        file.visibility?.toLowerCase() === 'public' ? (
                          file.download_only ? (
                            <div className="relative inline-flex items-center justify-center shrink-0" title="Public (Download Only)">
                              <svg className="w-5 h-5 text-sky-500 fill-current" viewBox="0 0 24 24">
                                <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                              </svg>
                              <svg
                                className="absolute -bottom-0.5 -right-0.5 w-2 h-2 text-sky-600"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                              >
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                              </svg>
                            </div>
                          ) : (
                            <svg className="w-5 h-5 text-blue-500 fill-current shrink-0" viewBox="0 0 24 24" title="Public Folder">
                              <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                            </svg>
                          )
                        ) : file.download_only ? (
                          <div className="relative inline-flex items-center justify-center shrink-0" title="Private (Download Only)">
                            <svg className="w-5 h-5 text-amber-500 fill-current" viewBox="0 0 24 24">
                              <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                            </svg>
                            <span className="absolute -bottom-1 -right-1 bg-amber-600 text-white p-0.5 rounded-full ring-2 ring-white dark:ring-gray-900">
                              <svg
                                className="w-2.5 h-2.5"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="3"
                              >
                                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                              </svg>
                            </span>
                          </div>
                        ) : (
                          <div className="relative inline-flex items-center justify-center shrink-0" title="Private Folder">
                            <svg className="w-5 h-5 text-orange-500 fill-current" viewBox="0 0 24 24">
                              <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                            </svg>
                          </div>
                        )
                      ) : (
                        <FileIconOrThumbnail file={file} onPreview={(f) => setPreviewThumbnail(f)} />
                      )}
                      <div
                        className={`min-w-0 ${!isFolder ? 'cursor-pointer group' : ''}`}
                        onClick={() => {
                          if (!isFolder && !select) {
                            performSecureDownload(file.id, file.original_name, 'view');
                          }
                        }}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className="font-semibold text-gray-800 dark:text-gray-200 group-hover:text-blue-400 transition-colors truncate"
                            title={isFolder ? file.folder_name : file.original_name}
                          >
                            {isFolder ? file.folder_name : file.file_name}
                          </span>
                          {isNew && (
                            <span className="shrink-0 text-[10px] font-bold text-emerald-500 tracking-wide">
                              NEW
                            </span>
                          )}
                        </div>

                        {!isFolder && searchTerm.length > 0 && file.vvirtual_path && (
                          <span
                            className="block text-[10px] text-blue-500/70 font-mono mt-0.5 truncate"
                            title={`Located in: ${decodeURIComponent(file.vvirtual_path)}`}
                          >
                            📁 {decodeURIComponent(file.vvirtual_path)}
                          </span>
                        )}

                        {!isFolder && (
                          <span
                            className="block text-[10px] text-gray-500 dark:text-gray-500 font-mono mt-0.5 truncate"
                            title={file.description}
                          >
                            {file.description}
                          </span>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* ── Uploaded By ────────────────────────── */}
                  <td className="py-3 -px-3 text-gray-600 dark:text-gray-400">
                    {isFolder ? (
                      <span className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                        {file.created_by_name}
                      </span>
                    ) : (
                      <div>
                        <span className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                          {file.uploaded_by}
                        </span>
                        <span className="block text-[9px] font-mono text-gray-500 dark:text-gray-500 mt-0.5">
                          {file.uploader_ip}
                        </span>
                      </div>
                    )}
                  </td>

                  {/* ── Upload Date ────────────────────────── */}
                  <td className="py-3 -px-3">
                    {isFolder ? (
                      <div>
                        <span
                          className="block text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap"
                          title={`Last modified: ${formatDate(file.last_modified)} ${formatTime(file.last_modified)}`}
                        >
                          {formatDate(file.created_at)}
                        </span>
                        <span className="block text-[10px] text-gray-500 dark:text-gray-500 mt-0.5 whitespace-nowrap">
                          {formatTime(file.created_at)}
                        </span>
                      </div>
                    ) : (
                      <div>
                        <span
                          className="block text-xs text-gray-700 dark:text-gray-300 whitespace-nowrap"
                          title={`Last modified: ${formatDate(file.last_modified)} ${formatTime(file.last_modified)}`}
                        >
                          {formatDate(file.upload_timestamp)}
                        </span>
                        <span className="block text-[10px] text-gray-500 dark:text-gray-500 mt-0.5 whitespace-nowrap">
                          {formatTime(file.upload_timestamp)}
                        </span>
                      </div>
                    )}
                  </td>

                  {/* ── Size / Status ──────────────────────── */}
                  <td className="py-3 -px-3 text-center">
                    {isFolder ? (
                      '-'
                    ) : (
                      <div>
                        <span className="block text-xs font-semibold text-gray-700 dark:text-gray-300 whitespace-nowrap">
                          {formatBytes(file.file_size)}
                        </span>
                        <span className="block text-[10px] text-gray-500 dark:text-gray-500 mt-0.5">
                          {file.download_count} DL
                        </span>
                        {file.is_pinned && <span className="block text-[9px] text-yellow-600 mt-0.5">PINNED</span>}
                      </div>
                    )}
                  </td>

                  {/* ── Operations ─────────────────────────── */}
                  <td className="py-3 px-3 text-center" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1.5">
                      {/* 1. Download Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          isFolder
                            ? onDownloadFolderZip(file.folder_id, file.folder_name)
                            : performSecureDownload(file.id, file.original_name);
                        }}
                        disabled={!isFolder && downloadingIds.has(file.id)}
                        title={isFolder ? 'Download folder as ZIP' : 'Download'}
                        className="p-2 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg text-gray-500 dark:text-gray-400 hover:text-blue-400 hover:border-blue-500/50 transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-wait"
                      >
                        {!isFolder && downloadingIds.has(file.id) ? (
                          <span className="block w-[18px] h-[18px] border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                        ) : isFolder ? (
                          <Archive size={18} />
                        ) : (
                          <Download size={18} />
                        )}
                      </button>

                      {/* 2. Edit Button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditModal(file);
                        }}
                        title="Edit"
                        disabled={select}
                        className={`p-2 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg text-gray-500 dark:text-gray-400 transition-all duration-200 ${
                          select ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:text-emerald-400 hover:border-emerald-500/50'
                        }`}
                      >
                        <Pencil size={18} />
                      </button>

                      {/* 3. Dropdown for Print, QR & Delete */}
                      <div className="relative inline-block text-left">
                        <button
                          onClick={() =>
                            setActiveDesktopMenuId(
                              activeDesktopMenuId === (file.id || file.folder_id) ? null : (file.id || file.folder_id)
                            )
                          }
                          title="More options"
                          className="p-2 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300 dark:hover:border-gray-700 transition-all duration-200 cursor-pointer"
                        >
                          <MoreVertical size={18} />
                        </button>

                        {activeDesktopMenuId === (file.id || file.folder_id) && (
                          <>
                            <div
                              className="fixed inset-0 z-40"
                              onClick={() => setActiveDesktopMenuId(null)}
                            />

                            <div
                              className={`absolute right-0 z-50 w-36 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-xl py-1 text-xs font-medium text-gray-700 dark:text-gray-200 ${
                                filterfiles.indexOf(file) >= filterfiles.length - 2 && filterfiles.length > 2
                                  ? 'bottom-full mb-1'
                                  : 'top-full mt-1'
                              }`}
                            >
                              {!isFolder && isPrintable(file.mime_type) && (
                                <button
                                  onClick={() => {
                                    setActiveDesktopMenuId(null);
                                    handlePrintFile(file);
                                  }}
                                  disabled={select || isPrintFetching}
                                  className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                                >
                                  <Printer size={14} className={`text-violet-500 ${isPrintFetching ? 'animate-pulse' : ''}`} />
                                  <span>Print</span>
                                </button>
                              )}

                              {!isFolder && (
                                <button
                                  onClick={() => {
                                    setActiveDesktopMenuId(null);
                                    openQrModal(file);
                                  }}
                                  disabled={select}
                                  className="w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                                >
                                  <Sparkles size={14} className="text-purple-500" />
                                  <span>Get QR</span>
                                </button>
                              )}

                              <button
                                onClick={() => {
                                  setActiveDesktopMenuId(null);
                                  isFolder ? handleDeleteFolder(file.folder_id) : onDelete(file.id);
                                }}
                                disabled={select}
                                className="w-full text-left px-3 py-2 flex items-center gap-2.5 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-50 border-t border-gray-100 dark:border-gray-800/60 mt-0.5"
                              >
                                <Trash2 size={14} />
                                <span>Delete</span>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* 2. MOBILE VIEW */}
      <div className="block md:hidden divide-y divide-gray-200/60 dark:divide-gray-800/60 border-b border-gray-200/60 dark:border-gray-800/60">
        {filterfiles.map((file, index) => {
          const isFolder = file.type === 'folder';
          const fileId = isFolder ? file.folder_id : file.id;
          const isSelected = isFolder
            ? selectedFolderIds.has(file.folder_id)
            : selectedFileIds.has(file.id);
          const isNew = isFolder
            ? isRecentlyAdded(file.created_at)
            : isRecentlyAdded(file.upload_timestamp);

          const isMenuOpen = activeMobileMenuId === fileId;

          return (
            <div
              key={fileId}
              className={`relative flex items-center justify-between min-h-[56px] px-3 py-2.5 transition-colors cursor-pointer select-none ${
                isSelected
                  ? 'bg-blue-500/10 dark:bg-blue-500/15 border-l-4 border-blue-500'
                  : 'hover:bg-gray-50/80 dark:hover:bg-gray-800/40 active:bg-gray-100 dark:active:bg-gray-800/80'
              }`}
              onClick={() => {
                if (isFolder) {
                  setFolder(decodeURIComponent(file.full_path));
                } else if (select) {
                  onToggleFileSelect(file.id);
                } else {
                  performSecureDownload(file.id, file.original_name, 'view');
                }
              }}
            >
              {/* LEFT */}
              <div className="flex items-center gap-2.5 min-w-0 flex-1 pr-2">
                {select && !isFolder ? (
                  <div className="shrink-0 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      className="w-4 h-4 accent-blue-500 cursor-pointer rounded"
                      checked={selectedFileIds.has(file.id)}
                      onChange={() => onToggleFileSelect(file.id)}
                    />
                  </div>
                ) : (
                  !select && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        isFolder ? onPinFolder(file.folder_id) : onPin(file.id);
                      }}
                      className={`shrink-0 text-base leading-none p-1 transition-colors ${
                        file.is_pinned
                          ? 'text-yellow-500'
                          : 'text-gray-300 dark:text-gray-600 hover:text-gray-400'
                      }`}
                      title={file.is_pinned ? 'Unpin' : 'Pin to top'}
                    >
                      ★
                    </button>
                  )
                )}

                {/* Icon / Thumbnail Section */}
                <div className="shrink-0 flex items-center justify-center">
                  {isFolder ? (
                    file.visibility?.toLowerCase() === 'public' ? (
                      file.download_only ? (
                        <div className="relative inline-flex items-center justify-center shrink-0" title="Public (Download Only)">
                          <svg className="w-6 h-6 text-sky-500 fill-current" viewBox="0 0 24 24">
                            <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                          </svg>
                          <svg
                            className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 text-sky-600 dark:text-sky-400"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                          >
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                        </div>
                      ) : (
                        <svg className="w-6 h-6 text-blue-500 fill-current shrink-0" viewBox="0 0 24 24" title="Public Folder">
                          <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                        </svg>
                      )
                    ) : file.download_only ? (
                      <div className="relative inline-flex items-center justify-center shrink-0" title="Private (Download Only)">
                        <svg className="w-6 h-6 text-amber-500 fill-current" viewBox="0 0 24 24">
                          <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                        </svg>
                        <span className="absolute -bottom-1 -right-1 bg-amber-600 text-white p-0.5 rounded-full ring-2 ring-white dark:ring-gray-900">
                          <svg
                            className="w-2.5 h-2.5"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                          >
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                          </svg>
                        </span>
                      </div>
                    ) : (
                      <div className="relative inline-flex items-center justify-center shrink-0" title="Private Folder">
                        <svg className="w-6 h-6 text-orange-500 fill-current" viewBox="0 0 24 24">
                          <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                        </svg>
                      </div>
                    )
                  ) : (
                    <FileIconOrThumbnail file={file} onPreview={(f) => setPreviewThumbnail(f)} />
                  )}
                </div>

                {/* File Meta Info */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate leading-tight">
                      {isFolder ? file.folder_name : file.file_name}
                    </span>
                    {isNew && (
                      <span className="shrink-0 text-[9px] font-bold text-emerald-500 uppercase tracking-wide">
                        NEW
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
                    {isFolder
                      ? `${file.created_by_name || 'System'} • ${formatDate(file.created_at)}`
                      : `${formatBytes(file.file_size)} • ${formatDate(file.upload_timestamp)}`}
                  </div>
                </div>
              </div>

              {/* RIGHT */}
              <div className="flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                {!isFolder && (
                  <>
                    <button
                      onClick={() => performSecureDownload(file.id, file.original_name)}
                      className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 active:bg-gray-100 dark:active:bg-gray-800 rounded-lg transition-colors"
                      title="Download"
                    >
                      <Download size={16} />
                    </button>

                    <button
                      onClick={() => openEditModal(file)}
                      disabled={select}
                      className="p-1.5 text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 active:bg-gray-100 dark:active:bg-gray-800 rounded-lg transition-colors disabled:opacity-30"
                      title="Edit"
                    >
                      <Pencil size={16} />
                    </button>
                  </>
                )}

                <div className="relative">
                  <button
                    onClick={() => setActiveMobileMenuId(isMenuOpen ? null : fileId)}
                    className="p-1.5 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 active:bg-gray-100 dark:active:bg-gray-800 rounded-lg transition-colors"
                  >
                    <MoreVertical size={16} />
                  </button>

                  {isMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-40 bg-transparent" onClick={() => setActiveMobileMenuId(null)} />

                      <div
                        className={`absolute right-0 z-50 w-40 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-xl py-1 text-xs ${
                          index >= filterfiles.length - 2 && filterfiles.length > 2
                            ? 'bottom-full mb-1'
                            : 'top-full mt-1'
                        }`}
                      >
                        {isFolder && (
                          <>
                            <button
                              onClick={() => {
                                setActiveMobileMenuId(null);
                                openEditModal(file);
                              }}
                              disabled={select}
                              className="w-full text-left px-3 py-2 text-emerald-600 dark:text-emerald-400 flex items-center gap-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/60 disabled:opacity-50"
                            >
                              <Pencil size={14} /> Edit
                            </button>

                            <button
                              onClick={() => {
                                setActiveMobileMenuId(null);
                                onDownloadFolderZip(file.folder_id, file.folder_name);
                              }}
                              className="w-full text-left px-3 py-2 text-gray-700 dark:text-gray-300 flex items-center gap-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/60"
                            >
                              <Archive size={14} /> Download ZIP
                            </button>
                          </>
                        )}

                        {!isFolder && (
                          <button
                            onClick={() => {
                              setActiveMobileMenuId(null);
                              openQrModal(file);
                            }}
                            disabled={select}
                            className="w-full text-left px-3 py-2 text-purple-600 dark:text-purple-400 flex items-center gap-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/60 disabled:opacity-50"
                          >
                            <Sparkles size={14} /> Get QR
                          </button>
                        )}

                        {!isFolder && isPrintable(file.mime_type) && (
                          <button
                            onClick={() => {
                              setActiveMobileMenuId(null);
                              handlePrintFile(file);
                            }}
                            disabled={select || isPrintFetching}
                            className="w-full text-left px-3 py-2 text-violet-600 dark:text-violet-400 flex items-center gap-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/60 disabled:opacity-50"
                          >
                            <Printer size={14} className={isPrintFetching ? 'animate-pulse' : ''} /> Print
                          </button>
                        )}

                        <button
                          onClick={() => {
                            setActiveMobileMenuId(null);
                            isFolder ? handleDeleteFolder(file.folder_id) : onDelete(file.id);
                          }}
                          disabled={select}
                          className="w-full text-left px-3 py-2 text-red-600 dark:text-red-400 flex items-center gap-2.5 hover:bg-gray-50 dark:hover:bg-gray-800/60 disabled:opacity-50"
                        >
                          <Trash2 size={14} /> Delete
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Infinite Scroll Bottom Sentinel */}
      <div ref={observerTarget} className="py-4 text-center flex items-center justify-center min-h-[50px]">
        {isFetchingMore && (
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
            <span className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            Loading more files...
          </div>
        )}
        {!hasMore && filterfiles.length > 0 && (
          <span className="text-xs text-gray-400 dark:text-gray-600 font-medium">
            You've reached the end of the list.
          </span>
        )}
      </div>

      {/* Shared Modals */}
      <EditFileModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        fileData={activeFile}
        expoFolder={expoFolder}
        onUpdateSuccess={onRefresh}
      />
      <PrinterManagerModal
        isOpen={isPrintModalOpen}
        onClose={() => {
          setIsPrintModalOpen(false);
          setPrintFile(null);
        }}
        pdfBlob={printFile?.blob}
        documentTitle={printFile?.name || 'Document'}
        allowFileUpload
      />

      {/* Thumbnail Reference Preview Modal */}
      {previewThumbnail && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={() => setPreviewThumbnail(null)}
        >
          <div
            className="relative max-w-lg w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-2xl p-4 flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-gray-200/80 dark:border-gray-800/80">
              <h3
                className="text-sm font-bold text-gray-800 dark:text-gray-100 truncate pr-2"
                title={previewThumbnail.file_name || previewThumbnail.original_name}
              >
                {previewThumbnail.file_name || previewThumbnail.original_name || 'Thumbnail Reference'}
              </h3>
              <button
                onClick={() => setPreviewThumbnail(null)}
                className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Preview Image Frame */}
            <div className="w-full min-h-[220px] max-h-[60vh] flex items-center justify-center overflow-hidden rounded-lg bg-gray-50 dark:bg-gray-950 p-2 border border-gray-200/60 dark:border-gray-800/60">
              <img
                src={previewThumbnail.thumbnail}
                alt={previewThumbnail.file_name || 'Thumbnail Preview'}
                className="max-w-full max-h-[55vh] object-contain rounded shadow-sm"
              />
            </div>

            {/* Footer Metadata & Actions */}
            <div className="flex justify-between items-center text-xs text-gray-500 dark:text-gray-400 pt-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-700 dark:text-gray-300">
                  {formatBytes(previewThumbnail.file_size)}
                </span>
                <span>•</span>
                <span>{getMimeLabel(previewThumbnail.mime_type)}</span>
              </div>
              <button
                onClick={() => {
                  performSecureDownload(previewThumbnail.id, previewThumbnail.original_name);
                  setPreviewThumbnail(null);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-lg text-xs transition-colors shadow-xs"
              >
                <Download size={14} /> Download Asset
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {qrModalFile && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
          onClick={closeQrModal}
        >
          <div
            className="relative max-w-sm w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header — gradient banner */}
            <div className="relative w-full px-5 py-4 bg-gradient-to-r from-purple-600 via-violet-600 to-blue-600 text-white overflow-hidden">
              {/* decorative dot grid */}
              <div
                className="absolute inset-0 opacity-15 pointer-events-none"
                style={{
                  backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
                  backgroundSize: '14px 14px',
                }}
              />
              <div className="relative flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="p-1.5 bg-white/15 rounded-lg backdrop-blur-sm">
                    <QrCode size={16} />
                  </span>
                  <h3 className="text-sm font-bold tracking-wide">Secure QR Download</h3>
                </div>
                <button
                  onClick={closeQrModal}
                  className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/15 transition-colors"
                  title="Close"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="p-6 flex flex-col items-center gap-4 text-center">
              {/* Network Tab Switcher */}
              <div className="w-full flex items-center gap-1 p-1 bg-gray-100 dark:bg-gray-800/70 rounded-xl">
                {Object.entries(QR_NETWORKS).map(([key, net]) => {
                  const isActive = qrNetworkTab === key;
                  const Icon = key === 'secure' ? Wifi : Shield;
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        setQrNetworkTab(key);
                        setIsLinkCopied(false);
                      }}
                      className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wide transition-all duration-150 ${
                        isActive
                          ? 'bg-white dark:bg-gray-900 text-purple-600 dark:text-purple-400 shadow-sm'
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                      }`}
                      title={`Use the ${net.label} network address (${net.host})`}
                    >
                      <Icon size={13} /> {net.label}
                    </button>
                  );
                })}
              </div>

              {/* QR Code Graphic */}
              <div className="relative p-5 bg-white rounded-2xl shadow-inner border border-gray-100 flex items-center justify-center min-h-[250px] w-full">
                {/* corner accents */}
                <span className="absolute top-2 left-2 w-4 h-4 border-t-2 border-l-2 border-purple-400/60 rounded-tl-md" />
                <span className="absolute top-2 right-2 w-4 h-4 border-t-2 border-r-2 border-purple-400/60 rounded-tr-md" />
                <span className="absolute bottom-2 left-2 w-4 h-4 border-b-2 border-l-2 border-purple-400/60 rounded-bl-md" />
                <span className="absolute bottom-2 right-2 w-4 h-4 border-b-2 border-r-2 border-purple-400/60 rounded-br-md" />

                {isGeneratingQr ? (
                  <div className="flex flex-col items-center gap-2 text-xs text-gray-500">
                    <span className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    Generating temporary secure link...
                  </div>
                ) : (
                  displayedQrUrl && (
                    <QRCodeSVG
                      value={displayedQrUrl}
                      size={200}
                      level="L"
                      includeMargin={false}
                      fgColor="#4c1d95"
                    />
                  )
                )}
              </div>

              {/* File Info */}
              <div className="w-full">
                <p
                  className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate"
                  title={qrModalFile.original_name || qrModalFile.file_name}
                >
                  {qrModalFile.original_name || qrModalFile.file_name}
                </p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-1">
                  {qrNetworkTab === 'secure'
                    ? 'For devices on the secure office/VPN network.'
                    : 'For devices on the local (LAN) network only.'}{' '}
                  Expires in 24 hours.
                </p>
              </div>

              {/* Copy Link Row */}
              <div className="w-full flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={isGeneratingQr ? 'Generating link…' : displayedQrUrl}
                  onFocus={(e) => e.target.select()}
                  className="flex-1 min-w-0 text-[11px] font-mono px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 text-gray-600 dark:text-gray-300 truncate focus:outline-none focus:ring-2 focus:ring-purple-500/40"
                />
                <button
                  onClick={handleCopyQrLink}
                  disabled={isGeneratingQr || !displayedQrUrl}
                  title="Copy secure link"
                  className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all duration-150 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed ${
                    isLinkCopied
                      ? 'bg-emerald-500 text-white'
                      : 'bg-purple-600 hover:bg-purple-500 text-white'
                  }`}
                >
                  {isLinkCopied ? (
                    <>
                      <Check size={14} /> Copied
                    </>
                  ) : (
                    <>
                      <Copy size={14} /> Copy
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}