import React, { useState, useEffect, useRef } from 'react';
import api from '../utils/api';
import { toast } from 'react-hot-toast';
import { ShieldCheck, ShieldOff, Copy, Check, Loader2, X, AlertTriangle } from 'lucide-react';

/**
 * Self-service MFA settings modal. Any authenticated user (not just admins)
 * can enable, verify, or disable their own MFA from here.
 *
 * Usage:
 *   const [isMfaModalOpen, setIsMfaModalOpen] = useState(false);
 *   <MfaSettingsModal
 *     isOpen={isMfaModalOpen}
 *     onClose={() => setIsMfaModalOpen(false)}
 *     isMfaEnabled={user?.is_mfa_enabled}
 *     onStatusChange={(enabled) => { ...update local user state if you track it... }}
 *   />
 */
export default function MfaSettingsModal({ isOpen, onClose, isMfaEnabled, onStatusChange }) {
  // 'status' -> shows current state + the enable/disable entry point.
  // 'scanning' -> QR shown, waiting for the first code to activate.
  // 'disabling' -> asking for a current code to turn MFA off.
  const [phase, setPhase] = useState('status');
  const [qrCode, setQrCode] = useState(null);
  const [manualKey, setManualKey] = useState(null);
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const inputRef = useRef(null);

  // Reset to a clean state every time the modal opens, and reflect whatever
  // the caller currently knows about this user's MFA status.
  useEffect(() => {
    if (isOpen) {
      setPhase('status');
      setQrCode(null);
      setManualKey(null);
      setCode('');
      setIsLoading(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if ((phase === 'scanning' || phase === 'disabling') && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [phase]);

  if (!isOpen) return null;

  const handleStartSetup = async () => {
    setIsLoading(true);
    try {
      const { data } = await api.post('/auth/mfa/setup');
      setQrCode(data.qrCode);
      setManualKey(data.manualEntryKey);
      setPhase('scanning');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Could not start MFA setup.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      toast.error('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setIsLoading(true);
    try {
      await api.post('/auth/mfa/verify-setup', { token: code });
      toast.success('MFA enabled successfully.');
      onStatusChange?.(true);
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Invalid code. Please try again.');
      setCode('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisable = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      toast.error('Enter the 6-digit code from your authenticator app.');
      return;
    }
    setIsLoading(true);
    try {
      await api.post('/auth/mfa/disable', { token: code });
      toast.success('MFA disabled.');
      onStatusChange?.(false);
      onClose();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Invalid code. Please try again.');
      setCode('');
    } finally {
      setIsLoading(false);
    }
  };

  const copySecret = () => {
    navigator.clipboard.writeText(manualKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-2xl w-full max-w-sm p-6 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors cursor-pointer"
        >
          <X size={16} />
        </button>

        <h2 className="text-base font-bold text-gray-900 dark:text-white mb-1">
          Two-Factor Authentication
        </h2>

        {/* ── Status view ── */}
        {phase === 'status' && (
          <>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-5">
              Add an extra layer of security to your account using an authenticator
              app like Google Authenticator.
            </p>

            <div className="flex items-center gap-2 mb-5">
              {isMfaEnabled ? (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold bg-emerald-500/10 text-emerald-500 border border-emerald-500/20">
                  <ShieldCheck size={13} /> MFA is Enabled
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-bold bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-500 border border-gray-300 dark:border-gray-700">
                  <ShieldOff size={13} /> MFA is Disabled
                </span>
              )}
            </div>

            {isMfaEnabled ? (
              <button
                onClick={() => setPhase('disabling')}
                className="w-full py-2.5 rounded-xl text-xs font-semibold bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 hover:border-red-500/40 text-gray-600 dark:text-gray-400 hover:text-red-400 transition-colors cursor-pointer"
              >
                Disable MFA
              </button>
            ) : (
              <button
                onClick={handleStartSetup}
                disabled={isLoading}
                className="w-full py-2.5 rounded-xl text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
              >
                {isLoading && <Loader2 size={13} className="animate-spin" />}
                Enable MFA
              </button>
            )}
          </>
        )}

        {/* ── QR scan + confirm ── */}
        {phase === 'scanning' && (
          <div className="space-y-4">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Scan this with your authenticator app, then enter the current code to confirm.
            </p>

            <div className="flex flex-col items-center gap-3 bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
              <img src={qrCode} alt="MFA QR Code" className="w-40 h-40 rounded" />
              <div className="w-full">
                <span className="text-[10px] uppercase tracking-wider text-gray-500 dark:text-gray-500 font-semibold">
                  Can't scan? Enter this key manually
                </span>
                <div className="flex items-center gap-2 mt-1">
                  <code className="flex-1 text-[11px] text-blue-500 break-all bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-2 py-1.5">
                    {manualKey}
                  </code>
                  <button
                    onClick={copySecret}
                    title="Copy Secret"
                    className="p-1.5 rounded-lg bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 transition-colors shrink-0 cursor-pointer"
                  >
                    {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                  </button>
                </div>
              </div>
            </div>

            <form onSubmit={handleVerify}>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-500 mb-1.5">
                Enter code to confirm
              </label>
              <input
                ref={inputRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                disabled={isLoading}
                className="w-full text-center text-lg tracking-[0.4em] bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
              />

              <div className="flex gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => setPhase('status')}
                  disabled={isLoading}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLoading || code.length !== 6}
                  className="flex-1 py-2 rounded-lg text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  {isLoading && <Loader2 size={12} className="animate-spin" />}
                  Confirm & Enable
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ── Disable confirmation ── */}
        {phase === 'disabling' && (
          <form onSubmit={handleDisable} className="space-y-4">
            <div className="flex items-start gap-2 text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <p className="text-xs text-amber-600 dark:text-amber-400">
                Enter your current authenticator code to confirm disabling MFA on your account.
              </p>
            </div>

            <input
              ref={inputRef}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="000000"
              disabled={isLoading}
              className="w-full text-center text-lg tracking-[0.4em] bg-gray-50 dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-lg px-3 py-2 text-gray-900 dark:text-white focus:outline-none focus:border-blue-500"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPhase('status')}
                disabled={isLoading}
                className="flex-1 py-2 rounded-lg text-xs font-semibold bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading || code.length !== 6}
                className="flex-1 py-2 rounded-lg text-xs font-semibold bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {isLoading && <Loader2 size={12} className="animate-spin" />}
                Disable MFA
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}