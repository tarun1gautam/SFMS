/**
 * FileTable.jsx  (SFMS v2 — Enhanced)
 *
 * Changes from v1:
 *  • NEW "Shared To" column with badge/chip display
 *  • Sortable column headers (click-to-sort with direction arrows)
 *  • last_modified shown as tooltip on upload date
 *  • Better empty-state messaging when filters are active
 *  • All existing columns and styling preserved
 */

import React, { useEffect, useState, useRef } from 'react';
import { Download, Pencil, Trash2 } from 'lucide-react'; // Import icons
import EditFileModal  from './modals/EditFileModal';
import { toast } from 'react-hot-toast';
import api from '../utils/api';

// ─── Sub-components ──────────────────────────────────────────────────────────
/**
 * SharedToBadges — renders shared_label array as coloured chips.
 * Handles: 'Public', single user, multiple users, group names, '—'
 */
function SharedToBadges({ sharedLabel, visibility,type }) {
  // Fix: Properly parse and handle sharedLabel from database
  let labels = [];
  
  // Helper function to parse PostgreSQL array/text format like {'tarun'} or {'Public'}
  const parseSharedLabel = (input) => {
    if (!input) return [];
    
    // If it's already an array
    if (Array.isArray(input)) {
      return input;
    }
    
    // If it's a string
    if (typeof input === 'string') {
      // Handle PostgreSQL array format: {'tarun'} or {'Public','user2'}
      if (input.startsWith('{') && input.endsWith('}')) {
        // Remove curly braces and split by comma
        let content = input.slice(1, -1);
        // Parse quoted values
        const matches = content.match(/'([^']*)'/g);
        if (matches) {
          return matches.map(m => m.slice(1, -1));
        }
        // Fallback: split by comma
        return content.split(',').map(s => s.trim().replace(/['"]/g, '')).filter(s => s);
      }
      
      // Handle JSON string format
      try {
        const parsed = JSON.parse(input);
        if (Array.isArray(parsed)) return parsed;
      } catch(e) {
        // Not JSON, continue
      }
      
      // Handle comma-separated string
      if (input.includes(',')) {
        return input.split(',').map(s => s.trim()).filter(s => s);
      }
      
      // Single value
      if (input && input !== 'null' && input !== 'undefined') {
        return [input];
      }
    }
    
    return [];
  };
  
  // Parse the sharedLabel
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

  // if(type === "folder"){
  //   labels = sharedLabel;
  //   console.log(type,sharedLabel,visibility);
  // }

  // Check if it's the special 'Public' label
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
  
  // Check if it's Private
  if (labels.length === 1 && (labels[0] === 'Private' || labels[0] === 'private')) {
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-gray-600/10 text-gray-400 border border-gray-600/20">
        🔒 Private
      </span>
    );
  }
  
  // Check if it's the placeholder '—'
  if (labels.length === 1 && labels[0] === '—') {
    return <span className="text-gray-600 text-xs">—</span>;
  }

  // Remove duplicates and filter out empty values
  const uniqueLabels = [...new Set(labels.filter(l => l && l !== 'null' && l !== 'undefined'))];
  
  if (uniqueLabels.length === 0) {
    return <span className="text-gray-600 text-xs">—</span>;
  }

  // Multiple recipients or single named user — show up to 3 chips, then "+N more"
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

/**
 * SortableHeader — column header that shows sort indicator and is clickable.
 * sortKey must match a sortField value in useFileManager.
 */
function SortableHeader({ children, sortKey, currentSort, currentOrder, onSort, className = '' }) {
  const isActive = currentSort === sortKey;
  return (
    <th
      onClick={() => onSort(sortKey)}
      className={`py-2 px-4 select-none cursor-pointer group/th transition-colors
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

// ─── Format helpers ───────────────────────────────────────────────────────────

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

// Extract a friendly extension label from mime_type
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
  // fallback: use last part of mime
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

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FileTable({
  files,
  onPin,
  onDelete,
  onDownload,
  // Sort props (passed from Dashboard via useFileManager)
  sortField    = 'default',
  sortOrder    = 'desc',
  onSortChange = () => {},
  // Whether any search/filter is active (for empty state message)
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
}) {

  const [activeFile, setActiveFile] = useState(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);


      const openEditModal = (file) => {
  setActiveFile(file);
  setIsEditModalOpen(true);
};

// Merge folders and files
const filteredFolders = folders.filter((f) => {
  // Never show the root public folder itself
  if (f.full_path === '/public/') return false;

  if (f.visibility?.toLowerCase() === 'public') return true;

  if (f.visibility?.toLowerCase() === 'private') {
    // Empty target_users = shared with everyone
    if (!f.target_users || f.target_users.length === 0) return true;
    // User is in target_users OR is the creator
    return f.target_users.some(t => t === user.user_id) || 
           f.created_by_name === user.user_id;
  }

  return false;
});

const combinedItems = [
  ...filteredFolders.map(f => ({ ...f, type: 'folder', })),
  ...files.map(f => ({ ...f, type: 'file' }))
].sort((a, b) => (a.type === 'folder' ? -1 : 1));

const filterfiles = combinedItems.filter(f =>{
  if (!expoFolder) return false;
  const normalizedExpo = expoFolder.endsWith('/') ? expoFolder : `${expoFolder}/`;
  const decodedFullPath = f.full_path;
  if(f.type==="folder"){
    const normalizedFolder = decodedFullPath.endsWith('/') ? decodedFullPath : `${decodedFullPath}/`;
    const isInside = normalizedFolder.startsWith(normalizedExpo) && normalizedFolder !== normalizedExpo;
    const expoSlashCount = (normalizedExpo.match(/\//g) || []).length;
    const folderSlashCount = (normalizedFolder.match(/\//g) || []).length;
    return isInside && folderSlashCount === expoSlashCount + 1;

  }else{
    if(searchTerm.length>0){
      return true
    }else{
      return f.virtual_path === currentFolderId
    }
  // if(f.virtual_path === currentFolderId){
  //   return true;
  // }
}
});

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
      <div className="p-12 text-center text-gray-500">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mx-auto mb-3 opacity-30"
             fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0a2 2 0 01-2 2H6a2 2 0 01-2-2m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
        </svg>
        <span className="text-sm font-medium block">
          {isFiltered
            ? 'No files match your current search/filter criteria.'
            : 'No storage entities available under your present login session clearance.'}
        </span>
        {isFiltered && (
          <span className="text-xs text-gray-600 mt-1 block">
            Try adjusting or clearing your filters.
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-left border-collapse min-w-[900px]">
        <thead>
          <tr className="bg-gray-950/60 border-b border-gray-800 text-[11px] font-bold uppercase tracking-wider">
            {/* Pin column — no sort */}
            <th className="py-2 px-4 w-10 text-gray-400"></th>

            {/* File Reference — sortable by name */}
            <SortableHeader
              sortKey="name"
              currentSort={sortField}
              currentOrder={sortOrder}
              onSort={onSortChange}
            >
              File Reference Asset
            </SortableHeader>

            {/* Visibility — sortable */}
            {/* <SortableHeader
              sortKey="visibility"
              currentSort={sortField}
              currentOrder={sortOrder}
              onSort={onSortChange}
            >
              Visibility
            </SortableHeader> */}

            {/* NEW: Shared To — not sortable (array column) */}
            {/* <th className="py-2 px-4 text-gray-400 select-none">Shared To</th> */}

            {/* Uploaded By — sortable */}
            <SortableHeader
              sortKey="uploader"
              currentSort={sortField}
              currentOrder={sortOrder}
              onSort={onSortChange}
            >
              Added By
            </SortableHeader>

            {/* Upload Date — sortable */}
            <SortableHeader
              sortKey="upload_date"
              currentSort={sortField}
              currentOrder={sortOrder}
              onSort={onSortChange}
            >
              Upload Date
            </SortableHeader>

            {/* Size — sortable */}
            <SortableHeader
              sortKey="size"
              currentSort={sortField}
              currentOrder={sortOrder}
              onSort={onSortChange}
              className="text-center"
            >
              Size / Status
            </SortableHeader>

            {/* Operations — no sort */}
            <th className="py-2 px-4 text-center text-gray-400 select-none">
              Operations Terminal
            </th>
          </tr>
        </thead>

        <tbody className="divide-y divide-gray-800/40">
          {filterfiles.map((file) => {
            const mimeLabel = getMimeLabel(file.mime_type);
            const mimeColor = getMimeColor(file.mime_type);
            const isFolder = file.type === 'folder';

            return (
              <tr
                key={file.id || file.folder_id}
                className={`group hover:bg-gray-800/30 transition-colors cursor-pointer ${
                  file.is_pinned ? 'bg-blue-600/[0.03]' : ''
                }`}
                onClick={isFolder?() => setFolder(decodeURIComponent(file.full_path)):()=>{}}
              >
                {/* ── Pin ───────────────────────────────── */}
                <td className="py-4 px-4 text-center">
                  {!isFolder && (
                    
                    <button
                    onClick={() => onPin(file.id)}
                    className={`transition-colors cursor-pointer text-base ${
                      file.is_pinned
                      ? 'text-yellow-500'
                      : 'text-gray-600 group-hover:text-gray-400'
                      }`}
                      title={file.is_pinned ? 'Unpin' : 'Pin to top'}
                      >
                    ★
                  </button>
                  )}
                </td>

                {/* ── File Reference ─────────────────────── */}
                <td className="py-4 px-4 max-w-[240px]">
                  {/* File type badge + name */}
                  <div className="flex items-start gap-2">
                    {isFolder ? (
  file.visibility?.toLowerCase() === 'public' ? (
    // Public folder — blue
    <svg className="w-5 h-5 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
      <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
    </svg>
  ) : (
    // Private folder — orange with lock
    <svg className="w-5 h-5 text-orange-500" fill="currentColor" viewBox="0 0 24 24">
      <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z"/>
      <path d="M18 13c-.55 0-1 .45-1 1v1h-1v-1c0-1.1.9-2 2-2s2 .9 2 2v1h-1v-1c0-.55-.45-1-1-1z" fill="white"/>
      <path d="M18 12c-1.1 0-2 .9-2 2v1h4v-1c0-1.1-.9-2-2-2z"/>
    </svg>
  )
) : (
  // File — mime type badge
  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${getMimeColor(file.mime_type)}`}>
    {getMimeLabel(file.mime_type)}
  </span>
)}
                    <div
                      className={`min-w-0 ${!isFolder ? 'cursor-pointer group' : ''}`}
                      onClick={() => {
                        if (!isFolder) {
                          onDownload(file.id, file.original_name, 'view');
                        }
                      }}
                    >
                      <span
                        className="block font-semibold text-gray-200 group-hover:text-blue-400
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

                      {!isFolder && (<span className="block text-[10px] text-gray-500 font-mono mt-0.5 truncate"
                            title={file.description}>
                        {file.description}
                      </span>)}
                      {/* File ID for reference
                      <span className="block text-[9px] text-gray-700 font-mono mt-0.5 truncate"
                            title={`ID: ${file.id}`}>
                        #{file.id?.slice(0, 8)}…
                      </span> */}
                    </div>
                  </div>
                </td>

                {/* ── Visibility ─────────────────────────── */}
                {/* <td className="py-4 px-4">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px]
                                   font-bold uppercase tracking-wide border ${
                    file.visibility === 'public'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : file.visibility === 'private'
                        ? 'bg-red-500/10 text-red-400 border-red-500/20'
                        : 'bg-orange-500/10 text-orange-400 border-orange-500/20'
                  }`}>
                    {file.visibility}
                  </span>
                </td> */}

                {/* ── NEW: Shared To ─────────────────────── */}
                {/* <td className="py-4 px-4 text-xs text-gray-500">
                  <SharedToBadges sharedLabel={file.shared_label} visibility={file.visibility} type={file.type}/>
                </td> */}

                {/* ── Uploaded By ────────────────────────── */}
                <td className="py-4 px-4 text-gray-400">
                  {isFolder ? (<span className="block text-xs font-medium text-gray-300">
                    {file.created_by_name}
                  </span>):(<div>
                  <span className="block text-xs font-medium text-gray-300">
                    {file.uploaded_by}
                  </span>
                  <span className="block text-[9px] font-mono text-gray-500 mt-0.5">
                    {file.uploader_ip}
                  </span>
                  </div>)}
                </td>

                {/* ── Upload Date (+ last modified tooltip) ─ */}
                <td className="py-4 px-4">
                  {isFolder ? (<div>
                  <span className="block text-xs text-gray-300 whitespace-nowrap"
                        title={`Last modified: ${formatDate(file.last_modified)} ${formatTime(file.last_modified)}`}>
                    {formatDate(file.created_at)}
                  </span>
                  <span className="block text-[10px] text-gray-500 mt-0.5 whitespace-nowrap">
                    {formatTime(file.created_at)}
                  </span>
                  {/* Show last_modified if different from upload
                  {file.last_modified && file.last_modified !== file.upload_timestamp && (
                    <span className="block text-[9px] text-gray-600 mt-0.5 italic whitespace-nowrap">
                      mod: {formatDate(file.last_modified)}
                    </span>
                  )} */}
                  </div>) :(
                  <div>
                  <span className="block text-xs text-gray-300 whitespace-nowrap"
                        title={`Last modified: ${formatDate(file.last_modified)} ${formatTime(file.last_modified)}`}>
                    {formatDate(file.upload_timestamp)}
                  </span>
                  <span className="block text-[10px] text-gray-500 mt-0.5 whitespace-nowrap">
                    {formatTime(file.upload_timestamp)}
                  </span>
                  {/* Show last_modified if different from upload
                  {file.last_modified && file.last_modified !== file.upload_timestamp && (
                    <span className="block text-[9px] text-gray-600 mt-0.5 italic whitespace-nowrap">
                      mod: {formatDate(file.last_modified)}
                    </span>
                  )} */}
                  </div>)}
                </td>

                {/* ── Size / Status ──────────────────────── */}
                <td className="py-4 px-4 text-center">
                  {isFolder?"-":(
                    <div>
                  <span className="block text-xs font-semibold text-gray-300 whitespace-nowrap">
                    {formatBytes(file.file_size)}
                  </span>
                  <span className="block text-[10px] text-gray-500 mt-0.5">
                    {file.download_count} DL
                  </span>
                  {file.is_pinned && (
                    <span className="block text-[9px] text-yellow-600 mt-0.5">PINNED</span>
                  )}</div>)}
                </td>

                {/* ── Operations ─────────────────────────── */}
                <td className="py-4 px-4 text-center">
  <div className="flex items-center justify-center gap-1.5">
    {[
      { onClick: (e) => {
        e.stopPropagation();
        onDownload(file.id, file.original_name)
      }, icon: <Download size={18} />, title: "Download", color: "hover:text-blue-400 hover:border-blue-500/50", disabled: isFolder },
      { onClick: (e) => {
        e.stopPropagation();
        openEditModal(file)
      }, icon: <Pencil size={18} />, title: "Edit", color: "hover:text-emerald-400 hover:border-emerald-500/50", disabled: false },
      {onClick: (e) => { 
      e.stopPropagation(); 
      isFolder ? handleDeleteFolder(file.folder_id) : onDelete(file.id); 
    },  icon: <Trash2 size={18} />, title: "Delete", color: "hover:text-red-400 hover:border-red-500/50"}
    ].map((btn, i) => (
      <button
        key={i}
        onClick={btn.onClick}
        title={btn.title}
        className={`p-2 bg-gray-950 border border-gray-800 rounded-lg text-gray-500 transition-all duration-200 cursor-pointer ${btn.color}`}
      >
        <span className="text-sm">{btn.icon}</span>
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