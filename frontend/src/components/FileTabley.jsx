/**
 * FileTable.jsx  (SFMS v2 — Enhanced)
 * [unchanged header comment]
 */

import React, { useEffect, useState, useRef } from 'react';
import { Download, Folder, FolderLock, Pencil, Trash2, Archive, FileQuestion } from 'lucide-react';
import EditFileModal  from './modals/EditFileModal';
import { toast } from 'react-hot-toast';
import api from '../utils/api';

// ─── Sub-components (unchanged logic, restyled markup) ─────────────────────

function SharedToBadges({ sharedLabel, visibility,type }) {
  let labels = [];

  const parseSharedLabel = (input) => {
    if (!input) return [];
    if (Array.isArray(input)) return input;
    if (typeof input === 'string') {
      if (input.startsWith('{') && input.endsWith('}')) {
        let content = input.slice(1, -1);
        const matches = content.match(/'([^']*)'/g);
        if (matches) return matches.map(m => m.slice(1, -1));
        return content.split(',').map(s => s.trim().replace(/['"]/g, '')).filter(s => s);
      }
      try {
        const parsed = JSON.parse(input);
        if (Array.isArray(parsed)) return parsed;
      } catch(e) {}
      if (input.includes(',')) return input.split(',').map(s => s.trim()).filter(s => s);
      if (input && input !== 'null' && input !== 'undefined') return [input];
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
  }else if (visibility === 'directory') {
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
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-gray-600/10 text-gray-400 border border-gray-600/20">
        📂 Directory
      </span>
    );
  }

  if (labels.length === 1 && (labels[0] === 'Private' || labels[0] === 'private')) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-gray-600/10 text-gray-400 border border-gray-600/20">
        🔒 Private
      </span>
    );
  }

  if (labels.length === 1 && labels[0] === '—') {
    return <span className="text-gray-600 text-xs">—</span>;
  }

  const uniqueLabels = [...new Set(labels.filter(l => l && l !== 'null' && l !== 'undefined'))];

  if (uniqueLabels.length === 0) {
    return <span className="text-gray-600 text-xs">—</span>;
  }

  const MAX_VISIBLE = 3;
  const visible  = uniqueLabels.slice(0, MAX_VISIBLE);
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
                     bg-gray-700/60 text-gray-400 border border-gray-600/30 cursor-help"
        >
          +{overflow} more
        </span>
      )}
    </div>
  );
}

function SortableHeader({ children, sortKey, currentSort, currentOrder, onSort, className = '' }) {
  const isActive = currentSort === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`py-3 px-4 select-none cursor-pointer group/th transition-colors
                  hover:text-gray-200 ${isActive ? 'text-blue-400' : 'text-gray-400'} ${className}`}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <span className="text-[10px] opacity-60 group-hover/th:opacity-100 transition-opacity">
          {isActive
            ? currentOrder === 'asc' ? '↑' : '↓'
            : <span className="text-gray-600">⇅</span>
          }
        </span>
      </span>
    </th>
  );
}

// ─── Format helpers (unchanged) ─────────────────────────────────────────────

const formatDate = (ts) => {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
  });
};

const formatTime = (ts) => {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: '2-digit', minute: '2-digit',
  });
};

const formatBytes = (bytes) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
};

const getMimeLabel = (mimeType) => {
  if (!mimeType) return '?';
  if (mimeType.includes('pdf'))              return 'PDF';
  if (mimeType.includes('wordprocessingml')) return 'DOCX';
  if (mimeType.includes('spreadsheetml'))    return 'XLSX';
  if (mimeType.includes('presentationml'))   return 'PPTX';
  if (mimeType.startsWith('image/'))         return mimeType.split('/')[1]?.toUpperCase() || 'IMG';
  if (mimeType.startsWith('video/'))         return 'VIDEO';
  if (mimeType.startsWith('audio/'))         return 'AUDIO';
  if (mimeType.includes('zip'))              return 'ZIP';
  if (mimeType.includes('rar'))              return 'RAR';
  if (mimeType.includes('text/plain'))       return 'TXT';
  if (mimeType.includes('csv'))              return 'CSV';
  if (mimeType.includes('json'))             return 'JSON';
  return mimeType.split('/').pop()?.slice(0, 6).toUpperCase() || '?';
};

const MIME_COLORS = {
  PDF:   'bg-red-500/10 text-red-400 border-red-500/20',
  DOCX:  'bg-blue-500/10 text-blue-400 border-blue-500/20',
  XLSX:  'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  PPTX:  'bg-orange-500/10 text-orange-400 border-orange-500/20',
  ZIP:   'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  RAR:   'bg-yellow-500/10 text-yellow-400 border-yellow-500/20',
  TXT:   'bg-gray-500/10 text-gray-400 border-gray-500/20',
  CSV:   'bg-teal-500/10 text-teal-400 border-teal-500/20',
  JSON:  'bg-purple-500/10 text-purple-400 border-purple-500/20',
  VIDEO: 'bg-pink-500/10 text-pink-400 border-pink-500/20',
  AUDIO: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
};
const getMimeColor = (mime) => MIME_COLORS[getMimeLabel(mime)] || 'bg-gray-500/10 text-gray-400 border-gray-500/20';

// ─── Main Component ──────────────────────────────────────────────────────────

export default function FileTable({
  files,
  onPin,
  onDelete,
  onDownload,
  sortField    = 'default',
  sortOrder    = 'desc',
  onSortChange = () => {},
  isFiltered   = false,
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
  selectedFileIds   = new Set(),
  selectedFolderIds = new Set(),
  onToggleFileSelect   = () => {},
  onToggleFolderSelect = () => {},
  onDownloadFolderZip  = () => {},
  select,
  setFileCount,
}) {

  const [activeFile, setActiveFile] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);

  const openEditModal = (file) => {
    setActiveFile(file);
    setIsEditModalOpen(true);
  };

  const filteredFolders = folders.filter((f) => {
    if (f.full_path === '/public/') return false;
    if (f.full_path === '/shared/') return false;

    if (f.visibility?.toLowerCase() === 'public') return true;

    if (f.visibility?.toLowerCase() === 'private') {
      if (!f.target_users || f.target_users.length === 0) return true;
      return f.target_users.some(t => t === user.user_id) ||
             f.created_by_name === user.user_id;
    }

    return false;
  });

  const combinedItems = [
    ...filteredFolders.map(f => ({ ...f, type: 'folder' })),
    ...files.map(f => ({ ...f, type: 'file' }))
  ].sort((a, b) => {
    if (a.type !== b.type) {
      return a.type === 'folder' ? -1 : 1;
    }
    if (a.type === 'folder') {
      const nameA = a.name || '';
      const nameB = b.name || '';
      return nameA.localeCompare(nameB);
    }
    return 0;
  });

  const filterfiles = combinedItems.filter(f => {
    if (!expoFolder) return false;
    const normalizedExpo = expoFolder.endsWith('/') ? expoFolder : `${expoFolder}/`;
    const isSharedView = normalizedExpo.toLowerCase() === '/shared/';
    if (isSharedView) {
      return true;
    }

    const decodedFullPath = f.full_path;
    if (f.type === "folder") {
      const normalizedFolder = decodedFullPath.endsWith('/') ? decodedFullPath : `${decodedFullPath}/`;
      const isInside = normalizedFolder.startsWith(normalizedExpo) && normalizedFolder !== normalizedExpo;
      const expoSlashCount = (normalizedExpo.match(/\//g) || []).length;
      const folderSlashCount = (normalizedFolder.match(/\//g) || []).length;
      return isInside && folderSlashCount === expoSlashCount + 1;

    } else {
      if (searchTerm.length > 0) {
        return true
      } else {
        return f.virtual_path === currentFolderId
      }
    }
  });

  const fileCount = filterfiles.filter(f => f.type !== "folder").length;

  useEffect(()=>{
    setFileCount(fileCount);
  },[fileCount])

  const handleDeleteFolder = async (fileId) => {
    setIsDeleting(true);
    if (!window.confirm('Are you sure you want to permanently erase this asset from disk storage?')) return;
    console.log(fileId)
    try {
      const response = await api.delete(`/folders/delete/${fileId}`);
      toast.success('Asset deleted successfully.');
      console.log(response)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Erase operation failed.');
      console.log(err.response)
    } finally{
      setIsDeleting(false);
      onRefresh();
    }
  };

  if (filterfiles.length === 0) {
    return (
      <div className="py-16 px-8 text-center text-gray-500">
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gray-800/50 border border-gray-800 flex items-center justify-center">
          <FileQuestion className="w-8 h-8 text-gray-600" strokeWidth={1.5} />
        </div>
        <span className="text-sm font-medium block text-gray-400">
          {isFiltered
            ? 'No files match your current search/filter criteria.'
            : 'No storage entities available under your present login session clearance.'}
        </span>
        {isFiltered && (
          <span className="text-xs text-gray-600 mt-1.5 block">
            Try adjusting or clearing your filters.
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-left border-collapse min-w-[900px]">
        <thead className="sticky top-[57px] z-10">
          <tr className="bg-gray-950/95 backdrop-blur-sm border-b border-gray-800 text-[11px] font-bold uppercase tracking-wider">
            {select?(<th className="py-2.5 px-3 w-8 text-gray-400">
              <input
                type="checkbox"
                className="w-3.5 h-3.5 accent-blue-500 cursor-pointer"
                checked={filterfiles.length > 0 && filterfiles.every(f =>
                  f.type === 'folder' ? selectedFolderIds.has(f.folder_id) : selectedFileIds.has(f.id)
                )}
                onChange={(e) => {
                  e.stopPropagation();
                  const allChecked = filterfiles.every(f =>
                    f.type === 'folder' ? selectedFolderIds.has(f.folder_id) : selectedFileIds.has(f.id)
                  );
                  filterfiles.forEach(f => {
                    if (f.type === 'folder') {
                      const isSelected = selectedFolderIds.has(f.folder_id);
                      if (allChecked && isSelected) onToggleFolderSelect(f.folder_id);
                      if (!allChecked && !isSelected) onToggleFolderSelect(f.folder_id);
                    } else {
                      const isSelected = selectedFileIds.has(f.id);
                      if (allChecked && isSelected) onToggleFileSelect(f.id);
                      if (!allChecked && !isSelected) onToggleFileSelect(f.id);
                    }
                  });
                }}
              />
            </th>):(<th className="py-3 px-4 w-10 text-gray-400"></th>)}
            <SortableHeader
              sortKey="name"
              currentSort={sortField}
              currentOrder={sortOrder}
              onSort={onSortChange}
            >
              File Reference Asset
            </SortableHeader>

            <SortableHeader
              sortKey="uploader"
              currentSort={sortField}
              currentOrder={sortOrder}
              onSort={onSortChange}
            >
              Added By
            </SortableHeader>

            <SortableHeader
              sortKey="upload_date"
              currentSort={sortField}
              currentOrder={sortOrder}
              onSort={onSortChange}
            >
              Upload Date
            </SortableHeader>

            <SortableHeader
              sortKey="size"
              currentSort={sortField}
              currentOrder={sortOrder}
              onSort={onSortChange}
              className="text-center"
            >
              Size / Status
            </SortableHeader>

            <th className="py-3 px-4 text-center text-gray-400 select-none">
              Operations Terminal
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-gray-800/40">
          {filterfiles.map((file) => {
            const mimeLabel = getMimeLabel(file.mime_type);
            const mimeColor = getMimeColor(file.mime_type);
            const isFolder = file.type === 'folder';
            const isPublicFolder = isFolder && file.visibility?.toLowerCase() === 'public';

            return (
              <tr
                key={file.id || file.folder_id}
                className={`group hover:bg-gray-800/25 transition-colors cursor-pointer ${
                  file.is_pinned ? 'bg-blue-600/[0.04]' : ''
                }`}
                onClick={isFolder?() => setFolder(decodeURIComponent(file.full_path)):()=>{}}
              >
                <td
                  className="py-3.5 px-4 w-12 text-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  {select && !isFolder ? (
                    <div className="flex items-center justify-center">
                      <input
                        type="checkbox"
                        className="w-3.5 h-3.5 accent-blue-500 cursor-pointer"
                        checked={isFolder ? selectedFolderIds.has(file.folder_id) : selectedFileIds.has(file.id)}
                        onChange={() => isFolder ? onToggleFolderSelect(file.folder_id) : onToggleFileSelect(file.id)}
                      />
                    </div>
                  ) : !isFolder ? (
                    <button
                      onClick={() => onPin(file.id)}
                      className={`transition-colors cursor-pointer text-base leading-none ${
                        file.is_pinned
                          ? 'text-yellow-500'
                          : 'text-gray-700 group-hover:text-gray-400'
                      }`}
                      title={file.is_pinned ? 'Unpin' : 'Pin to top'}
                    >
                      ★
                    </button>
                  ) : (
                    <div className="w-4 h-4" />
                  )}
                </td>

                {/* ── File Reference ── */}
                <td className="py-3.5 px-4 max-w-[280px]">
                  <div className="flex items-start gap-2.5">
                    {isFolder ? (
                      <div className={`shrink-0 mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center ${
                        isPublicFolder ? 'bg-blue-500/10' : 'bg-orange-500/10'
                      }`}>
                        {isPublicFolder ? (
                          <Folder size={15} className="text-blue-400" />
                        ) : (
                          <FolderLock size={15} className="text-orange-400" />
                        )}
                      </div>
                    ) : (
                      <span className={`shrink-0 mt-0.5 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${getMimeColor(file.mime_type)}`}>
                        {getMimeLabel(file.mime_type)}
                      </span>
                    )}
                    <div
                      className={`min-w-0 ${!isFolder ? 'cursor-pointer group/name' : ''}`}
                      onClick={() => {
                        if (!isFolder) {
                          onDownload(file.id, file.original_name, 'view');
                        }
                      }}
                    >
                      <span
                        className="block font-semibold text-[13px] text-gray-200 group-hover/name:text-blue-400
                                   transition-colors truncate"
                        title={isFolder?file.folder_name:file.original_name}
                      >
                        {isFolder?file.folder_name:file.file_name}
                      </span>

                      {!isFolder && searchTerm.length>0 && file.vvirtual_path && (
                        <span className="block text-[10px] text-blue-500/70 font-mono mt-0.5 truncate" title={`Located in: ${decodeURIComponent(file.vvirtual_path)}`}>
                          📁 {decodeURIComponent(file.vvirtual_path)}
                        </span>
                      )}

                      {!isFolder && file.description && (
                        <span className="block text-[10px] text-gray-500 font-mono mt-0.5 truncate"
                              title={file.description}>
                          {file.description}
                        </span>
                      )}
                    </div>
                  </div>
                </td>

                {/* ── Uploaded By ── */}
                <td className="py-3.5 px-4 text-gray-400">
                  {isFolder ? (
                    <span className="block text-xs font-medium text-gray-300">
                      {file.created_by_name}
                    </span>
                  ):(
                    <div>
                      <span className="block text-xs font-medium text-gray-300">
                        {file.uploaded_by}
                      </span>
                      <span className="block text-[9px] font-mono text-gray-600 mt-0.5">
                        {file.uploader_ip}
                      </span>
                    </div>
                  )}
                </td>

                {/* ── Upload Date ── */}
                <td className="py-3.5 px-4">
                  {isFolder ? (
                    <div>
                      <span className="block text-xs text-gray-300 whitespace-nowrap"
                            title={`Last modified: ${formatDate(file.last_modified)} ${formatTime(file.last_modified)}`}>
                        {formatDate(file.created_at)}
                      </span>
                      <span className="block text-[10px] text-gray-500 mt-0.5 whitespace-nowrap">
                        {formatTime(file.created_at)}
                      </span>
                    </div>
                  ) :(
                    <div>
                      <span className="block text-xs text-gray-300 whitespace-nowrap"
                            title={`Last modified: ${formatDate(file.last_modified)} ${formatTime(file.last_modified)}`}>
                        {formatDate(file.upload_timestamp)}
                      </span>
                      <span className="block text-[10px] text-gray-500 mt-0.5 whitespace-nowrap">
                        {formatTime(file.upload_timestamp)}
                      </span>
                    </div>
                  )}
                </td>

                {/* ── Size / Status ── */}
                <td className="py-3.5 px-4 text-center">
                  {isFolder?<span className="text-gray-700">—</span>:(
                    <div>
                      <span className="block text-xs font-semibold text-gray-300 whitespace-nowrap">
                        {formatBytes(file.file_size)}
                      </span>
                      <span className="block text-[10px] text-gray-500 mt-0.5">
                        {file.download_count} DL
                      </span>
                      {file.is_pinned && (
                        <span className="inline-block mt-1 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-wide bg-yellow-500/10 text-yellow-500 border border-yellow-500/20">
                          Pinned
                        </span>
                      )}
                    </div>
                  )}
                </td>

                {/* ── Operations ── */}
                <td className="py-3.5 px-4 text-center">
                  <div className="flex items-center justify-center gap-1.5 opacity-70 group-hover:opacity-100 transition-opacity">
                    {[
                      isFolder
                        ? { onClick: (e) => {
                            e.stopPropagation();
                            onDownloadFolderZip(file.folder_id, file.folder_name);
                          }, icon: <Archive size={16} />, title: "Download folder as ZIP", color: "hover:text-blue-400 hover:border-blue-500/50" }
                        : { onClick: (e) => {
                        e.stopPropagation();
                        onDownload(file.id, file.original_name)
                      }, icon: <Download size={16} />, title: "Download", color: "hover:text-blue-400 hover:border-blue-500/50" },
                      { onClick: (e) => {
                        e.stopPropagation();
                        openEditModal(file)
                      }, icon: <Pencil size={16} />, title: "Edit", color: "hover:text-emerald-400 hover:border-emerald-500/50", disabled: false },
                      {onClick: (e) => {
                      e.stopPropagation();
                      isFolder ? handleDeleteFolder(file.folder_id) : onDelete(file.id);
                    },  icon: <Trash2 size={16} />, title: "Delete", color: "hover:text-red-400 hover:border-red-500/50"}
                    ].map((btn, i) => (
                      <button
                        key={i}
                        onClick={btn.onClick}
                        title={btn.title}
                        className={`p-1.5 bg-gray-950 border border-gray-800 rounded-lg text-gray-500 transition-all duration-150 cursor-pointer hover:scale-105 ${btn.color}`}
                      >
                        {btn.icon}
                      </button>
                    ))}
                  </div>
                </td>

              </tr>
            );
          })}
        </tbody>
      </table>
      <EditFileModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        fileData={activeFile}
        expoFolder={expoFolder}
        onUpdateSuccess={onRefresh}
      />
    </div>
  );
}