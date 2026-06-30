/**
 * Dashboard.jsx  (SFMS v2 — Enhanced)
 *
 * Changes from v1:
 *  • Integrated useFileManager hook for all sort/filter/search state
 *  • Added SearchBar, SortDropdown, FilterPanel components in the toolbar
 *  • Passes sort props down to FileTable for column-header sorting
 *  • Active filter/search summary pill in toolbar
 *  • Loading skeleton for file table
 *  • All existing functionality (stats, tabs, upload modal, pagination,
 *    WebSocket updates, pin/delete/download) is preserved unchanged.
 * 
 * NEW CHANGE: Moved User Management button from tab bar to navbar.
 *             Clicking "Identity Core (admin)" in navbar toggles between
 *             File System Directory and User Management views.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/api';
import { baseURL } from '../utils/api';
import { toast } from 'react-hot-toast';
import { io } from 'socket.io-client';

// Existing components
import FileTable    from '../components/FileTable';
import UploadModal  from '../components/modals/UploadModal';
import FolderModal  from '../components/modals/FolderModal';
import UserManagement from '../components/UserManagement';

// NEW v2 components';

import SearchBar    from '../components/SearchBar';
import SortDropdown from '../components/SortDropdown';
import FilterPanel  from '../components/FilterPanel';

// NEW v2 hook
import useFileManager from '../hooks/useFileManager';

export default function Dashboard() {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';

  // ── Stats & UI state (unchanged from v1) ──────────────────
  const [stats, setStats]         = useState({ totalFiles: 0, totalStorageBytes: 0, topDownloadedFile: null });
  const [activeTab, setActiveTab] = useState('files');
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isFolderOpen, setIsFolderOpen] = useState(false);


  // const [folders, setFolders] = useState([]);
  // const [expoFolder, setExpoFolder] = useState("/public/") // Default root
const [expoFolder, setExpoFolder] = useState(null);

// Store the resolved folder_id for the current path
// const [currentFolderId, setCurrentFolderId] = useState(null);

  const [isDeleting, setIsDeleting] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();

const setFolder = (newPath) => {
  // Updates the URL: /dashboard?path=/SPMU/
  navigate(`/dashboard?path=${encodeURIComponent(newPath)}`);
};

// useEffect(() => {
//   // If we are currently deleting, do nothing!
//   if (isDeleting) return; 

//   if ((expoFolder?.length <= user?.base_path.length)) {
//     setExpoFolder(user.base_path);
//   } else {
//     const params = new URLSearchParams(location.search);
//     const path = params.get('path') || '/';
//     setExpoFolder(path);
//   }
// }, [location.search, isDeleting]); // Add isDeleting to dependencies

  // ── All file management state via the new hook ─────────────
  const fm = useFileManager();

  // useEffect(()=>{
  //   console.log(fm.files);
  // },[fm.files])

useEffect(() => {
  if (!expoFolder) return;

  console.log("expoFolder called")

  let cancelled = false; // prevent stale updates if folder changes fast

  const loadFolder = async () => {
    try {
      // 1. Resolve folder_id from path
      const pathToUse = (expoFolder && expoFolder.trim() !== "") ? expoFolder : user.base_path;
      const res = await api.get('/folders/resolve', {
        params: { folder_path: pathToUse }
      });

      if (cancelled) return;

      const folderId = res.data.folder_id;
      fm.setCurrentFolderId(folderId);
      await Promise.all([
        fm.fetchFolders(expoFolder),
        fm.fetchFiles(fm.currentPage,folderId),
      ]);

    } catch (err) {
      if (!cancelled) {
        console.error('Failed to load folder:', err);
      }
    }
  };

  loadFolder();

  return () => { cancelled = true; }; // cleanup on fast navigation
}, [expoFolder]);

// Separate effect ONLY for page changes
useEffect(() => {
  console.log("fm.currentPage called");
  if (!fm.currentFolderId) return;
    fm.fetchFiles(fm.currentPage);
}, [fm.currentPage]);


useEffect(() => {
  fetchStats();
  fm.fetchUploaders();
// eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

// URL sync — separate from data fetching
useEffect(() => {
  if (isDeleting || !user?.base_path) return;
  const params = new URLSearchParams(location.search);
  const pathFromUrl = params.get('path');
  if (pathFromUrl) {
    const decoded = decodeURIComponent(pathFromUrl);
    if (decoded.startsWith(user.base_path) || decoded.startsWith('/public/')) {
      setExpoFolder(decoded);
    } else {
      setFolder(user.base_path); // redirect invalid paths
    }
  } else {
    setFolder(user.base_path); // no path param → redirect to base
  }
}, [location.search, isDeleting, user?.base_path]);

// Update refreshData
const refreshData = () => {
  console.log("refresh called");
  fm.fetchFiles(fm.currentPage);
  fm.fetchUploaders();
  fm.fetchFolders(expoFolder);
  fetchStats();
};

  // ── Fetch stats (unchanged) ───────────────────────────────
  const fetchStats = useCallback(async () => {
    try {
      const res = await api.get('/files/stats');
      setStats(res.data);
    } catch (err) {
      console.error('Failed to pull system stats', err);
    }
    // api.get('/folders')
    //   .then(res => {
    //     setFolders(res.data.folders);
    //   })
    //   .catch(console.error);
  }, []);

  // ── File Operations (unchanged from v1) ───────────────────

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
    // Directly open in new tab
    window.open(downloadUrl, '_blank');
  } else {
    // Handle download as before
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

const handleNavigateBack = () => {
  if (expoFolder === user.base_path) return;
  const normalized = expoFolder.endsWith('/') ? expoFolder.slice(0, -1) : expoFolder;
  const lastIndex = normalized.lastIndexOf('/');
  const parentPath = lastIndex <= 0 ? '/' : normalized.substring(0, lastIndex) + '/';
  const finalPath = parentPath.length < user.base_path.length ? user.base_path : parentPath;
  setFolder(finalPath);
};

  // ── Format helpers (unchanged) ────────────────────────────
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // ── Derived state ─────────────────────────────────────────
  const isFiltered = fm.activeFilterCount > 0 || !!fm.searchTerm;

  // ── Loading skeleton rows ─────────────────────────────────
  const SkeletonRows = () => (
    <>
      {[...Array(5)].map((_, i) => (
        <tr key={i} className="border-b border-gray-800/40">
          {[...Array(8)].map((_, j) => (
            <td key={j} className="py-4 px-4">
              <div className="h-3 bg-gray-800/60 rounded animate-pulse" style={{ width: `${60 + Math.random() * 30}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col font-sans selection:bg-blue-600">

      {/* ── Navigation (UPDATED: Added clickable Identity Core button that toggles User Management) ── */}
      <nav className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between shadow-md">
  <div className="flex items-center gap-3">
    <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white font-black shadow-lg shadow-blue-600/20">
      SF
    </div>
    <div>
      <h1 className="text-lg font-bold text-white tracking-wide">SFMS Control Panel</h1>
      <p className="text-xs text-gray-400">Secure File Management Matrix</p>
    </div>
  </div>

  <div className="flex items-center gap-4">
  {isAdmin && (
      <button
        onClick={() => setActiveTab(activeTab === 'files' ? 'admin_users' : 'files')}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
          activeTab === 'admin_users'
            ? 'bg-blue-600/20 border-blue-500/40 text-blue-300'
            : 'bg-blue-500/10 border-blue-500/20 text-blue-400 hover:bg-blue-500/20'
        }`}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <span className="text-xs font-bold uppercase tracking-wider">User Mgmt</span>
      </button>
    )}
    {/* Identity Display */}
    <div className="text-right mr-2 hidden md:block">
      <span className="block text-sm font-semibold text-gray-200">{user?.user_id || 'Guest'}</span>
      <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
        {user?.role || 'User'}
      </span>
    </div>

    <button
      onClick={logout}
      className="p-2.5 bg-gray-950 border border-gray-800 rounded-xl text-gray-400 hover:text-red-400 hover:border-red-500/30 transition-all cursor-pointer"
      title="Logout"
    >
      <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
      </svg>
    </button>
  </div>
</nav>

      {/* ── Main Content ───────────────────────────────────── */}
      <main className="flex-1 p-6 space-y-6 max-w-[1800px] w-full mx-auto">

        {/* ── Stats (unchanged) ────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Total Managed Index</p>
              <h3 className="text-3xl font-extrabold text-white mt-2">{stats.totalFiles} files</h3>
            </div>
            <div className="p-4 bg-emerald-500/10 rounded-xl text-emerald-400 border border-emerald-500/20">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Storage Footprint</p>
              <h3 className="text-3xl font-extrabold text-white mt-2">{formatBytes(stats.totalStorageBytes)}</h3>
            </div>
            <div className="p-4 bg-blue-500/10 rounded-xl text-blue-400 border border-blue-500/20">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
              </svg>
            </div>
          </div>

          <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 shadow-xl flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider">Weekly Hot Asset</p>
              <h3 className="text-sm font-bold text-white mt-2 truncate max-w-[200px]"
                  title={stats.topDownloadedFile?.original_name || 'No current activity'}>
                {stats.topDownloadedFile?.original_name || 'No downloads log'}
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                {stats.topDownloadedFile
                  ? `Downloads: ${stats.topDownloadedFile.download_count}`
                  : 'Activity clear'}
              </p>
            </div>
            <div className="p-4 bg-purple-500/10 rounded-xl text-purple-400 border border-purple-500/20">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
              </svg>
            </div>
          </div>
        </div>

        {/* ── Tab Bar + Upload Button (UPDATED: Removed User Management button, only File System Directory remains) ── */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-gray-900 p-4 border border-gray-800 rounded-2xl">
          <div className="flex items-center bg-gray-950 p-1.5 rounded-xl border border-gray-800/80">
            <button
              onClick={() => setActiveTab('files')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer ${
                activeTab === 'files' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              File System Directory
            </button>
          </div>

          {activeTab === 'files' && (
            <button
              onClick={() => setIsUploadOpen(true)}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600
                         hover:bg-blue-500 text-white text-sm font-semibold rounded-xl
                         shadow-lg shadow-blue-600/10 transition-all cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
              Deploy New File
            </button>
          )}

          {/* {activeTab === 'files' && (
            <button
              onClick={() => setIsFolderOpen(true)}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600
                         hover:bg-blue-500 text-white text-sm font-semibold rounded-xl
                         shadow-lg shadow-blue-600/10 transition-all cursor-pointer"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
              </svg>
              Create New Folder
            </button>
          )} */}
        </div>

        {/* ── Main Content Card ──────────────────────────── */}
        <div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden">

          {activeTab === 'files' ? (
            <>
              {/* ── NEW v2: Search + Sort + Filter Toolbar ── */}
              <div className="px-4 py-3 border-b border-gray-800/80 bg-gray-900/60 backdrop-blur-sm">
                <div className="flex flex-wrap items-center gap-3">

                  {/* Search (grows to fill available space) */}
                  <SearchBar
                    searchTerm={fm.searchTerm}
                    setSearchTerm={fm.setSearchTerm}
                    searchField={fm.searchField}
                    setSearchField={fm.setSearchField}
                    clearSearch={fm.clearSearch}
                  />

                  {/* Sort Dropdown */}
                  <SortDropdown
                    sortField={fm.sortField}
                    sortOrder={fm.sortOrder}
                    onSortChange={fm.handleSortChange}
                    setSortOrder={fm.setSortOrder}
                    isOpen={fm.sortDropOpen}
                    setIsOpen={fm.setSortDropOpen}
                  />

                  {/* Filter Panel */}
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

                {/* Active filter/search summary pill row */}
                {isFiltered && (
                  <div className="flex flex-wrap items-center gap-2 mt-2.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500">Active:</span>

                    {fm.searchTerm && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg
                                       bg-blue-500/10 border border-blue-500/20 text-blue-400 text-[10px] font-semibold">
                        🔍 "{fm.searchTerm}"
                        <button onClick={fm.clearSearch} className="hover:text-white cursor-pointer ml-0.5">×</button>
                      </span>
                    )}

                    {fm.filters.visibility && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg
                                       bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[10px] font-semibold">
                        Visibility: {fm.filters.visibility}
                        <button onClick={() => fm.updateFilter('visibility', '')} className="hover:text-white cursor-pointer ml-0.5">×</button>
                      </span>
                    )}

                    {fm.filters.fileType && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg
                                       bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[10px] font-semibold">
                        Type: {fm.filters.fileType.toUpperCase()}
                        <button onClick={() => fm.updateFilter('fileType', '')} className="hover:text-white cursor-pointer ml-0.5">×</button>
                      </span>
                    )}

                    {fm.filters.uploader && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg
                                       bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[10px] font-semibold">
                        By: {fm.filters.uploader}
                        <button onClick={() => fm.updateFilter('uploader', '')} className="hover:text-white cursor-pointer ml-0.5">×</button>
                      </span>
                    )}

                    {(fm.filters.dateFrom || fm.filters.dateTo) && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg
                                       bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[10px] font-semibold">
                        Date: {fm.filters.dateFrom || '…'} → {fm.filters.dateTo || '…'}
                        <button onClick={() => { fm.updateFilter('dateFrom', ''); fm.updateFilter('dateTo', ''); }}
                                className="hover:text-white cursor-pointer ml-0.5">×</button>
                      </span>
                    )}

                    {(fm.filters.sizeMinMB !== '' || fm.filters.sizeMaxMB !== '') && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-lg
                                       bg-purple-500/10 border border-purple-500/20 text-purple-400 text-[10px] font-semibold">
                        Size: {fm.filters.sizeMinMB || '0'}–{fm.filters.sizeMaxMB || '∞'} MB
                        <button onClick={() => { fm.updateFilter('sizeMinMB', ''); fm.updateFilter('sizeMaxMB', ''); }}
                                className="hover:text-white cursor-pointer ml-0.5">×</button>
                      </span>
                    )}

                    {/* Clear all */}
                    <button
                      onClick={() => { fm.resetFilters(); fm.clearSearch(); }}
                      className="text-[10px] text-gray-600 hover:text-red-400 transition-colors
                                 cursor-pointer underline underline-offset-2 ml-1"
                    >
                      Clear all
                    </button>

                    {/* Result count */}
                    <span className="ml-auto text-[10px] text-gray-500">
                      {fm.files.length} result{fm.files.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
              </div>

              {/* Path Display Area */}
{/* Minimalist Path Display (Status Only) */}
<div className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2 flex items-center gap-2">
  {/* Navigation Controls */}
  <div className="flex items-center gap-1 mr-2 border-r border-gray-800 pr-3">
    {/* ... your existing buttons ... */}
    <button 
      onClick={() => handleNavigateBack()}
      className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-all"
      title="Go Back"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
    </button>
    <button 
      onClick={() => setFolder(user.base_path)}
      className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-all"
      title="Root Directory"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/></svg>
    </button>
    <button 
      onClick={() => setFolder(`/public/`)}
      className="p-1.5 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-all"
      title="Public Directory"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/>
      </svg>
    </button>
  </div>

  {/* Location Display */}
  <span className="text-gray-500 text-[10px] font-bold uppercase tracking-widest mr-2">Loc:</span>
  <span className="text-blue-400 font-mono text-sm truncate select-none flex-1">
    {expoFolder || "/"}
  </span>

  {/* New Create Folder Button */}
  {expoFolder?.toLowerCase() !== "/public/" && (<button 
    onClick={() => {setIsFolderOpen(true)}}
    className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-gray-300 hover:text-white bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg transition-all"
  >
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
    </svg>
    New Folder
  </button>)}
</div>
              {/* ── File Table ─────────────────────────────── */}
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
                />
              )}

              {/* ── Pagination (unchanged) ───────────────── */}
              {fm.pagination.totalPages > 1 && (
                <div className="px-6 py-4 bg-gray-900 border-t border-gray-800/60 flex items-center justify-between">
                  <span className="text-xs text-gray-400">
                    Showing Page {fm.pagination.page} of {fm.pagination.totalPages}
                    <span className="ml-2 text-gray-600">({fm.pagination.total} total)</span>
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      disabled={fm.currentPage === 1}
                      onClick={() => fm.setCurrentPage(p => Math.max(p - 1, 1))}
                      className="px-3 py-1.5 text-xs font-semibold bg-gray-950 border border-gray-800
                                 rounded-lg text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed
                                 hover:bg-gray-800 cursor-pointer"
                    >
                      Prev
                    </button>
                    <button
                      disabled={fm.currentPage === fm.pagination.totalPages}
                      onClick={() => fm.setCurrentPage(p => Math.min(p + 1, fm.pagination.totalPages))}
                      className="px-3 py-1.5 text-xs font-semibold bg-gray-950 border border-gray-800
                                 rounded-lg text-gray-300 disabled:opacity-40 disabled:cursor-not-allowed
                                 hover:bg-gray-800 cursor-pointer"
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <UserManagement />
          )}
        </div>
      </main>

      {/* ── Upload Modal (enhanced — passes shared_label) ──── */}
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