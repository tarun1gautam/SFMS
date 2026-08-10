import React, { useState, useRef, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import api from '../utils/api';

/**
 * Drop this into an account settings page/modal, e.g.:
 *   {isMfaEnabled ? <p>MFA is enabled</p> : <MfaSetup onEnabled={() => refetchUser()} />}
 */
export default function MfaSetup({ onEnabled }) {
  // 'idle' -> button to start setup. 'scanning' -> QR shown, waiting for code.
  const [phase, setPhase] = useState('idle');
  const [qrCode, setQrCode] = useState(null);
  const [manualKey, setManualKey] = useState(null);
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const codeInputRef = useRef(null);

  useEffect(() => {
    if (phase === 'scanning' && codeInputRef.current) {
      codeInputRef.current.focus();
    }
  }, [phase]);

  const handleStartSetup = async () => {
    setIsLoading(true);
    try {
      const { data } = await api.post('/auth/mfa/setup');
      setQrCode(data.qrCode);
      setManualKey(data.manualEntryKey);
      setPhase('scanning');
    } catch (error) {
      console.error('MFA setup start error:', error);
      toast.error(error.response?.data?.message || 'Could not start MFA setup.');
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
    const toastId = toast.loading('Verifying...');
    try {
      const { data } = await api.post('/auth/mfa/verify-setup', { token: code });

      // Enabling MFA can change the security level of the current session.
      // If the server rotates/reissues the JWT as part of this response,
      // make sure we start using it immediately — otherwise the next
      // authenticated request (e.g. onEnabled's refetch) goes out with the
      // old token and can get rejected, logging the user out right after
      // they successfully verified their code.
      const newToken = data?.token || data?.accessToken;
      if (newToken) {
        localStorage.setItem('sfms_token', newToken);
        api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
      }

      toast.success('MFA enabled successfully.', { id: toastId });
      setPhase('idle');
      setCode('');
      setQrCode(null);
      setManualKey(null);
      onEnabled?.();
    } catch (error) {
      console.error('MFA verify-setup error:', error);
      toast.error(error.response?.data?.message || 'Invalid code. Please try again.', { id: toastId });
      setCode('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = () => {
    setPhase('idle');
    setCode('');
    setQrCode(null);
    setManualKey(null);
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 max-w-md">
      <h2 className="text-lg font-bold text-white mb-1">Two-Factor Authentication</h2>
      <p className="text-sm text-gray-400 mb-6">
        Add an extra layer of security using Google Authenticator or a compatible app.
      </p>

      {phase === 'idle' && (
        <button
          onClick={handleStartSetup}
          disabled={isLoading}
          className="w-full py-3 px-4 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-500 transition-colors duration-150"
        >
          {isLoading ? 'Starting...' : 'Enable Two-Factor Authentication'}
        </button>
      )}

      {phase === 'scanning' && (
        <div className="space-y-5">
          <div className="flex flex-col items-center gap-3 bg-gray-950 border border-gray-800 rounded-xl p-4">
            <img src={qrCode} alt="MFA QR Code" className="w-44 h-44 rounded-lg" />
            <div className="text-center">
              <p className="text-xs text-gray-500 mb-1">Can't scan? Enter this key manually:</p>
              <code className="text-xs text-blue-400 break-all">{manualKey}</code>
            </div>
          </div>

          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                Enter code to confirm
              </label>
              <input
                ref={codeInputRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="w-full bg-gray-950 border border-gray-800 rounded-xl px-4 py-3 text-white text-center text-xl tracking-[0.4em] placeholder-gray-700 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors duration-200"
                disabled={isLoading}
              />
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleCancel}
                disabled={isLoading}
                className="flex-1 py-3 px-4 rounded-xl text-sm font-semibold text-gray-300 bg-gray-800 hover:bg-gray-700 transition-colors duration-150"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isLoading || code.length !== 6}
                className="flex-1 py-3 px-4 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 disabled:bg-gray-800 disabled:text-gray-500 transition-colors duration-150"
              >
                {isLoading ? 'Verifying...' : 'Confirm & Enable'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}