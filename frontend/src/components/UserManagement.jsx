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
  const [showEditPin, setShowEditPin] = useState(false);

  // Per-row "logout all" in-flight state (so we can disable the button while it runs)
  const [loggingOutId, setLoggingOutId] = useState(null);

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
    setEditData({ role: u.role, base_path: u.base_path || '', pin: '', logout_all: false });
    setEditFolderSearch(u.base_path || '');
    setShowEditFolderDropdown(false);
    setShowEditPin(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({});
    setEditFolderSearch('');
    setShowEditFolderDropdown(false);
    setShowEditPin(false);
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

    if (editData.pin && !/^\d{4,8}$/.test(String(editData.pin))) {
      toast.error('PIN must be 4-8 digits');
      return;
    }

    try {
      // Only send fields that actually changed / were filled in
      const payload = {
        role: editData.role,
        base_path: editData.base_path,
      };
      if (editData.pin) payload.pin = editData.pin;
      if (editData.logout_all) payload.logout_all = true;

      const res = await api.patch(`/auth/users/${userId}`, payload);

      if (res.data.passwordChanged) {
        toast.success('Password updated — user logged out everywhere.');
      } else if (res.data.loggedOutEverywhere) {
        toast.success('User updated and signed out of all devices.');
      } else {
        toast.success('User updated.');
      }

      cancelEdit();
      fetchdata();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Update failed.');
    }
  };

  // Quick one-click logout, independent of the edit form
  const handleForceLogoutAll = async (userId) => {
    if (!window.confirm(`Sign out "${userId}" from all devices? Their current session token(s) will stop working immediately.`)) return;
    setLoggingOutId(userId);
    try {
      await api.post(`/auth/users/${userId}/logout-all`);
      toast.success(`${userId} signed out of all devices.`);
      fetchdata();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Logout failed.');
    } finally {
      setLoggingOutId(null);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-gray-200/60 dark:divide-gray-800/60">

      {/* Account Registration Form Section */}
      <div className="p-6 space-y-5">
        <h3 className="text-base font-bold text-gray-900 dark:text-white mb-2">Provision Account</h3>

        <form onSubmit={handleRegisterUser} className="space-y-4">
          {/* User ID Field */}
          <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">User Key String</label>
          <div className='w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-2.5 flex items-center focus-within:border-blue-500 transition-colors'>
            <input
              type="text"
              value={newUserId}
              onChange={(e) => setNewUserId(e.target.value)}
              placeholder="e.g., manager_finance"
              className="w-full bg-transparent text-gray-900 dark:text-white outline-none text-sm placeholder-gray-400 dark:placeholder-gray-600"
            />
          </div>

          {/* Folder Selection Field */}
          <div className="relative">
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">Base Path</label>
            <div
              className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-2.5 flex items-center focus-within:border-blue-500 transition-colors cursor-pointer"
              onClick={() => {
                setShowFolderDropdown(!showFolderDropdown);
                handleFolderSearch({ target: { value: folderSearch || '' } });
              }}
            >
              <input
                value={folderSearch || selectedFolder}
                onChange={handleFolderSearch}
                className="w-full bg-transparent text-gray-900 dark:text-white outline-none text-sm placeholder-gray-400 dark:placeholder-gray-600"
                placeholder="navigate_to_folder..."
              />
            </div>

            {showFolderDropdown && (
              <div className="absolute z-20 w-full bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 mt-1.5 rounded-xl shadow-2xl max-h-48 overflow-y-auto">
                {filteredFolders.map(f => (
                  <div
                    key={f.folder_id}
                    onClick={() => { setSelectedFolder(f.full_path); setFolderSearch(f.full_path); setShowFolderDropdown(false); }}
                    className="px-4 py-2.5 hover:bg-gray-200 dark:hover:bg-gray-800 text-sm text-gray-700 dark:text-gray-300 cursor-pointer border-b border-gray-200/50 dark:border-gray-800/50 last:border-0"
                  >
                    {f.full_path}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Security PIN */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">System Security PIN (4-8 Digits)</label>
            <input
              type="password"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              placeholder="••••"
              className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>

          {/* Role Select */}
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-1.5">System Context Authorization Role</label>
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl px-3 py-2.5 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-blue-500 transition-colors"
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
        <h3 className="text-base font-bold text-gray-900 dark:text-white">Active Users Directory</h3>
        <div className="w-full overflow-x-auto border border-gray-200/60 dark:border-gray-800/60 rounded-xl">
          <table className="w-full text-left border-collapse min-w-[820px]">
            <thead>
              <tr className="bg-white/60 dark:bg-gray-950/60 border-b border-gray-200 dark:border-gray-800 text-[10px] font-bold uppercase tracking-wider text-gray-600 dark:text-gray-400">
                <th className="py-3 px-4">Account Identifier</th>
                <th className="py-3 px-4">Level</th>
                <th className="py-3 px-4">Base Path</th>
                <th className="py-3 px-4">Latest Connection</th>
                <th className="py-3 px-4 text-center">Session v</th>
                <th className="py-3 px-4 text-center">Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200/40 dark:divide-gray-800/40 text-xs">
              {users.map((u) => {
                const isEditing = editingId === u.user_id;
                const isLoggingOut = loggingOutId === u.user_id;
                return (
                  <tr key={u.user_id} className={`transition-colors ${isEditing ? 'bg-gray-200/30 dark:bg-gray-800/30' : 'hover:bg-gray-200/20 dark:hover:bg-gray-800/20'}`}>

                    {/* Account ID — not editable (primary key) */}
                    <td className="py-3 px-4 font-mono font-semibold text-gray-800 dark:text-gray-200 align-top">{u.user_id}</td>

                    {/* Role — editable */}
                    <td className="py-3 px-4 align-top">
                      {isEditing ? (
                        <select
                          value={editData.role}
                          onChange={(e) => setEditData(d => ({ ...d, role: e.target.value }))}
                          className="bg-white dark:bg-gray-950 border border-blue-500/50 rounded-lg px-2 py-1 text-xs text-gray-900 dark:text-white focus:outline-none focus:border-blue-400"
                        >
                          <option value="user">user</option>
                          <option value="admin">admin</option>
                        </select>
                      ) : (
                        <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${u.role === 'admin' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-gray-200 dark:bg-gray-800 text-gray-600 dark:text-gray-400'}`}>
                          {u.role}
                        </span>
                      )}
                    </td>

                    {/* Base Path — editable with folder dropdown */}
                    <td className="py-3 px-4 font-mono text-gray-600 dark:text-gray-400 align-top">
                      {isEditing ? (
                        <div className="relative">
                          <input
                            type="text"
                            value={editFolderSearch}
                            onChange={handleEditFolderSearch}
                            onClick={() => setShowEditFolderDropdown(true)}
                            placeholder="e.g., finance/"
                            className="w-full bg-white dark:bg-gray-950 border border-blue-500/50 rounded-lg px-2 py-1 text-xs text-gray-900 dark:text-white focus:outline-none focus:border-blue-400 min-w-[140px]"
                          />
                          {showEditFolderDropdown && editFilteredFolders.length > 0 && (
                            <div className="absolute z-30 w-full bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 mt-1 rounded-xl shadow-2xl max-h-40 overflow-y-auto">
                              {editFilteredFolders.map(f => (
                                <div
                                  key={f.folder_id}
                                  onClick={() => {
                                    setEditFolderSearch(f.full_path);
                                    setEditData(d => ({ ...d, base_path: f.full_path }));
                                    setShowEditFolderDropdown(false);
                                  }}
                                  className="px-3 py-2 hover:bg-gray-200 dark:hover:bg-gray-800 text-xs text-gray-700 dark:text-gray-300 cursor-pointer border-b border-gray-200/50 dark:border-gray-800/50 last:border-0"
                                >
                                  {f.full_path}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-500 dark:text-gray-500">{u.base_path || <span className="italic text-gray-300 dark:text-gray-700">—</span>}</span>
                      )}
                    </td>

                    {/* Last login */}
                    <td className="py-3 px-4 font-mono text-gray-500 dark:text-gray-500 align-top">
                      {u.last_login ? new Date(u.last_login).toLocaleString() : 'Never Connected'}
                    </td>

                    {/* Token version */}
                    <td className="py-3 px-4 font-mono text-gray-500 dark:text-gray-500 text-center align-top">
                      {u.token_version ?? '—'}
                    </td>

                    {/* Controls */}
                    <td className="py-3 px-4 align-top">
                      {isEditing ? (
                        <div className="space-y-2 min-w-[180px]">
                          {/* Password reset toggle */}
                          {!showEditPin ? (
                            <button
                              type="button"
                              onClick={() => setShowEditPin(true)}
                              className="text-[10px] font-semibold text-blue-400 hover:text-blue-300 cursor-pointer"
                            >
                              + Reset Password
                            </button>
                          ) : (
                            <input
                              type="password"
                              value={editData.pin || ''}
                              onChange={(e) => setEditData(d => ({ ...d, pin: e.target.value }))}
                              placeholder="New 4-8 digit PIN"
                              className="w-full bg-white dark:bg-gray-950 border border-blue-500/50 rounded-lg px-2 py-1 text-xs text-gray-900 dark:text-white focus:outline-none focus:border-blue-400"
                            />
                          )}

                          {/* Logout-all-devices toggle, bundled into this save */}
                          <label className="flex items-center gap-1.5 text-[10px] text-gray-600 dark:text-gray-400 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={!!editData.logout_all}
                              onChange={(e) => setEditData(d => ({ ...d, logout_all: e.target.checked }))}
                              className="accent-blue-500"
                            />
                            Force logout all devices
                          </label>

                          <div className="flex items-center gap-1.5 pt-1">
                            <button
                              onClick={() => handleSaveEdit(u.user_id)}
                              className="px-2 py-1 bg-blue-600 hover:bg-blue-500 border border-blue-500 text-white rounded-lg text-[10px] font-semibold transition-all cursor-pointer"
                            >
                              Save
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="px-2 py-1 bg-surface dark:bg-gray-950 hover:bg-field dark:hover:bg-gray-800 border border-line dark:border-gray-700 text-subtle dark:text-gray-400 hover:text-ink dark:hover:text-white rounded-lg text-[10px] font-semibold transition-all cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-center gap-1.5 flex-wrap">
                          <button
                            onClick={() => startEdit(u)}
                            className="px-2 py-1 bg-white dark:bg-gray-950 hover:bg-blue-950/30 border border-gray-200 dark:border-gray-800 hover:border-blue-500/40 text-gray-500 dark:text-gray-500 hover:text-blue-400 rounded-lg transition-all cursor-pointer"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleForceLogoutAll(u.user_id)}
                            disabled={isLoggingOut}
                            className="px-2 py-1 bg-white dark:bg-gray-950 hover:bg-amber-950/30 border border-gray-200 dark:border-gray-800 hover:border-amber-500/40 text-gray-500 dark:text-gray-500 hover:text-amber-400 rounded-lg transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {isLoggingOut ? '...' : 'Logout All'}
                          </button>
                          <button
                            onClick={() => handleDeleteUser(u.user_id)}
                            className="px-2 py-1 bg-white dark:bg-gray-950 hover:bg-red-950/30 border border-gray-200 dark:border-gray-800 hover:border-red-500/40 text-gray-500 dark:text-gray-500 hover:text-red-400 rounded-lg transition-all cursor-pointer"
                          >
                            Revoke
                          </button>
                        </div>
                      )}
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