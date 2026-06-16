import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/api';
import { toast } from 'react-hot-toast';

export default function AdminPanal() {
  const [users, setUsers] = useState([]);
  const [newUserId, setNewUserId] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [newBasePath, setNewBasePath] = useState('');
  const { user, logout } = useAuth();

  const [activeTab, setActiveTab] = useState('admin');
  const isAdmin = user?.role === 'admin';

  // editingId = user_id currently being edited; editData = live form state
  const [editingId, setEditingId] = useState(null);
  const [editData, setEditData] = useState({});

  const fetchUsers = async () => {
    try {
      const res = await api.get('/auth/users');
      setUsers(res.data.users);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleRegisterUser = async (e) => {
    e.preventDefault();
    if (!newUserId.trim() || !newPin.trim()) return;

    try {
      await api.post('/auth/register', {
        user_id: newUserId,
        pin: newPin,
        role: newRole,
        base_path: newBasePath || undefined,
      });
      toast.success('Identity node created successfully.');
      setNewUserId('');
      setNewPin('');
      setNewBasePath('');
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Registration failed.');
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm(`Revoke credentials and completely wipe keys for user account: ${userId}?`)) return;
    try {
      await api.delete(`/auth/users/${userId}`);
      toast.success('Credential context cleared from memory.');
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Action rejected.');
    }
  };

  const startEdit = (u) => {
    setEditingId(u.user_id);
    setEditData({ role: u.role, base_path: u.base_path || '' });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditData({});
  };

  const handleSaveEdit = async (userId) => {
    try {
      await api.patch(`/auth/users/${userId}`, editData);
      toast.success('User updated.');
      setEditingId(null);
      setEditData({});
      fetchUsers();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Update failed.');
    }
  };

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100 flex flex-col font-sans selection:bg-blue-600">
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
          <div className="text-right">
            <span className="block text-sm font-semibold text-gray-200">{user?.user_id}</span>
            <span className="text-[10px] font-bold uppercase tracking-wider text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
              {user?.role}
            </span>
          </div>
          <button
            onClick={logout}
            className="p-2.5 bg-gray-950 border border-gray-800 rounded-xl text-gray-400 hover:text-red-400 hover:border-red-500/30 transition-all cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
          </button>
        </div>
      </nav>

      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 bg-gray-900 p-4 border border-gray-800 rounded-2xl m-6">
        <div className="flex items-center bg-gray-950 p-1.5 rounded-xl border border-gray-800/80">
          <button
            onClick={() => setActiveTab('admin')}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer ${
              activeTab === 'admin' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'
            }`}
          >
            Admin Panal
          </button>
          {isAdmin && (
            <button
              onClick={() => setActiveTab('admin_users')}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-all cursor-pointer ${
                activeTab === 'admin_users' ? 'bg-blue-600 text-white shadow' : 'text-gray-400 hover:text-white'
              }`}
            >
              Identity Core ({user?.role})
            </button>
          )}
        </div>

        {activeTab === 'files' && (
          <button
            onClick={() => setIsUploadOpen(true)}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold rounded-xl shadow-lg shadow-blue-600/10 transition-all cursor-pointer"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
            Deploy New File
          </button>
        )}
      </div>

      {activeTab === 'admin' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-gray-800/60">

          {/* Account Registration Form */}
          <div className="p-6 space-y-4">
            <h3 className="text-base font-bold text-white">Provision Account</h3>
            <form onSubmit={handleRegisterUser} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">User Key String</label>
                <input
                  type="text"
                  value={newUserId}
                  onChange={(e) => setNewUserId(e.target.value)}
                  placeholder="e.g., manager_finance"
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">System Security PIN (4-8 Digits)</label>
                <input
                  type="password"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value)}
                  placeholder="••••"
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Base Folder Path</label>
                <input
                  type="text"
                  value={newBasePath}
                  onChange={(e) => setNewBasePath(e.target.value)}
                  placeholder="e.g., finance/"
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">System Context Authorization Role</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                >
                  <option value="user">Standard Verified User</option>
                  <option value="admin">System Cluster Administrator</option>
                </select>
              </div>
              <button
                type="submit"
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 font-semibold rounded-xl text-xs uppercase tracking-wider shadow cursor-pointer"
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
                              onChange={(e) => setEditData((d) => ({ ...d, role: e.target.value }))}
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

                        {/* Base Path — editable */}
                        <td className="py-3 px-4 font-mono text-gray-400">
                          {isEditing ? (
                            <input
                              type="text"
                              value={editData.base_path}
                              onChange={(e) => setEditData((d) => ({ ...d, base_path: e.target.value }))}
                              placeholder="e.g., finance/"
                              className="w-full bg-gray-950 border border-blue-500/50 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-400"
                            />
                          ) : (
                            <span className="text-gray-500">{u.base_path || <span className="italic text-gray-700">—</span>}</span>
                          )}
                        </td>

                        {/* Last login */}
                        <td className="py-3 px-4 font-mono text-gray-500">
                          {u.last_login ? new Date(u.last_login).toLocaleString() : 'Never Connected'}
                        </td>

                        {/* Action buttons */}
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
      )}
    </div>
  );
}