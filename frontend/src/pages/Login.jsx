import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import api from '../utils/api'; // 👈 IMPORTED YOUR AXIOS INSTANCE

export default function Login() {
  // 'credentials' -> normal userId/pin form. 'otp' -> 6-digit code form.
  const [step, setStep] = useState('credentials');

  const [userId, setUserId] = useState('');
  const [pin, setPin] = useState('');
  const [otp, setOtp] = useState('');
  const [tempToken, setTempToken] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const otpInputRef = useRef(null);

  const { login } = useAuth();
  const navigate = useNavigate();

  // Auto-focus the OTP field the moment we switch into step 2
  useEffect(() => {
    if (step === 'otp' && otpInputRef.current) {
      otpInputRef.current.focus();
    }
  }, [step]);

  const handleCredentialsSubmit = async (e) => {
    e.preventDefault();

    if (!userId.trim() || !pin.trim()) {
      toast.error('Please fill in all security fields.');
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading('Authenticating credentials...');

    try {
      // 1. Send authentication request directly to your Node/Express backend
      const response = await api.post('/auth/login', {
        user_id: userId,
        pin: pin
      });

      // MFA-enabled accounts get a temp token + a flag instead of a real session
      if (response.data.mfaRequired) {
        setTempToken(response.data.tempToken);
        toast.success('Enter your authenticator code to continue.', { id: toastId });
        setStep('otp');
        return;
      }

      // 2. Destructure the token and user info returned from your server payload
      const { token, user } = response.data;

      // 3. Pass the actual server token and user profile data into your AuthContext
      login(token, user);

      toast.success('Access granted. Welcome back!', { id: toastId });

      // 4. Safely push the session over to the protected dashboard
      navigate('/dashboard');
    } catch (error) {
      console.error('Login error:', error);
      toast.error(
        error.response?.data?.message || error.response?.data?.error || 'Invalid User ID or Security PIN.',
        { id: toastId }
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOtpSubmit = async (e) => {
    e.preventDefault();

    if (!/^\d{6}$/.test(otp)) {
      toast.error('Enter the 6-digit code from your authenticator app.');
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading('Verifying code...');

    try {
      const response = await api.post('/auth/login/mfa-verify', {
        tempToken,
        token: otp,
      });

      const { token, user } = response.data;
      login(token, user);
      toast.success('Access granted. Welcome back!', { id: toastId });
      navigate('/dashboard');
    } catch (error) {
      console.error('MFA verify error:', error);
      toast.error(
        error.response?.data?.message || error.response?.data?.error || 'Invalid code. Please try again.',
        { id: toastId }
      );
      setOtp('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBackToLogin = () => {
    setStep('credentials');
    setOtp('');
    setTempToken(null);
    setPin('');
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-white dark:bg-gray-950 px-4 select-none">
      <div className="w-full max-w-md bg-gray-100 dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-2xl p-8 shadow-2xl transition-all duration-300 hover:border-gray-300 dark:hover:border-gray-700">
        
        {/* Header section */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/10 text-blue-400 mb-4 border border-blue-500/20">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-extrabold text-gray-900 dark:text-white tracking-tight">SFMS Secure Gateway</h1>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
            {step === 'credentials'
              ? 'Enter credentials to decrypt your file workspace'
              : 'Enter the 6-digit code from your authenticator app'}
          </p>
        </div>

        {step === 'credentials' ? (
          <form onSubmit={handleCredentialsSubmit} className="space-y-6">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-2">
                User ID
              </label>
              <input
                type="text"
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                placeholder="e.g., admin"
                className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors duration-200"
                disabled={isSubmitting}
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-2">
                Security PIN / Password
              </label>
              <input
                type="password"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors duration-200"
                disabled={isSubmitting}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full flex items-center justify-center py-3 px-4 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-500 dark:disabled:text-gray-500 transition-all duration-150 shadow-lg shadow-blue-600/10 cursor-pointer"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Verify Identity'
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleOtpSubmit} className="space-y-6">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-600 dark:text-gray-400 mb-2">
                Authenticator Code
              </label>
              <input
                ref={otpInputRef}
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                placeholder="000000"
                className="w-full bg-white dark:bg-gray-950 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-3 text-gray-900 dark:text-white text-center text-2xl tracking-[0.5em] placeholder-gray-300 dark:placeholder-gray-700 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors duration-200"
                disabled={isSubmitting}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting || otp.length !== 6}
              className="w-full flex items-center justify-center py-3 px-4 rounded-xl text-sm font-semibold text-white bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-500 dark:disabled:text-gray-500 transition-all duration-150 shadow-lg shadow-blue-600/10 cursor-pointer"
            >
              {isSubmitting ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                'Verify & Continue'
              )}
            </button>

            <button
              type="button"
              onClick={handleBackToLogin}
              disabled={isSubmitting}
              className="w-full text-center text-xs text-gray-500 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors duration-150"
            >
              ← Back to Login
            </button>
          </form>
        )}

        {/* Security footer notice */}
        <div className="mt-8 pt-4 border-t border-gray-200/60 dark:border-gray-800/60 text-center">
          <span className="inline-flex items-center text-xs text-gray-500 dark:text-gray-500 gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
            End-to-End Encrypted Session
          </span>
        </div>

      </div>
    </div>
  );
}