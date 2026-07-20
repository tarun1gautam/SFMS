/**
 * Dashboard.jsx  (SFMS v2 — Enhanced)
 * [unchanged header comment]
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/api';
import { baseURL } from '../utils/api';
import { toast } from 'react-hot-toast';
import { io } from 'socket.io-client';

import FileTable    from '../components/FileTable';
import { Copy, Scissors, ClipboardPaste, Archive, X, ArrowLeft, Home, Globe, Users, FolderPlus, CheckSquare, Square, UploadCloud } from 'lucide-react';
import UploadModal  from '../components/modals/UploadModal';
import FolderModal  from '../components/modals/FolderModal';
import UserManagement from '../components/UserManagement';
import ToolsPanel from '../components/Toolspanel';
import NearbyShare from './NearbyShare';

import SearchBar    from '../components/SearchBar';
import SortDropdown from '../components/SortDropdown';
import FilterPanel  from '../components/FilterPanel';

import useFileManager from '../hooks/useFileManager';

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
  const [fileCount,setFileCount] = useState(1);

  
  const [isPasting, setIsPasting] = useState(false);
const [pasteProgress, setPasteProgress] = useState(0); // 0 to 100
const [pasteStatusText, setPasteStatusText] = useState('');

  const navigate = useNavigate();
  const location = useLocation();
  const setFolder = (newPath) => {
    if(expoFolder===newPath) return;
    fm.setLoading(true);
    navigate(`/dashboard?path=${encodeURIComponent(newPath)}`);
  };

  const fm = useFileManager();

  useEffect(() => {
    let cancelled = false;
    const loadFolder = async () => {
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
      }
    };
    loadFolder();
    console.log(expoFolder);
    if (expoFolder) {
    if (expoFolder.startsWith("/public/")) {
      setActiveExpo("public");
    } else if (expoFolder.startsWith("/shared/")) {
      setActiveExpo("shared");
    }else{
      if(expoFolder.startsWith(user.base_path)){
        setActiveExpo("root");
      }
    }
  }
    return () => { cancelled = true; };
  }, [expoFolder]);

  useEffect(() => {
    console.log("run");
    if (!fm.currentFolderId) return;
    fm.fetchFiles(fm.currentPage, fm.currentFolderId);
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
      if (decoded.startsWith(user.base_path) || decoded.startsWith('/public/') || decoded.startsWith('/shared/') || activeExpo==="shared") {
        setExpoFolder(decoded);
      } else {
        setFolder(user.base_path);
        setActiveExpo("root");
      }
    } else {
      setFolder(user.base_path);
    }
  }, [location.search, isDeleting, user?.base_path]);

  const refreshData = () => {
    console.log("refresh called");
    fm.fetchFiles(fm.currentPage, fm.currentFolderId);
    fm.fetchUploaders();
    fm.fetchFolders(expoFolder);
    fetchStats();
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

  const handleDeleteFile = async (fileId) => {
    if (!window.confirm('Are you sure you want to permanently erase this asset from disk storage?')) return;
    try {
      await api.delete(`/files/${fileId}`);
      toast.success('Asset deleted successfully.');
      fm.fetchFiles(fm.currentPage);
      fetchStats();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erase operation failed.');
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

      setTimeout(() => {
        if (typeof fetchStats === 'function') fetchStats();
      }, 1000);
    }
  };

  const selectedCount = fm.selectedFileIds.size + fm.selectedFolderIds.size;

  const handleDownloadFolderZip = (folderId, folderName) => {
    const token = localStorage.getItem('sfms_token');
    const url = `${baseURL}/folders/download-zip/${folderId}?token=${token}`;
    window.open(url, '_blank');
    setTimeout(() => { if (typeof fetchStats === 'function') fetchStats(); }, 1500);
  };

  const handleDownloadSelectedZip = () => {
    const ids = Array.from(fm.selectedFileIds);
    if (ids.length === 0) {
      toast.error('Select at least one file to download as ZIP (folders are excluded).');
      return;
    }
    const token = localStorage.getItem('sfms_token');
    const url = `${baseURL}/files/download-zip?ids=${ids.join(',')}&token=${token}`;
    window.open(url, '_blank');
    setTimeout(() => { if (typeof fetchStats === 'function') fetchStats(); }, 1500);
  };

    // const handlePaste = async () => {
  //   if (!fm.clipboard || !fm.currentFolderId) return;
  //   const { mode, fileIds, folderIds } = fm.clipboard;
  //   const verb = mode === 'copy' ? 'copied' : 'moved';

  //   try {
  //     if (fileIds.length > 0) {
  //       const endpoint = mode === 'copy' ? '/files/copy' : '/files/move';
  //       const res = await api.post(endpoint, { fileIds, target_folder_id: fm.currentFolderId });
  //       if (res.data.skipped?.length > 0) {
  //         res.data.skipped.forEach(s => toast.error(`Skipped a file: ${s.reason}`));
  //       }
  //     }

  //     if (folderIds.length > 0) {
  //       if (mode === 'cut') {
  //         for (const folderId of folderIds) {
  //           try {
  //             await api.put(`/folders/move/${folderId}`, { target_parent_path: expoFolder });
  //           } catch (err) {
  //             toast.error(err.response?.data?.error || 'A folder could not be moved.');
  //           }
  //         }
  //       } else {
  //         toast.error('Copying folders is not supported yet — only files can be copied. Folders were skipped.');
  //       }
  //     }

  //     toast.success(`Items ${verb} successfully.`);
  //   } catch (err) {
  //     toast.error(err.response?.data?.error || 'Paste operation failed.');
  //   } finally {
  //     fm.clearClipboard();
  //     fm.clearSelection();
  //     setSelect(false);
  //     refreshData();
  //   }
  // };

    const handlePaste = async () => {
  // Prevent duplicate execution if paste is already in progress
  if (isPasting) return;
  if (!fm.clipboard || !fm.currentFolderId) return;

  const { mode, fileIds = [], folderIds = [] } = fm.clipboard;
  const verb = mode === 'copy' ? 'copied' : 'moved';
  const totalItems = fileIds.length + (mode === 'cut' ? folderIds.length : 0);

  if (totalItems === 0) return;

  // Lock UI & Reset Progress
  setIsPasting(true);
  setPasteProgress(0);
  setPasteStatusText(`Preparing to ${mode} items...`);

  let processedCount = 0;

  const updateProgress = (completedItemCount, statusText) => {
    const percent = Math.min(100, Math.round((completedItemCount / totalItems) * 100));
    setPasteProgress(percent);
    setPasteStatusText(statusText);
  };

  try {
    // ── 1. HANDLE FILES ───────────────────────────────────────────────────
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

    // ── 2. HANDLE FOLDERS ─────────────────────────────────────────────────
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

    // ── 3. FINISH & CLEANUP ───────────────────────────────────────────────
    updateProgress(totalItems, 'Pasting complete!');
    toast.success(`Items ${verb} successfully.`);

  } catch (err) {
    console.error('Paste operation failed:', err);
    toast.error(err.response?.data?.error || 'Paste operation failed.');
  } finally {
    // Small delay before closing progress modal so user sees 100% complete
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

  const SkeletonRows = () => (
    <>
      {[...Array(6)].map((_, i) => (
        <tr key={i} className="border-b border-gray-800/40">
          {[...Array(6)].map((_, j) => (
            <td key={j} className="py-4 px-4">
              <div
                className="h-3 rounded-full bg-gradient-to-r from-gray-800/70 via-gray-700/50 to-gray-800/70 bg-[length:200%_100%] animate-[shimmer_1.6s_infinite]"
                style={{ width: `${55 + Math.random() * 35}%` }}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col font-sans selection:bg-blue-600/40">

      {/* ── Navigation ── */}
      <nav className="bg-gray-900/90 backdrop-blur-md border-b border-gray-800 px-6 py-3.5 flex items-center justify-between top-0 z-30 shadow-lg shadow-black/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center text-white font-black shadow-lg shadow-blue-600/30 ring-1 ring-white/10">
            SF
          </div>
          <div>
            <h1 className="text-[15px] font-bold text-white tracking-wide leading-tight">SFMS Control Panel</h1>
            <p className="text-[11px] text-gray-500">Secure File Management Matrix</p>
          </div>
        </div>

        <div className="flex items-center gap-4">

          {/* Compact Stats */}
          <div className="hidden md:flex items-center gap-4 border-l border-gray-800 pl-4">
            <div className="flex items-center gap-1.5 text-xs text-gray-400" title="Total files">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span className="font-semibold text-gray-200 tabular-nums">{stats.totalFiles}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400" title="Storage used">
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
              </svg>
              <span className="font-semibold text-gray-200 tabular-nums">{formatBytes(stats.totalStorageBytes)}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400" title={stats.topDownloadedFile?.original_name || 'No activity'}>
              <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
              <span className="font-semibold text-gray-200 tabular-nums">
                {stats.topDownloadedFile ? stats.topDownloadedFile.download_count : 0}
              </span>
            </div>
          </div>

          {isAdmin && (
            <button
              onClick={() => setActiveTab(activeTab === 'files' ? 'admin_users' : 'files')}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border transition-all cursor-pointer ${
                activeTab === 'admin_users'
                  ? 'bg-blue-600 border-blue-500 text-white shadow shadow-blue-600/20'
                  : 'bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20 hover:border-blue-500/30'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <span className="text-xs font-bold uppercase tracking-wider">User Mgmt</span>
            </button>
          )}

          {/* Identity Display */}
          <div className="hidden md:flex items-center gap-2.5 pl-1">
            <div className="w-8 h-8 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center text-[11px] font-bold text-gray-300 uppercase">
              {(user?.user_id || 'G').slice(0, 2)}
            </div>
            <div className="text-right">
              <span className="block text-sm font-semibold text-gray-200 leading-tight">{user?.user_id || 'Guest'}</span>
              <span className="text-[9px] font-bold uppercase tracking-wider text-blue-400">
                {user?.role || 'User'}
              </span>
            </div>
          </div>

          <button
            onClick={logout}
            className="p-2.5 bg-gray-950 border border-gray-800 rounded-xl text-gray-400 hover:text-red-400 hover:border-red-500/40 hover:bg-red-500/5 transition-all cursor-pointer"
            title="Logout"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </nav>

      {/* ── Main Content ── */}
      <main className="flex-1 p-6 space-y-5 max-w-[1800px] w-full mx-auto">

        {/* ── Tab Bar + Upload Button ── */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-gray-900 p-3.5 border border-gray-800 rounded-2xl shadow-sm">
          <div className="flex items-center bg-gray-950/80 p-1 rounded-xl border border-gray-800/80 gap-0.5">
            <button
              onClick={() => setActiveTab('files')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer ${
                activeTab === 'files' ? 'bg-blue-600 text-white shadow shadow-blue-600/20' : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
              }`}
            >
              File System Directory
            </button>

            <button
              onClick={() => setActiveTab('tools')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer ${
                activeTab === 'tools' ? 'bg-blue-600 text-white shadow shadow-blue-600/20' : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
              }`}
            >
              Utility Engine
            </button>

            <button
              onClick={() => setActiveTab('share')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer ${
                activeTab === 'share' ? 'bg-blue-600 text-white shadow shadow-blue-600/20' : 'text-gray-400 hover:text-white hover:bg-gray-800/60'
              }`}
            >
              Nearby Share
            </button>
          </div>

          {(activeTab === 'files' && 
  expoFolder !== "/" && 
  (expoFolder || '').toLowerCase() !== '/shared/'
) && (
  <button
    onClick={() => setIsUploadOpen(true)}
    className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600
               hover:bg-blue-500 text-white text-sm font-semibold rounded-xl
               shadow-lg shadow-blue-600/20 transition-all cursor-pointer active:scale-[0.98]"
  >
    <UploadCloud size={17} strokeWidth={2.3} />
    Deploy New File
  </button>
)}
        </div>

        {/* ── Main Content Card ── */}
        {/* ── Main Content Card ── */}
<div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl">

  {activeTab === 'files' ? (
    <>

        {/* ── Search + Sort + Filter Toolbar ── */}
        <div className="px-4 py-3 border-b border-gray-800/80 bg-gray-900/60 rounded-t-2xl backdrop-blur-sm">
          <div className="flex flex-wrap items-center gap-3">
            <SearchBar
              searchTerm={fm.searchTerm}
              setSearchTerm={fm.setSearchTerm}
              searchField={fm.searchField}
              setSearchField={fm.setSearchField}
              clearSearch={fm.clearSearch}
            />

            <SortDropdown
              sortField={fm.sortField}
              sortOrder={fm.sortOrder}
              onSortChange={fm.handleSortChange}
              setSortOrder={fm.setSortOrder}
              isOpen={fm.sortDropOpen}
              setIsOpen={fm.setSortDropOpen}
            />

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

          {isFiltered && (
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Active:</span>

              {fm.searchTerm && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full
                                 bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-semibold">
                  🔍 "{fm.searchTerm}"
                  <button onClick={fm.clearSearch} className="hover:text-white cursor-pointer ml-0.5">×</button>
                </span>
              )}

              {fm.filters.visibility && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full
                                 bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[10px] font-semibold">
                  Visibility: {fm.filters.visibility}
                  <button onClick={() => fm.updateFilter('visibility', '')} className="hover:text-white cursor-pointer ml-0.5">×</button>
                </span>
              )}

              {fm.filters.fileType && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full
                                 bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[10px] font-semibold">
                  Type: {fm.filters.fileType.toUpperCase()}
                  <button onClick={() => fm.updateFilter('fileType', '')} className="hover:text-white cursor-pointer ml-0.5">×</button>
                </span>
              )}

              {fm.filters.uploader && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full
                                 bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[10px] font-semibold">
                  By: {fm.filters.uploader}
                  <button onClick={() => fm.updateFilter('uploader', '')} className="hover:text-white cursor-pointer ml-0.5">×</button>
                </span>
              )}

              {(fm.filters.dateFrom || fm.filters.dateTo) && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full
                                 bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[10px] font-semibold">
                  Date: {fm.filters.dateFrom || '…'} → {fm.filters.dateTo || '…'}
                  <button onClick={() => { fm.updateFilter('dateFrom', ''); fm.updateFilter('dateTo', ''); }}
                          className="hover:text-white cursor-pointer ml-0.5">×</button>
                </span>
              )}

              {(fm.filters.sizeMinMB !== '' || fm.filters.sizeMaxMB !== '') && (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full
                                 bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[10px] font-semibold">
                  Size: {fm.filters.sizeMinMB || '0'}–{fm.filters.sizeMaxMB || '∞'} MB
                  <button onClick={() => { fm.updateFilter('sizeMinMB', ''); fm.updateFilter('sizeMaxMB', ''); }}
                          className="hover:text-white cursor-pointer ml-0.5">×</button>
                </span>
              )}

              <button
                onClick={() => { fm.resetFilters(); fm.clearSearch(); }}
                className="text-[10px] text-gray-600 hover:text-red-400 transition-colors
                           cursor-pointer underline underline-offset-2 ml-1"
              >
                Clear all
              </button>

              <span className="ml-auto text-[10px] text-gray-500">
                {fm.files.length} result{fm.files.length !== 1 ? 's' : ''}
              </span>
            </div>
          )}
        </div>

        {/* ── Sticky operations zone: search/sort/filter, selection toolbar, path bar ── */}
      <div className="sticky top-[0px] z-20 bg-gray-900 overflow-hidden">

        {/* ── Selection / Clipboard toolbar ── */}
        {((selectedCount > 0 || fm.clipboard) && (expoFolder !== "/public/") && (expoFolder !== "/shared/") && ((expoFolder !== "/"))) && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-gray-800/80 bg-blue-500/[0.06]">
            {selectedCount > 0 && (
              <>
                <span className="text-[11px] font-bold uppercase tracking-wider text-blue-400">
                  {selectedCount} selected
                </span>
                <button
                  onClick={() => fm.copyToClipboard('copy')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-all cursor-pointer"
                  title="Copy selected items"
                >
                  <Copy size={14} /> Copy
                </button>
                <button
                  onClick={() => fm.copyToClipboard('cut')}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-all cursor-pointer"
                  title="Cut selected items (move)"
                >
                  <Scissors size={14} /> Cut
                </button>
                <button
                  onClick={handleDownloadSelectedZip}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-all cursor-pointer"
                  title="Download selected files as ZIP"
                >
                  <Archive size={14} /> Download ZIP
                </button>
                <button
                  onClick={fm.clearSelection}
                  className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-gray-500 hover:text-red-400 transition-all cursor-pointer"
                  title="Clear selection"
                >
                  <X size={14} />
                </button>
              </>
            )}

            {fm.clipboard && (
              <div className="flex items-center gap-2 ml-auto">
                <span className="text-[10px] text-gray-500">
                  {fm.clipboard.mode === 'copy' ? 'Copying' : 'Moving'}{' '}
                  {fm.clipboard.fileIds.length + fm.clipboard.folderIds.length} item(s)
                </span>
                <button
                  onClick={handlePaste}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-500 rounded-lg transition-all cursor-pointer"
                  title="Paste into current folder"
                >
                  <ClipboardPaste size={14} /> Paste here
                </button>
                <button
                  onClick={fm.clearClipboard}
                  className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-gray-500 hover:text-red-400 transition-all cursor-pointer"
                  title="Cancel clipboard"
                >
                  <X size={14} />
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Path / Navigation Bar ── */}
        <div className="w-full bg-gray-950/60 border-b border-gray-800 px-4 py-2.5 flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-0.5 mr-1 border-r border-gray-800 pr-2.5">
            <button
              onClick={() => { handleNavigateBack(); }}
              className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-all cursor-pointer"
              title="Go Back"
            >
              <ArrowLeft size={16} />
            </button>

            <button
              onClick={() => { setFolder(user.base_path); setActiveExpo("root"); }}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                activeExpo === "root"
                  ? "text-white bg-blue-600/90 shadow shadow-blue-600/20"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
              title="Root Directory"
            >
              <Home size={16} />
            </button>

            <button
              onClick={() => { setFolder("/public/"); setActiveExpo("public"); }}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                activeExpo === "public"
                  ? "text-white bg-blue-600/90 shadow shadow-blue-600/20"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
              title="Public Directory"
            >
              <Globe size={16} />
            </button>

            <button
              onClick={() => { setFolder("/shared/"); setActiveExpo("shared"); }}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                activeExpo === "shared"
                  ? "text-white bg-blue-600/90 shadow shadow-blue-600/20"
                  : "text-gray-400 hover:text-white hover:bg-gray-800"
              }`}
              title="Shared With Me"
            >
              <Users size={16} />
            </button>
          </div>

          <span className="text-gray-600 text-[10px] font-bold uppercase tracking-widest">Loc</span>
          <span className="text-blue-400 font-mono text-[13px] truncate select-none flex-1 min-w-[100px]">
            {expoFolder || "/"}
          </span>

          {(fileCount>0 || select) && (
            <button
              // onClick={() => setSelect((pv) => !pv)}
              onClick={() => {
  setSelect((pv) => {
    if (pv){
      fm.clearSelection();
    }; // clears items when switching from true -> false
    return !pv;
  });
}}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-all cursor-pointer ${
                select
                  ? 'text-white bg-blue-600 hover:bg-blue-700 border-blue-500 shadow-sm'
                  : 'text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border-gray-700'
              }`}
            >
              {select ? <CheckSquare size={14} /> : <Square size={14} />}
              Select
            </button>
          )}

          {((expoFolder?.toLowerCase() !== "/public/") && (expoFolder !== "/" ||  isAdmin) && (expoFolder !== "/shared/")) && (
            <button
              onClick={() => {setIsFolderOpen(true)}}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-all cursor-pointer"
            >
              <FolderPlus size={15} />
              New Folder
            </button>
          )}
        </div>
      </div>

      {/* ── Non-sticky content: table + pagination ── */}
      <div className="rounded-b-2xl overflow-hidden">
        {/* ── File Table ── */}
        {fm.loading ? (
          <div className="w-full overflow-x-auto">
            <table className="w-full border-collapse min-w-[900px]">
              <tbody><SkeletonRows /></tbody>
             </table>
          </div>
        ) : (
          <FileTable
            files={fm.files}
            onPin={handleTogglePin}
            onDelete={handleDeleteFile}
            onDownload={handleDownloadFile}
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
            setIsDeleting = {setIsDeleting}
            currentFolderId = {fm.currentFolderId}
            searchTerm = {fm.searchTerm}
            setLoading = {fm.setLoading}
            loading = {fm.loading}
            selectedFileIds={fm.selectedFileIds}
            selectedFolderIds={fm.selectedFolderIds}
            onToggleFileSelect={fm.toggleFileSelect}
            onToggleFolderSelect={fm.toggleFolderSelect}
            onDownloadFolderZip={handleDownloadFolderZip}
            select={select}
            setFileCount = {setFileCount}
          />
        )}

        {/* ── Pagination ── */}
        {fm.pagination.totalPages > 1 && (
          <div className="px-6 py-4 bg-gray-900 border-t border-gray-800/60 flex items-center justify-between">
            <span className="text-xs text-gray-400">
              Showing Page <span className="text-gray-200 font-semibold">{fm.pagination.page}</span> of {fm.pagination.totalPages}
              <span className="ml-2 text-gray-600">({fm.pagination.total} total)</span>
            </span>
            <div className="flex items-center gap-2">
              <button
                disabled={fm.currentPage === 1}
                onClick={() => {
                  const newPage = Math.max(fm.currentPage - 1, 1);
                  fm.setCurrentPage(newPage);
                  fm.fetchFiles(newPage, fm.currentFolderId);
                }}
                className="px-3.5 py-1.5 text-xs font-medium text-gray-300 bg-gray-950 border border-gray-800 rounded-lg
                           hover:bg-gray-800 hover:text-white disabled:opacity-40 disabled:hover:bg-gray-950
                           disabled:cursor-not-allowed transition-all cursor-pointer"
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
                className="px-3.5 py-1.5 text-xs font-medium text-gray-300 bg-gray-950 border border-gray-800 rounded-lg
                           hover:bg-gray-800 hover:text-white disabled:opacity-40 disabled:hover:bg-gray-950
                           disabled:cursor-not-allowed transition-all cursor-pointer"
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
  ) : (
    <UserManagement />
  )}
</div>
      </main>
{isPasting && (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
    <div className="w-full max-w-md p-6 bg-white rounded-lg shadow-xl border border-gray-100">
      <div className="flex justify-between items-center mb-3">
        <h4 className="text-base font-semibold text-gray-800">Pasting Items...</h4>
        <span className="text-sm font-bold text-blue-600">{pasteProgress}%</span>
      </div>
      
      <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
        <div 
          className="bg-blue-600 h-2.5 rounded-full transition-all duration-300 ease-out" 
          style={{ width: `${pasteProgress}%` }}
        />
      </div>

      <p className="mt-2 text-xs text-gray-500 truncate">{pasteStatusText}</p>
    </div>
  </div>
)}
      {/* ── Upload Modal ── */}
      <UploadModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        user={user}
        expoFolder={expoFolder}
        currentFolderId = {fm.currentFolderId}
        onUploadSuccess={() => {
          refreshData();
        }}
      />

      <FolderModal
        isOpen={isFolderOpen}
        onClose={() => setIsFolderOpen(false)}
        user={user}
        expoFolder={expoFolder}
        onFolderCreate={() => {
          refreshData();
        }}
      />
    </div>
  );
}