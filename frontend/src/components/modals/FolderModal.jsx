import React, { useEffect, useState } from 'react';
import api from '../../utils/api';
import { toast } from 'react-hot-toast';

export default function FolderModal({ isOpen, onClose, user, expoFolder, onFolderCreate }) {
  const [visibility,         setVisibility]         = useState('public');
  const [targetUsersInput,   setTargetUsersInput]   = useState([]); // ← always array
  const [targetUsersInputval,setTargetUsersInputval]= useState('');
  const [suggestions,        setSuggestions]        = useState([]);
  const [newFolderName,      setNewFolderName]      = useState('');
  const [folders,            setFolders]            = useState([]);
  const [filteredFolders,    setFilteredFolders]    = useState([]);
  const [selectedFolder,     setSelectedFolder]     = useState(expoFolder);
  const [folderSearch,       setFolderSearch]       = useState('');
  const [showFolderDropdown, setShowFolderDropdown] = useState(false);
  const [parentVisibility,   setParentVisibility]   = useState(null);
  const [parentTargetUsers,  setParentTargetUsers]  = useState([]);
  const [isUploading,        setIsUploading]        = useState(false);
  const [folderSharingEnabled, setFolderSharingEnabled] = useState(false);

  const basePath   = user.base_path;
  const permLevel  = { private: 0, group: 1, directory: 2, public: 3 };

  // ── Fetch all folders on open ──────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    if (expoFolder.toLowerCase() === '/public/') {
      toast.error('Permission denied: Cannot create folder.');
      onClose();
      return;
    }
    api.get('/folders', { params: { fetch_all: true } })
      .then(res => {
        const decoded = res.data.folders.map(f => ({
          ...f, full_path: decodeURIComponent(f.full_path)
        }));
        setFolders(decoded);
      })
      .catch(console.error);
  }, [isOpen]);

  // ── Sync selectedFolder when expoFolder changes ────────────
  useEffect(() => {
    setSelectedFolder(expoFolder);
    setFolderSearch(expoFolder?.slice(basePath.length));
    console.log(selectedFolder);
  }, [expoFolder]);

   useEffect(() => {
    console.log(visibility);
  }, [visibility]);

  // ── When selectedFolder changes, update parent constraints ─
  useEffect(() => {
    if (!selectedFolder || !folders.length) {
      setParentVisibility(null);
      setParentTargetUsers([]);
      setTargetUsersInput([]);
      setVisibility('public');
      setFolderSharingEnabled(false);
      return;
    }

    const current = folders.find(f => f.full_path === selectedFolder);
    const pVis    = current?.visibility || null;
    const pUsers  = current?.target_users || [];

    setParentVisibility(pVis);
    setParentTargetUsers(pUsers);

    // Pre-fill target users from parent + auto-set visibility
    if (pVis === 'private') {
      setVisibility('private');
      setTargetUsersInput([...pUsers]); // ← pre-select all parent users
    } else {
      setVisibility(pVis.toLowerCase() || 'public');
      setTargetUsersInput([]);
    }
    setFolderSharingEnabled(false);
  }, [selectedFolder, folders]);

  // ── Visibility options filtered by parent ─────────────────
  const maxLevel = parentVisibility ? (permLevel[parentVisibility] ?? 3) : 3;
  const ALL_VISIBILITY_OPTIONS = [
    { value: 'public',  label: 'Public (Global Visibility Scope)' },
    { value: 'private', label: 'Private (Restricted Node Verification)' },
  ];
  const visibilityOptions = ALL_VISIBILITY_OPTIONS.filter(
    opt => (permLevel[opt.value] ?? 3) <= maxLevel
  );

  if (!isOpen) return null;

  const resetState = () => {
    setVisibility('public');
    setTargetUsersInput([]);
    setTargetUsersInputval('');
    setSuggestions([]);
    setNewFolderName('');
    setFolderSearch(expoFolder?.slice(basePath.length));
    setFolderSharingEnabled(false);
    setSelectedFolder(expoFolder);
  };

  const handleClose = () => { resetState(); onClose(); };

  // ── Visibility select change ────────────────────────────────
  const handleVisibilityChange = (e) => {
    const value = e.target.value;
    setVisibility(value);
    if (value !== 'public') {
      setFolderSharingEnabled(false);
      setTargetUsersInputval('');
      setSuggestions([]);
    }
  };

  // ── Folder Sharing toggle ────────────────────────────────────
  const handleToggleFolderSharing = () => {
    const next = !folderSharingEnabled;
    setFolderSharingEnabled(next);
    if (!next) {
      setTargetUsersInput([]);
      setTargetUsersInputval('');
      setSuggestions([]);
    }
  };

  // ── User search — restricted to parent users if private ───
  // const handleSearchChange = async (e) => {
  //   const value = e.target.value;
  //   setTargetUsersInputval(value);
  //   if (!value.length) { setSuggestions([]); return; }

  //   if (parentVisibility === 'private') {
  //     // Only show users from parent's list that aren't already selected
  //     const filtered = parentTargetUsers.filter(u =>
  //       u.toLowerCase().includes(value.toLowerCase()) &&
  //       !targetUsersInput.includes(u)
  //     );
  //     setSuggestions(filtered);
  //   } else {
  //     try {
  //       const res = await api.get(`/auth/users/search?query=${encodeURIComponent(value)}`);
  //       console.log(res);
  //       setSuggestions(res.data.users.filter(u => !targetUsersInput.includes(u)));
  //     } catch (err) {
  //       console.error('Error fetching users:', err);
  //     }
  //   }
  // };

const handleSearchChange = async (e) => {
    const value = e.target.value;
    setTargetUsersInputval(value);
    if (!value.length) { setSuggestions([]); return; }

    if (parentVisibility === 'private') {
      // Only show users from parent's list that aren't already selected
      const filtered = parentTargetUsers.filter(u =>
        u.toLowerCase().includes(value.toLowerCase()) &&
        !targetUsersInput.includes(u)
      );
      setSuggestions(filtered);
    } else {
      try {
        const res = await api.get(`/auth/users/search?query=${encodeURIComponent(value)}`);
        console.log(res);
        // API returns objects {user_id, base_path} — extract just the user_id string
        const userIds = res.data.users.map(u => u.user_id);
        setSuggestions(userIds.filter(u => !targetUsersInput.includes(u)));
      } catch (err) {
        console.error('Error fetching users:', err);
      }
    }
  };

  // ── Folder navigation search ───────────────────────────────
  const handleFolderSearch = (e) => {
    const searchvalue = e.target.value;
    const value = basePath + searchvalue;
    setSelectedFolder(searchvalue ? value : '');
    setFolderSearch(searchvalue);

    const fFolders = folders.filter(f => {
      const path        = f.full_path;
      const folderLevel = (path.match(/\//g) || []).length;
      const searchLevel = (value.match(/\//g) || []).length;
      return (searchLevel + 1) === folderLevel &&
             path.toLowerCase().includes(value.toLowerCase());
    });
    setFilteredFolders(fFolders);
  };

  // ── Create ─────────────────────────────────────────────────
  const CreateFolder = async () => {
    if (!newFolderName.trim()) {
      toast.error('Folder name is required.'); return;
    }

    const targetPath = selectedFolder + (newFolderName.endsWith('/') ? newFolderName : newFolderName + '/');

    if (folders.some(f => f.full_path === targetPath)) {
      toast.error('A folder with this name already exists.'); return;
    }

    if (visibility === 'private' && targetUsersInput.length < 1) {
      toast.error('Select at least one target user.'); return;
    }

    if (visibility === 'public' && folderSharingEnabled && targetUsersInput.length < 1) {
      toast.error('Add at least one user to share this folder with, or turn off folder sharing.'); return;
    }

    try {
      const res = await api.post('/createFolder', {
        folder_name  : newFolderName,
        parent_path  : selectedFolder,
        full_path    : targetPath,
        visibility,
        target_users : targetUsersInput,
        shared_label : visibility === 'public' ? ['Public'] : targetUsersInput,
      });

      if (res.status === 201) {
        toast.success('Folder created successfully');
        resetState();
        onFolderCreate();
        onClose();
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create folder');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-gray-950/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl w-full max-w-md p-5 shadow-2xl">
        <h3 className="text-xl font-bold text-white mb-4">Create Folder</h3>

        <div className="space-y-4">

          {/* Folder Name */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">
              Folder Name
            </label>
            <input
              value={newFolderName}
              onChange={e => setNewFolderName(e.target.value)}
              placeholder="Folder Name"
              className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-blue-500"
            />
          </div>

          {/* Target Directory */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">
              Target Directory
            </label>
            <div className="relative">
              <div className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2 flex items-center focus-within:border-blue-500">
                <span className="text-gray-500 font-mono select-none whitespace-nowrap">{basePath}</span>
                <input
  type="text"
  value={folderSearch}
  onFocus={(e) => {
    setShowFolderDropdown(true);
    // Pass the actual event object instead of mocking it
    handleFolderSearch(e); 
  }}
  onBlur={() => {
    // A slight 200ms delay allows the user to click dropdown items safely
    setTimeout(() => {
      setShowFolderDropdown(false);
    }, 100);
  }}
  onChange={handleFolderSearch}
  className="w-full bg-transparent text-white outline-none ml-1 text-sm"
  placeholder="navigate_to_folder..."
/>
              </div>
              {showFolderDropdown && filteredFolders.length > 0 && (
                <div className="absolute z-20 w-full bg-gray-900 border border-gray-800 mt-1 rounded-xl max-h-48 overflow-y-auto">
                  {filteredFolders.map(f => (
                    <div
                      key={f.folder_id}
                      onClick={() => {
                        setSelectedFolder(f.full_path);
                        setFolderSearch(f.full_path.slice(basePath.length));
                        setShowFolderDropdown(false);
                      }}
                      className="px-4 py-2 hover:bg-gray-800 text-sm text-gray-300 cursor-pointer"
                    >
                      {f.full_path}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Visibility */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">
              Visibility
            </label>
            <select
              value={visibility}
              onChange={handleVisibilityChange}
              disabled={parentVisibility === 'private'} // ← locked when parent is private
              className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 disabled:opacity-50"
            >
              {visibilityOptions.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
            {parentVisibility === 'private' && (
              <p className="text-xs text-amber-400 mt-1">
                ⚠ Parent is private — visibility locked to private.
              </p>
            )}
          </div>

          {/* Folder Sharing toggle — public visibility only */}
          {visibility === 'public' && (
            <div className="flex items-center justify-between bg-gray-950 border border-gray-800 rounded-xl px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-white">Folder Sharing</p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Share this public folder with specific people, even outside their normal scope.
                </p>
              </div>
              <button
                type="button"
                onClick={handleToggleFolderSharing}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  folderSharingEnabled ? 'bg-blue-600' : 'bg-gray-700'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    folderSharingEnabled ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          )}

          {/* Target Users */}
          {(visibility === 'private' || (visibility === 'public' && folderSharingEnabled)) && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-400 mb-1">
                {visibility === 'public' ? 'Shared With' : 'Target Users'}
                {parentVisibility === 'private' && visibility === 'private' && (
                  <span className="ml-2 normal-case font-normal text-gray-500">
                    (choose from parent's users)
                  </span>
                )}
              </label>

              {/* Selected chips */}
              <div className="flex flex-wrap gap-2 mb-2">
                {targetUsersInput.map(u => (
                  <span key={u} className="bg-blue-500/20 text-blue-300 px-2 py-1 rounded text-xs flex items-center gap-1">
                    {u}
                    <button
                      onClick={() => setTargetUsersInput(targetUsersInput.filter(x => x !== u))}
                      className="text-red-400 hover:text-red-300"
                    >×</button>
                  </span>
                ))}
              </div>

              {/* Search */}
              <div className="relative">
                <input
                  type="text"
                  value={targetUsersInputval}
                  onChange={handleSearchChange}
                  placeholder={
                    parentVisibility === 'private' && visibility === 'private'
                      ? 'Search from parent users...'
                      : 'Type to search users...'
                  }
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2 text-sm text-white outline-none focus:border-blue-500"
                />
                {suggestions.length > 0 && (
                  <ul className="absolute z-10 w-full bg-gray-900 border border-gray-800 mt-1 rounded-lg shadow-xl max-h-40 overflow-y-auto">
                    {suggestions.map(u => (
                      <li
                        key={u}
                        onClick={() => {
                          setTargetUsersInput([...targetUsersInput, u]);
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

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button onClick={handleClose}
              className="flex-1 py-2.5 text-sm font-semibold bg-gray-950 border border-gray-800 rounded-xl hover:bg-gray-800 text-gray-400">
              Cancel
            </button>
            <button onClick={CreateFolder}
              className="flex-1 py-2.5 text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-xl shadow">
              Create Folder
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}