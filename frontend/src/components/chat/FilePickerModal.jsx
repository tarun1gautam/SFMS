import React, { useState, useEffect, useCallback } from 'react';
import { X, Folder, ArrowLeft, FileText, FileSpreadsheet, FileImage, Presentation, File as FileIcon, Search } from 'lucide-react';
import api from '../../utils/api';

const ICON_MAP = {
  pdf: FileText, doc: FileText, docx: FileText, txt: FileText,
  xls: FileSpreadsheet, xlsx: FileSpreadsheet, csv: FileSpreadsheet,
  ppt: Presentation, pptx: Presentation,
  png: FileImage, jpg: FileImage, jpeg: FileImage, gif: FileImage,
};
function iconFor(name) {
  const ext = name?.split('.').pop()?.toLowerCase();
  return ICON_MAP[ext] || FileIcon;
}
function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default function FilePickerModal({ isOpen, onClose, user, onSelectFile }) {
  const [currentPath, setCurrentPath] = useState(user?.base_path || '/');
  const [currentFolderId, setCurrentFolderId] = useState(null);
  const [folders, setFolders] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // const loadFolder = useCallback(async (path) => {
  //   setLoading(true);
  //   try {
  //     const resolveRes = await api.get('/folders/resolve', { params: { folder_path: path } });
  //     const folderId = resolveRes.data.folder_id;
  //     setCurrentFolderId(folderId);

  //     const [foldersRes, filesRes] = await Promise.all([
  //       api.get('/folders', { params: { folder_path: path } }),
  //       api.get('/files', { params: { folder_id: folderId, page: 1, limit: 200 } }),
  //     ]);

  //     setFolders((foldersRes.data.folders || []).map(f => ({ ...f, full_path: decodeURIComponent(f.full_path) })));
  //     setFiles(filesRes.data.files || []);
  //   } catch (err) {
  //     console.error('FilePicker load error:', err);
  //     setFolders([]);
  //     setFiles([]);
  //   } finally {
  //     setLoading(false);
  //   }
  // }, []);

const loadFolder = useCallback(async (path) => {
    setLoading(true);
    try {
      const resolveRes = await api.get('/folders/resolve', { params: { folder_path: path } });
      const folderId = resolveRes.data.folder_id;
      setCurrentFolderId(folderId);

      const [foldersRes, filesRes] = await Promise.all([
        api.get('/folders', { params: { folder_path: path } }),
        api.get('/files', { params: { folder_id: folderId, page: 1, limit: 200 } }),
      ]);

      // Filter out the folder where folder_id matches the current folderId
      const filteredFolders = (foldersRes.data.folders || [])
        .filter(f => f.id !== folderId && f.folder_id !== folderId)
        .map(f => ({ ...f, full_path: decodeURIComponent(f.full_path) }));

      setFolders(filteredFolders);
      setFiles(filesRes.data.files || []);
    } catch (err) {
      console.error('FilePicker load error:', err);
      setFolders([]);
      setFiles([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const initial = user?.base_path || '/';
    setCurrentPath(initial);
    loadFolder(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFolderClick = (folder) => {
    setCurrentPath(folder.full_path);
    loadFolder(folder.full_path);
  };

  const handleBack = () => {
    if (currentPath === user?.base_path) return;
    const trimmed = currentPath.endsWith('/') ? currentPath.slice(0, -1) : currentPath;
    const lastSlash = trimmed.lastIndexOf('/');
    const parent = lastSlash <= 0 ? '/' : trimmed.substring(0, lastSlash) + '/';
    const finalPath = parent.length < (user?.base_path?.length || 1) ? user.base_path : parent;
    setCurrentPath(finalPath);
    loadFolder(finalPath);
  };

  const visibleFiles = files.filter(f =>
    !searchTerm || (f.file_name || f.original_name || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-surface dark:bg-gray-900 border border-line dark:border-gray-800 rounded-2xl w-full max-w-lg h-[75vh] shadow-2xl flex flex-col">

        <div className="flex items-center justify-between p-4 pb-3 shrink-0 border-b border-line dark:border-gray-800">
          <div>
            {/* <h3 className="text-sm font-bold text-ink dark:text-white">Send from SFMS</h3> */}
            <h3 className="text-sm font-bold text-ink dark:text-white">
  Send from SFMS
</h3>
            <p className="text-[11px] text-faint font-mono truncate max-w-[280px]">{currentPath}</p>
          </div>
          <button onClick={onClose} className="text-faint hover:text-ink dark:hover:text-white">
            <X size={18} />
          </button>
        </div>

        <div className="flex items-center gap-2 px-4 py-2.5 border-b border-line dark:border-gray-800 shrink-0">
          <button
            onClick={handleBack}
            disabled={currentPath === user?.base_path}
            className="p-1.5 rounded-lg text-subtle hover:bg-field dark:hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ArrowLeft size={15} />
          </button>
          <div className="relative flex-1">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Filter files in this folder..."
              className="w-full bg-field dark:bg-gray-800 border border-line dark:border-gray-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-ink dark:text-white focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <p className="text-xs text-faint text-center py-8">Loading…</p>
          ) : (
            <div className="space-y-0.5">
              {folders.filter(f => f.full_path !== '/public/' && f.full_path !== '/shared/').map(folder => (
                <button
                  key={folder.folder_id}
                  onClick={() => handleFolderClick(folder)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-field dark:hover:bg-gray-800 transition-colors text-left"
                >
                  <Folder size={16} className="text-blue-500 shrink-0" />
                  <span className="text-sm text-ink dark:text-gray-200 truncate">{folder.folder_name}</span>
                </button>
              ))}

              {visibleFiles.map(file => {
                const Icon = iconFor(file.file_name);
                return (
                  <button
                    key={file.id}
                    onClick={() => onSelectFile(file)}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl hover:bg-blue-500/5 border border-transparent hover:border-blue-500/20 transition-colors text-left group"
                  >
                    <Icon size={16} className="text-faint shrink-0 group-hover:text-blue-500" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ink dark:text-gray-200 truncate">{file.original_name || file.file_name}</p>
                      <p className="text-[10px] text-faint">{formatBytes(file.file_size)}</p>
                    </div>
                  </button>
                );
              })}

              {!loading && folders.length === 0 && visibleFiles.length === 0 && (
                <p className="text-xs text-faint text-center py-8">This folder is empty.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}