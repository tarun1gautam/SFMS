import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import api from '../utils/api';

/* ============================================================================
   PRESENTATIONAL SUB-COMPONENTS
   Decorative only — authentication state and API logic remain in Login.
============================================================================ */

function BrandMark({ className = "w-6 h-6" }) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="10" fill="currentColor" opacity="0.14" />
            <path d="M8 8.5v7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
            <path d="M13.5 8.5c2.7 1.4 2.7 5.6 0 7" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        </svg>
    );
}

function QuotesIcon() {
    return (
        <svg viewBox="0 0 24 24" className="w-8 h-8" fill="currentColor" aria-hidden="true">
            <path d="M4.6 17.3C3.55 16.2 3 14.96 3 13c0-3.5 2.46-6.64 6.03-8.19l.89 1.38c-3.33 1.8-3.99 4.15-4.25 5.62.54-.28 1.24-.38 1.93-.31 1.8.17 3.23 1.65 3.23 3.49a3.5 3.5 0 1 1-6.23 2.31Zm10 0C13.55 16.2 13 14.96 13 13c0-3.5 2.46-6.64 6.03-8.19l.89 1.38c-3.33 1.8-3.99 4.15-4.25 5.62.54-.28 1.24-.38 1.93-.31 1.8.17 3.23 1.65 3.23 3.49a3.5 3.5 0 1 1-6.23 2.31Z" />
        </svg>
    );
}

function UserIcon({ className = "w-5 h-5" }) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
        </svg>
    );
}

function LockIcon({ className = "w-5 h-5" }) {
    return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="11" width="18" height="11" rx="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
    );
}

function EyeIcon({ hidden = false }) {
    return hidden ? (
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
            <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
    ) : (
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    );
}

function ArrowRight() {
    return (
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
        </svg>
    );
}

function Spinner() {
    return (
        <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
    );
}

function AppBadge({ type, label, className = "" }) {
    const icons = {
        filesystem: (
            <span className="sfms-app-icon sfms-app-filesystem">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
                </svg>
            </span>
        ),
        dak: (
            <span className="sfms-app-icon sfms-app-dak">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 12h4l2 3h4l2-3h4" />
                    <path d="M5 4h14l2 8v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6l2-8Z" />
                </svg>
            </span>
        ),
        nearby: (
            <span className="sfms-app-icon sfms-app-nearby">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <circle cx="5" cy="19" r="1.4" fill="currentColor" stroke="none" />
                    <path d="M9.5 19a4.5 4.5 0 0 0-4.5-4.5" />
                    <path d="M14 19a9 9 0 0 0-9-9" />
                    <path d="M18.5 19A13.5 13.5 0 0 0 5 5.5" />
                </svg>
            </span>
        ),
        filechat: (
            <span className="sfms-app-icon sfms-app-filechat">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
                </svg>
            </span>
        ),
        utility: (
            <span className="sfms-app-icon sfms-app-utility">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
                </svg>
            </span>
        ),
    };

    return (
        <div className={`sfms-app-badge ${className}`}>
            {icons[type]}
            <span>{label}</span>
        </div>
    );
}

function FloatingPill({ children, className = "" }) {
    return <div className={`sfms-floating-pill ${className}`}>{children}</div>;
}

function DashboardIllustration({ step }) {
    const isOtp = step === 'otp';

    return (
        <div className={`sfms-dashboard-stage ${isOtp ? 'sfms-dashboard-stage-otp' : ''}`} aria-hidden="true">
            <div className="sfms-dashboard-orbit sfms-orbit-a" />
            <div className="sfms-dashboard-orbit sfms-orbit-b" />

            <AppBadge type="filesystem" label="File System" className="sfms-badge-filesystem" />
            <AppBadge type="dak" label="Dak Register" className="sfms-badge-dak" />
            <AppBadge type="nearby" label="Nearby Share" className="sfms-badge-nearby" />
            <AppBadge type="filechat" label="File Chat" className="sfms-badge-filechat" />
            <AppBadge type="utility" label="Utility Engine" className="sfms-badge-utility" />

            <FloatingPill className="sfms-pill-video">
                <span className="sfms-pill-dot sfms-dot-cyan" />
                {isOtp ? 'MFA Protected' : 'Print Center'}
            </FloatingPill>

            <FloatingPill className="sfms-pill-read">
                <span className="sfms-pill-dot sfms-dot-blue" />
                {isOtp ? 'Secure Session' : 'Folder Lock'}
            </FloatingPill>

            <div className="sfms-dashboard-card">
                <div className="sfms-dashboard-card-top">
                    <div className="sfms-dashboard-brand">
                        <span className="sfms-mini-logo"><BrandMark className="w-3.5 h-3.5" /></span>
                        <span>SFMS</span>
                    </div>
                    <div className="sfms-dashboard-actions">
                        <span />
                        <span />
                        <span />
                    </div>
                </div>

                <div className="sfms-dashboard-title-row">
                    <div>
                        <div className="sfms-dashboard-kicker">{isOtp ? 'SECURITY CENTER' : 'WORKSPACE OVERVIEW'}</div>
                        <div className="sfms-dashboard-title">{isOtp ? 'Protected session' : 'Campaign Performance'}</div>
                    </div>
                    <span className={`sfms-dashboard-status ${isOtp ? 'is-secure' : ''}`}>
                        <i />
                        {isOtp ? 'Verified' : 'Live'}
                    </span>
                </div>

                <div className="sfms-metric-grid">
                    <div className="sfms-metric">
                        <span>Total Files</span>
                        <strong>{isOtp ? '12,480' : '8,250'}</strong>
                        <small>+8.4%</small>
                    </div>
                    <div className="sfms-metric">
                        <span>Sync Rate</span>
                        <strong>{isOtp ? '99.98%' : '96.3%'}</strong>
                        <small>+2.1%</small>
                    </div>
                    <div className="sfms-metric">
                        <span>Access</span>
                        <strong>{isOtp ? 'MFA' : '24/7'}</strong>
                        <small>{isOtp ? 'Active' : 'Protected'}</small>
                    </div>
                </div>

                <div className="sfms-chart">
                    <div className="sfms-chart-label">
                        <span>{isOtp ? 'Security activity' : 'Storage & Review Trends'}</span>
                        <span>Last 30 days</span>
                    </div>
                    <svg viewBox="0 0 520 150" preserveAspectRatio="none">
                        <defs>
                            <linearGradient id="sfmsChartFill" x1="0" x2="0" y1="0" y2="1">
                                <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.25" />
                                <stop offset="100%" stopColor="#22d3ee" stopOpacity="0" />
                            </linearGradient>
                        </defs>
                        <path d="M0 118 C42 100 55 111 84 92 S132 95 160 79 S205 93 238 62 S284 86 316 58 S362 77 392 45 S440 64 468 30 S502 42 520 24 V150 H0 Z" fill="url(#sfmsChartFill)" />
                        <path d="M0 118 C42 100 55 111 84 92 S132 95 160 79 S205 93 238 62 S284 86 316 58 S362 77 392 45 S440 64 468 30 S502 42 520 24" fill="none" stroke="#22d3ee" strokeWidth="4" strokeLinecap="round" />
                        <path d="M0 132 C42 121 65 127 96 110 S140 119 172 104 S218 114 252 96 S300 110 333 87 S377 99 412 74 S455 91 520 58" fill="none" stroke="#2563eb" strokeWidth="3" strokeDasharray="7 7" opacity="0.72" />
                    </svg>
                    <div className="sfms-chart-axis">
                        <span>Mon</span><span>Wed</span><span>Fri</span><span>Sun</span>
                    </div>
                </div>

                <div className="sfms-dashboard-footer">
                    <div className="sfms-avatar-stack">
                        <span>MH</span><span>RA</span><span>+</span>
                    </div>
                    <div className="sfms-dashboard-footer-copy">
                        <strong>{isOtp ? 'Authenticator connected' : 'Workspace synced'}</strong>
                        <span>{isOtp ? 'Ready for secure access' : 'All systems operational'}</span>
                    </div>
                    <span className="sfms-dashboard-arrow"><ArrowRight /></span>
                </div>
            </div>
        </div>
    );
}

const BRAND_SLIDES = [
    {
        title: <>Unlock The Full<br />Power of Your<br /><span>Workspace</span></>,
        body: 'Enterprise-grade file management with bank-level security, real-time collaboration, and intelligent workflow automation.',
        accent: 'Bank-grade security, always on',
    },
    {
        title: <>Move Faster.<br />Stay Completely<br /><span>Protected.</span></>,
        body: 'Keep teams, files, approvals, and sensitive workflows moving together inside one secure workspace.',
        accent: 'Real-time control across every device',
    },
];

function BrandPanel({ step }) {
    const [slideIndex, setSlideIndex] = useState(0);
    const [slideKey, setSlideKey] = useState(0);

    useEffect(() => {
        const id = setInterval(() => {
            setSlideIndex((index) => (index + 1) % BRAND_SLIDES.length);
            setSlideKey((key) => key + 1);
        }, 5200);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        setSlideKey((key) => key + 1);
    }, [step]);

    const slide = BRAND_SLIDES[slideIndex];

    return (
        <section className="sfms-brand-panel">
            <div className="sfms-brand-glow sfms-brand-glow-a" />
            <div className="sfms-brand-glow sfms-brand-glow-b" />
            <div className="sfms-brand-grid" />
            <div className="sfms-brand-ring sfms-brand-ring-a" />
            <div className="sfms-brand-ring sfms-brand-ring-b" />

            <div className="sfms-brand-content">
                <div className="sfms-brand-copy">
                    <div className="sfms-quotes"><QuotesIcon /></div>

                    <div key={slideKey} className="sfms-slide-copy">
                        <h2 className="sfms-display sfms-brand-title">{slide.title}</h2>
                        <p className="sfms-brand-body">{slide.body}</p>
                        <div className="sfms-brand-accent">
                            <span className="sfms-brand-accent-dot" />
                            <span>{step === 'otp' ? 'Awaiting secure verification code' : slide.accent}</span>
                        </div>
                    </div>
                </div>

                <div key={`dashboard-${step}`} className="sfms-dashboard-wrap">
                    <DashboardIllustration step={step} />
                </div>
            </div>

            <div className="sfms-brand-footer">
                <span>© SFMS 2026. All Rights Reserved</span>
                <span className="sfms-brand-footer-status"><i /> Secure &middot; Intelligent &middot; Connected</span>
            </div>
        </section>
    );
}

function MobileBrandHeader() {
    return (
        <div className="sfms-mobile-brand">
            <div className="sfms-mobile-mark"><BrandMark /></div>
            <div>
                <div className="sfms-display text-lg font-bold text-slate-900 leading-none">SFMS</div>
                <div className="text-[10px] text-slate-500 mt-1">Secure File Management</div>
            </div>
        </div>
    );
}

function OtpCells({ value, focused }) {
    const cells = Array.from({ length: 6 });
    const activeIndex = value.length < 6 ? value.length : 5;

    return (
        <div aria-hidden="true" className="grid grid-cols-6 gap-2.5">
            {cells.map((_, index) => {
                const char = value[index];
                const isActive = focused && index === activeIndex;

                return (
                    <div
                        key={index}
                        className={`sfms-otp-cell ${char ? 'sfms-otp-cell-filled' : ''} ${isActive ? 'sfms-otp-cell-active' : ''}`}
                    >
                        {char || ''}
                    </div>
                );
            })}
        </div>
    );
}

function ErrorBanner({ children }) {
    return (
        <div className="sfms-error-banner">
            <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{children}</span>
        </div>
    );
}

/* ============================================================================
   MAIN COMPONENT
   Authentication and lockout behavior intentionally preserved.
============================================================================ */

export default function Login() {
    // ── Auth state ──────────────────────────────────────────────────────────
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

    // ── Presentational-only state ──────────────────────────────────────────
    const [formError, setFormError] = useState(null);
    const [otpError, setOtpError] = useState(null);
    const [showPin, setShowPin] = useState(false);
    const [otpFocused, setOtpFocused] = useState(false);

    // ── Login lockout state ─────────────────────────────────────────────────
    const [lockoutUntil, setLockoutUntil] = useState(null);
    const [lockoutRemaining, setLockoutRemaining] = useState(0);

    const LOCKOUT_KEY_PREFIX = 'sfms_login_lockout_';
    const DEFAULT_LOCKOUT_SECONDS = 10 * 60;

    const getLockoutKey = (id) => `${LOCKOUT_KEY_PREFIX}${id.trim().toLowerCase()}`;

    const readStoredLockout = (id) => {
        if (!id || !id.trim()) return null;
        try {
            const raw = localStorage.getItem(getLockoutKey(id));
            if (!raw) return null;
            const until = parseInt(raw, 10);
            if (!until || until <= Date.now()) {
                localStorage.removeItem(getLockoutKey(id));
                return null;
            }
            return until;
        } catch {
            return null;
        }
    };

    const storeLockout = (id, until) => {
        try {
            localStorage.setItem(getLockoutKey(id), String(until));
        } catch {}
    };

    const clearStoredLockout = (id) => {
        try {
            localStorage.removeItem(getLockoutKey(id));
        } catch {}
    };

    const formatLockoutTime = (totalSeconds) => {
        const s = Math.max(0, totalSeconds);
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, '0')}`;
    };

    useEffect(() => {
        setLockoutUntil(readStoredLockout(userId));
    }, [userId]);

    useEffect(() => {
        if (!lockoutUntil) {
            setLockoutRemaining(0);
            return;
        }

        const tick = () => {
            const secondsLeft = Math.max(0, Math.ceil((lockoutUntil - Date.now()) / 1000));
            setLockoutRemaining(secondsLeft);

            if (secondsLeft <= 0) {
                setLockoutUntil(null);
                clearStoredLockout(userId);
            }
        };

        tick();
        const interval = setInterval(tick, 1000);
        return () => clearInterval(interval);
    }, [lockoutUntil, userId]);

    useEffect(() => {
        if (step === 'otp' && otpInputRef.current) {
            otpInputRef.current.focus();
        }
    }, [step]);

    // ── Handlers ───────────────────────────────────────────────────────────
    const handleCredentialsSubmit = async (e) => {
        e.preventDefault();

        if (!userId.trim() || !pin.trim()) {
            const msg = 'Please fill in all security fields.';
            toast.error(msg);
            setFormError(msg);
            return;
        }

        const activeLockout = readStoredLockout(userId);
        if (activeLockout) {
            setLockoutUntil(activeLockout);
            toast.error(`Too many failed attempts. Try again in ${formatLockoutTime(Math.ceil((activeLockout - Date.now()) / 1000))}.`);
            return;
        }

        setFormError(null);
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

            clearStoredLockout(userId);
            setLockoutUntil(null);

            const { token, user } = response.data;
            login(token, user);
            toast.success('Access granted. Welcome back!', { id: toastId });
            navigate('/dashboard');
        } catch (error) {
            console.error('Login error:', error);

            if (error.response?.status === 429) {
                const data = error.response.data || {};
                const retryAfterSeconds = data.retryAfter ?? data.retryAfterSeconds ?? DEFAULT_LOCKOUT_SECONDS;
                const until = data.lockoutUntil ? new Date(data.lockoutUntil).getTime() : Date.now() + retryAfterSeconds * 1000;

                setLockoutUntil(until);
                storeLockout(userId, until);

                toast.error(data.message || 'Too many failed attempts. Please try again later.', { id: toastId });
            } else {
                const msg = error.response?.data?.message || error.response?.data?.error || 'Invalid User ID or Security PIN.';
                toast.error(msg, { id: toastId });
                setFormError(msg);
            }
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleOtpSubmit = async (e) => {
        e.preventDefault();

        if (!/^\d{6}$/.test(otp)) {
            const msg = 'Enter the 6-digit code from your authenticator app.';
            toast.error(msg);
            setOtpError(msg);
            return;
        }

        setOtpError(null);
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
            const msg = error.response?.data?.message || error.response?.data?.error || 'Invalid code. Please try again.';
            toast.error(msg, { id: toastId });
            setOtpError(msg);
            setOtp('');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleBackToLogin = () => {
        setStep('credentials');
        setOtp('');
        setOtpError(null);
        setTempToken(null);
        setPin('');
    };

    return (
        <div className="sfms-page">
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap');

                .sfms-page {
                    --sfms-blue: #2563EB;
                    --sfms-blue-dark: #1D4ED8;
                    --sfms-cyan: #0284C7;
                    --sfms-teal: #0d5c75;
                    --sfms-teal-dark: #084c61;
                    min-height: 100vh;
                    width: 100%;
                    overflow: hidden;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    color: #0F172A;
                    font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif;
                    background: #F8FAFC;
                }

                .sfms-page *,
                .sfms-page *::before,
                .sfms-page *::after {
                    box-sizing: border-box;
                }

                .sfms-display {
                    font-family: 'Space Grotesk', 'Inter', ui-sans-serif, system-ui, sans-serif;
                }

                /* -----------------------------------------------------------------
                   OUTER CANVAS / SPLIT STRUCTURE
                ----------------------------------------------------------------- */
                .sfms-shell {
                    position: relative;
                    width: min(1440px, calc(100vw - 64px));
                    min-height: min(900px, calc(100vh - 64px));
                    max-height: 960px;
                    display: grid;
                    grid-template-columns: minmax(430px, 0.91fr) minmax(520px, 1.09fr);
                    overflow: hidden;
                    background: #F8FAFC;
                    border: 1px solid rgba(15, 23, 42, 0.06);
                    box-shadow: 0 28px 80px -35px rgba(15, 23, 42, 0.28);
                }

                .sfms-right-panel {
                    position: relative;
                    min-width: 0;
                    overflow: hidden;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 44px 48px;
                    background:
                        linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px),
                        #F8FAFC;
                    background-size: 96px 96px;
                }

                .sfms-right-panel::before,
                .sfms-right-panel::after {
                    content: "";
                    position: absolute;
                    pointer-events: none;
                    border: 1px solid rgba(15, 23, 42, 0.05);
                }

                .sfms-right-panel::before {
                    inset: 0 16% 0 16%;
                    border-top: 0;
                    border-bottom: 0;
                }

                .sfms-right-panel::after {
                    inset: 28% 0 28% 0;
                    border-left: 0;
                    border-right: 0;
                }

                .sfms-right-rail {
                    position: absolute;
                    inset: 0;
                    pointer-events: none;
                    overflow: hidden;
                }

                .sfms-right-rail::before {
                    content: "";
                    position: absolute;
                    top: 0;
                    bottom: 0;
                    left: 16%;
                    width: 96px;
                    background: repeating-linear-gradient(-45deg, transparent 0 7px, rgba(15,23,42,0.035) 7px 8px);
                    border-left: 1px solid rgba(15,23,42,0.05);
                    border-right: 1px solid rgba(15,23,42,0.05);
                }

                .sfms-right-rail::after {
                    content: "";
                    position: absolute;
                    top: 0;
                    bottom: 0;
                    right: 16%;
                    width: 96px;
                    background: repeating-linear-gradient(-45deg, transparent 0 7px, rgba(15,23,42,0.035) 7px 8px);
                    border-left: 1px solid rgba(15,23,42,0.05);
                    border-right: 1px solid rgba(15,23,42,0.05);
                }

                /* -----------------------------------------------------------------
                   LEFT BRAND PANEL — REFERENCE-DESIGN TEAL + MOTION
                ----------------------------------------------------------------- */
                .sfms-brand-panel {
                    position: relative;
                    min-width: 0;
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                    padding: 54px 50px 34px;
                    color: white;
                    background: linear-gradient(150deg, #0A1B4A 0%, #123B8F 40%, #1D4ED8 72%, #0284C7 100%);
                    isolation: isolate;
                }

                .sfms-brand-grid {
                    position: absolute;
                    inset: 0;
                    z-index: -1;
                    opacity: 0.18;
                    background:
                        linear-gradient(135deg, transparent 0 48%, rgba(255,255,255,0.12) 48.15%, transparent 48.35%),
                        linear-gradient(135deg, transparent 0 58%, rgba(255,255,255,0.09) 58.15%, transparent 58.35%);
                    background-size: 26px 26px;
                    mask-image: linear-gradient(to bottom, transparent 38%, black 62%, black);
                    -webkit-mask-image: linear-gradient(to bottom, transparent 38%, black 62%, black);
                }

                .sfms-brand-panel::after {
                    content: "";
                    position: absolute;
                    z-index: -1;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    height: 52%;
                    opacity: 0.24;
                    background: repeating-linear-gradient(-45deg, transparent 0 7px, rgba(255,255,255,0.15) 7px 8px);
                    mask-image: linear-gradient(to top, black, transparent);
                    -webkit-mask-image: linear-gradient(to top, black, transparent);
                }

                .sfms-brand-glow {
                    position: absolute;
                    border-radius: 999px;
                    filter: blur(3px);
                    pointer-events: none;
                }

                .sfms-brand-glow-a {
                    width: 380px;
                    height: 380px;
                    top: -190px;
                    right: -120px;
                    background: rgba(56, 189, 248, 0.20);
                    animation: sfmsBrandGlowA 10s ease-in-out infinite alternate;
                }

                .sfms-brand-glow-b {
                    width: 300px;
                    height: 300px;
                    bottom: -180px;
                    left: -120px;
                    background: rgba(37, 99, 235, 0.13);
                    animation: sfmsBrandGlowB 12s ease-in-out infinite alternate;
                }

                .sfms-brand-ring {
                    position: absolute;
                    border: 1px solid rgba(255,255,255,0.10);
                    border-radius: 999px;
                    pointer-events: none;
                }

                .sfms-brand-ring-a {
                    width: 280px;
                    height: 280px;
                    top: 14%;
                    right: -170px;
                    animation: sfmsRingFloat 10s ease-in-out infinite;
                }

                .sfms-brand-ring-b {
                    width: 170px;
                    height: 170px;
                    bottom: 12%;
                    left: -95px;
                    animation: sfmsRingFloat 8s ease-in-out infinite reverse;
                }

                .sfms-brand-content {
                    position: relative;
                    z-index: 2;
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                    min-height: 0;
                }

                .sfms-brand-copy {
                    max-width: 500px;
                }

                .sfms-quotes {
                    color: rgba(255,255,255,0.72);
                    margin-bottom: 22px;
                    animation: sfmsQuoteIn 0.7s cubic-bezier(0.16,1,0.3,1) both;
                }

                .sfms-slide-copy {
                    animation: sfmsSlideIn 0.7s cubic-bezier(0.16,1,0.3,1) both;
                }

                .sfms-brand-title {
                    margin: 0;
                    font-size: clamp(2.15rem, 3.2vw, 3.15rem);
                    line-height: 1.04;
                    letter-spacing: -0.045em;
                    font-weight: 700;
                }

                .sfms-brand-title span {
                    color: #7dd3fc;
                }

                .sfms-brand-body {
                    max-width: 445px;
                    margin: 19px 0 0;
                    color: rgba(224, 242, 254, 0.76);
                    font-size: 14px;
                    line-height: 1.65;
                }

                .sfms-brand-accent {
                    display: inline-flex;
                    align-items: center;
                    gap: 8px;
                    margin-top: 17px;
                    color: rgba(224,242,254,0.86);
                    font-size: 11px;
                    font-weight: 700;
                    letter-spacing: 0.01em;
                }

                .sfms-brand-accent-dot {
                    width: 6px;
                    height: 6px;
                    border-radius: 999px;
                    background: #67e8f9;
                    box-shadow: 0 0 0 5px rgba(103,232,249,0.10);
                }

                .sfms-dashboard-wrap {
                    flex: 1;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 390px;
                    margin-top: 12px;
                    animation: sfmsDashboardEnter 0.9s cubic-bezier(0.16,1,0.3,1) both;
                }

                .sfms-dashboard-stage {
                    position: relative;
                    width: min(100%, 510px);
                    height: 410px;
                    margin: 0 auto;
                    transform: translateX(-4px);
                }

                .sfms-dashboard-stage-otp .sfms-dashboard-card {
                    transform: rotate(-2.6deg) translateY(5px) scale(0.985);
                }

                .sfms-dashboard-orbit {
                    position: absolute;
                    left: 50%;
                    top: 50%;
                    width: 420px;
                    height: 280px;
                    transform: translate(-50%, -43%) rotate(-8deg);
                    border: 1px solid rgba(255,255,255,0.12);
                    border-radius: 32px;
                    pointer-events: none;
                }

                .sfms-orbit-b {
                    transform: translate(-50%, -43%) rotate(8deg);
                    border-color: rgba(125,211,252,0.11);
                }

                .sfms-dashboard-card {
                    position: absolute;
                    left: 50%;
                    top: 52%;
                    width: 410px;
                    max-width: calc(100% - 70px);
                    transform: translate(-50%, -50%) rotate(-4deg);
                    padding: 15px;
                    color: #334155;
                    background: rgba(255,255,255,0.97);
                    border: 1px solid rgba(15,23,42,0.07);
                    border-radius: 16px;
                    box-shadow: 0 26px 42px -20px rgba(2,35,49,0.50);
                    transition: transform 0.7s cubic-bezier(0.16,1,0.3,1);
                    animation: sfmsCardFloat 6.5s ease-in-out infinite;
                }

                .sfms-dashboard-card::after {
                    content: "";
                    position: absolute;
                    inset: 0;
                    border-radius: inherit;
                    pointer-events: none;
                    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.55);
                }

                .sfms-dashboard-card-top,
                .sfms-dashboard-title-row,
                .sfms-dashboard-footer {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }

                .sfms-dashboard-card-top {
                    padding: 1px 2px 12px;
                    border-bottom: 1px solid #e2e8f0;
                }

                .sfms-dashboard-brand {
                    display: inline-flex;
                    align-items: center;
                    gap: 5px;
                    font-size: 9px;
                    font-weight: 800;
                    letter-spacing: 0.08em;
                    color: #64748b;
                }

                .sfms-mini-logo {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 17px;
                    height: 17px;
                    color: #fff;
                    border-radius: 6px;
                    background: linear-gradient(135deg, #2563EB, #0284C7);
                }

                .sfms-dashboard-actions {
                    display: flex;
                    gap: 4px;
                }

                .sfms-dashboard-actions span {
                    width: 4px;
                    height: 4px;
                    border-radius: 50%;
                    background: #cbd5e1;
                }

                .sfms-dashboard-title-row {
                    gap: 12px;
                    padding: 13px 2px 10px;
                }

                .sfms-dashboard-kicker {
                    color: #94a3b8;
                    font-size: 6px;
                    line-height: 1;
                    font-weight: 800;
                    letter-spacing: 0.12em;
                }

                .sfms-dashboard-title {
                    margin-top: 5px;
                    color: #0f172a;
                    font-size: 12px;
                    line-height: 1.1;
                    font-weight: 800;
                }

                .sfms-dashboard-status {
                    display: inline-flex;
                    align-items: center;
                    gap: 5px;
                    padding: 5px 7px;
                    color: #475569;
                    background: #f8fafc;
                    border: 1px solid #e2e8f0;
                    border-radius: 999px;
                    font-size: 6px;
                    font-weight: 800;
                    white-space: nowrap;
                }

                .sfms-dashboard-status i {
                    width: 5px;
                    height: 5px;
                    border-radius: 50%;
                    background: #22c55e;
                    box-shadow: 0 0 0 3px rgba(34,197,94,0.10);
                }

                .sfms-dashboard-status.is-secure i {
                    background: #2563EB;
                    box-shadow: 0 0 0 3px rgba(37,99,235,0.10);
                }

                .sfms-metric-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 7px;
                }

                .sfms-metric {
                    min-width: 0;
                    padding: 9px 8px;
                    background: #f8fafc;
                    border: 1px solid #edf2f7;
                    border-radius: 8px;
                }

                .sfms-metric span,
                .sfms-metric small {
                    display: block;
                    font-size: 6px;
                    line-height: 1.25;
                    color: #94a3b8;
                }

                .sfms-metric strong {
                    display: block;
                    margin: 4px 0 3px;
                    color: #0f172a;
                    font-size: 13px;
                    line-height: 1;
                    letter-spacing: -0.02em;
                }

                .sfms-metric small {
                    color: #22a66f;
                    font-weight: 700;
                }

                .sfms-chart {
                    margin-top: 8px;
                    padding: 9px 8px 7px;
                    border: 1px solid #edf2f7;
                    border-radius: 9px;
                    background: #fff;
                }

                .sfms-chart-label,
                .sfms-chart-axis {
                    display: flex;
                    justify-content: space-between;
                    color: #94a3b8;
                    font-size: 6px;
                    font-weight: 700;
                }

                .sfms-chart-label {
                    margin-bottom: 4px;
                }

                .sfms-chart svg {
                    display: block;
                    width: 100%;
                    height: 76px;
                }

                .sfms-chart-axis {
                    padding: 0 1px;
                }

                .sfms-dashboard-footer {
                    gap: 8px;
                    justify-content: flex-start;
                    margin-top: 8px;
                    padding: 8px 2px 1px;
                }

                .sfms-avatar-stack {
                    display: flex;
                    align-items: center;
                }

                .sfms-avatar-stack span {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 20px;
                    height: 20px;
                    margin-left: -4px;
                    color: #fff;
                    background: #0d5c75;
                    border: 2px solid #fff;
                    border-radius: 50%;
                    font-size: 5px;
                    font-weight: 800;
                }

                .sfms-avatar-stack span:first-child {
                    margin-left: 0;
                    background: #2563EB;
                }

                .sfms-avatar-stack span:nth-child(2) {
                    background: #0284C7;
                }

                .sfms-avatar-stack span:last-child {
                    color: #64748b;
                    background: #e2e8f0;
                }

                .sfms-dashboard-footer-copy {
                    min-width: 0;
                    display: flex;
                    flex-direction: column;
                    gap: 2px;
                }

                .sfms-dashboard-footer-copy strong {
                    color: #334155;
                    font-size: 7px;
                }

                .sfms-dashboard-footer-copy span {
                    color: #94a3b8;
                    font-size: 6px;
                }

                .sfms-dashboard-arrow {
                    margin-left: auto;
                    color: #2563EB;
                }

                .sfms-dashboard-arrow svg {
                    width: 13px;
                    height: 13px;
                }

                /* -----------------------------------------------------------------
                   FLOATING APP BADGES + PILLS
                ----------------------------------------------------------------- */
                .sfms-app-badge,
                .sfms-floating-pill {
                    position: absolute;
                    z-index: 5;
                    display: inline-flex;
                    align-items: center;
                    gap: 7px;
                    white-space: nowrap;
                    box-shadow: 0 12px 24px -14px rgba(2,35,49,0.55);
                }

                .sfms-floating-pill {
                    color: #334155;
                    background: rgba(255,255,255,0.97);
                    border: 1px solid rgba(15,23,42,0.08);
                }

                .sfms-app-badge {
                    padding: 7px 11px 7px 7px;
                    border-radius: 999px;
                    font-size: 8px;
                    font-weight: 800;
                    color: #ffffff;
                    background: #7dd3fc;
                    border: 1px solid rgba(255,255,255,0.4);
                }

                .sfms-app-icon {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 25px;
                    height: 25px;
                    border-radius: 8px;
                }

                .sfms-app-filesystem { color: #ffffff; background: rgba(255,255,255,0.22); }
                .sfms-app-dak { color: #ffffff; background: rgba(255,255,255,0.22); }
                .sfms-app-nearby { color: #ffffff; background: rgba(255,255,255,0.22); }
                .sfms-app-filechat { color: #ffffff; background: rgba(255,255,255,0.22); }
                .sfms-app-utility { color: #ffffff; background: rgba(255,255,255,0.22); }

                .sfms-badge-filesystem { left: 2%; top: 23%; animation: sfmsBadgeFloatA 5.7s ease-in-out infinite; }
                .sfms-badge-dak { right: 3%; top: 14%; animation: sfmsBadgeFloatB 6.3s ease-in-out infinite; }
                .sfms-badge-nearby { left: 8%; bottom: 18%; animation: sfmsBadgeFloatB 6.1s ease-in-out infinite reverse; }
                .sfms-badge-filechat { right: 2%; bottom: 20%; animation: sfmsBadgeFloatA 5.4s ease-in-out infinite reverse; }
                .sfms-badge-utility { left: 27%; bottom: 5%; animation: sfmsBadgeFloatC 6.6s ease-in-out infinite; }

                .sfms-floating-pill {
                    padding: 7px 10px;
                    border-radius: 10px;
                    font-size: 7px;
                    font-weight: 800;
                    animation: sfmsPillFloat 5s ease-in-out infinite;
                }

                .sfms-pill-video { right: 10%; top: 34%; animation-delay: -2.2s; }
                .sfms-pill-read { left: 10%; bottom: 31%; animation-delay: -0.7s; }

                .sfms-pill-dot {
                    width: 5px;
                    height: 5px;
                    border-radius: 50%;
                }

                .sfms-dot-cyan { background: #22d3ee; }
                .sfms-dot-blue { background: #2563EB; }

                /* -----------------------------------------------------------------
                   BRAND FOOTER
                ----------------------------------------------------------------- */
                .sfms-brand-footer {
                    position: relative;
                    z-index: 3;
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    gap: 20px;
                    padding-top: 20px;
                    border-top: 1px solid rgba(255,255,255,0.12);
                    color: rgba(224,242,254,0.58);
                    font-size: 9px;
                }

                .sfms-brand-footer-status {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    font-weight: 700;
                }

                .sfms-brand-footer-status i {
                    width: 5px;
                    height: 5px;
                    border-radius: 50%;
                    background: #67e8f9;
                    box-shadow: 0 0 0 4px rgba(103,232,249,0.08);
                }

                /* -----------------------------------------------------------------
                   RIGHT FORM CARD
                ----------------------------------------------------------------- */
                .sfms-form-shell {
                    position: relative;
                    z-index: 4;
                    width: min(100%, 500px);
                }

                .sfms-mobile-brand {
                    display: none;
                }

                .sfms-glass-card {
                    position: relative;
                    overflow: hidden;
                    padding: 34px 40px 30px;
                    border: 1px solid rgba(255,255,255,0.95);
                    border-radius: 30px;
                    background: rgba(255,255,255,0.94);
                    box-shadow:
                        0 1px 2px rgba(0,0,0,0.03),
                        0 24px 65px -22px rgba(15,23,42,0.19),
                        0 0 0 1px rgba(37,99,235,0.04);
                    backdrop-filter: blur(18px);
                    -webkit-backdrop-filter: blur(18px);
                    animation: sfmsFormEnter 0.75s cubic-bezier(0.16,1,0.3,1) both;
                }

                .sfms-card-top-line {
                    position: absolute;
                    top: 0;
                    left: 0;
                    right: 0;
                    height: 3px;
                    background: linear-gradient(90deg, #2563EB 0%, #1D4ED8 48%, #0284C7 100%);
                }

                .sfms-card-corner {
                    position: absolute;
                    width: 6px;
                    height: 6px;
                    top: 16px;
                    border-radius: 50%;
                    background: #cbd5e1;
                }

                .sfms-card-corner-left { left: 16px; }
                .sfms-card-corner-right { right: 16px; }

                .sfms-form-header {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    text-align: center;
                    margin-bottom: 25px;
                }

                .sfms-logo-badge {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    width: 48px;
                    height: 48px;
                    margin-bottom: 13px;
                    color: white;
                    border-radius: 16px;
                    background: linear-gradient(135deg, #2563EB, #1D4ED8);
                    box-shadow:
                        0 0 0 1px rgba(255,255,255,0.75),
                        0 12px 22px -7px rgba(37,99,235,0.42);
                }

                .sfms-form-title {
                    margin: 0;
                    color: #0f172a;
                    font-size: 24px;
                    line-height: 1.12;
                    font-weight: 700;
                    letter-spacing: -0.035em;
                }

                .sfms-form-subtitle {
                    max-width: 310px;
                    margin: 7px auto 0;
                    color: #64748b;
                    font-size: 12px;
                    line-height: 1.55;
                }

                .sfms-lockout {
                    display: flex;
                    align-items: flex-start;
                    gap: 10px;
                    margin-bottom: 17px;
                    padding: 12px 13px;
                    color: #92400e;
                    background: rgba(245,158,11,0.09);
                    border: 1px solid rgba(245,158,11,0.18);
                    border-radius: 15px;
                    font-size: 11px;
                    line-height: 1.45;
                }

                .sfms-lockout svg { color: #d97706; margin-top: 1px; }

                .sfms-lockout strong {
                    display: block;
                    margin-bottom: 1px;
                    font-size: 11px;
                }

                .sfms-error-banner {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    padding: 10px 11px;
                    color: #dc2626;
                    background: rgba(239,68,68,0.07);
                    border: 1px solid rgba(239,68,68,0.14);
                    border-radius: 12px;
                    font-size: 11px;
                    font-weight: 600;
                }

                .sfms-form-stack {
                    display: flex;
                    flex-direction: column;
                    gap: 15px;
                }

                .sfms-field-label {
                    display: block;
                    margin: 0 0 7px 1px;
                    color: #475569;
                    font-size: 10px;
                    line-height: 1;
                    font-weight: 800;
                    letter-spacing: 0.09em;
                    text-transform: uppercase;
                }

                .sfms-input-wrap {
                    display: flex;
                    align-items: center;
                    min-height: 51px;
                    padding: 0 13px;
                    border: 1px solid rgba(203,213,225,0.88);
                    border-radius: 15px;
                    background: rgba(248,250,252,0.86);
                    transition: all 0.2s cubic-bezier(0.16,1,0.3,1);
                }

                .sfms-input-wrap:hover {
                    border-color: #94a3b8;
                    background: #fff;
                }

                .sfms-input-wrap:focus-within {
                    border-color: #2563EB;
                    background: #fff;
                    box-shadow: 0 0 0 4px rgba(37,99,235,0.11);
                }

                .sfms-input-wrap-error {
                    border-color: #ef4444 !important;
                }

                .sfms-input-wrap-error:focus-within {
                    box-shadow: 0 0 0 4px rgba(239,68,68,0.11) !important;
                }

                .sfms-input-icon {
                    flex: 0 0 auto;
                    margin-right: 10px;
                    color: #94a3b8;
                    transition: color 0.2s ease;
                }

                .sfms-input-wrap:focus-within .sfms-input-icon {
                    color: #2563EB;
                }

                .sfms-input {
                    width: 100%;
                    min-width: 0;
                    border: 0;
                    outline: 0;
                    background: transparent;
                    color: #0f172a;
                    caret-color: #2563EB;
                    font-size: 13px;
                    font-weight: 600;
                }

                .sfms-input::placeholder { color: #94a3b8; font-weight: 500; }

                .sfms-input:-webkit-autofill,
                .sfms-input:-webkit-autofill:hover,
                .sfms-input:-webkit-autofill:focus {
                    -webkit-text-fill-color: #0F172A;
                    -webkit-box-shadow: 0 0 0 1000px rgba(255,255,255,0.01) inset;
                    box-shadow: 0 0 0 1000px rgba(255,255,255,0.01) inset;
                    transition: background-color 9999s ease-in-out 0s;
                }

                .sfms-eye-btn {
                    flex: 0 0 auto;
                    margin-left: 8px;
                    padding: 3px;
                    color: #94a3b8;
                    border: 0;
                    background: transparent;
                    cursor: pointer;
                    transition: color 0.2s ease;
                }

                .sfms-eye-btn:hover { color: #475569; }

                .sfms-remember-row {
                    display: flex;
                    align-items: center;
                    padding-top: 1px;
                }

                .sfms-checkbox {
                    width: 15px;
                    height: 15px;
                    accent-color: #2563EB;
                }

                .sfms-remember-label {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    color: #64748b;
                    font-size: 10px;
                    font-weight: 600;
                    cursor: pointer;
                    user-select: none;
                }

                .sfms-btn-primary {
                    position: relative;
                    width: 100%;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    min-height: 50px;
                    margin-top: 1px;
                    padding: 0 18px;
                    color: white;
                    border: 0;
                    border-radius: 999px;
                    background: linear-gradient(135deg, #2563EB 0%, #1D4ED8 50%, #0284C7 100%);
                    background-size: 200% 200%;
                    background-position: 0% 50%;
                    box-shadow: 0 11px 25px -7px rgba(37,99,235,0.38);
                    font-size: 13px;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.3s cubic-bezier(0.16,1,0.3,1);
                }

                .sfms-btn-primary:hover:not(:disabled) {
                    background-position: 100% 50%;
                    transform: translateY(-1px);
                    box-shadow: 0 15px 30px -7px rgba(37,99,235,0.46);
                }

                .sfms-btn-primary:active:not(:disabled) { transform: translateY(0); }

                .sfms-btn-primary:disabled {
                    opacity: 0.62;
                    cursor: not-allowed;
                    box-shadow: none;
                }

                .sfms-social-divider {
                    position: relative;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    margin: 16px 0 11px;
                    color: #94a3b8;
                    font-size: 9px;
                }

                .sfms-social-divider::before,
                .sfms-social-divider::after {
                    content: "";
                    flex: 1;
                    height: 1px;
                    background: #e2e8f0;
                }

                .sfms-social-divider span {
                    padding: 0 10px;
                    background: #fff;
                }

                .sfms-social-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 10px;
                }

                .sfms-social-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 7px;
                    min-height: 42px;
                    color: #475569;
                    border: 1px solid rgba(203,213,225,0.7);
                    border-radius: 999px;
                    background: rgba(248,250,252,0.88);
                    font-size: 11px;
                    font-weight: 700;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }

                .sfms-social-btn:hover {
                    color: #334155;
                    background: #fff;
                    border-color: #94a3b8;
                    box-shadow: 0 3px 10px rgba(15,23,42,0.05);
                    transform: translateY(-1px);
                }

                .sfms-social-btn svg {
                    width: 16px;
                    height: 16px;
                    flex: 0 0 auto;
                }

                .sfms-otp-transition {
                    animation: sfmsStepIn 0.55s cubic-bezier(0.16,1,0.3,1) both;
                }

                .sfms-otp-help {
                    margin: -1px 0 1px;
                    color: #64748b;
                    font-size: 11px;
                    line-height: 1.5;
                    text-align: center;
                }

                .sfms-otp-input-hitbox {
                    position: relative;
                    cursor: text;
                }

                .sfms-otp-input {
                    position: absolute;
                    inset: 0;
                    z-index: 2;
                    width: 100%;
                    height: 100%;
                    opacity: 0;
                    cursor: text;
                }

                .sfms-otp-cell {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    min-height: 55px;
                    color: #0f172a;
                    border: 1px solid #e2e8f0;
                    border-radius: 14px;
                    background: rgba(248,250,252,0.92);
                    font-size: 19px;
                    font-weight: 800;
                    transition: all 0.2s ease;
                }

                .sfms-otp-cell-filled {
                    color: #2563EB;
                    border-color: #3B82F6;
                    background: #fff;
                    box-shadow: 0 3px 10px rgba(37,99,235,0.08);
                }

                .sfms-otp-cell-active {
                    color: #2563EB;
                    border-color: #2563EB;
                    background: #fff;
                    box-shadow: 0 0 0 3px rgba(37,99,235,0.13);
                }

                .sfms-back-btn {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 5px;
                    width: 100%;
                    margin-top: 2px;
                    padding: 7px 0;
                    color: #64748b;
                    border: 0;
                    background: transparent;
                    font-size: 10px;
                    font-weight: 700;
                    cursor: pointer;
                    transition: color 0.2s ease;
                }

                .sfms-back-btn:hover { color: #0f172a; }

                .sfms-security-note {
                    margin: 15px 0 0;
                    color: #94a3b8;
                    font-size: 9px;
                    line-height: 1.5;
                    text-align: center;
                }

                /* -----------------------------------------------------------------
                   MOTION
                ----------------------------------------------------------------- */
                @keyframes sfmsFormEnter {
                    from { opacity: 0; transform: translateY(18px) scale(0.985); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }

                @keyframes sfmsStepIn {
                    from { opacity: 0; transform: translateX(14px); }
                    to { opacity: 1; transform: translateX(0); }
                }

                @keyframes sfmsSlideIn {
                    from { opacity: 0; transform: translateX(-16px); clip-path: inset(0 18% 0 0); }
                    to { opacity: 1; transform: translateX(0); clip-path: inset(0 0 0 0); }
                }

                @keyframes sfmsQuoteIn {
                    from { opacity: 0; transform: scale(0.8) translateY(6px); }
                    to { opacity: 1; transform: scale(1) translateY(0); }
                }

                @keyframes sfmsDashboardEnter {
                    from { opacity: 0; transform: translateY(18px) scale(0.96); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }

                @keyframes sfmsCardFloat {
                    0%, 100% { margin-top: 0; }
                    50% { margin-top: -9px; }
                }

                @keyframes sfmsBadgeFloatA {
                    0%, 100% { transform: translate3d(0,0,0) rotate(-2deg); }
                    50% { transform: translate3d(0,-9px,0) rotate(1deg); }
                }

                @keyframes sfmsBadgeFloatB {
                    0%, 100% { transform: translate3d(0,0,0) rotate(2deg); }
                    50% { transform: translate3d(0,-11px,0) rotate(-2deg); }
                }

                @keyframes sfmsBadgeFloatC {
                    0%, 100% { transform: translate3d(0,0,0) rotate(-1deg); }
                    50% { transform: translate3d(5px,-8px,0) rotate(2deg); }
                }


                @keyframes sfmsPillFloat {
                    0%, 100% { transform: translate3d(0,0,0) rotate(0deg); opacity: 0.88; }
                    45% { transform: translate3d(5px,-8px,0) rotate(2deg); opacity: 1; }
                    70% { transform: translate3d(-3px,-4px,0) rotate(-1deg); opacity: 0.95; }
                }

                @keyframes sfmsBrandGlowA {
                    from { transform: translate3d(0,0,0) scale(1); }
                    to { transform: translate3d(-35px,45px,0) scale(1.12); }
                }

                @keyframes sfmsBrandGlowB {
                    from { transform: translate3d(0,0,0) scale(1); }
                    to { transform: translate3d(45px,-35px,0) scale(1.1); }
                }

                @keyframes sfmsRingFloat {
                    0%, 100% { transform: translateY(0) rotate(0deg); opacity: 0.6; }
                    50% { transform: translateY(-12px) rotate(7deg); opacity: 1; }
                }

                /* -----------------------------------------------------------------
                   VIEWPORT-FIT + REFERENCE-STYLE ENTRANCE MOTION
                   Keeps the desktop experience inside one viewport and makes the
                   two panels/cards arrive in sequence without browser scrolling.
                ----------------------------------------------------------------- */
                .sfms-page {
                    height: 100dvh;
                    min-height: 100dvh;
                    padding: 14px;
                    overflow: hidden;
                    align-items: center;
                }

                .sfms-shell {
                    width: min(1440px, calc(100vw - 28px));
                    height: min(900px, calc(100dvh - 28px));
                    min-height: 0;
                    max-height: calc(100dvh - 28px);
                    border-radius: 2px;
                }

                .sfms-brand-panel {
                    animation: sfmsLeftPanelReveal 1s cubic-bezier(0.16, 1, 0.3, 1) both;
                    will-change: transform, opacity;
                }

                .sfms-right-panel {
                    animation: sfmsRightPanelReveal 1s 0.08s cubic-bezier(0.16, 1, 0.3, 1) both;
                    will-change: transform, opacity;
                }

                .sfms-glass-card {
                    animation: sfmsCardFromBottom 1s 0.28s cubic-bezier(0.16, 1, 0.3, 1) both;
                    will-change: transform, opacity;
                }

                .sfms-form-header > *,
                .sfms-step-form > *,
                .sfms-security-note {
                    animation: sfmsContentRise 0.62s cubic-bezier(0.16, 1, 0.3, 1) both;
                }

                .sfms-form-header > *:nth-child(1) { animation-delay: 0.42s; }
                .sfms-form-header > *:nth-child(2) { animation-delay: 0.50s; }
                .sfms-form-header > *:nth-child(3) { animation-delay: 0.58s; }

                .sfms-step-form > *:nth-child(1) { animation-delay: 0.62s; }
                .sfms-step-form > *:nth-child(2) { animation-delay: 0.70s; }
                .sfms-step-form > *:nth-child(3) { animation-delay: 0.78s; }
                .sfms-step-form > *:nth-child(4) { animation-delay: 0.86s; }
                .sfms-step-form > *:nth-child(5) { animation-delay: 0.94s; }
                .sfms-step-form > *:nth-child(6) { animation-delay: 1.02s; }
                .sfms-step-form > *:nth-child(7) { animation-delay: 1.10s; }

                .sfms-brand-copy .sfms-quotes {
                    animation: sfmsQuoteReveal 0.75s 0.34s cubic-bezier(0.16, 1, 0.3, 1) both;
                }

                .sfms-brand-footer {
                    animation: sfmsContentRise 0.7s 0.72s cubic-bezier(0.16, 1, 0.3, 1) both;
                }

                .sfms-dashboard-wrap {
                    animation: sfmsDashboardReveal 0.95s 0.42s cubic-bezier(0.16, 1, 0.3, 1) both;
                }

                .sfms-dashboard-card {
                    animation:
                        sfmsDashboardCardReveal 0.9s 0.62s cubic-bezier(0.16, 1, 0.3, 1) both,
                        sfmsCardFloat 6.5s 1.52s ease-in-out infinite;
                }

                .sfms-app-badge,
                .sfms-floating-pill {
                    animation-duration: 5.7s;
                }

                @keyframes sfmsLeftPanelReveal {
                    from {
                        opacity: 0;
                        transform: translate3d(-105%, 0, 0) scale(0.985);
                    }
                    70% { transform: translate3d(1.5%, 0, 0) scale(1); }
                    to {
                        opacity: 1;
                        transform: translate3d(0, 0, 0) scale(1);
                    }
                }

                @keyframes sfmsRightPanelReveal {
                    from {
                        opacity: 0;
                        transform: translate3d(45px, 0, 0);
                    }
                    to {
                        opacity: 1;
                        transform: translate3d(0, 0, 0);
                    }
                }

                @keyframes sfmsCardFromBottom {
                    from {
                        opacity: 0;
                        transform: translate3d(0, 90px, 0) scale(0.94);
                        filter: blur(5px);
                    }
                    65% { transform: translate3d(0, -5px, 0) scale(1.01); }
                    to {
                        opacity: 1;
                        transform: translate3d(0, 0, 0) scale(1);
                        filter: blur(0);
                    }
                }

                @keyframes sfmsContentRise {
                    from {
                        opacity: 0;
                        transform: translate3d(0, 18px, 0);
                    }
                    to {
                        opacity: 1;
                        transform: translate3d(0, 0, 0);
                    }
                }

                @keyframes sfmsQuoteReveal {
                    from {
                        opacity: 0;
                        transform: translate3d(-24px, 0, 0) scale(0.9);
                    }
                    to {
                        opacity: 1;
                        transform: translate3d(0, 0, 0) scale(1);
                    }
                }

                @keyframes sfmsDashboardReveal {
                    from {
                        opacity: 0;
                        transform: translate3d(0, 45px, 0) scale(0.94);
                    }
                    to {
                        opacity: 1;
                        transform: translate3d(0, 0, 0) scale(1);
                    }
                }

                @keyframes sfmsDashboardCardReveal {
                    from {
                        opacity: 0;
                        transform: translate3d(-50%, calc(-50% + 34px), 0) rotate(-7deg) scale(0.92);
                    }
                    to {
                        opacity: 1;
                        transform: translate3d(-50%, -50%, 0) rotate(-4deg) scale(1);
                    }
                }

                /* The smaller-height desktop breakpoint prevents the form/card from
                   becoming taller than the viewport while preserving every control. */
                @media (max-height: 820px) and (min-width: 1024px) {
                    .sfms-brand-panel { padding: 34px 38px 22px; }
                    .sfms-right-panel { padding: 24px 30px; }
                    .sfms-form-shell { width: min(100%, 470px); }
                    .sfms-glass-card { padding: 25px 30px 22px; border-radius: 26px; }
                    .sfms-form-header { margin-bottom: 17px; }
                    .sfms-logo-badge { width: 42px; height: 42px; margin-bottom: 9px; border-radius: 14px; }
                    .sfms-form-title { font-size: 22px; }
                    .sfms-form-subtitle { margin-top: 5px; font-size: 11px; }
                    .sfms-form-stack { gap: 10px; }
                    .sfms-field-label { margin-bottom: 5px; }
                    .sfms-input-wrap { min-height: 45px; }
                    .sfms-btn-primary { min-height: 46px; }
                    .sfms-social-btn { min-height: 42px; }
                    .sfms-dashboard-wrap { min-height: 330px; }
                    .sfms-dashboard-stage { height: 350px; transform: scale(0.88) translateX(-8px); }
                }

                @media (max-height: 700px) and (min-width: 1024px) {
                    .sfms-page { padding: 8px; }
                    .sfms-shell { width: calc(100vw - 16px); height: calc(100dvh - 16px); max-height: calc(100dvh - 16px); }
                    .sfms-brand-panel { padding: 25px 30px 18px; }
                    .sfms-right-panel { padding: 16px 22px; }
                    .sfms-glass-card { padding: 19px 24px 17px; }
                    .sfms-form-header { margin-bottom: 13px; }
                    .sfms-logo-badge { width: 36px; height: 36px; margin-bottom: 7px; border-radius: 12px; }
                    .sfms-form-title { font-size: 20px; }
                    .sfms-form-subtitle { font-size: 10px; }
                    .sfms-form-stack { gap: 8px; }
                    .sfms-input-wrap { min-height: 40px; border-radius: 12px; }
                    .sfms-btn-primary { min-height: 41px; }
                    .sfms-social-btn { min-height: 37px; }
                    .sfms-security-note { margin-top: 7px !important; }
                    .sfms-dashboard-wrap { min-height: 270px; margin-top: 0; }
                    .sfms-dashboard-stage { height: 300px; transform: scale(0.76) translateX(-8px); }
                }

                @media (prefers-reduced-motion: reduce) {
                    .sfms-page *,
                    .sfms-page *::before,
                    .sfms-page *::after {
                        animation-duration: 0.01ms !important;
                        animation-iteration-count: 1 !important;
                        scroll-behavior: auto !important;
                    }
                }

                /* -----------------------------------------------------------------
                   RESPONSIVE
                ----------------------------------------------------------------- */
                @media (max-width: 1200px) {
                    .sfms-shell {
                        width: min(1180px, calc(100vw - 32px));
                        min-height: min(850px, calc(100vh - 32px));
                        grid-template-columns: minmax(390px, 0.9fr) minmax(480px, 1.1fr);
                    }

                    .sfms-brand-panel { padding: 42px 38px 28px; }
                    .sfms-right-panel { padding: 34px 34px; }
                    .sfms-dashboard-stage { transform: scale(0.94) translateX(-10px); transform-origin: center; }
                }

                @media (max-width: 1023px) {
                    .sfms-page {
                        height: auto;
                        min-height: 100dvh;
                        overflow-y: auto;
                        padding: 24px 0;
                    }

                    .sfms-shell {
                        width: min(620px, calc(100vw - 32px));
                        height: auto;
                        min-height: auto;
                        max-height: none;
                        display: block;
                        overflow: visible;
                        background: transparent;
                        border: 0;
                        box-shadow: none;
                    }

                    .sfms-brand-panel {
                        display: none;
                        animation: none;
                    }

                    .sfms-right-panel {
                        min-height: calc(100dvh - 48px);
                        padding: 0;
                        background:
                            linear-gradient(rgba(0,0,0,0.03) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(0,0,0,0.03) 1px, transparent 1px),
                            #F8FAFC;
                        background-size: 72px 72px;
                    }

                    .sfms-right-panel::before,
                    .sfms-right-panel::after,
                    .sfms-right-rail {
                        display: none;
                    }

                    .sfms-form-shell {
                        width: min(100%, 500px);
                    }

                    .sfms-mobile-brand {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        gap: 10px;
                        margin-bottom: 18px;
                    }

                    .sfms-mobile-mark {
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        width: 38px;
                        height: 38px;
                        color: #2563EB;
                        border: 1px solid rgba(37,99,235,0.12);
                        border-radius: 12px;
                        background: rgba(255,255,255,0.88);
                        box-shadow: 0 8px 18px -10px rgba(37,99,235,0.35);
                    }
                }

                @media (max-width: 560px) {
                    .sfms-page { padding: 16px; }
                    .sfms-shell { width: 100%; }
                    .sfms-right-panel { min-height: calc(100vh - 32px); }
                    .sfms-glass-card {
                        padding: 28px 21px 23px;
                        border-radius: 25px;
                    }
                    .sfms-form-title { font-size: 22px; }
                    .sfms-form-subtitle { font-size: 11px; }
                    .sfms-social-grid { gap: 8px; }
                    .sfms-social-btn { min-height: 40px; }
                }
            `}</style>

            <main className="sfms-shell">
                <BrandPanel step={step} />

                <section className="sfms-right-panel">
                    <div className="sfms-right-rail" aria-hidden="true" />

                    <div className="sfms-form-shell">
                        <MobileBrandHeader />

                        <div className="sfms-glass-card">
                            <div className="sfms-card-top-line" />
                            <span aria-hidden="true" className="sfms-card-corner sfms-card-corner-left" />
                            <span aria-hidden="true" className="sfms-card-corner sfms-card-corner-right" />

                            <div key={`header-${step}`} className="sfms-form-header">
                                <div className="sfms-logo-badge">
                                    <BrandMark />
                                </div>

                                <h1 className="sfms-display sfms-form-title">
                                    {step === 'credentials' ? 'Welcome back' : 'Two-Factor Verification'}
                                </h1>

                                <p className="sfms-form-subtitle">
                                    {step === 'credentials'
                                        ? 'Enter your credentials to access your secure portal'
                                        : 'Please enter the 6-digit verification code'}
                                </p>
                            </div>

                            {lockoutRemaining > 0 && (
                                <div className="sfms-lockout">
                                    <svg viewBox="0 0 24 24" className="w-5 h-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                    </svg>
                                    <div>
                                        <strong>Account Temporarily Locked</strong>
                                        Too many failed attempts. Try again in <span className="font-bold font-mono">{formatLockoutTime(lockoutRemaining)}</span>.
                                    </div>
                                </div>
                            )}

                            {step === 'credentials' ? (
                                <form key="credentials-form" onSubmit={handleCredentialsSubmit} className="sfms-form-stack sfms-step-form">
                                    {formError && <ErrorBanner>{formError}</ErrorBanner>}

                                    <div>
                                        <label className="sfms-field-label" htmlFor="sfms-user-id">User ID</label>
                                        <div className={`sfms-input-wrap ${formError ? 'sfms-input-wrap-error' : ''}`}>
                                            <UserIcon className="sfms-input-icon w-5 h-5" />
                                            <input
                                                id="sfms-user-id"
                                                type="text"
                                                value={userId}
                                                onChange={(e) => setUserId(e.target.value)}
                                                placeholder="Enter your User ID"
                                                disabled={isSubmitting}
                                                className="sfms-input"
                                                autoComplete="username"
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="sfms-field-label" htmlFor="sfms-pin">Security PIN</label>
                                        <div className={`sfms-input-wrap ${formError ? 'sfms-input-wrap-error' : ''}`}>
                                            <LockIcon className="sfms-input-icon w-5 h-5" />
                                            <input
                                                id="sfms-pin"
                                                type={showPin ? 'text' : 'password'}
                                                value={pin}
                                                onChange={(e) => setPin(e.target.value)}
                                                placeholder="Enter your PIN"
                                                disabled={isSubmitting || lockoutRemaining > 0}
                                                className="sfms-input"
                                                autoComplete="current-password"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPin(!showPin)}
                                                className="sfms-eye-btn"
                                                aria-label={showPin ? 'Hide Security PIN' : 'Show Security PIN'}
                                            >
                                                <EyeIcon hidden={showPin} />
                                            </button>
                                        </div>
                                    </div>

                                    <div className="sfms-remember-row">
                                        <label className="sfms-remember-label">
                                            <input
                                                type="checkbox"
                                                checked={rememberMe}
                                                onChange={(e) => setRememberMe(e.target.checked)}
                                                className="sfms-checkbox"
                                            />
                                            <span>Remember this device</span>
                                        </label>
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isSubmitting || lockoutRemaining > 0}
                                        className="sfms-btn-primary"
                                    >
                                        {isSubmitting ? (
                                            <span className="inline-flex items-center gap-2">
                                                <Spinner />
                                                Authenticating...
                                            </span>
                                        ) : (
                                            <>
                                                <span>Sign In</span>
                                                <ArrowRight />
                                            </>
                                        )}
                                    </button>

                                    <div className="sfms-social-divider">
                                        <span>Or continue with</span>
                                    </div>

                                    <div className="sfms-social-grid">
                                        <button type="button" className="sfms-social-btn" aria-label="Continue with Google">
                                            <svg viewBox="0 0 24 24" aria-hidden="true">
                                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                            </svg>
                                            Google
                                        </button>

                                        <button type="button" className="sfms-social-btn" aria-label="Continue with GitHub">
                                            <svg viewBox="0 0 24 24" fill="#24292e" aria-hidden="true">
                                                <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.15 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.62.24 2.85.12 3.15.765.84 1.23 3.225 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                                            </svg>
                                            GitHub
                                        </button>
                                    </div>
                                </form>
                            ) : (
                                <form key="otp-form" onSubmit={handleOtpSubmit} className="sfms-form-stack sfms-step-form">
                                    {otpError && <ErrorBanner>{otpError}</ErrorBanner>}

                                    <p className="sfms-otp-help">
                                        Enter the code from your authenticator app to complete secure sign-in.
                                    </p>

                                    <div className="sfms-otp-input-hitbox" onClick={() => otpInputRef.current?.focus()}>
                                        <input
                                            ref={otpInputRef}
                                            type="text"
                                            inputMode="numeric"
                                            pattern="\d*"
                                            maxLength={6}
                                            value={otp}
                                            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                                            onFocus={() => setOtpFocused(true)}
                                            onBlur={() => setOtpFocused(false)}
                                            className="sfms-otp-input"
                                            disabled={isSubmitting}
                                            aria-label="6-digit verification code"
                                            autoComplete="one-time-code"
                                        />
                                        <OtpCells value={otp} focused={otpFocused} />
                                    </div>

                                    <button
                                        type="submit"
                                        disabled={isSubmitting || otp.length !== 6}
                                        className="sfms-btn-primary"
                                    >
                                        {isSubmitting ? (
                                            <span className="inline-flex items-center gap-2">
                                                <Spinner />
                                                Verifying...
                                            </span>
                                        ) : (
                                            <>
                                                <span>Verify &amp; Continue</span>
                                                <ArrowRight />
                                            </>
                                        )}
                                    </button>

                                    <button
                                        type="button"
                                        onClick={handleBackToLogin}
                                        disabled={isSubmitting}
                                        className="sfms-back-btn"
                                    >
                                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                                            <polyline points="15 18 9 12 15 6" />
                                        </svg>
                                        Back to Credentials
                                    </button>
                                </form>
                            )}
                        </div>

                        <p className="sfms-security-note">
                            Protected with end-to-end multi-layer encryption &bull; SFMS Safe Core
                        </p>
                    </div>
                </section>
            </main>
        </div>
    );
}