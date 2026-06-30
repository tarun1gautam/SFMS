import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import { toast } from 'react-hot-toast';
import PdfToolsSection from './Pdftoolssection';

export default function EditFileModal({ isOpen, onClose, fileData, expoFolder, onUpdateSuccess }) {
  const [fileName,            setFileName]            = useState('');
  const [visibility,          setVisibility]          = useState('public');
  const [description,         setDescription]         = useState('');
  const [filePath,            setFilePath]            = useState('');
  const [targetUsers,         setTargetUsers]         = useState([]);
  const [targetUsersInputval, setTargetUsersInputval] = useState('');
  const [suggestions,         setSuggestions]         = useState([]);
  const [realTargetUsers,     setRealTargetUsers]     = useState([]);
  const [parentVisibility,    setParentVisibility]    = useState(null);
  const [parentTargetUsers,   setParentTargetUsers]   = useState([]);

  const isFolder   = fileData?.type === 'folder';
  const permLevel  = { private: 0, group: 1, directory: 2, public: 3 };

  // ── Populate form when fileData changes ────────────────────
  useEffect(() => {
    if (!fileData) return;
    if (isFolder) {
      setFileName(fileData.folder_name || '');
      setVisibility(fileData.visibility || 'public');
      setDescription('');
      setFilePath('');
      setTargetUsers(fileData.target_users || []);
      setRealTargetUsers(fileData.target_users || []);
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
    if (visibility === 'public' || visibility === 'directory') {
      setTargetUsers([]);
    } else {
      setTargetUsers(realTargetUsers);
    }
  }, [visibility, realTargetUsers]);

  if (!isOpen) return null;

  // ── Visibility options ─────────────────────────────────────
  const maxLevel = parentVisibility ? (permLevel[parentVisibility] ?? 3) : 3;

  const getVisibilityOptions = () => {
    if (isFolder) {
      const opts = [
        { value: 'public',  label: 'Public' },
        { value: 'private', label: 'Private' },
      ];
      return opts
        .filter(o => (permLevel[o.value] ?? 3) <= maxLevel)
        .map(o => <option key={o.value} value={o.value}>{o.label}</option>);
    }
    if (expoFolder === '/public/') return <option value="public">Public</option>;
    return (
      <>
        <option value="directory">Directory</option>
        <option value="private">Private</option>
      </>
    );
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
        setSuggestions(res.data.users.filter(u => !targetUsers.includes(u)));
      } catch (err) {
        console.error('User search error:', err);
      }
    }
  };

  // ── Handle save ────────────────────────────────────────────
  const handleUpdate = async () => {
    const cleanedName = fileName.trim();

    if (!cleanedName) { toast.error('Name cannot be empty.'); return; }

    if (visibility === 'private' && targetUsers.length === 0) {
      toast.error('Select at least one target user for private visibility.');
      return;
    }

    // ── FOLDER update ──────────────────────────────────────
    if (isFolder) {
      // Frontend guard — block more permissive than parent
      if (parentVisibility) {
        const parentLevel = permLevel[parentVisibility] ?? 3;
        const newLevel    = permLevel[visibility] ?? 3;
        if (newLevel > parentLevel) {
          toast.error(`Cannot set visibility to "${visibility}" — parent folder is "${parentVisibility}".`);
          return;
        }
      }

      // Block users outside parent's list
      if (parentVisibility === 'private' && parentTargetUsers.length > 0) {
        const parentSet    = new Set(parentTargetUsers);
        const invalidUsers = targetUsers.filter(u => !parentSet.has(u));
        if (invalidUsers.length > 0) {
          toast.error(`Users [${invalidUsers.join(', ')}] are not in the parent folder's access list.`);
          return;
        }
      }

      try {
        await api.put(`/folders/edit/${fileData.folder_id}`, {
          folder_name  : cleanedName,
          visibility,
          target_users : targetUsers,
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
    <div className="fixed inset-0 z-50 bg-gray-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">

        <h2 className="text-xl font-bold text-white mb-4">
          {isFolder ? 'Edit Folder' : 'Edit File Details'}
        </h2>

        <div className="space-y-5">

          {/* Name */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
              {isFolder ? 'Folder Name' : 'File Name'}
            </label>
            <input
              value={fileName}
              onChange={e => setFileName(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
              required
            />
          </div>

          {/* Visibility */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
              Visibility Scope
            </label>
            <select
              value={visibility}
              onChange={e => setVisibility(e.target.value)}
              disabled={isFolder && parentVisibility === 'private'} // locked if parent is private
              className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
            >
              {getVisibilityOptions()}
            </select>
            {isFolder && parentVisibility === 'private' && (
              <p className="text-xs text-amber-400 mt-1">
                ⚠ Parent is private — visibility locked.
              </p>
            )}
          </div>

          {/* Target Users */}
          {visibility === 'private' && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                Clearance Target Keys
                {isFolder && parentVisibility === 'private' && (
                  <span className="ml-2 normal-case font-normal text-gray-500">
                    (choose from parent's users)
                  </span>
                )}
              </label>

              <div className="flex flex-wrap gap-2 mb-2">
                {targetUsers.map(u => (
                  <span key={u} className="bg-blue-500/20 text-blue-300 px-2 py-1 rounded text-xs flex items-center gap-1">
                    {u}
                    <button
                      onClick={() => setTargetUsers(targetUsers.filter(x => x !== u))}
                      className="text-red-400 hover:text-red-300"
                    >×</button>
                  </span>
                ))}
              </div>

              <div className="relative">
                <input
                  type="text"
                  value={targetUsersInputval}
                  onChange={handleSearchChange}
                  placeholder={
                    isFolder && parentVisibility === 'private'
                      ? 'Search from parent users...'
                      : 'Type to search users...'
                  }
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
                {suggestions.length > 0 && (
                  <ul className="absolute z-10 w-full bg-gray-900 border border-gray-800 mt-1 rounded-lg shadow-xl max-h-40 overflow-y-auto">
                    {suggestions.map(u => (
                      <li
                        key={u}
                        onClick={() => {
                          setTargetUsers([...targetUsers, u]);
                          setTargetUsersInputval('');
                          setSuggestions([]);
                        }}
                        className="px-4 py-2 hover:bg-gray-800 cursor-pointer text-sm text-white"
                      >
                        {u}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* Description — files only */}
          {!isFolder && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                Description
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows="3"
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>
          )}

          {/* PDF Tools */}
          {!isFolder && fileData?.mime_type?.includes('pdf') && (
            <PdfToolsSection fileData={fileData} onUpdateSuccess={onUpdateSuccess} />
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button onClick={onClose}
              className="flex-1 py-2.5 text-sm font-semibold bg-gray-950 border border-gray-800 rounded-xl hover:bg-gray-800 text-gray-400">
              Cancel
            </button>
            <button onClick={handleUpdate}
              className="flex-1 py-2.5 text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow">
              Save Changes
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}