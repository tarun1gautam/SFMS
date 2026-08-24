import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import api from '../utils/api';

export default function Login() {
    const [step, setStep] = useState('credentials');
    const [userId, setUserId] = useState('');
    const [pin, setPin] = useState('');
    const [otp, setOtp] = useState('');
    const [tempToken, setTempToken] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);

    const otpInputRef = useRef(null);
    const { login } = useAuth();
    const navigate = useNavigate();

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
            const response = await api.post('/auth/login', {
                user_id: userId,
                pin: pin
            });

            if (response.data.mfaRequired) {
                setTempToken(response.data.tempToken);
                toast.success('Enter your authenticator code to continue.', { id: toastId });
                setStep('otp');
                return;
            }

            const { token, user } = response.data;
            login(token, user);
            toast.success('Access granted. Welcome back!', { id: toastId });
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
        <div className="relative flex items-center justify-center min-h-screen px-4 select-none overflow-hidden bg-gradient-to-b from-blue-900 via-blue-800 to-cyan-700">
            {/* Injected styles for sea wave animation, floating logo, and white card */}
            <style>{`
                /* Wave animation keyframes */
                @keyframes waveMove {
                    0% { transform: translateX(0) translateY(0) rotate(0deg); }
                    100% { transform: translateX(-50%) translateY(-10%) rotate(2deg); }
                }
                @keyframes waveMove2 {
                    0% { transform: translateX(0) translateY(0) rotate(0deg); }
                    100% { transform: translateX(-50%) translateY(5%) rotate(-2deg); }
                }
                @keyframes waveMove3 {
                    0% { transform: translateX(0) translateY(0) rotate(0deg); }
                    100% { transform: translateX(-50%) translateY(-5%) rotate(1deg); }
                }
                /* Floating logo animation - only affects the floating child */
                @keyframes floatLogoVertical {
                    0% { transform: translateY(0px) rotate(0deg); }
                    50% { transform: translateY(-25px) rotate(4deg); }
                    100% { transform: translateY(0px) rotate(0deg); }
                }
                .wave-layer {
                    position: absolute;
                    bottom: 0;
                    left: 0;
                    width: 200%;
                    height: 120%;
                    border-radius: 40% 60% 30% 70% / 50% 40% 60% 50%;
                    animation-duration: 12s;
                    animation-timing-function: ease-in-out;
                    animation-iteration-count: infinite;
                    will-change: transform;
                }
                .wave-1 {
                    background: linear-gradient(135deg, rgba(56, 132, 255, 0.4), rgba(0, 200, 255, 0.25));
                    animation-name: waveMove;
                    animation-duration: 14s;
                    bottom: -20%;
                    opacity: 0.7;
                }
                .wave-2 {
                    background: linear-gradient(135deg, rgba(0, 150, 255, 0.3), rgba(0, 255, 210, 0.2));
                    animation-name: waveMove2;
                    animation-duration: 18s;
                    bottom: -10%;
                    opacity: 0.6;
                    border-radius: 30% 70% 40% 60% / 60% 30% 70% 40%;
                }
                .wave-3 {
                    background: linear-gradient(135deg, rgba(0, 100, 255, 0.35), rgba(100, 200, 255, 0.2));
                    animation-name: waveMove3;
                    animation-duration: 16s;
                    bottom: -30%;
                    opacity: 0.5;
                    border-radius: 50% 30% 70% 40% / 40% 60% 30% 70%;
                }
                .wave-4 {
                    background: linear-gradient(135deg, rgba(30, 80, 200, 0.3), rgba(0, 180, 255, 0.15));
                    animation-name: waveMove;
                    animation-duration: 20s;
                    animation-delay: -4s;
                    bottom: -5%;
                    opacity: 0.4;
                    border-radius: 60% 40% 50% 50% / 30% 60% 40% 70%;
                }
                .logo-float {
                    animation: floatLogoVertical 8s ease-in-out infinite;
                }
                /* Solid white card with soft shadow */
                .white-card {
                    background: rgba(255, 255, 255, 0.95);
                    backdrop-filter: blur(4px);
                    -webkit-backdrop-filter: blur(4px);
                    border: 1px solid rgba(255, 255, 255, 0.8);
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                }
                .white-card:hover {
                    box-shadow: 0 30px 60px -12px rgba(0, 50, 150, 0.4);
                }
                /* Input fields – light background with dark text */
                .input-light {
                    background: #f9fafb;
                    border: 1px solid #e5e7eb;
                    color: #111827;
                    transition: all 0.2s ease;
                }
                .input-light::placeholder {
                    color: #9ca3af;
                }
                .input-light:focus {
                    background: white;
                    border-color: #3b82f6;
                    outline: none;
                    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
                }
                /* Label and text colors for white card */
                .label-dark {
                    color: #374151;
                }
                .text-dark {
                    color: #111827;
                }
                .text-muted {
                    color: #6b7280;
                }
                .text-link {
                    color: #3b82f6;
                }
                .text-link:hover {
                    color: #2563eb;
                }
                .btn-gradient {
                    background: linear-gradient(135deg, #3b82f6, #7c3aed);
                    transition: all 0.2s ease;
                    border: none;
                    color: white;
                }
                .btn-gradient:hover:not(:disabled) {
                    background: linear-gradient(135deg, #2563eb, #6d28d9);
                    transform: scale(1.02);
                    box-shadow: 0 8px 25px -5px rgba(59, 130, 246, 0.6);
                }
                .btn-gradient:active:not(:disabled) {
                    transform: scale(0.98);
                }
                .btn-gradient:disabled {
                    background: #e5e7eb;
                    color: #9ca3af;
                    cursor: not-allowed;
                    box-shadow: none;
                }
                .checkbox-custom {
                    accent-color: #3b82f6;
                }
                .min-h-card {
                    min-height: 420px;
                }
                @media (prefers-reduced-motion: reduce) {
                    .wave-layer, .logo-float {
                        animation: none !important;
                    }
                }
            `}</style>

            {/* Sea wave background layers */}
            <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
                {/* Animated Sea Waves */}
                <div className="wave-layer wave-1" />
                <div className="wave-layer wave-2" />
                <div className="wave-layer wave-3" />
                <div className="wave-layer wave-4" />
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,_rgba(255,255,255,0.05)_0%,_transparent_60%)]" />

                {/* Simplified Floating SPMU Logo - Centered vertically on the left side */}
                {/* The parent container uses inset-y-0 and flex items-center to handle centering */}
                <div className="absolute inset-y-0 left-6 flex items-center pointer-events-none">
                    <div className="logo-float opacity-20 w-48 h-48 sm:w-64 sm:h-64 md:w-80 md:h-80">
                        <svg width="100%" height="100%" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
                            <defs>
                                <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                    <stop offset="0%" stop-color="#3b82f6" />
                                    <stop offset="100%" stop-color="#7c3aed" />
                                </linearGradient>
                                <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                                    <feDropShadow dx="0" dy="10" stdDeviation="10" flood-color="#000" flood-opacity="0.3"/>
                                </filter>
                            </defs>
                            {/* Outer ring */}
                            <circle cx="100" cy="100" r="90" fill="url(#logoGrad)" filter="url(#shadow)" />
                            {/* Inner ring */}
                            <circle cx="100" cy="100" r="75" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2" />
                            {/* University text - SPMU only */}
                            <text x="100" y="120" font-family="'Arial', sans-serif" font-size="42" font-weight="bold" fill="white" text-anchor="middle" letter-spacing="6">SPMU</text>
                            {/* Decorative lines */}
                            <line x1="50" y1="140" x2="70" y2="140" stroke="rgba(255,255,255,0.4)" stroke-width="2" />
                            <line x1="130" y1="140" x2="150" y2="140" stroke="rgba(255,255,255,0.4)" stroke-width="2" />
                        </svg>
                    </div>
                </div>
            </div>

            {/* Main card – solid white with subtle backdrop blur */}
            <div className="relative w-full max-w-[420px] white-card rounded-2xl p-8 min-h-card transition-all duration-300 z-10">

                {/* Logo / Brand section */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30 mb-4 transition-transform duration-300 hover:scale-105">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-dark tracking-tight">
                        {step === 'credentials' ? 'SFMS' : 'Two-Factor Authentication'}
                    </h1>
                    <p className="text-sm text-muted mt-1.5">
                        {step === 'credentials'
                            ? 'Welcome back. Sign in to securely manage your files.'
                            : 'Enter the 6-digit code from your authenticator app'}
                    </p>
                </div>

                {step === 'credentials' ? (
                    <form onSubmit={handleCredentialsSubmit} className="space-y-5">

                        {/* User ID Field */}
                        <div>
                            <label className="block text-sm font-medium label-dark mb-1.5">
                                User ID
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-gray-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                    </svg>
                                </div>
                                <input
                                    type="text"
                                    value={userId}
                                    onChange={(e) => setUserId(e.target.value)}
                                    placeholder="Enter your user ID"
                                    className="w-full input-light rounded-xl pl-10 pr-4 py-3 focus:outline-none"
                                    disabled={isSubmitting}
                                    autoFocus
                                />
                            </div>
                        </div>

                        {/* PIN / Password Field */}
                        <div>
                            <label className="block text-sm font-medium label-dark mb-1.5">
                                Security PIN
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-gray-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                    </svg>
                                </div>
                                <input
                                    type="password"
                                    value={pin}
                                    onChange={(e) => setPin(e.target.value)}
                                    placeholder="Enter your security PIN"
                                    className="w-full input-light rounded-xl pl-10 pr-4 py-3 focus:outline-none"
                                    disabled={isSubmitting}
                                />
                            </div>
                        </div>

                        {/* Options Row: Remember Me + Forgot Password */}
                        <div className="flex items-center justify-between">
                            <label className="flex items-center gap-2 text-sm text-muted cursor-pointer group">
                                <input
                                    type="checkbox"
                                    checked={rememberMe}
                                    onChange={(e) => setRememberMe(e.target.checked)}
                                    className="checkbox-custom w-4 h-4 rounded border-gray-300 focus:ring-2 focus:ring-blue-500/50 transition-all duration-200"
                                />
                                <span className="select-none group-hover:text-dark transition-colors">
                                    Remember me
                                </span>
                            </label>
                            <button
                                type="button"
                                className="text-sm text-link font-medium transition-colors duration-200"
                            >
                                Forgot Password?
                            </button>
                        </div>

                        {/* Login Button */}
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="btn-gradient w-full flex items-center justify-center py-3.5 px-4 rounded-xl text-sm font-semibold shadow-lg shadow-blue-500/30 focus:ring-2 focus:ring-blue-500/50 focus:outline-none"
                        >
                            {isSubmitting ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                'Log In'
                            )}
                        </button>

                        {/* Registration link */}
                        <p className="text-center text-sm text-muted mt-2">
                            Don't have an account?{' '}
                            <a href="/register" className="text-link font-medium transition-colors duration-200">
                                Get Registered
                            </a>
                        </p>

                    </form>
                ) : (
                    <form onSubmit={handleOtpSubmit} className="space-y-6">

                        {/* OTP Field */}
                        <div>
                            <label className="block text-sm font-medium label-dark mb-1.5">
                                Authenticator Code
                            </label>
                            <div className="relative">
                                <div className="absolute inset-y-0 left-0 flex items-center pl-3.5 pointer-events-none text-gray-400">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
                                    </svg>
                                </div>
                                <input
                                    ref={otpInputRef}
                                    type="text"
                                    inputMode="numeric"
                                    autoComplete="one-time-code"
                                    maxLength={6}
                                    value={otp}
                                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                                    placeholder="0 0 0 0 0 0"
                                    className="w-full input-light rounded-xl pl-10 pr-4 py-3 text-center text-2xl tracking-[0.5em] placeholder-gray-300 focus:outline-none"
                                    disabled={isSubmitting}
                                />
                            </div>
                            <p className="text-xs text-muted mt-2 text-center">
                                Enter the 6-digit code from your authenticator app
                            </p>
                        </div>

                        {/* Verify Button */}
                        <button
                            type="submit"
                            disabled={isSubmitting || otp.length !== 6}
                            className="btn-gradient w-full flex items-center justify-center py-3.5 px-4 rounded-xl text-sm font-semibold shadow-lg shadow-blue-500/30 focus:ring-2 focus:ring-blue-500/50 focus:outline-none"
                        >
                            {isSubmitting ? (
                                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            ) : (
                                'Verify & Continue'
                            )}
                        </button>

                        {/* Back button */}
                        <button
                            type="button"
                            onClick={handleBackToLogin}
                            disabled={isSubmitting}
                            className="w-full text-center text-sm text-muted hover:text-dark transition-colors duration-200"
                        >
                            ← Back to login
                        </button>

                    </form>
                )}

                {/* Security footer */}
                <div className="mt-7 pt-4 border-t border-gray-200/60 flex items-center justify-center gap-2">
                    <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-green-500 opacity-75 animate-ping" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-green-500" />
                    </span>
                    <span className="text-xs text-muted">
                        End-to-End Encrypted Session
                    </span>
                </div>

            </div>
        </div>
    );
}