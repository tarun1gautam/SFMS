import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { toast } from 'react-hot-toast';

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [newUserId, setNewUserId] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newRole, setNewRole] = useState('user');

  const [folders, setFolders] = useState([]);
  const [filteredFolders, setfilteredFolders] = useState([]);
  const [selectedFolder, setSelectedFolder] = useState('/');
  const [folderSearch, setFolderSearch] = useState('/');
  const [showFolderDropdown, setShowFolderDropdown] = useState(false);

  // Edit state
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});
  const [editFolderSearch, setEditFolderSearch] = useState('');
  const [editFilteredFolders, setEditFilteredFolders] = useState([]);
  const [showEditFolderDropdown, setShowEditFolderDropdown] = useState(false);

  const fetchdata = async () => {
    try {
      const res = await api.get('/auth/users');
      setUsers(res.data.users);
    } catch (err) {
      console.error(err);
    }
    api.get('/folders?fetch_all=true').then(res => setFolders(res.data.folders)).catch(console.error);
  };

  useEffect(() => {
    fetchdata();
  }, []);

  const handleRegisterUser = async (e) => {
    e.preventDefault();
    if (!newUserId.trim() || !newPin.trim()) return;

    if (selectedFolder && !selectedFolder.endsWith('/')) {
      toast.error('Path must end with a forward slash (/)');
      return;
    }

    const doesFolderExist = folders.some(folder => folder.full_path === selectedFolder);
    if (!doesFolderExist) {
      toast.error('folder not exist');
      return;
    }

    try {
      await api.post('/auth/register', { user_id: newUserId, pin: newPin, role: newRole, base_path: selectedFolder });
      toast.success('Identity node created successfully.');
      setNewUserId('');
      setNewPin('');
      fetchdata();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Registration failed.');
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm(`Revoke credentials and completely wipe keys for user account: ${userId}?`)) return;
    try {
      await api.delete(`/auth/users/${userId}`);
      toast.success('Credential context cleared from memory.');
      fetchdata();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Action rejected.');
    }
  };

  const handleFolderSearch = (e) => {
    const searchvalue = e.target.value;
    if (!searchvalue) setSelectedFolder('');
    const value = e.target.value;
    setSelectedFolder(value);
    setFolderSearch(searchvalue);
    const fFolders = folders.filter((f) => {
      const path = f.full_path;
      const folderlevel = (path.match(/\//g) || []).length;
      const searchlevel = (value.match(/\//g) || []).length;
      if ((searchlevel + 1) === folderlevel) {
        return f.full_path.toLowerCase().includes(value.toLowerCase());
      }
      return false;
    });
    setfilteredFolders(fFolders);
  };

  // ── Edit helpers ─────────────────────────────────────────
  const startEdit = (u) => {
    setEditingId(u.user_id);
    setEditData({ role: u.role, base_path: u.base_path || '' });
    setEditFolderSearch(u.base_path || '');
    setShowEditFolderDropdown(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({});
    setEditFolderSearch('');
    setShowEditFolderDropdown(false);
  };

  const handleEditFolderSearch = (e) => {
    const value = e.target.value;
    setEditFolderSearch(value);
    setEditData(d => ({ ...d, base_path: value }));
    const fFolders = folders.filter((f) => {
      const path = f.full_path;
      const folderlevel = (path.match(/\//g) || []).length;
      const searchlevel = (value.match(/\//g) || []).length;
      if ((searchlevel + 1) === folderlevel) {
        return f.full_path.toLowerCase().includes(value.toLowerCase());
      }
      return false;
    });
    setEditFilteredFolders(fFolders);
    setShowEditFolderDropdown(true);
  };

  const handleSaveEdit = async (userId) => {
    if (editData.base_path && !editData.base_path.endsWith('/')) {
      toast.error('Path must end with a forward slash (/)');
      return;
    }
    try {
      await api.patch(`/auth/users/${userId}`, editData);
      toast.success('User updated.');
      cancelEdit();
      fetchdata();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Update failed.');
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-gray-800/60">

      {/* Account Registration Form Section */}
      <div className="p-6 space-y-5">
        <h3 className="text-base font-bold text-white mb-2">Provision Account</h3>

        <form onSubmit={handleRegisterUser} className="space-y-4">
          {/* User ID Field */}
          <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">User Key String</label>
          <div className='w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 flex items-center focus-within:border-blue-500 transition-colors'>
            <input
              type="text"
              value={newUserId}
              onChange={(e) => setNewUserId(e.target.value)}
              placeholder="e.g., manager_finance"
              className="w-full bg-transparent text-white outline-none text-sm placeholder-gray-600"
            />
          </div>

          {/* Folder Selection Field */}
          <div className="relative">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Base Path</label>
            <div
              className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 flex items-center focus-within:border-blue-500 transition-colors cursor-pointer"
              onClick={() => {
                setShowFolderDropdown(!showFolderDropdown);
                handleFolderSearch({ target: { value: folderSearch || '' } });
              }}
            >
              <input
                value={folderSearch || selectedFolder}
                onChange={handleFolderSearch}
                className="w-full bg-transparent text-white outline-none text-sm placeholder-gray-600"
                placeholder="navigate_to_folder..."
              />
            </div>

            {showFolderDropdown && (
              <div className="absolute z-20 w-full bg-gray-900 border border-gray-800 mt-1.5 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                {filteredFolders.map(f => (
                  <div
                    key={f.folder_id}
                    onClick={() => { setSelectedFolder(f.full_path); setFolderSearch(f.full_path); setShowFolderDropdown(false); }}
                    className="px-4 py-2.5 hover:bg-gray-800 text-sm text-gray-300 cursor-pointer border-b border-gray-800/50 last:border-0"
                  >
                    {f.full_path}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Security PIN */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">System Security PIN (4-8 Digits)</label>
            <input
              type="password"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              placeholder="••••"
              className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Role Select */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">System Context Authorization Role</label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
            >
              <option value="user">Standard Verified User</option>
              <option value="admin">System Cluster Administrator</option>
            </select>
          </div>

          <button
            type="submit"
            className="w-full py-3 mt-2 bg-blue-600 hover:bg-blue-500 font-semibold rounded-xl text-xs uppercase tracking-wider text-white shadow-lg shadow-blue-900/20 transition-all cursor-pointer"
          >
            Deploy Identity
          </button>
        </form>
      </div>

      {/* Active Users Directory */}
      <div className="p-6 lg:col-span-2 space-y-4">
        <h3 className="text-base font-bold text-white">Active Users Directory</h3>
        <div className="w-full overflow-x-auto border border-gray-800/60 rounded-xl">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-gray-950/60 border-b border-gray-800 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                <th className="py-3 px-4">Account Identifier</th>
                <th className="py-3 px-4">Level</th>
                <th className="py-3 px-4">Base Path</th>
                <th className="py-3 px-4">Latest Connection</th>
                <th className="py-3 px-4 text-center">Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/40 text-xs">
              {users.map((u) => {
                const isEditing = editingId === u.user_id;
                return (
                  <tr key={u.user_id} className={`transition-colors ${isEditing ? 'bg-gray-800/30' : 'hover:bg-gray-800/20'}`}>

                    {/* Account ID — not editable (primary key) */}
                    <td className="py-3 px-4 font-mono font-semibold text-gray-200">{u.user_id}</td>

                    {/* Role — editable */}
                    <td className="py-3 px-4">
                      {isEditing ? (
                        <select
                          value={editData.role}
                          onChange={(e) => setEditData(d => ({ ...d, role: e.target.value }))}
                          className="bg-gray-950 border border-blue-500/50 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-400"
                        >
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                        </select>
                      ) : (
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${u.role === 'admin' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-gray-800 text-gray-400'}`}>
                          {u.role}
                        </span>
                      )}
                    </td>

                    {/* Base Path — editable with folder dropdown */}
                    <td className="py-3 px-4 font-mono text-gray-400">
                      {isEditing ? (
                        <div className="relative">
                          <input
                            type="text"
                            value={editFolderSearch}
                            onChange={handleEditFolderSearch}
                            onClick={() => setShowEditFolderDropdown(true)}
                            placeholder="e.g., finance/"
                            className="w-full bg-gray-950 border border-blue-500/50 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-400 min-w-[140px]"
                          />
                          {showEditFolderDropdown && editFilteredFolders.length > 0 && (
                            <div className="absolute z-30 w-full bg-gray-900 border border-gray-800 mt-1 rounded-xl shadow-2xl max-h-40 overflow-y-auto">
                              {editFilteredFolders.map(f => (
                                <div
                                  key={f.folder_id}
                                  onClick={() => {
                                    setEditFolderSearch(f.full_path);
                                    setEditData(d => ({ ...d, base_path: f.full_path }));
                                    setShowEditFolderDropdown(false);
                                  }}
                                  className="px-3 py-2 hover:bg-gray-800 text-xs text-gray-300 cursor-pointer border-b border-gray-800/50 last:border-0"
                                >
                                  {f.full_path}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-500">{u.base_path || <span className="italic text-gray-700">—</span>}</span>
                      )}
                    </td>

                    {/* Last login */}
                    <td className="py-3 px-4 font-mono text-gray-500">
                      {u.last_login ? new Date(u.last_login).toLocaleString() : 'Never Connected'}
                    </td>

                    {/* Controls */}
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-center gap-1.5">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => handleSaveEdit(u.user_id)}
                              className="px-2 py-1 bg-blue-600 hover:bg-blue-500 border border-blue-500 text-white rounded-lg text-[10px] font-semibold transition-all cursor-pointer"
                            >
                              Save
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="px-2 py-1 bg-gray-950 hover:bg-gray-800 border border-gray-700 text-gray-400 hover:text-white rounded-lg text-[10px] font-semibold transition-all cursor-pointer"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => startEdit(u)}
                              className="px-2 py-1 bg-gray-950 hover:bg-blue-950/30 border border-gray-800 hover:border-blue-500/40 text-gray-500 hover:text-blue-400 rounded-lg transition-all cursor-pointer"
                            >
                              Edit
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u.user_id)}
                              className="px-2 py-1 bg-gray-950 hover:bg-red-950/30 border border-gray-800 hover:border-red-500/40 text-gray-500 hover:text-red-400 rounded-lg transition-all cursor-pointer"
                            >
                              Revoke
                            </button>
                          </>
                        )}
                      </div>
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}