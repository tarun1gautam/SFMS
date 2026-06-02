import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import { toast } from 'react-hot-toast';

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [newUserId, setNewUserId] = useState('');
  const [newPin, setNewPin] = useState('');
  const [newRole, setNewRole] = useState('user');

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
      await api.post('/auth/register', { user_id: newUserId, pin: newPin, role: newRole });
      toast.success('Identity node created successfully.');
      setNewUserId('');
      setNewPin('');
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

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-gray-800/60">
      
      {/* Account Registration Form Section */}
      <div className="p-6 space-y-4">
        <h3 className="text-base font-bold text-white">Provision Account</h3>
        <form onSubmit={handleRegisterUser} className="space-y-4">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">User Key String</label>
            <input type="text" value={newUserId} onChange={(e) => setNewUserId(e.target.value)} placeholder="e.g., manager_finance" className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">System Security PIN (4-8 Digits)</label>
            <input type="password" value={newPin} onChange={(e) => setNewPin(e.target.value)} placeholder="••••" className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-2 text-sm text-white focus:outline-none focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">System Context Authorization Role</label>
            <select value={newRole} onChange={(e) => setNewRole(e.target.value)} className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500">
              <option value="user">Standard Verified User</option>
              <option value="admin">System Cluster Administrator</option>
            </select>
          </div>
          <button type="submit" className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 font-semibold rounded-xl text-xs uppercase tracking-wider shadow cursor-pointer">
            Deploy Identity
          </button>
        </form>
      </div>

      {/* Database User Index Listing Directory */}
      <div className="p-6 lg:col-span-2 space-y-4">
        <h3 className="text-base font-bold text-white">Active Users Directory</h3>
        <div className="w-full overflow-hidden border border-gray-800/60 rounded-xl">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-950/60 border-b border-gray-800 text-[10px] font-bold uppercase tracking-wider text-gray-400">
                <th className="py-3 px-4">Account Identifier</th>
                <th className="py-3 px-4">Level</th>
                <th className="py-3 px-4">Latest Connection Trace</th>
                <th className="py-3 px-4 text-center">Controls</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/40 text-xs">
              {users.map((u) => (
                <tr key={u.user_id} className="hover:bg-gray-800/20">
                  <td className="py-3 px-4 font-mono font-semibold text-gray-200">{u.user_id}</td>
                  <td className="py-3 px-4">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${u.role === 'admin' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-gray-800 text-gray-400'}`}>{u.role}</span>
                  </td>
                  <td className="py-3 px-4 font-mono text-gray-500">{u.last_login ? new Date(u.last_login).toLocaleString() : 'Never Connected'}</td>
                  <td className="py-3 px-4 text-center">
                    <button onClick={() => handleDeleteUser(u.user_id)} className="px-2 py-1 bg-gray-950 hover:bg-red-950/30 border border-gray-800 hover:border-red-500/40 text-gray-500 hover:text-red-400 rounded-lg transition-all cursor-pointer">
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}