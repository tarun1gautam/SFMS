import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import { validateName, validateFreeText, validateUsername } from '../../utils/inputGuard';
import { toast } from 'react-hot-toast';
import PdfToolsSection from './Pdftoolssection';

// ── Recent History / Activity helpers (NEW — module scope, no props needed) ──
const ACTIVITY_ICON_PATHS = {
  upload:     'M12 15V4m0 0L8 8m4-4l4 4M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3',
  download:   'M12 4v11m0 0l-4-4m4 4l4-4M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3',
  rename:     'M4 20h4l10.5-10.5a2.12 2.12 0 00-3-3L5 17v3z',
  delete:     'M6 7h12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2m-7 0l1 12a1 1 0 001 1h4a1 1 0 001-1l1-12',
  move:       'M5 12h14M13 6l6 6-6 6',
  copy:       'M8 8h10v10H8zM6 6h10v2H8a2 2 0 00-2 2v8H6z',
  share:      'M6 12a3 3 0 100-6 3 3 0 000 6zm0 0a3 3 0 013 3m9-9a3 3 0 11-6 0 3 3 0 016 0zm0 0a3 3 0 01-3 3m-6 3l6 3m-6-9l6-3',
  permission: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
  pin:        'M12 2l1.8 5.6H19l-4.6 3.4 1.8 5.6L12 13.2 7.8 16.6l1.8-5.6L5 7.6h5.2z',
  default:    'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
};

const activityIconKey = (action = '') => {
  const a = action.toLowerCase();
  if (a.includes('upload')) return 'upload';
  if (a.includes('download')) return 'download';
  if (a.includes('rename') || a.includes('edit')) return 'rename';
  if (a.includes('delete')) return 'delete';
  if (a.includes('move')) return 'move';
  if (a.includes('copy')) return 'copy';
  if (a.includes('share') || a.includes('transfer')) return 'share';
  if (a.includes('permission') || a.includes('visibility') || a.includes('lock')) return 'permission';
  if (a.includes('pin')) return 'pin';
  return 'default';
};

const ActivityIcon = ({ action, className }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className={className}>
    <path strokeLinecap="round" strokeLinejoin="round" d={ACTIVITY_ICON_PATHS[activityIconKey(action)]} />
  </svg>
);

const timeAgo = (iso) => {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

const describeActivity = (item) => {
  const meta = item.metadata || {};
  const key = activityIconKey(item.action);
  if (key === 'rename') {
    return {
      title: item.targetType === 'folder' ? 'Folder renamed' : 'File renamed',
      detail: meta.oldName && meta.newName ? `${meta.oldName} → ${meta.newName}` : item.targetLabel,
    };
  }
  const titles = {
    upload: item.targetType === 'folder' ? 'Folder created' : 'File uploaded',
    download: 'File downloaded',
    delete: item.targetType === 'folder' ? 'Folder deleted' : 'File deleted',
    move: 'Item moved',
    copy: 'Item copied',
    share: 'Ownership / sharing updated',
    permission: 'Permissions updated',
    pin: 'Pin status changed',
    default: item.targetType === 'folder' ? 'Folder updated' : 'File updated',
  };
  return { title: titles[key], detail: item.targetLabel };
};

// ── Activity Details modal — nested, reads the same /activity endpoint ──────
function ActivityDetailsModal({ targetId, targetType, onClose }) {
  const [items,  setItems]  = useState([]);
  const [status, setStatus] = useState('loading'); // loading | success | error

  const load = () => {
    setStatus('loading');
    api.get(`/files/${targetId}/activity`, { params: { targetType, limit: 20 } })
      .then(res => { setItems(res.data.activities || []); setStatus('success'); })
      .catch(() => setStatus('error'));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [targetId, targetType]);

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-[fadeIn_0.15s_ease-out]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-lg max-h-[70vh] flex flex-col rounded-2xl border border-gray-200 dark:border-gray-800
                       bg-white dark:bg-gray-900 shadow-2xl overflow-hidden animate-[scaleIn_0.15s_ease-out]">
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <div>
            <h3 className="text-sm font-bold text-gray-900 dark:text-white">Activity Details</h3>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-0.5">What happened to this item</p>
          </div>
          <button onClick={onClose} aria-label="Close"
            className="w-7 h-7 flex items-center justify-center rounded-lg text-gray-400 dark:text-gray-500
                       hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1">
          {status === 'loading' && (
            <div className="space-y-4 px-5 py-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex items-start gap-3 animate-pulse">
                  <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-800 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-2.5 w-1/3 rounded bg-gray-200 dark:bg-gray-800" />
                    <div className="h-2.5 w-2/3 rounded bg-gray-200 dark:bg-gray-800" />
                    <div className="h-2 w-1/5 rounded bg-gray-200 dark:bg-gray-800" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {status === 'error' && (
            <div className="flex flex-col items-center justify-center py-12 px-5 text-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                className="w-9 h-9 text-red-400 dark:text-red-500 mb-3">
                <circle cx="12" cy="12" r="9" />
                <path strokeLinecap="round" d="M12 8v5M12 16h.01" />
              </svg>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Couldn't load activity</p>
              <button onClick={load} className="mt-3 text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline">
                Try again
              </button>
            </div>
          )}

          {status === 'success' && items.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 px-5 text-center">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"
                className="w-9 h-9 text-gray-300 dark:text-gray-700 mb-3">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">No activity yet</p>
              <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">Actions on this item will show up here.</p>
            </div>
          )}

          {status === 'success' && items.length > 0 && (
            <ul className="px-5 py-3 space-y-4">
              {items.map((item) => {
                const { title, detail } = describeActivity(item);
                return (
                  <li key={item.id} className="flex items-start gap-3">
                    <span className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 dark:bg-gray-800 shrink-0 mt-0.5">
                      <ActivityIcon action={item.action} className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-gray-800 dark:text-gray-200">{title}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-500 truncate">{detail}</p>
                      <p className="text-[10.5px] text-gray-400 dark:text-gray-600 mt-0.5">{timeAgo(item.createdAt)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default function EditFileModal({ isOpen, onClose, fileData, expoFolder, onUpdateSuccess }) {
  const [fileName,            setFileName]            = useState('');
  const [visibility,          setVisibility]          = useState('public');
  const [description,         setDescription]         = useState('');
  const [filePath,            setFilePath]            = useState('');
  const [folderPath,          setFolderPath]          = useState('');
  const [targetUsers,         setTargetUsers]         = useState([]);
  const [targetUsersInputval, setTargetUsersInputval] = useState('');
  const [suggestions,         setSuggestions]         = useState([]);
  const [realTargetUsers,     setRealTargetUsers]     = useState([]);
  const [parentVisibility,    setParentVisibility]    = useState(null);
  const [parentTargetUsers,   setParentTargetUsers]   = useState([]);
  const [folderSharingEnabled, setFolderSharingEnabled] = useState(false);
  const [transferQuery,    setTransferQuery]    = useState('');
  const [transferOptions,  setTransferOptions]  = useState([]);
  const [selectedTransfer, setSelectedTransfer] = useState(null);
  const [confirmOpen,      setConfirmOpen]      = useState(false);
  const [confirmText,      setConfirmText]      = useState('');
  const [transferring,     setTransferring]     = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [downloadOnly, setDownloadOnly] = useState(false);

  // ── Recent History / Activity (NEW — additive only) ────────────────
  const [historyItems,    setHistoryItems]    = useState([]);
  const [historyLoading,  setHistoryLoading]  = useState(false);
  const [historyError,    setHistoryError]    = useState(false);
  const [activityModalOpen, setActivityModalOpen] = useState(false);

  const isFolder   = fileData?.type === 'folder';
  const permLevel  = { private: 0, group: 1, directory: 2, public: 3 };
  const activityTargetId = isFolder ? fileData?.folder_id : fileData?.id;

  // ── Populate form when fileData changes ────────────────────
  useEffect(() => {
    if (!fileData) return;
    if (isFolder) {
      setFileName(fileData.folder_name || '');
      setVisibility(fileData.visibility.toLowerCase() || 'public');
      setFolderPath(decodeURIComponent(fileData.full_path) || '/')
      setDescription('');
      setFilePath('');
      setDownloadOnly(fileData.download_only || false);
      console.log("download_only:", fileData.download_only);
      setTargetUsers(fileData.target_users || []);
      setRealTargetUsers(fileData.target_users || []);
      // Folder sharing is "on" if it's already public with target users set
      setFolderSharingEnabled(
        (fileData.visibility.toLowerCase() || 'public') === 'public' &&
        Array.isArray(fileData.target_users) &&
        fileData.target_users.length > 0
      );
    } else {
      setFileName(fileData.file_name || '');
      setVisibility(fileData.visibility || 'public');
      setDescription(fileData.description || '');
      setFilePath(fileData.file_path || '');
      setTargetUsers(fileData.target_users || []);
      setRealTargetUsers(fileData.target_users || []);
    }
  }, [fileData]);

  // ── Fetch parent folder settings ───────────────────────────
  useEffect(() => {
    if (!isOpen || !fileData) return;

    const parentPath = isFolder ? fileData.parent_path : null;
    if (!parentPath) { setParentVisibility(null); setParentTargetUsers([]); return; }

    api.get('/folders', { params: { folder_path: parentPath } })
      .then(res => {
        const parent = res.data.folders?.find(
          f => decodeURIComponent(f.full_path) === parentPath
        );
        setParentVisibility(parent?.visibility || null);
        setParentTargetUsers(parent?.target_users || []);
      })
      .catch(() => { setParentVisibility(null); setParentTargetUsers([]); });
  }, [isOpen, fileData]);

  // ── Reset target_users when visibility changes ─────────────
  useEffect(() => {
    if (visibility === 'private') {
      setTargetUsers(realTargetUsers);
      return;
    }
    if (visibility === 'public' && isFolder) {
      // Public folders keep target_users only if sharing toggle is on
      setTargetUsers(folderSharingEnabled ? realTargetUsers : []);
      return;
    }
    // directory, or public non-folder
    setTargetUsers([]);
  }, [visibility, realTargetUsers, isFolder, folderSharingEnabled]);

  // ── Turn sharing off automatically if visibility leaves public ──
  useEffect(() => {
    if (visibility.toLowerCase() !== 'public' && folderSharingEnabled) {
      setFolderSharingEnabled(false);
    }
  }, [visibility]);

  // ── Fetch recent activity for this file/folder (NEW) ────────────────
  useEffect(() => {
    if (!isOpen || !activityTargetId) return;
    setHistoryLoading(true);
    setHistoryError(false);
    api.get(`/files/${activityTargetId}/activity`, {
      params: { targetType: isFolder ? 'folder' : 'file', limit: 5 },
    })
      .then(res => setHistoryItems(res.data.activities || []))
      .catch(() => setHistoryError(true))
      .finally(() => setHistoryLoading(false));
  }, [isOpen, activityTargetId, isFolder]);

  if (!isOpen) return null;

  // ── Visibility options ─────────────────────────────────────
  const maxLevel = parentVisibility ? (permLevel[parentVisibility] ?? 3) : 3;

const getVisibilityOptions = () => {
  // Option rendering for Folders
  if (isFolder) {
    const opts = [
      { value: 'public', label: 'Public' },
      { value: 'private', label: 'Private' },
    ];

    return opts
      .filter(o => (permLevel[o.value] ?? 3) <= maxLevel)
      .map(o => <option key={o.value} value={o.value}>{o.label}</option>);
  }

  // Option rendering for Files
  return <option value="public">Public</option>;
};

  const showTargetUsersSection =
    visibility === 'private' ||
    (isFolder && visibility.toLowerCase() === 'public' && folderSharingEnabled);

  const handleToggleFolderSharing = () => {
    const next = !folderSharingEnabled;
    setFolderSharingEnabled(next);
    setTargetUsers(next ? realTargetUsers : []);
    if (!next) {
      setTargetUsersInputval('');
      setSuggestions([]);
    }
  };

  // ── User search — restricted to parent users if folder in private parent ──
  const handleSearchChange = async (e) => {
    const value = e.target.value;
    setTargetUsersInputval(value);
    if (!value.length) { setSuggestions([]); return; }

    if (isFolder && parentVisibility === 'private' && parentTargetUsers.length > 0) {
      // Only show users from parent's list
      const filtered = parentTargetUsers.filter(u =>
        u.toLowerCase().includes(value.toLowerCase()) &&
        !targetUsers.includes(u)
      );
      setSuggestions(filtered);
    } else {
      try {
        const res = await api.get(`/auth/users/search?query=${encodeURIComponent(value)}`);
        // setSuggestions(res.data.users.filter(u => !targetUsers.includes(u.user_id)));
        // console.log(res.data.users.filter(u => !targetUsers.includes(u.user_id)))
        setSuggestions(res.data.users.filter((u) => {
  // 1. Guard against object vs string comparison (adjust u.username or u.id if needed)
  const isAlreadySelected = targetUsers.includes(u.user_id || u.id || u);
  if (isAlreadySelected) {
    return false; // Always exclude if already selected
  }

  // 2. Normalize paths to prevent accidental substring partial matches (e.g., /SPMU vs /SPMU-2)
  const normFolderPath = folderPath.endsWith('/') ? folderPath : `${folderPath}/`;
  const normUserPath = (u.base_path || '').endsWith('/') ? u.base_path : `${u.base_path}/`;
  console.log(normFolderPath,normUserPath,u.base_path);

  // If user base_path is completely empty or missing, handle gracefully
  if (!u.base_path) return false;

  // 3. Folder Sharing Enabled + Public Visibility Rule
  if (folderSharingEnabled && visibility.toLowerCase() === "public") {
    // Exclude if already in scope (i.e., folderPath starts with user path)
    if (normFolderPath.startsWith(normUserPath)) {
      return false; 
    }
    return true;
  }

  // 4. Folder Sharing Disabled + Private Visibility Rule
  if (!folderSharingEnabled && visibility === "private") {
    // Only show users whose scope chain covers this folder (folder is at or deep inside user base path)
    return normFolderPath.startsWith(normUserPath);
  }

  // Fallback default for any other state permutations
  return false;
}));
      } catch (err) {
        console.error('User search error:', err);
      }
    }
  };


  const currentOwner = isFolder ? fileData?.created_by_name : fileData?.uploaded_by;
const itemPath = isFolder ? fileData?.full_path : decodeURIComponent(filePath).replace(/[^/]*$/, '');

const handleTransferSearch = async (e) => {
  const value = e.target.value;
  setTransferQuery(value);
  if (!itemPath) return;
  try {
    const res = await api.get('/auth/users/transfer-eligible', {
      params: { path: itemPath, query: value }
    });
    setTransferOptions(res.data.users || []);
  } catch (err) {
    console.error('Transfer-eligible search error:', err);
  }
};

const handleConfirmTransfer = async () => {
  if (confirmText !== 'TRANSFER') { toast.error('Type TRANSFER exactly to confirm.'); return; }
  setTransferring(true);
  try {
    if (isFolder) {
      await api.put(`/folders/transfer/${fileData.folder_id}`, {
        new_owner: selectedTransfer.user_id,
        confirmation: confirmText,
      });
    } else {
      await api.put(`/files/transfer/${fileData.id}`, {
        new_owner: selectedTransfer.user_id,
        confirmation: confirmText,
      });
    }
    toast.success('Ownership transferred successfully.');
    setConfirmOpen(false);
    setConfirmText('');
    setSelectedTransfer(null);
    onUpdateSuccess();
    onClose();
  } catch (err) {
    toast.error(err.response?.data?.error || 'Transfer failed.');
  } finally {
    setTransferring(false);
  }
};

  // ── Handle save ────────────────────────────────────────────
  const handleUpdate = async () => {
    const cleanedName = fileName.trim();

    if (!cleanedName) { toast.error('Name cannot be empty.'); return; }
    const nameCheck = validateName(cleanedName, { label: isFolder ? 'Folder name' : 'File name' });
    if (!nameCheck.valid) { toast.error(nameCheck.message); return; }

    if (visibility === 'private' && targetUsers.length === 0) {
      toast.error('Select at least one target user for private visibility.');
      return;
    }

    if (isFolder && visibility === 'public' && folderSharingEnabled && targetUsers.length === 0) {
      toast.error('Add at least one user to share this folder with, or turn off folder sharing.');
      return;
    }

    // ── FOLDER update ──────────────────────────────────────
    if (isFolder) {
      if (parentVisibility) {
        const parentLevel = permLevel[parentVisibility] ?? 3;
        const newLevel    = permLevel[visibility] ?? 3;
        if (newLevel > parentLevel) {
          toast.error(`Cannot set visibility to "${visibility}" — parent folder is "${parentVisibility}".`);
          return;
        }
      }

      // Block users outside parent's list (private folders only —
      // public-folder sharing is intentionally allowed to go outside scope)
      if (visibility === 'private' && parentVisibility === 'private' && parentTargetUsers.length > 0) {
        const parentSet    = new Set(parentTargetUsers);
        const invalidUsers = targetUsers.filter(u => !parentSet.has(u));
        if (invalidUsers.length > 0) {
          toast.error(`Users [${invalidUsers.join(', ')}] are not in the parent folder's access list.`);
          return;
        }
      }

    const descCheck = validateFreeText(description, { label: 'Description' });
    if (!descCheck.valid) { toast.error(descCheck.message); return; }

      try {
        await api.put(`/folders/edit/${fileData.folder_id}`, {
          folder_name  : cleanedName,
          visibility,
          target_users : targetUsers,
          download_only: downloadOnly,
        });
        toast.success('Folder updated successfully.');
        onUpdateSuccess();
        onClose();
      } catch (err) {
        toast.error(err.response?.data?.error || 'Failed to update folder.');
      }
      return;
    }

    // ── FILE update ────────────────────────────────────────
    const originalName = fileData?.file_name || '';
    if (cleanedName.toLowerCase() !== originalName.toLowerCase()) {
      try {
        const collisionRes = await api.get('/files/check-collision', {
  params: { filename: cleanedName, folder_id: fileData.virtual_path }
});
        if (collisionRes.data?.exists) {
          toast.error('A file with this name already exists. Choose a different name.');
          return;
        }
      } catch (err) {
        toast.error('Error checking file name availability.');
        return;
      }
    }

    const oldPath = filePath;
    const newPath = oldPath.replace(/[^\\/]*$/, cleanedName);

    try {
      await api.put(`/files/edit/${fileData.id}`, {
        file_name    : cleanedName,
        visibility,
        original_name: fileData.original_name,
        description,
        file_path    : newPath,
        target_users : targetUsers,
      });
      toast.success('File updated successfully.');
      onUpdateSuccess();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update file.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-white/70 dark:bg-gray-950/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl w-full max-w-md p-5 shadow-xl relative
                       max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-4 pb-2.5 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 ${
              isFolder ? 'bg-violet-500/10 text-violet-500 dark:text-violet-400' : 'bg-blue-500/10 text-blue-500 dark:text-blue-400'
            }`}>
              {isFolder ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-4 h-4">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 3h7l4 4v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 3v4h4" />
                </svg>
              )}
            </span>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-gray-900 dark:text-white truncate">
                {isFolder ? 'Edit Folder' : 'Edit File Details'}
              </h2>
              <p className="text-[11px] text-gray-500 dark:text-gray-500 truncate">
                {isFolder ? (fileData?.folder_name || '') : (fileData?.file_name || '')}
              </p>
            </div>
          </div>

          {isFolder && (
            <button
              type="button"
              onClick={() => setDownloadOnly(v => !v)}
              className={`group flex items-center gap-1.5 px-2 py-1 rounded-full border shrink-0 transition-all ${
                downloadOnly
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-600 dark:text-amber-400'
                  : 'bg-gray-100 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400'
              }`}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d={
                    downloadOnly
                      ? 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z'
                      : 'M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z'
                  }
                />
              </svg>
              <span className="text-[10.5px] font-semibold">
                {downloadOnly ? 'Locked' : 'Unlocked'}
              </span>
              <div className={`relative inline-flex h-3.5 w-6 shrink-0 items-center rounded-full transition-colors ${
                downloadOnly ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'
              }`}>
                <span className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white transition-transform ${
                  downloadOnly ? 'translate-x-3' : 'translate-x-0.5'
                }`} />
              </div>
            </button>
          )}
        </div>

        <div className="space-y-4">

          {/* Name */}
          <div>
            <label className="block text-[10.5px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-500 mb-1.5">
              {isFolder ? 'Folder Name' : 'File Name'}
            </label>
            <input
              value={fileName}
              disabled={downloadOnly}
              onChange={e => setFileName(e.target.value)}
              className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm
                         text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30
                         disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-gray-100 dark:disabled:bg-gray-900
                         disabled:border-gray-200 dark:disabled:border-gray-800 transition-colors"
              required
            />
          </div>

          {/* Visibility */}
          {isFolder && (
            <div>
              <label className="block text-[10.5px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-500 mb-1.5">
                Visibility Scope
              </label>
              <select
                value={visibility}
                onChange={e => setVisibility(e.target.value)}
                disabled={(isFolder && parentVisibility === 'private') || downloadOnly}
                className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm
                           text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30
                           disabled:opacity-50 transition-colors"
              >
                {getVisibilityOptions()}
              </select>
              {isFolder && parentVisibility === 'private' && (
                <p className="text-[10.5px] text-amber-500 dark:text-amber-400 mt-1">
                  ⚠ Parent is private — visibility locked.
                </p>
              )}
            </div>
          )}

          {/* Folder Sharing toggle — folders only, public visibility only */}
          {isFolder && visibility === 'public' && (
            <div className="flex items-center justify-between">
              <span
                className="text-xs text-gray-600 dark:text-gray-400"
                title="Share this public folder with specific people, even outside their normal scope."
              >
                Folder sharing
              </span>
              <button
                type="button"
                onClick={handleToggleFolderSharing}
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                  folderSharingEnabled ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-700'
                }`}
              >
                <span
                  className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                    folderSharingEnabled ? 'translate-x-5' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          )}

          {/* Target Users */}
          {showTargetUsersSection && (
            <div>
              <label className="block text-[10.5px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-500 mb-1.5">
                {visibility === 'public' ? 'Shared With' : 'Clearance Target Keys'}
                {isFolder && parentVisibility === 'private' && visibility === 'private' && (
                  <span className="ml-1.5 normal-case font-normal text-gray-400 dark:text-gray-600">
                    (choose from parent's users)
                  </span>
                )}
              </label>

              {targetUsers.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {targetUsers.map(u => (
                    <span key={u} className="bg-blue-500/10 text-blue-600 dark:text-blue-300 border border-blue-500/20 px-2 py-0.5 rounded-md text-[11px] flex items-center gap-1">
                      {u}
                      <button
                        onClick={() => setTargetUsers(targetUsers.filter(x => x !== u))}
                        className="text-blue-400 hover:text-red-400 transition-colors leading-none"
                      >×</button>
                    </span>
                  ))}
                </div>
              )}

              <div className="relative">
                <input
                  type="text"
                  value={targetUsersInputval}
                  onChange={handleSearchChange}
                  placeholder={
                    isFolder && parentVisibility === 'private' && visibility === 'private'
                      ? 'Search from parent users...'
                      : 'Type to search users...'
                  }
                  className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-1.5 text-xs
                             text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 transition-colors"
                />
                {suggestions.length > 0 && (
                  <ul className="absolute z-10 w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 mt-1 rounded-lg shadow-xl max-h-40 overflow-y-auto">
                    {suggestions.map(u => (
                      <li
                        key={u.user_id}
                        onClick={() => {
                          setTargetUsers([...targetUsers, u.user_id]);
                          setTargetUsersInputval('');
                          setSuggestions([]);
                        }}
                        className="px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer text-xs text-gray-900 dark:text-white transition-colors"
                      >
                        {u.user_id}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* Transfer Ownership — collapsed by default, minimal footprint */}
          <div className="border-t border-gray-200 dark:border-gray-800 pt-3">
            {!transferOpen ? (
              <button
                onClick={() => setTransferOpen(true)}
                className="w-full flex items-center justify-between text-xs text-gray-500 dark:text-gray-500
                           hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
              >
                <span>Transfer ownership</span>
                <span className="text-gray-400 dark:text-gray-600">→</span>
              </button>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10.5px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-500">Transfer Ownership</span>
                  <button
                    onClick={() => { setTransferOpen(false); setSelectedTransfer(null); setTransferQuery(''); setTransferOptions([]); }}
                    className="text-xs text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400 transition-colors"
                  >Cancel</button>
                </div>

                {!selectedTransfer ? (
                  <div className="relative">
                    <input
                      type="text"
                      value={transferQuery}
                      onChange={handleTransferSearch}
                      placeholder="Search eligible users..."
                      className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-1.5 text-xs
                                 text-gray-900 dark:text-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 transition-colors"
                    />
                    {transferOptions.length > 0 && (
                      <ul className="absolute z-10 w-full bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 mt-1 rounded-lg shadow-xl max-h-32 overflow-y-auto">
                        {transferOptions.map(u => (
                          <li
                            key={u.user_id}
                            onClick={() => { setSelectedTransfer(u); setTransferQuery(''); setTransferOptions([]); }}
                            className="px-3 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer text-xs text-gray-900 dark:text-white transition-colors"
                          >
                            {u.user_id} <span className="text-gray-500 dark:text-gray-500">({u.base_path})</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center justify-between bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-1.5">
                    <span className="text-xs text-gray-900 dark:text-white">
                      → <span className="font-semibold text-amber-500 dark:text-amber-400">{selectedTransfer.user_id}</span>
                    </span>
                    <div className="flex gap-2">
                      <button onClick={() => setSelectedTransfer(null)} className="text-xs text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors">Change</button>
                      <button
                        onClick={() => setConfirmOpen(true)}
                        className="text-xs font-semibold bg-amber-600 hover:bg-amber-500 text-white px-2.5 py-1 rounded-md transition-colors"
                      >Transfer</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Transfer confirmation dialog */}
            {confirmOpen && selectedTransfer && (
              <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl w-full max-w-sm p-4 shadow-2xl">
                  <h3 className="text-sm font-bold text-gray-900 dark:text-white mb-2">Confirm Ownership Transfer</h3>
                  <p className="text-xs text-gray-600 dark:text-gray-400 mb-3 leading-relaxed">
                    This will transfer ownership to <span className="font-semibold text-amber-500 dark:text-amber-400">{selectedTransfer.user_id}</span>.
                    This cannot be undone. Type <span className="font-mono font-bold">TRANSFER</span> to confirm.
                  </p>
                  <input
                    type="text"
                    value={confirmText}
                    onChange={(e) => setConfirmText(e.target.value)}
                    placeholder="Type TRANSFER"
                    className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm
                               text-gray-900 dark:text-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 mb-3 transition-colors"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => { setConfirmOpen(false); setConfirmText(''); }}
                      className="flex-1 py-1.5 text-xs font-semibold bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleConfirmTransfer}
                      disabled={transferring || confirmText !== 'TRANSFER'}
                      className="flex-1 py-1.5 text-xs font-semibold bg-amber-600 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                    >
                      {transferring ? 'Transferring…' : 'Confirm Transfer'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Description — files only */}
          {!isFolder && (
            <div>
              <label className="block text-[10.5px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-500 mb-1.5">
                Description
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows="3"
                className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-sm
                           text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30 resize-none transition-colors"
              />
            </div>
          )}

          {/* PDF Tools */}
          {!isFolder && fileData?.mime_type?.includes('pdf') && (
            <PdfToolsSection fileData={fileData} onUpdateSuccess={onUpdateSuccess} />
          )}

          {/* Recent History */}
          <div className="border-t border-gray-200 dark:border-gray-800 pt-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10.5px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-500">
                Recent History
              </span>
              <button
                type="button"
                onClick={() => setActivityModalOpen(true)}
                aria-label="View activity details"
                title="View activity details"
                className="w-6 h-6 flex items-center justify-center rounded-full text-gray-400 dark:text-gray-500
                           hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-blue-500 dark:hover:text-blue-400
                           focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="w-3.5 h-3.5">
                  <circle cx="12" cy="12" r="9" />
                  <path strokeLinecap="round" d="M12 11v5" />
                  <circle cx="12" cy="8" r="0.75" fill="currentColor" stroke="none" />
                </svg>
              </button>
            </div>

            {historyLoading ? (
              <div className="space-y-2 py-0.5">
                {[...Array(3)].map((_, i) => (
                  <div key={i} className="h-3 rounded bg-gray-100 dark:bg-gray-800 animate-pulse" style={{ width: `${70 - i * 10}%` }} />
                ))}
              </div>
            ) : historyError ? (
              <p className="text-xs text-gray-400 dark:text-gray-600 py-0.5">Couldn't load activity.</p>
            ) : historyItems.length === 0 ? (
              <p className="text-xs text-gray-400 dark:text-gray-600 py-0.5">No recent activity.</p>
            ) : (
              <ul className="space-y-1.5">
                {historyItems.map((item) => (
                  <li key={item.id} className="flex items-center gap-2">
                    <ActivityIcon action={item.action} className="w-3.5 h-3.5 text-gray-400 dark:text-gray-500 shrink-0" />
                    <span className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1">{item.targetLabel}</span>
                    <span className="text-[10.5px] text-gray-400 dark:text-gray-600 shrink-0">{timeAgo(item.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-2.5 pt-1">
            <button onClick={onClose}
              className="flex-1 py-2 text-xs font-semibold bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800
                         rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors">
              Cancel
            </button>
            <button onClick={handleUpdate}
              className="flex-1 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-lg shadow-sm
                         focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 transition-colors">
              Save Changes
            </button>
          </div>

        </div>
      </div>

      {activityModalOpen && activityTargetId && (
        <ActivityDetailsModal
          targetId={activityTargetId}
          targetType={isFolder ? 'folder' : 'file'}
          onClose={() => setActivityModalOpen(false)}
        />
      )}
    </div>
  );
}