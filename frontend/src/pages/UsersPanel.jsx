import React, { useState, useEffect, useCallback } from 'react';
import api from '../utils/api';
import { toast } from 'react-hot-toast';
import {
  ShieldCheck, ShieldOff, RefreshCw, Search, X, Copy, Check,
  AlertTriangle, Loader2, KeyRound,
} from 'lucide-react';

// --- Confirm-before-disable modal ---------------------------------------
const ConfirmDisableModal = ({ userId, onConfirm, onCancel, isSubmitting }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl w-full max-w-sm p-5">
      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mb-3">
        <AlertTriangle size={18} />
        <h3 className="font-bold text-sm">Disable MFA for {userId}?</h3>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
        This clears their MFA secret entirely. They'll log in with just their PIN
        until MFA is set up again from scratch.
      </p>
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={isSubmitting}
          className="px-3 py-1.5 rounded text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={isSubmitting}
          className="px-3 py-1.5 rounded text-xs font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors flex items-center gap-1.5 disabled:opacity-60"
        >
          {isSubmitting && <Loader2 size={12} className="animate-spin" />}
          Disable MFA
        </button>
      </div>
    </div>
  </div>
);

// --- QR / secret display modal (after "Generate New QR Code") ----------
const MfaQrModal = ({ userId, qrCode, manualEntryKey, onClose, onConfirm, isConfirming }) => {
  const [copied, setCopied] = useState(false);
  const [code, setCode] = useState('');

  const copySecret = () => {
    navigator.clipboard.writeText(manualEntryKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConfirm = (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) return;
    onConfirm(code);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl w-full max-w-sm p-5">
        <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-1">
          New MFA Secret — {userId}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Scan this in an authenticator app (yours if setting up in person, or
          the user's), then enter the current code below to activate MFA.
          It stays inactive until confirmed — closing this without confirming
          leaves it pending.
        </p>

        <div className="flex flex-col items-center gap-3 bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg p-4">
          <img src={qrCode} alt="MFA QR Code" className="w-40 h-40 rounded" />
          <div className="w-full">
            <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
              Manual entry key
            </span>
            <div className="flex items-center gap-2 mt-1">
              <code className="flex-1 text-[11px] text-blue-600 dark:text-blue-400 break-all bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded px-2 py-1.5">
                {manualEntryKey}
              </code>
              <button
                onClick={copySecret}
                title="Copy Secret"
                className="p-1.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors shrink-0"
              >
                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              </button>
            </div>
          </div>
        </div>

        <form onSubmit={handleConfirm} className="mt-4">
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
            Enter code to confirm &amp; enable
          </label>
          <input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            autoFocus
            disabled={isConfirming}
            className="w-full text-center text-lg tracking-[0.4em] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          />

          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isConfirming}
              className="flex-1 py-2 rounded text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              Close (leave pending)
            </button>
            <button
              type="submit"
              disabled={isConfirming || code.length !== 6}
              className="flex-1 py-2 rounded text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
            >
              {isConfirming && <Loader2 size={12} className="animate-spin" />}
              Confirm &amp; Enable
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// --- Main panel -----------------------------------------------------------
export default function UsersPanel() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  // Per-row async state, keyed by user_id, so one row's spinner doesn't
  // affect any other row.
  const [togglingId, setTogglingId] = useState(null);
  const [generatingId, setGeneratingId] = useState(null);

  const [confirmDisableFor, setConfirmDisableFor] = useState(null); // user_id or null
  const [qrModalData, setQrModalData] = useState(null); // { userId, qrCode, manualEntryKey } or null
  const [isConfirming, setIsConfirming] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/auth/users');
      setUsers(res.data.users || []);
    } catch (err) {
      console.error('Fetch users error:', err);
      toast.error('Failed to load users.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // --- Toggle MFA on/off ---
  const setMfaStatus = async (userId, isMfaEnabled) => {
    setTogglingId(userId);
    try {
      await api.patch(`/admin/users/${userId}/mfa-status`, { isMfaEnabled });
      setUsers(prev => prev.map(u =>
        u.user_id === userId ? { ...u, is_mfa_enabled: isMfaEnabled } : u
      ));
      toast.success(isMfaEnabled ? `MFA enabled for ${userId}.` : `MFA disabled for ${userId}.`);
    } catch (err) {
      console.error('MFA status toggle error:', err);
      toast.error(err.response?.data?.error || 'Failed to update MFA status.');
    } finally {
      setTogglingId(null);
      setConfirmDisableFor(null);
    }
  };

  // --- Confirm the pending code and activate MFA ---
  const handleConfirmMfaSetup = async (code) => {
    if (!qrModalData) return;
    setIsConfirming(true);
    try {
      await api.post(`/admin/users/${qrModalData.userId}/mfa/verify-setup`, { token: code });
      setUsers(prev => prev.map(u =>
        u.user_id === qrModalData.userId ? { ...u, is_mfa_enabled: true } : u
      ));
      toast.success(`MFA enabled for ${qrModalData.userId}.`);
      setQrModalData(null);
    } catch (err) {
      console.error('Admin MFA verify-setup error:', err);
      toast.error(err.response?.data?.error || 'Invalid code. Please try again.');
    } finally {
      setIsConfirming(false);
    }
  };

  const handleToggleClick = (user) => {
    if (user.is_mfa_enabled) {
      // Disabling is destructive (clears the secret) — confirm first
      setConfirmDisableFor(user.user_id);
    } else {
      // Enabling without a verified secret is rejected server-side with a
      // clear message — no confirmation needed for the attempt itself
      setMfaStatus(user.user_id, true);
    }
  };

  // --- Generate a fresh QR/secret for a user ---
  const handleGenerateQr = async (userId) => {
    setGeneratingId(userId);
    try {
      const res = await api.post(`/admin/users/${userId}/mfa/generate`);
      setQrModalData({ userId, qrCode: res.data.qrCode, manualEntryKey: res.data.manualEntryKey });
      toast.success('New MFA secret generated — pending user verification.');
    } catch (err) {
      console.error('MFA generate error:', err);
      toast.error(err.response?.data?.error || 'Failed to generate MFA secret.');
    } finally {
      setGeneratingId(null);
    }
  };

  const filteredUsers = users.filter(u =>
    u.user_id.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-2">
        <div className="relative w-56">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search users..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-7 py-1.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white text-xs focus:ring-1 focus:ring-blue-500 focus:outline-none"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
              <X size={12} />
            </button>
          )}
        </div>

        <button
          onClick={fetchUsers}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-colors"
        >
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[720px]">
            <thead className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-b border-slate-200 dark:border-slate-700 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-3 py-2.5">User ID</th>
                <th className="px-3 py-2.5">Role</th>
                <th className="px-3 py-2.5">Base Path</th>
                <th className="px-3 py-2.5">MFA Status</th>
                <th className="px-3 py-2.5">Last Login</th>
                <th className="px-3 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-400 text-xs">
                    <Loader2 size={20} className="mx-auto mb-2 animate-spin" />
                    Loading users...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-slate-400 text-xs">
                    No matching users found.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => (
                  <tr key={user.user_id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="px-3 py-2.5 font-mono text-xs text-slate-900 dark:text-white font-semibold">
                      {user.user_id}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-600 dark:text-slate-300">{user.role}</td>
                    <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
                      {user.base_path || '—'}
                    </td>
                    <td className="px-3 py-2.5">
                      {user.is_mfa_enabled ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                          <ShieldCheck size={11} /> Enabled
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/20">
                          <ShieldOff size={11} /> Disabled
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
                      {user.last_login ? new Date(user.last_login).toLocaleString() : 'Never'}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-2">
                        {/* Toggle switch */}
                        <button
                          onClick={() => handleToggleClick(user)}
                          disabled={togglingId === user.user_id}
                          title={user.is_mfa_enabled ? 'Disable MFA' : 'Enable MFA'}
                          className={`relative w-9 h-5 rounded-full transition-colors shrink-0 disabled:opacity-50 ${
                            user.is_mfa_enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                              user.is_mfa_enabled ? 'translate-x-4' : 'translate-x-0'
                            }`}
                          />
                        </button>

                        {/* Reset / Setup MFA */}
                        <button
                          onClick={() => handleGenerateQr(user.user_id)}
                          disabled={generatingId === user.user_id}
                          className="flex items-center gap-1 px-2 py-1 rounded text-[11px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 hover:bg-blue-500/20 transition-colors disabled:opacity-50"
                        >
                          {generatingId === user.user_id
                            ? <Loader2 size={11} className="animate-spin" />
                            : <KeyRound size={11} />}
                          Reset / Setup MFA
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modals */}
      {confirmDisableFor && (
        <ConfirmDisableModal
          userId={confirmDisableFor}
          isSubmitting={togglingId === confirmDisableFor}
          onCancel={() => setConfirmDisableFor(null)}
          onConfirm={() => setMfaStatus(confirmDisableFor, false)}
        />
      )}

      {qrModalData && (
        <MfaQrModal
          userId={qrModalData.userId}
          qrCode={qrModalData.qrCode}
          manualEntryKey={qrModalData.manualEntryKey}
          onConfirm={handleConfirmMfaSetup}
          isConfirming={isConfirming}
          onClose={() => setQrModalData(null)}
        />
      )}
    </div>
  );
}