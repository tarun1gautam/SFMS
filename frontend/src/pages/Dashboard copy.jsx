/**
 * Dashboard.jsx  (SFMS v2 — Enhanced with Path Access Counter)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/api';
import { baseURL } from '../utils/api';
import { toast } from 'react-hot-toast';
import { io } from 'socket.io-client';

import FileTable    from '../components/FileTable';
import { Copy, Scissors, ClipboardPaste, Archive, X, ArrowLeft, Home, Globe, Users, FolderPlus, CheckSquare, Square, UploadCloud, ChevronDown, KeyRound, LogOut, FileText, Folder, Loader2, Lock, Printer, Sparkles, UserCheck, Search, RefreshCw, AlertCircle } from 'lucide-react';
import ChangePasswordModal from '../components/modals/ChangePasswordModal';
import MfaSettingsModal from '../components/MfaSettingsModal';
import DakRegister from '../components/DakRegister';
import UploadModal  from '../components/modals/UploadModal';
import FolderModal  from '../components/modals/FolderModal';
import UserManagement from '../components/UserManagement';
import ToolsPanel from '../components/Toolspanel';
import NearbyShare from './NearbyShare';
import AdminDashboard from './AdminDashboard';
import FileChatWidget from '../components/chat/FileChatWidget';

import SearchBar    from '../components/SearchBar';
import SortDropdown from '../components/SortDropdown';
import FilterPanel  from '../components/FilterPanel';
import PrinterManagerModal from '../components/PrinterManagerModal';
import RecentWorkFilesModal from '../components/modals/RecentWorkFilesModal';

import useFileManager from '../hooks/useFileManager';
import Navbar from '../components/NavBar';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [stats, setStats]         = useState({ totalFiles: 0, totalStorageBytes: 0, topDownloadedFile: null });
  const [activeTab, setActiveTab] = useState('files');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isFolderOpen, setIsFolderOpen] = useState(false);
  const [select, setSelect] = useState(false);
  const [expoFolder, setExpoFolder] = useState(null);
  const [activeExpo, setActiveExpo] = useState("root");
  const [isDeleting, setIsDeleting] = useState(false);
  const [fileCount, setFileCount] = useState(1);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isMfaSettingsOpen, setIsMfaSettingsOpen] = useState(false);
  const [isMfaEnabled, setIsMfaEnabled] = useState(user?.is_mfa_enabled || false);

  // Path Access State
  const [accessibleUsers, setAccessibleUsers] = useState([]);
  const [isUsersLoading, setIsUsersLoading] = useState(false);
  const [showUsersModal, setShowUsersModal] = useState(false);
  // ── Access & Permissions modal metadata (NEW — minimal, additive) ──────
  // Holds the backend's contextual response (public / shared / private /
  // normal) so the modal can represent it faithfully instead of collapsing
  // everything down to accessibleUsers.length.
  const [usersAccessInfo, setUsersAccessInfo] = useState({ count: 0, message: '', path: '' });
  const [usersModalError, setUsersModalError] = useState(false);
  const [usersSearchQuery, setUsersSearchQuery] = useState('');

  useEffect(() => {
    setIsMfaEnabled(user?.is_mfa_enabled || false);
  }, [user?.is_mfa_enabled]);

  const [isPasting, setIsPasting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pasteProgress, setPasteProgress] = useState(0);
  const [pasteStatusText, setPasteStatusText] = useState('');

  const [isPrintOpen, setIsPrintOpen] = useState(false);
  const [testPrintBlob, setTestPrintBlob] = useState(null);

  const [showRecentWorkModal, setShowRecentWorkModal] = useState(false);
  const [pendingUploadFiles, setPendingUploadFiles] = useState(null);
  const [isPrintFetching, setIsPrintFetching] = useState(false);

  const [unreadCount, setUnreadCount] = useState(0);

  const navigate = useNavigate();
  const location = useLocation();

  const setFolder = (newPath) => {
    if (expoFolder === newPath) return;
    fm.setLoading(true);
    navigate(`/dashboard?path=${encodeURIComponent(newPath)}`);
  };

  const fm = useFileManager();

  // Fetch count in background when path changes
const fetchUsersCountForPath = useCallback(async (pathToUse) => {
  try {
    const path = (pathToUse && pathToUse.trim() !== "") ? pathToUse : user?.base_path || "/";
    const res = await api.get(`/general/users-by-path?path=${encodeURIComponent(path)}`);
    
    setAccessibleUsers(res.data.users || []);
    // Update usersAccessInfo with backend response count and details
    setUsersAccessInfo({
      count: res.data.count ?? 0,
      message: res.data.message || '',
      path: path,
    });
  } catch (err) {
    console.error('Failed to fetch path access count:', err);
  }
}, [user?.base_path]);

  // Fetch users with access to current folder modal view
  const fetchUsersForPath = async () => {
    const pathToUse = (expoFolder && expoFolder.trim() !== "") ? expoFolder : user?.base_path || "/";
    setIsUsersLoading(true);
    setUsersModalError(false);
    setUsersSearchQuery('');
    setShowUsersModal(true);
    try {
      const res = await api.get(`/general/users-by-path?path=${encodeURIComponent(pathToUse)}`);
      setAccessibleUsers(res.data.users || []);
      setUsersAccessInfo({
        count: res.data.count,
        message: res.data.message || '',
        path: pathToUse,
      });
    } catch (err) {
      console.error('Failed to fetch users for path:', err);
      toast.error('Could not retrieve user list for this location.');
      setUsersModalError(true);
    } finally {
      setIsUsersLoading(false);
    }
  };

  // Escape-to-close for the Access & Permissions modal (isolated to this
  // modal only — does not touch any other modal's behavior).
  useEffect(() => {
    if (!showUsersModal) return;
    const onKeyDown = (e) => { if (e.key === 'Escape') setShowUsersModal(false); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [showUsersModal]);

  useEffect(() => {
    fetchUsersCountForPath(expoFolder);
  }, [expoFolder, fetchUsersCountForPath]);

  useEffect(() => {
    let cancelled = false;
    const loadFolder = async () => {
      setIsLoading(true);
      try {
        const pathToUse = (expoFolder && expoFolder.trim() !== "") ? expoFolder : user.base_path;
        const res = await api.get('/folders/resolve', { params: { folder_path: pathToUse } });
        if (cancelled) return;

        const folderId = res.data.folder_id;
        fm.setCurrentFolderId(folderId);
        fm.setCurrentPage(1);

        await Promise.all([
          fm.fetchFolders(expoFolder),
          fm.fetchFiles(1, folderId),
        ]);

        if (!cancelled) fm.setLoading(false);
      } catch (err) {
        if (!cancelled) console.error('Failed to load folder:', err);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };
    loadFolder();
    if (expoFolder) {
      if (expoFolder.startsWith("/public/")) {
        setActiveExpo("public");
      } else if (expoFolder.startsWith("/shared/")) {
        setActiveExpo("shared");
      } else {
        if (expoFolder.startsWith(user.base_path)) {
          setActiveExpo("root");
        }
      }
    }
    return () => { cancelled = true; };
  }, [expoFolder]);

  useEffect(() => {
    setIsLoading(true);
    if (!fm.currentFolderId) return;
    fm.fetchFiles(fm.currentPage, fm.currentFolderId);
    setIsLoading(false);
  }, [fm.currentPage]);

  useEffect(() => {
    fetchStats();
    fm.fetchUploaders();
  }, []);

  useEffect(() => {
    if (isDeleting || !user?.base_path) return;
    const params = new URLSearchParams(location.search);
    const pathFromUrl = params.get('path');
    if (pathFromUrl) {
      const decoded = decodeURIComponent(pathFromUrl);
      if (decoded.startsWith(user.base_path) || decoded.startsWith('/public/') || decoded.startsWith('/shared/') || activeExpo === "shared") {
        setExpoFolder(decoded);
      } else {
        setFolder(user.base_path);
        setActiveExpo("root");
      }
    } else {
      setFolder(user.base_path);
    }
  }, [location.search, isDeleting, user?.base_path]);

  useEffect(() => {
    let socket;

    const fetchUnreadCount = async () => {
      try {
        const res = await api.get('/messages/unread-count');
        setUnreadCount(res.data.count || 0);
      } catch (err) {
        console.error('Failed to fetch unread message count:', err);
      }
    };

    fetchUnreadCount();

    const token = localStorage.getItem('sfms_token');
    if (token) {
      socket = io(baseURL, {
        auth: { token },
        transports: ['websocket', 'polling'],
      });

      socket.on('new_message', () => {
        if (activeTab !== 'chat') {
          setUnreadCount((prev) => prev + 1);
        }
      });
    }

    return () => {
      if (socket) socket.disconnect();
    };
  }, [activeTab]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'chat') {
      setUnreadCount(0);
    }
  };

  const refreshData = () => {
    fm.fetchFiles(fm.currentPage, fm.currentFolderId);
    fm.fetchUploaders();
    fm.fetchFolders(expoFolder);
    fetchStats();
    fetchUsersCountForPath(expoFolder);
  };

  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/files/stats');
      setStats(res.data);
    } catch (err) {
      console.error('Failed to pull system stats', err);
    }
  }, []);

  const handleTogglePin = async (fileId) => {
    try {
      const res = await api.patch(`/files/${fileId}/pin`);
      fm.fetchFiles(fm.currentPage);
      toast.success(res.data.file.is_pinned ? 'Asset pinned to terminal header.' : 'Asset unpinned.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Action rejected.');
    }
  };

  const handleTogglePinFolder = async (folderId) => {
    try {
      const res = await api.put(`/folders/${folderId}/pin`);
      fm.fetchFolders(expoFolder);
      toast.success(res.data?.folder?.is_pinned ? 'Folder pinned to top.' : 'Folder unpinned.');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to toggle folder pin.');
    }
  };

  const handleDeleteFile = async (fileId) => {
    if (!window.confirm('Are you sure you want to permanently erase this asset from disk storage?')) return;
    setIsDeleting(true);
    try {
      await api.delete(`/files/${fileId}`);
      toast.success('Asset deleted successfully.');
      fm.fetchFiles(fm.currentPage);
      fetchStats();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erase operation failed.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleDownloadFile = (fileId, originalName, mode = 'download') => {
    const token = localStorage.getItem('sfms_token');
    const downloadUrl = `${baseURL}/files/download/${fileId}?token=${token}${mode === 'view' ? '&mode=view' : ''}`;

    if (mode === 'view') {
      window.open(downloadUrl, '_blank');
    } else {
      const link = document.createElement('a');
      link.href = downloadUrl;
      link.setAttribute('download', originalName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const fetchSecureDownloadLink = async (fileId, duration = '24h') => {
    try {
      const res = await api.post(`/files/${fileId}/download-token`, { duration });
      return res.data.downloadUrl; 
    } catch (err) {
      toast.error('Failed to generate download token');
    }
  };

  const selectedCount = fm.selectedFileIds.size + fm.selectedFolderIds.size;

  const handleDownloadFolderZip = (folderId) => {
    const token = localStorage.getItem('sfms_token');
    const url = `${baseURL}/folders/download-zip/${folderId}?token=${token}`;
    window.open(url, '_blank');
    setTimeout(() => { if (typeof fetchStats === 'function') fetchStats(); }, 1500);
  };

  const handlePaste = async () => {
    if (isPasting) return;
    if (!fm.clipboard || !fm.currentFolderId) return;

    const { mode, fileIds = [], folderIds = [] } = fm.clipboard;
    const verb = mode === 'copy' ? 'copied' : 'moved';
    const totalItems = fileIds.length + (mode === 'cut' ? folderIds.length : 0);

    if (totalItems === 0) return;

    setIsPasting(true);
    setPasteProgress(0);

    let processedCount = 0;

    const updateProgress = (completedItemCount, statusText) => {
      const percent = Math.min(100, Math.round((completedItemCount / totalItems) * 100));
      setPasteProgress(percent);
      setPasteStatusText(statusText);
    };

    try {
      if (fileIds.length > 0) {
        updateProgress(processedCount, `Processing files (${fileIds.length})...`);
        const endpoint = mode === 'copy' ? '/files/copy' : '/files/move';
        
        const res = await api.post(endpoint, { 
          fileIds, 
          target_folder_id: fm.currentFolderId 
        });

        if (res.data.skipped?.length > 0) {
          res.data.skipped.forEach(s => toast.error(`Skipped a file: ${s.reason}`));
        }

        processedCount += fileIds.length;
        updateProgress(processedCount, `Completed files processing...`);
      }

      if (folderIds.length > 0) {
        if (mode === 'cut') {
          for (let i = 0; i < folderIds.length; i++) {
            const folderId = folderIds[i];
            updateProgress(processedCount, `Moving folder ${i + 1} of ${folderIds.length}...`);

            try {
              await api.put(`/folders/move/${folderId}`, { target_parent_path: expoFolder });
            } catch (err) {
              toast.error(err.response?.data?.error || `Folder ID ${folderId} could not be moved.`);
            }

            processedCount += 1;
            updateProgress(processedCount, `Moved folder ${i + 1} of ${folderIds.length}`);
          }
        } else {
          toast.error('Copying folders is not supported yet — only files can be copied. Folders were skipped.');
        }
      }

      updateProgress(totalItems, 'Pasting complete!');
      toast.success(`Items ${verb} successfully.`);

    } catch (err) {
      console.error('Paste operation failed:', err);
      toast.error(err.response?.data?.error || 'Paste operation failed.');
    } finally {
      setTimeout(() => {
        setIsPasting(false);
        setPasteProgress(0);
        setPasteStatusText('');

        fm.clearClipboard();
        fm.clearSelection();
        if (typeof setSelect === 'function') setSelect(false);
        if (typeof refreshData === 'function') refreshData();
      }, 400);
    }
  };

  const handleBatchDelete = async () => {
    const fileIds = Array.from(fm.selectedFileIds);

    if (fileIds.length === 0) {
      toast.error('Select at least one file to delete.');
      return;
    }

    const confirmMsg = `Are you sure you want to permanently delete ${fileIds.length} file(s)?`;
    if (!window.confirm(confirmMsg)) return;

    setIsDeleting(true);
    try {
      const res = await api.post('/files/batch-delete', { fileIds });
      toast.success(res.data.message || `${fileIds.length} file(s) deleted.`);
      
      if (res.data.skipped?.length > 0) {
        res.data.skipped.forEach((s) => toast.error(`Skipped item: ${s.reason}`));
      }

      fm.clearSelection();
      refreshData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Batch delete failed.');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleNavigateBack = () => {
    if (expoFolder === user.base_path) return;
    if (location.key !== 'default') {
      navigate(-1);
    } else {
      setFolder(user.base_path);
      setActiveExpo("root");
    }
  };

  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const isFiltered = fm.activeFilterCount > 0 || !!fm.searchTerm;

  const generateTestPdfBlob = () => {
    const base64Pdf = `JVBERi0xLjQKMSAwIG9iago8PC9UeXBlIC9DYXRhbG9nIC9QYWdlcyAyIDAgUj4+CmVuZG9iagoyIDAgb2JqCjw8L1R5cGUgL1BhZ2VzIC9LaWRzIFszIDAgUl0gL0NvdW50IDE+PgplbmRvYmoKMyAwIG9iago8PC9UeXBlIC9QYWdlIC9QYWdlbnQgMiAwIFIgL01lZGlhQm94IFswIDAgNjEyIDc5Ml0gL0NvbnRlbnRzIDQgMCBSIC9SZXNvdXJjZXMgPDwvRm9udCA8PC9GMSA1IDAgUj4+Pj4+PgplbmRvYmoKNCAwIG9iago8PC9MZW5ndGggNTM+PgpzdHJlYW0KQlQgL0YxIDI0IFRmIDEwMCA3MDAgVGQgKFNGTVMgVGVzdCBQcmludCkgVGogRVQKZW5kc3RyZWFtCmVuZG9iago1IDAgb2JqCjw8L1R5cGUgL0ZvbnQgL1N1YnR5cGUgL1R5cGUxIC9CYXNlRm9udCAvSGVsdmV0aWNhPj4KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKMDAwMDAwMDI0NSAwMDAwMCBuIAowMDAwMDAwMzQ4IDAwMDAwIG4gCnRyYWlsZXIKPDwvU2l6ZSA2IC9Sb290IDEgMCBSPj4Kc3RhcnR4cmVmCjQxOAolJUVPRg==`;
    const byteCharacters = atob(base64Pdf);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: 'application/pdf' });
  };

  const SkeletonRows = () => (
    <>
      {[...Array(6)].map((_, i) => (
        <tr key={i} className="border-b border-gray-200/40 dark:border-gray-800/40">
          {[...Array(6)].map((_, j) => (
            <td key={j} className="py-4 px-4">
              <div
                className="h-3 rounded-full bg-gradient-to-r from-gray-200/70 dark:from-gray-800/70 via-gray-300/50 dark:via-gray-700/50 to-gray-200/70 dark:to-gray-800/70 bg-[length:200%_100%] animate-[shimmer_1.6s_infinite]"
                style={{ width: `${55 + Math.random() * 35}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );

  // ── Access & Permissions modal helpers (NEW — pure, no new component) ──
  const getUserInitials = (userId = '') => {
    const str = String(userId).trim();
    if (!str) return '?';
    const spaceParts = str.split(/\s+/).filter(Boolean);
    if (spaceParts.length >= 2) return (spaceParts[0][0] + spaceParts[1][0]).toUpperCase();
    return str.charAt(0).toUpperCase();
  };

  const isPublicAccess  = usersAccessInfo.count === 'All' || usersAccessInfo.message === 'ALL users have access to this path';
  const isSharedAccess  = usersAccessInfo.message === 'Currently online users';
  const isPrivateAccess = usersAccessInfo.message === 'Private folder access list';

  const filteredAccessibleUsers = usersSearchQuery.trim()
    ? accessibleUsers.filter(u => String(u.user_id || '').toLowerCase().includes(usersSearchQuery.trim().toLowerCase()))
    : accessibleUsers;

  return (
    <div className="min-h-screen bg-canvas dark:bg-gray-950 text-ink dark:text-gray-100 flex flex-col font-sans selection:bg-blue-600/40">

      {/* Navbar */}
      <Navbar 
        stats={stats}
        formatBytes={formatBytes}
        isAdmin={isAdmin}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        user={user}
        logout={logout}
        setIsChangePasswordOpen={setIsChangePasswordOpen}
        setIsMfaSettingsOpen={setIsMfaSettingsOpen}
      />

      {/* Main Content */}
      <main className="flex-1 p-3 sm:p-6 space-y-5 max-w-[1800px] w-full mx-auto">

        {/* Tab Bar + Actions */}
        <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-2.5 sm:gap-3 bg-surface dark:bg-gray-900 p-2.5 sm:p-3.5 border border-line dark:border-gray-800 rounded-2xl shadow-sm shadow-gray-200/60 dark:shadow-none">
          <div className="flex sm:inline-flex w-full sm:w-auto items-center bg-surface-alt dark:bg-gray-950/80 p-1 rounded-xl border border-line dark:border-gray-800/80 gap-1 overflow-x-auto scrollbar-none">
            <button
              onClick={() => setActiveTab('files')}
              className={`flex-1 sm:flex-initial text-center px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'files'
                  ? 'bg-blue-600 text-white shadow shadow-blue-600/20'
                  : 'text-subtle dark:text-gray-400 hover:text-ink dark:hover:text-white hover:bg-white dark:hover:bg-gray-800/60'
              }`}
            >
              File System
            </button>

            <button
              onClick={() => setActiveTab('dak_register')}
              className={`flex-1 sm:flex-initial text-center px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'dak_register'
                  ? 'bg-blue-600 text-white shadow shadow-blue-600/20'
                  : 'text-subtle dark:text-gray-400 hover:text-ink dark:hover:text-white hover:bg-white dark:hover:bg-gray-800/60'
              }`}
            >
              Dak Register
            </button>

            <button
              onClick={() => setActiveTab('share')}
              className={`flex-1 sm:flex-initial text-center px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'share'
                  ? 'bg-blue-600 text-white shadow shadow-blue-600/20'
                  : 'text-subtle dark:text-gray-400 hover:text-ink dark:hover:text-white hover:bg-white dark:hover:bg-gray-800/60'
              }`}
            >
              Nearby Share
            </button>

            <button
              onClick={() => setActiveTab('chat')}
              className={`flex-1 sm:flex-initial text-center px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'chat'
                  ? 'bg-blue-600 text-white shadow shadow-blue-600/20'
                  : 'text-subtle dark:text-gray-400 hover:text-ink dark:hover:text-white hover:bg-white dark:hover:bg-gray-800/60'
              }`}
            >
              File Chat
            </button>

            <button
              onClick={() => handleTabChange('tools')}
              className={`flex items-center justify-center gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'tools'
                  ? 'bg-blue-600 text-white shadow shadow-blue-600/20'
                  : 'text-subtle dark:text-gray-400 hover:text-ink dark:hover:text-white hover:bg-white dark:hover:bg-gray-800/60'
              }`}
            >
              <span>Utility Engine</span>
              {unreadCount > 0 && (
                <span className="flex items-center justify-center min-w-[18px] h-4.5 px-1.5 text-[10px] font-bold text-white bg-red-500 rounded-full shadow-sm">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
          </div>

          <div className="grid grid-cols-3 sm:flex sm:flex-wrap items-center justify-end gap-1.5 sm:gap-2">
            {(activeTab === 'files' &&
              expoFolder !== "/" &&
              (expoFolder || '').toLowerCase() !== '/shared/'
            ) && (
              <button
                onClick={() => setIsUploadOpen(true)}
                className="flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-5 py-1.5 sm:py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-[11px] sm:text-sm font-semibold rounded-xl shadow-md shadow-blue-600/20 transition-all cursor-pointer active:scale-[0.98]"
              >
                <UploadCloud size={15} strokeWidth={2.3} className="shrink-0" />
                <span className="truncate">Deploy File</span>
              </button>
            )}

            {activeTab === 'files' && (
              <button
                onClick={() => setShowRecentWorkModal(true)}
                className="group relative flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-5 py-1.5 sm:py-2.5 overflow-hidden bg-gradient-to-r from-indigo-600 via-purple-600 to-blue-600 hover:from-indigo-500 hover:via-purple-500 hover:to-blue-500 text-white text-[11px] sm:text-sm font-semibold rounded-xl border border-white/10 shadow-md shadow-purple-600/25 transition-all duration-300 cursor-pointer active:scale-[0.98] hover:shadow-purple-500/40 hover:shadow-xl"
              >
                <span className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 ease-in-out bg-gradient-to-r from-transparent via-white/25 to-transparent" />
                <Sparkles size={14} className="relative shrink-0 animate-pulse" strokeWidth={2.3} />
                <span className="relative truncate">Fetch Work</span>
              </button>
            )}

            {activeTab === 'files' && (
              <button
                onClick={() => {
                  setTestPrintBlob(generateTestPdfBlob());
                  setIsPrintOpen(true);
                }}
                className="flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-5 py-1.5 sm:py-2.5 bg-field dark:bg-gray-800 hover:bg-line dark:hover:bg-gray-700 text-subtle dark:text-white text-[11px] sm:text-sm font-semibold rounded-xl border border-line dark:border-gray-700 shadow-sm transition-all cursor-pointer active:scale-[0.98]"
              >
                <Printer size={15} strokeWidth={2.3} className="shrink-0" />
                <span className="truncate">Print Center</span>
              </button>
            )}
          </div>
        </div>

        {/* Main Content Card */}
        <div className="bg-surface dark:bg-gray-900 border border-line dark:border-gray-800 rounded-2xl shadow-md shadow-gray-200/50 dark:shadow-2xl">
          {activeTab === 'files' ? (
            <>
              {/* Toolbar */}
              <div className="px-4 py-3 border-b border-gray-200/80 dark:border-gray-800/80 bg-white/80 dark:bg-gray-900/60 rounded-t-2xl backdrop-blur-sm relative z-30">
                <div className="flex items-center gap-1.5 sm:gap-3 flex-nowrap w-full">
                  <div className="flex-1 min-w-0">
                    <SearchBar
                      searchTerm={fm.searchTerm}
                      setSearchTerm={fm.setSearchTerm}
                      searchField={fm.searchField}
                      setSearchField={fm.setSearchField}
                      clearSearch={fm.clearSearch}
                    />
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    <div className="shrink-0">
                      <SortDropdown
                        sortField={fm.sortField}
                        sortOrder={fm.sortOrder}
                        onSortChange={fm.handleSortChange}
                        setSortOrder={fm.setSortOrder}
                        isOpen={fm.sortDropOpen}
                        setIsOpen={fm.setSortDropOpen}
                      />
                    </div>

                    <div className="shrink-0">
                      <FilterPanel
                        filters={fm.filters}
                        updateFilter={fm.updateFilter}
                        resetFilters={fm.resetFilters}
                        activeFilterCount={fm.activeFilterCount}
                        uploaders={fm.uploaders}
                        isOpen={fm.filterPanelOpen}
                        setIsOpen={fm.setFilterPanelOpen}
                      />
                    </div>
                  </div>
                </div>

                {isFiltered && (
                  <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mt-2.5 sm:mt-3 pt-2 border-t border-line/60 dark:border-gray-800/60 sm:border-0 sm:pt-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-500 shrink-0">
                      Active:
                    </span>

                    {fm.searchTerm && (
                      <span className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-400 text-[10px] font-semibold max-w-[160px] sm:max-w-none">
                        <span className="truncate">🔍 "{fm.searchTerm}"</span>
                        <button onClick={fm.clearSearch} className="hover:text-ink dark:hover:text-white cursor-pointer ml-0.5 shrink-0">×</button>
                      </span>
                    )}

                    {fm.filters.visibility && (
                      <span className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-700 dark:text-purple-400 text-[10px] font-semibold">
                        <span>Visibility: {fm.filters.visibility}</span>
                        <button onClick={() => fm.updateFilter('visibility', '')} className="hover:text-ink dark:hover:text-white cursor-pointer ml-0.5 shrink-0">×</button>
                      </span>
                    )}

                    {fm.filters.fileType && (
                      <span className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-700 dark:text-purple-400 text-[10px] font-semibold">
                        <span>Type: {fm.filters.fileType.toUpperCase()}</span>
                        <button onClick={() => fm.updateFilter('fileType', '')} className="hover:text-ink dark:hover:text-white cursor-pointer ml-0.5 shrink-0">×</button>
                      </span>
                    )}

                    {fm.filters.uploader && (
                      <span className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-700 dark:text-purple-400 text-[10px] font-semibold max-w-[130px] sm:max-w-none">
                        <span className="truncate">By: {fm.filters.uploader}</span>
                        <button onClick={() => fm.updateFilter('uploader', '')} className="hover:text-ink dark:hover:text-white cursor-pointer ml-0.5 shrink-0">×</button>
                      </span>
                    )}

                    {(fm.filters.dateFrom || fm.filters.dateTo) && (
                      <span className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-700 dark:text-purple-400 text-[10px] font-semibold">
                        <span>Date: {fm.filters.dateFrom || '…'} → {fm.filters.dateTo || '…'}</span>
                        <button onClick={() => { fm.updateFilter('dateFrom', ''); fm.updateFilter('dateTo', ''); }} className="hover:text-ink dark:hover:text-white cursor-pointer ml-0.5 shrink-0">×</button>
                      </span>
                    )}

                    {(fm.filters.sizeMinMB !== '' || fm.filters.sizeMaxMB !== '') && (
                      <span className="inline-flex items-center gap-1 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-700 dark:text-purple-400 text-[10px] font-semibold">
                        <span>Size: {fm.filters.sizeMinMB || '0'}–{fm.filters.sizeMaxMB || '∞'} MB</span>
                        <button onClick={() => { fm.updateFilter('sizeMinMB', ''); fm.updateFilter('sizeMaxMB', ''); }} className="hover:text-ink dark:hover:text-white cursor-pointer ml-0.5 shrink-0">×</button>
                      </span>
                    )}

                    <button
                      onClick={() => { fm.resetFilters(); fm.clearSearch(); }}
                      className="text-[10px] text-faint dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors cursor-pointer underline underline-offset-2 ml-1 shrink-0"
                    >
                      Clear all
                    </button>

                    <span className="w-full sm:w-auto sm:ml-auto text-right text-[10px] text-gray-500 dark:text-gray-500 mt-1 sm:mt-0 font-medium">
                      {fm.files.length} result{fm.files.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
              </div>

              {/* Sticky Operations Zone */}
              <div className="sticky top-[0px] z-20 bg-surface dark:bg-gray-900 overflow-hidden">
                {/* Selection Toolbar */}
                {((selectedCount > 0 || fm.clipboard) && (expoFolder !== "/public/") && (expoFolder !== "/shared/") && ((expoFolder !== "/"))) && (
                  <div className="flex flex-wrap items-center gap-2 px-3 py-2 sm:px-4 sm:py-2.5 border-b border-gray-200/80 dark:border-gray-800/80 bg-blue-500/[0.06]">
                    {selectedCount > 0 && (
                      <>
                        <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                          {selectedCount} selected
                        </span>
                        <button
                          onClick={() => fm.copyToClipboard('copy')}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 text-xs font-medium text-subtle dark:text-gray-300 hover:text-ink dark:hover:text-white bg-field dark:bg-gray-800 hover:bg-line dark:hover:bg-gray-700 border border-line dark:border-gray-700 rounded-lg transition-all cursor-pointer"
                          title="Copy selected items"
                        >
                          <Copy size={14} /> <span className="hidden sm:inline">Copy</span>
                        </button>
                        <button
                          onClick={() => fm.copyToClipboard('cut')}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 text-xs font-medium text-subtle dark:text-gray-300 hover:text-ink dark:hover:text-white bg-field dark:bg-gray-800 hover:bg-line dark:hover:bg-gray-700 border border-line dark:border-gray-700 rounded-lg transition-all cursor-pointer"
                          title="Cut selected items (move)"
                        >
                          <Scissors size={14} /> <span className="hidden sm:inline">Cut</span>
                        </button>
                        <button
                          onClick={handleBatchDelete}
                          disabled={isDeleting}
                          className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-red-600 dark:text-red-400 hover:text-white bg-red-500/10 hover:bg-red-600 border border-red-500/20 dark:border-red-500/30 rounded-lg transition-all cursor-pointer disabled:opacity-50"
                          title="Permanently delete selected files"
                        >
                          {isDeleting ? <Loader2 size={14} className="animate-spin" /> : <X size={14} />}
                          <span>Delete ({selectedCount})</span>
                        </button>
                        <button
                          onClick={fm.clearSelection}
                          className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-faint dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-all cursor-pointer ml-auto sm:ml-0"
                          title="Clear selection"
                        >
                          <X size={14} />
                        </button>
                      </>
                    )}

                    {fm.clipboard && (
                      <div className="flex items-center gap-2 ml-auto">
                        <span className="text-[10px] text-gray-500 dark:text-gray-500 truncate max-w-[110px] sm:max-w-none">
                          {fm.clipboard.mode === 'copy' ? 'Copying' : 'Moving'}{' '}
                          {fm.clipboard.fileIds.length + fm.clipboard.folderIds.length} item(s)
                        </span>
                        <button
                          onClick={handlePaste}
                          className="flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-all cursor-pointer shrink-0"
                          title="Paste into current folder"
                        >
                          <ClipboardPaste size={14} /> <span className="hidden sm:inline">Paste here</span>
                        </button>
                        <button
                          onClick={fm.clearClipboard}
                          className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-faint dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 transition-all cursor-pointer shrink-0"
                          title="Cancel clipboard"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Path / Navigation Bar */}
                <div className="w-full bg-surface-alt dark:bg-gray-950/60 border-b border-line dark:border-gray-800 px-3 py-2 sm:px-4 sm:py-2.5 flex items-center gap-1.5 sm:gap-2">
  <div className="flex items-center gap-0.5 pr-1.5 sm:pr-2.5 border-r border-gray-200 dark:border-gray-800 shrink-0">
    <button
      onClick={() => { handleNavigateBack(); }}
      className="p-1.5 text-subtle dark:text-gray-400 hover:text-ink dark:hover:text-white hover:bg-field dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700 rounded-lg transition-all duration-150 cursor-pointer active:scale-90"
      title="Go Back"
    >
      <ArrowLeft size={16} />
    </button>

    <button
      onClick={() => { setFolder(user.base_path); setActiveExpo("root"); }}
      className={`p-1.5 rounded-lg transition-all duration-150 cursor-pointer active:scale-90 ${
        activeExpo === "root"
          ? "text-white bg-blue-600/90 shadow shadow-blue-600/20 active:bg-blue-700"
          : "text-subtle dark:text-gray-400 hover:text-ink dark:hover:text-white hover:bg-field dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700"
      }`}
      title="Root Directory"
    >
      <Home size={16} />
    </button>

    <button
      onClick={() => { setFolder("/public/"); setActiveExpo("public"); }}
      className={`p-1.5 rounded-lg transition-all duration-150 cursor-pointer active:scale-90 ${
        activeExpo === "public"
          ? "text-white bg-blue-600/90 shadow shadow-blue-600/20 active:bg-blue-700"
          : "text-subtle dark:text-gray-400 hover:text-ink dark:hover:text-white hover:bg-field dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700"
      }`}
      title="Public Directory"
    >
      <Globe size={16} />
    </button>

    <button
      onClick={() => { setFolder("/shared/"); setActiveExpo("shared"); }}
      className={`p-1.5 rounded-lg transition-all duration-150 cursor-pointer active:scale-90 ${
        activeExpo === "shared"
          ? "text-white bg-blue-600/90 shadow shadow-blue-600/20 active:bg-blue-700"
          : "text-subtle dark:text-gray-400 hover:text-ink dark:hover:text-white hover:bg-field dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700"
      }`}
      title="Shared With Me"
    >
      <Users size={16} />
    </button>
  </div>

  <span className="hidden sm:inline text-faint dark:text-gray-600 text-[10px] font-bold uppercase tracking-widest shrink-0">Loc:</span>
  <span className="text-blue-700 dark:text-blue-400 font-mono text-xs sm:text-[13px] truncate select-none flex-1 min-w-[60px] sm:min-w-[100px] bg-field dark:bg-transparent px-1.5 py-0.5 rounded-md text-left [direction:rtl]">
    <bdi>{expoFolder || "/"}</bdi>
  </span>

  {/* Standardized Metadata Group (Files, Folders, and Users with Access) */}
  <span className="hidden sm:flex items-center gap-3 text-[11px] text-gray-500 dark:text-gray-500 font-medium shrink-0 border-l border-gray-200 dark:border-gray-800 pl-3">
    <span className="flex items-center gap-1" title="Files in this folder">
      <FileText size={13} className="text-gray-400 dark:text-gray-600" />
      {fm.pagination.total ?? fm.files.length}
    </span>
    <span className="flex items-center gap-1" title="Subfolders in this folder">
      <Folder size={13} className="text-gray-400 dark:text-gray-600" />
      {fm.folders.length - 1}
    </span>
    <button
  onClick={fetchUsersForPath}
  className="flex items-center gap-1 text-gray-500 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
  title="Click to view users with access to this location"
>
  <UserCheck size={13} className="text-blue-600 dark:text-blue-400" />
  <span>{usersAccessInfo.count ?? 0}</span>
</button>
  </span>

  {(fileCount > 0 || select) && (
    <button
      onClick={() => {
        setSelect((pv) => {
          if (pv) {
            fm.clearSelection();
          }
          return !pv;
        });
      }}
      className={`flex items-center gap-1 sm:gap-1.5 px-2 py-1.5 sm:px-3 text-xs font-medium border rounded-lg transition-all cursor-pointer shrink-0 ${
        select
          ? 'text-white bg-blue-600 hover:bg-blue-700 border-blue-500 shadow-sm'
          : 'text-subtle dark:text-gray-300 hover:text-ink dark:hover:text-white bg-field dark:bg-gray-800 hover:bg-line dark:hover:bg-gray-700 border-line dark:border-gray-700'
      }`}
    >
      {select ? <CheckSquare size={14} /> : <Square size={14} />}
      <span className="hidden sm:inline">Select</span>
    </button>
  )}

  {((expoFolder?.toLowerCase() !== "/public/") && (expoFolder !== "/" || isAdmin) && (expoFolder !== "/shared/")) && (
    <button
      onClick={() => { setIsFolderOpen(true); }}
      className="flex items-center gap-1 sm:gap-1.5 px-2 py-1.5 sm:px-3 text-xs font-medium text-subtle dark:text-gray-300 hover:text-ink dark:hover:text-white bg-field dark:bg-gray-800 hover:bg-line dark:hover:bg-gray-700 border border-line dark:border-gray-700 rounded-lg transition-all cursor-pointer shrink-0"
      title="New Folder"
    >
      <FolderPlus size={15} />
      <span className="hidden sm:inline">New Folder</span>
    </button>
  )}
</div>
              </div>

              {/* Table & Pagination Content */}
              <div className="rounded-b-2xl overflow-hidden">
                {fm.loading || isLoading ? (
                  <div className="w-full overflow-x-auto">
                    <table className="w-full border-collapse min-w-[900px]">
                      <tbody><SkeletonRows /></tbody>
                    </table>
                  </div>
                ) : (
                  <FileTable
                    files={fm.files}
                    onPin={handleTogglePin}
                    onPinFolder={handleTogglePinFolder}
                    onDelete={handleDeleteFile}
                    onDownload={handleDownloadFile}
                    fetchSecureLink={fetchSecureDownloadLink}
                    sortField={fm.sortField}
                    sortOrder={fm.sortOrder}
                    onSortChange={fm.handleSortChange}
                    isFiltered={isFiltered}
                    onRefresh={refreshData}
                    user={user}
                    folders={fm.folders}
                    expoFolder={expoFolder}
                    setFolder={setFolder}
                    isDeleting={isDeleting}
                    setIsDeleting={setIsDeleting}
                    currentFolderId={fm.currentFolderId}
                    searchTerm={fm.searchTerm}
                    setLoading={fm.setLoading}
                    loading={fm.loading}
                    selectedFileIds={fm.selectedFileIds}
                    selectedFolderIds={fm.selectedFolderIds}
                    onToggleFileSelect={fm.toggleFileSelect}
                    onToggleFolderSelect={fm.toggleFolderSelect}
                    onDownloadFolderZip={handleDownloadFolderZip}
                    select={select}
                    setFileCount={setFileCount}
                    isAdmin={isAdmin}
                    isPrintFetching={isPrintFetching}
                    setIsPrintFetching={setIsPrintFetching}
                    isLoading={isLoading}
                  />
                )}

                {fm.pagination.totalPages > 1 && (
                  <div className="px-6 py-4 bg-gray-100 dark:bg-gray-900 border-t border-gray-200/60 dark:border-gray-800/60 flex items-center justify-between">
                    <span className="text-xs text-gray-600 dark:text-gray-400">
                      Showing Page <span className="text-gray-800 dark:text-gray-200 font-semibold">{fm.pagination.page}</span> of {fm.pagination.totalPages}
                      <span className="ml-2 text-gray-400 dark:text-gray-600">({fm.pagination.total} total)</span>
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        disabled={fm.currentPage === 1}
                        onClick={() => {
                          const newPage = Math.max(fm.currentPage - 1, 1);
                          fm.setCurrentPage(newPage);
                          fm.fetchFiles(newPage, fm.currentFolderId);
                        }}
                        className="px-3.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-field dark:hover:bg-gray-800 hover:text-ink dark:hover:text-white disabled:opacity-40 disabled:hover:bg-surface dark:disabled:hover:bg-gray-950 disabled:cursor-not-allowed transition-all cursor-pointer"
                      >
                        Prev
                      </button>
                      <button
                        disabled={fm.currentPage === fm.pagination.totalPages}
                        onClick={() => {
                          const newPage = Math.min(fm.currentPage + 1, fm.pagination.totalPages);
                          fm.setCurrentPage(newPage);
                          fm.fetchFiles(newPage, fm.currentFolderId);
                        }}
                        className="px-3.5 py-1.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg hover:bg-field dark:hover:bg-gray-800 hover:text-ink dark:hover:text-white disabled:opacity-40 disabled:hover:bg-surface dark:disabled:hover:bg-gray-950 disabled:cursor-not-allowed transition-all cursor-pointer"
                      >
                        Next
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : activeTab === 'tools' ? (
            <ToolsPanel />
          ) : activeTab === 'share' ? (
            <NearbyShare />
          ) : activeTab === 'chat' ? (
            <FileChatWidget user={user} />
          ) : activeTab === 'dak_register' ? (
            <DakRegister />
          ) : activeTab === 'admin_dashboard' ? (
            <AdminDashboard />
          ) : (
            <UserManagement />
          )}
        </div>
      </main>

      {/* Progress / Loading Modal */}
      {(isPasting || isDeleting || isPrintFetching) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-sm mx-4 p-7 bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl shadow-black/50 overflow-hidden">
            <div className="absolute -top-16 -right-16 w-40 h-40 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative flex flex-col items-center text-center gap-4">
              <div className="relative flex items-center justify-center w-14 h-14">
                <span className="absolute inset-0 rounded-full bg-blue-500/20 animate-ping" />
                <div className="relative w-14 h-14 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center">
                  <ClipboardPaste className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
              <div>
                <h4 className="text-sm font-bold text-gray-900 dark:text-white tracking-wide">Working on it…</h4>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-500 truncate max-w-[260px]">
                  {isDeleting ? 'Erasing selected assets from disk storage…' : isPasting ? 'Pasting items into the current folder…' : null}
                </p>
              </div>
              <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                <div className="shimmer h-full w-full rounded-full" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Access & Permissions Modal (redesigned — inline, same Dashboard state) */}
      {showUsersModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 animate-in fade-in duration-150"
          onClick={() => setShowUsersModal(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="access-permissions-title"
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl shadow-2xl
                       w-full max-w-[440px] max-h-[75vh] flex flex-col overflow-hidden
                       animate-in zoom-in-95 duration-150"
            style={{ width: 'min(440px, calc(100% - 24px))' }}
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 px-5 py-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/40 flex items-center justify-center shrink-0">
                  <Users size={16} className="text-blue-600 dark:text-blue-400" />
                </div>
                <div className="min-w-0">
                  <h3 id="access-permissions-title" className="text-sm font-bold text-gray-900 dark:text-white">
                    Access &amp; Permissions
                  </h3>
                  <p className="text-[11px] text-gray-500 dark:text-gray-500 mt-0.5">
                    {isPublicAccess
                      ? 'Everyone can access this location'
                      : isSharedAccess
                      ? 'Users currently online'
                      : isPrivateAccess
                      ? 'Restricted access'
                      : 'People with access to this location'}
                  </p>
                  <p className="text-[11px] font-mono text-gray-400 dark:text-gray-600 truncate mt-1" title={usersAccessInfo.path || expoFolder || '/'}>
                    {usersAccessInfo.path || expoFolder || '/'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowUsersModal(false)}
                aria-label="Close access permissions"
                className="shrink-0 w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 dark:text-gray-500
                           hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-700 dark:hover:text-gray-200
                           focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            {/* Loading skeleton */}
            {isUsersLoading && (
              <div className="px-5 py-4 space-y-2.5">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="flex items-center gap-2.5 animate-pulse">
                    <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-800 shrink-0" />
                    <div className="h-2.5 rounded-full bg-gray-200 dark:bg-gray-800" style={{ width: `${45 + i * 8}%` }} />
                  </div>
                ))}
              </div>
            )}

            {/* In-modal error state */}
            {!isUsersLoading && usersModalError && (
              <div className="flex flex-col items-center justify-center gap-2 px-5 py-10 text-center">
                <AlertCircle size={26} className="text-red-400 dark:text-red-500" />
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400">Unable to load access information</p>
                <button
                  onClick={fetchUsersForPath}
                  className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                >
                  <RefreshCw size={12} /> Try again
                </button>
              </div>
            )}

            {/* Content */}
            {!isUsersLoading && !usersModalError && (
              <>
                {/* Context summary */}
                <div className="px-5 pt-3.5 pb-2 shrink-0">
                  {isPublicAccess ? (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/30 px-3.5 py-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <Globe size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">Everyone has access</p>
                          <p className="text-[11px] text-emerald-600/80 dark:text-emerald-400/70">This location is publicly accessible to all users.</p>
                        </div>
                      </div>
                      <span className="shrink-0 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">All users</span>
                    </div>
                  ) : isSharedAccess ? (
                    <div className="flex items-center gap-2.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 px-3.5 py-3">
                      <span className="relative flex items-center justify-center w-2.5 h-2.5 shrink-0">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75 animate-ping" />
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">Currently Online</p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-500">
                          {usersAccessInfo.count} user{usersAccessInfo.count === 1 ? '' : 's'} currently online
                        </p>
                      </div>
                    </div>
                  ) : isPrivateAccess ? (
                    <div className="flex items-center gap-2.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 px-3.5 py-3">
                      <Lock size={16} className="text-amber-500 dark:text-amber-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">Private Access</p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-500">Only selected users can access this location.</p>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5 rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/60 px-3.5 py-3">
                      <UserCheck size={16} className="text-blue-600 dark:text-blue-400 shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">People with access</p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-500">
                          {usersAccessInfo.count} user{usersAccessInfo.count === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>
                  )}

                  {isPrivateAccess && (
                    <p className="text-[11px] text-gray-400 dark:text-gray-600 mt-2 px-0.5">
                      {usersAccessInfo.count} user{usersAccessInfo.count === 1 ? '' : 's'} with access
                    </p>
                  )}
                </div>

                {/* Search — only for larger normal/private lists */}
                {!isPublicAccess && !isSharedAccess && accessibleUsers.length > 5 && (
                  <div className="px-5 pb-2 shrink-0">
                    <div className="relative">
                      <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-600" />
                      <input
                        type="text"
                        value={usersSearchQuery}
                        onChange={(e) => setUsersSearchQuery(e.target.value)}
                        placeholder="Search users..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800
                                   rounded-lg text-gray-800 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-600
                                   focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors"
                      />
                    </div>
                  </div>
                )}

                {/* User list / empty states */}
                <div className="flex-1 min-h-0 overflow-y-auto px-5 pb-3" style={{ maxHeight: '58vh' }}>
                  {isPublicAccess ? null : isSharedAccess && accessibleUsers.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-500">No one is online right now</p>
                      <p className="text-[11px] text-gray-400 dark:text-gray-600 mt-1">Users will appear here when they are online.</p>
                    </div>
                  ) : filteredAccessibleUsers.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-xs font-medium text-gray-500 dark:text-gray-500">
                        {usersSearchQuery ? 'No matching users.' : 'No users found for this location.'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      {filteredAccessibleUsers.map((u, idx) => (
                        <div
                          key={u.user_id || idx}
                          className="flex items-center gap-2.5 py-2.5 px-1.5 rounded-lg border border-transparent
                                     hover:bg-gray-50 dark:hover:bg-gray-800/70 hover:border-gray-100 dark:hover:border-gray-800 transition-colors"
                        >
                          <div className="w-8 h-8 rounded-full bg-blue-500/10 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400
                                          flex items-center justify-center text-[11px] font-bold shrink-0">
                            {getUserInitials(u.user_id)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-gray-800 dark:text-gray-200 truncate">{u.user_id}</p>
                            <p className="text-[10.5px] text-gray-400 dark:text-gray-600">
                              {isSharedAccess ? 'Online' : 'User'}
                            </p>
                          </div>
                          {isSharedAccess && (
                            <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" title="Online" />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Footer */}
            <div className="flex items-center justify-end px-5 py-2.5 border-t border-gray-200 dark:border-gray-800 shrink-0">
              <button
                onClick={() => setShowUsersModal(false)}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition-colors
                           focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <FolderModal
        isOpen={isFolderOpen}
        onClose={() => setIsFolderOpen(false)}
        user={user}
        expoFolder={expoFolder}
        onFolderCreate={() => { refreshData(); }}
      />

      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />

      <MfaSettingsModal
        isOpen={isMfaSettingsOpen}
        onClose={() => setIsMfaSettingsOpen(false)}
        isMfaEnabled={isMfaEnabled}
        onStatusChange={setIsMfaEnabled}
      />

      <PrinterManagerModal
        isOpen={isPrintOpen}
        onClose={() => setIsPrintOpen(false)}
        allowFileUpload
      />

      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => { setIsUploadOpen(false); setPendingUploadFiles(null); }}
        user={user}
        expoFolder={expoFolder}
        currentFolderId={fm.currentFolderId}
        initialFiles={pendingUploadFiles}
        onUploadSuccess={() => refreshData()}
      />

      <RecentWorkFilesModal
        isOpen={showRecentWorkModal}
        onClose={() => setShowRecentWorkModal(false)}
        user={user}
        onFilesSelected={(files) => {
          setPendingUploadFiles(files);
          setShowRecentWorkModal(false);
          setIsUploadOpen(true);
        }}
        existingFiles={fm.files.map(f => ({ file_name: f.file_name, file_size: f.file_size }))}
      />
    </div>
  );
}