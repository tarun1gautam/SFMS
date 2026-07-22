import React, { useState } from 'react';
import api from '../../utils/api';
import { toast } from 'react-hot-toast';
import { X, KeyRound } from 'lucide-react';

export default function ChangePasswordModal({ isOpen, onClose }) {
  const [currentPin, setCurrentPin] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const reset = () => { setCurrentPin(''); setNewPin(''); setConfirmPin(''); };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!currentPin || !newPin || !confirmPin) {
      toast.error('Fill in all fields.');
      return;
    }
    if (newPin !== confirmPin) {
      toast.error('New PIN and confirmation do not match.');
      return;
    }
    if (!/^\d{4,8}$/.test(newPin)) {
      toast.error('New PIN must be 4-8 digits.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.patch('/auth/change-password', {
        current_pin: currentPin,
        new_pin: newPin,
      });
      localStorage.setItem('sfms_token', res.data.token); // keep this device logged in
      toast.success(res.data.message || 'Password updated.');
      reset();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Password change failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
      <div className="w-full max-w-sm bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <KeyRound size={18} className="text-blue-400" />
            <h3 className="text-base font-bold text-white">Change Password</h3>
          </div>
          <button onClick={() => { reset(); onClose(); }} className="text-gray-500 hover:text-white cursor-pointer">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Current PIN</label>
            <input
              type="password"
              value={currentPin}
              onChange={(e) => setCurrentPin(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
              placeholder="••••"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">New PIN (4-8 digits)</label>
            <input
              type="password"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
              placeholder="••••"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Confirm New PIN</label>
            <input
              type="password"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value)}
              className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:border-blue-500"
              placeholder="••••"
            />
          </div>

          <p className="text-[10px] text-gray-500 leading-relaxed">
            Changing your password signs you out of all other devices. This device stays logged in.
          </p>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 mt-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed font-semibold rounded-xl text-xs uppercase tracking-wider text-white shadow-lg shadow-blue-900/20 transition-all cursor-pointer"
          >
            {submitting ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </div>
    </div>
  );
}