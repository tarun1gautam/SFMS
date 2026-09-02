import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';
import api from '../utils/api';

/* ============================================================================
   PRESENTATIONAL SUB-COMPONENTS
   Purely decorative — no auth state or logic lives here.
============================================================================ */

// Layered light-mode background with soft gradient, grid, and glow blobs
function AnimatedBackground() {
  return (
    <div aria-hidden className="sfms-bg absolute inset-0 overflow-hidden pointer-events-none">
      <div className="sfms-grid absolute inset-0" />
      <div className="sfms-blob sfms-blob-a" />
      <div className="sfms-blob sfms-blob-b" />
      <div className="sfms-blob sfms-blob-c" />
    </div>
  );
}

// Document SVG icon — clean, minimal, with folded corner
function DocumentIcon({ className, style, color = "#3B82F6", size = 24 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="8" y1="16" x2="16" y2="16" />
      <line x1="8" y1="12" x2="12" y2="12" />
    </svg>
  );
}

// Files coming from every direction into a secure receiver box
function SecurityCore() {
  return (
    <div className="relative w-[220px] h-[220px] xl:w-[270px] xl:h-[270px] mx-auto select-none">
      
      {/* Subtle glow behind the box */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-40 h-40 xl:w-48 xl:h-48 rounded-full bg-blue-400/5 blur-2xl" />
      </div>

      {/* Main SVG: Files flowing from all directions into secure box */}
      <svg viewBox="0 0 320 320" className="absolute inset-0 w-full h-full">
        
        {/* Incoming file paths from all directions */}
        <g opacity="0.08">
          {/* From top-left corner */}
          <line x1="10" y1="10" x2="100" y2="100" stroke="#2563EB" strokeWidth="0.8" strokeDasharray="2 4" />
          <line x1="30" y1="5" x2="110" y2="85" stroke="#2563EB" strokeWidth="0.8" strokeDasharray="2 4" />
          <line x1="5" y1="30" x2="85" y2="110" stroke="#2563EB" strokeWidth="0.8" strokeDasharray="2 4" />
          
          {/* From top-right corner */}
          <line x1="310" y1="10" x2="220" y2="100" stroke="#2563EB" strokeWidth="0.8" strokeDasharray="2 4" />
          <line x1="290" y1="5" x2="210" y2="85" stroke="#2563EB" strokeWidth="0.8" strokeDasharray="2 4" />
          <line x1="315" y1="30" x2="235" y2="110" stroke="#2563EB" strokeWidth="0.8" strokeDasharray="2 4" />
          
          {/* From bottom-left corner */}
          <line x1="10" y1="310" x2="100" y2="220" stroke="#2563EB" strokeWidth="0.8" strokeDasharray="2 4" />
          <line x1="30" y1="315" x2="110" y2="235" stroke="#2563EB" strokeWidth="0.8" strokeDasharray="2 4" />
          <line x1="5" y1="290" x2="85" y2="210" stroke="#2563EB" strokeWidth="0.8" strokeDasharray="2 4" />
          
          {/* From bottom-right corner */}
          <line x1="310" y1="310" x2="220" y2="220" stroke="#2563EB" strokeWidth="0.8" strokeDasharray="2 4" />
          <line x1="290" y1="315" x2="210" y2="235" stroke="#2563EB" strokeWidth="0.8" strokeDasharray="2 4" />
          <line x1="315" y1="290" x2="235" y2="210" stroke="#2563EB" strokeWidth="0.8" strokeDasharray="2 4" />
          
          {/* From top */}
          <line x1="160" y1="5" x2="160" y2="85" stroke="#2563EB" strokeWidth="0.8" strokeDasharray="2 4" />
          <line x1="140" y1="8" x2="145" y2="88" stroke="#2563EB" strokeWidth="0.8" strokeDasharray="2 4" />
          <line x1="180" y1="8" x2="175" y2="88" stroke="#2563EB" strokeWidth="0.8" strokeDasharray="2 4" />
          
          {/* From bottom */}
          <line x1="160" y1="315" x2="160" y2="235" stroke="#2563EB" strokeWidth="0.8" strokeDasharray="2 4" />
          <line x1="140" y1="312" x2="145" y2="232" stroke="#2563EB" strokeWidth="0.8" strokeDasharray="2 4" />
          <line x1="180" y1="312" x2="175" y2="232" stroke="#2563EB" strokeWidth="0.8" strokeDasharray="2 4" />
          
          {/* From left */}
          <line x1="5" y1="160" x2="85" y2="160" stroke="#2563EB" strokeWidth="0.8" strokeDasharray="2 4" />
          <line x1="8" y1="140" x2="88" y2="145" stroke="#2563EB" strokeWidth="0.8" strokeDasharray="2 4" />
          <line x1="8" y1="180" x2="88" y2="175" stroke="#2563EB" strokeWidth="0.8" strokeDasharray="2 4" />
          
          {/* From right */}
          <line x1="315" y1="160" x2="235" y2="160" stroke="#2563EB" strokeWidth="0.8" strokeDasharray="2 4" />
          <line x1="312" y1="140" x2="232" y2="145" stroke="#2563EB" strokeWidth="0.8" strokeDasharray="2 4" />
          <line x1="312" y1="180" x2="232" y2="175" stroke="#2563EB" strokeWidth="0.8" strokeDasharray="2 4" />
        </g>

        {/* Flying documents coming from every direction */}
        {[
          // From corners
          { x: 20, y: 20, delay: '0s', size: 13, targetX: 120, targetY: 120 },
          { x: 300, y: 20, delay: '0.7s', size: 14, targetX: 200, targetY: 120 },
          { x: 20, y: 300, delay: '1.4s', size: 12, targetX: 120, targetY: 200 },
          { x: 300, y: 300, delay: '2.1s', size: 15, targetX: 200, targetY: 200 },
          // From top
          { x: 160, y: 15, delay: '0.3s', size: 13, targetX: 160, targetY: 100 },
          { x: 120, y: 20, delay: '0.9s', size: 11, targetX: 130, targetY: 105 },
          { x: 200, y: 20, delay: '1.6s', size: 14, targetX: 190, targetY: 105 },
          // From bottom
          { x: 160, y: 305, delay: '0.5s', size: 12, targetX: 160, targetY: 220 },
          { x: 120, y: 300, delay: '1.2s', size: 14, targetX: 130, targetY: 215 },
          { x: 200, y: 300, delay: '1.8s', size: 13, targetX: 190, targetY: 215 },
          // From left
          { x: 15, y: 160, delay: '0.6s', size: 14, targetX: 100, targetY: 160 },
          { x: 20, y: 130, delay: '1.1s', size: 11, targetX: 105, targetY: 140 },
          { x: 20, y: 190, delay: '1.7s', size: 13, targetX: 105, targetY: 180 },
          // From right
          { x: 305, y: 160, delay: '0.4s', size: 12, targetX: 220, targetY: 160 },
          { x: 300, y: 130, delay: '1s', size: 14, targetX: 215, targetY: 140 },
          { x: 300, y: 190, delay: '1.9s', size: 13, targetX: 215, targetY: 180 },
        ].map((doc, i) => (
          <g
            key={i}
            className="sfms-flying-doc"
            style={{
              animationDelay: doc.delay,
              animationDuration: `${3.5 + (i % 3) * 0.5}s`,
            }}
            transform={`translate(${doc.x}, ${doc.y})`}
          >
            <DocumentIcon
              color={i % 2 === 0 ? "#3B82F6" : "#60A5FA"}
              size={doc.size}
              style={{
                opacity: 0.4 + (i % 4) * 0.1,
              }}
            />
          </g>
        ))}

        {/* The File Receiver Box - central secure container */}
        <g transform="translate(160, 160)">
          
          {/* Box shadow effect */}
          <rect x="-48" y="-40" width="96" height="80" rx="10" fill="rgba(37,99,235,0.03)" />
          
          {/* Main box - secure file receiver */}
          <rect x="-44" y="-36" width="88" height="72" rx="8" fill="none" stroke="#2563EB" strokeWidth="1.5" opacity="0.4" />
          <rect x="-44" y="-36" width="88" height="72" rx="8" fill="rgba(37,99,235,0.02)" />
          
          {/* Box lid with subtle highlight */}
          <line x1="-44" y1="-22" x2="44" y2="-22" stroke="#2563EB" strokeWidth="0.8" opacity="0.15" />
          
          {/* Small lock on the box */}
          <rect x="-10" y="-16" width="20" height="14" rx="2" fill="none" stroke="#2563EB" strokeWidth="1.5" />
          <path d="M-4,-16 L-4,-20 A4,4 0 0,1 4,-20 L4,-16" fill="none" stroke="#2563EB" strokeWidth="1.5" />
          <circle cx="0" cy="-9" r="2" fill="#2563EB" opacity="0.3" />
          
          {/* Documents inside the box - files being received */}
          <g opacity="0.5">
            <DocumentIcon color="#3B82F6" size={12} style={{ position: 'absolute', left: '-14px', top: '2px' }} />
            <DocumentIcon color="#60A5FA" size={10} style={{ position: 'absolute', left: '0px', top: '6px' }} />
            <DocumentIcon color="#3B82F6" size={14} style={{ position: 'absolute', left: '14px', top: '0px' }} />
            <DocumentIcon color="#60A5FA" size={11} style={{ position: 'absolute', left: '-20px', top: '12px' }} />
            <DocumentIcon color="#3B82F6" size={13} style={{ position: 'absolute', left: '20px', top: '10px' }} />
            <DocumentIcon color="#60A5FA" size={9} style={{ position: 'absolute', left: '-8px', top: '14px' }} />
            <DocumentIcon color="#3B82F6" size={12} style={{ position: 'absolute', left: '8px', top: '12px' }} />
          </g>
          
          {/* Processing indicators - showing files being received */}
          <circle cx="-32" cy="22" r="2.5" fill="#60A5FA" className="sfms-process-dot" style={{ animationDelay: '0s' }} />
          <circle cx="0" cy="28" r="2.5" fill="#60A5FA" className="sfms-process-dot" style={{ animationDelay: '0.3s' }} />
          <circle cx="32" cy="22" r="2.5" fill="#60A5FA" className="sfms-process-dot" style={{ animationDelay: '0.6s' }} />
          
          {/* Incoming arrow indicators on box edges */}
          <g opacity="0.15">
            {/* Top arrow */}
            <line x1="0" y1="-40" x2="0" y2="-36" stroke="#2563EB" strokeWidth="1.5" />
            <polyline points="-4,-44 0,-40 4,-44" fill="none" stroke="#2563EB" strokeWidth="1.2" />
            
            {/* Bottom arrow */}
            <line x1="0" y1="40" x2="0" y2="36" stroke="#2563EB" strokeWidth="1.5" />
            <polyline points="-4,44 0,40 4,44" fill="none" stroke="#2563EB" strokeWidth="1.2" />
            
            {/* Left arrow */}
            <line x1="-48" y1="0" x2="-44" y2="0" stroke="#2563EB" strokeWidth="1.5" />
            <polyline points="-52,-4 -48,0 -52,4" fill="none" stroke="#2563EB" strokeWidth="1.2" />
            
            {/* Right arrow */}
            <line x1="48" y1="0" x2="44" y2="0" stroke="#2563EB" strokeWidth="1.5" />
            <polyline points="52,-4 48,0 52,4" fill="none" stroke="#2563EB" strokeWidth="1.2" />
          </g>
        </g>
      </svg>

      <style>{`
        .sfms-flying-doc {
          animation: sfmsFlyToBox 3.5s ease-in-out infinite;
          position: absolute;
        }
        @keyframes sfmsFlyToBox {
          0% { 
            transform: translate(0, 0) scale(1);
            opacity: 0.3;
          }
          40% { 
            transform: translate(calc(140px - var(--tx, 140px)), calc(140px - var(--ty, 140px))) scale(0.7);
            opacity: 0.9;
          }
          60% { 
            transform: translate(calc(140px - var(--tx, 140px)), calc(140px - var(--ty, 140px))) scale(0.7);
            opacity: 0.9;
          }
          100% { 
            transform: translate(0, 0) scale(1);
            opacity: 0.3;
          }
        }
        
        .sfms-process-dot {
          animation: sfmsProcessPulse 1.2s ease-in-out infinite;
        }
        @keyframes sfmsProcessPulse {
          0%, 100% { opacity: 0.15; r: 2; }
          50% { opacity: 0.7; r: 3.5; }
        }
      `}</style>
    </div>
  );
}

// Desktop-only left panel: brand, headline, and the security visualization
function BrandPanel() {
  return (
    <div className="hidden lg:flex flex-col justify-center relative px-8 xl:px-12 py-8 min-h-0 overflow-hidden">
      <div className="sfms-enter sfms-enter-1 max-w-sm">
        <div className="inline-flex items-center gap-2 mb-5 px-3 py-1.5 rounded-full sfms-chip">
          <span className="relative flex h-2 w-2">
            <span className="sfms-dot-pulse absolute inline-flex h-full w-full rounded-full bg-blue-500" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
          </span>
          <span className="text-xs font-semibold tracking-[0.2em] text-blue-700 uppercase">
            Secure &middot; Intelligent &middot; Connected
          </span>
        </div>

        <h2 className="sfms-display text-[1.85rem] xl:text-[2.3rem] leading-[1.1] font-semibold text-slate-900 tracking-tight mb-3">
          Your files.
          <br />
          Your workflow.
          <br />
          <span className="sfms-text-gradient">Secure by design.</span>
        </h2>

        <p className="text-slate-500 text-sm leading-relaxed max-w-xs">
          A secure workspace for managing, organizing, and accessing your files with confidence.
        </p>

        <div className="flex items-baseline gap-3 mt-5">
          <span className="sfms-display text-base font-semibold text-slate-900 tracking-tight">SFMS</span>
          <span className="text-xs text-slate-400">Secure File Management System</span>
        </div>
      </div>

      <div className="sfms-enter sfms-enter-2 mt-4 flex justify-center">
        <SecurityCore />
      </div>
    </div>
  );
}

// Compact brand header shown above the login card on mobile/tablet
function MobileBrandHeader() {
  return (
    <div className="lg:hidden sfms-enter sfms-enter-1 text-center mb-3">
      <div className="inline-flex items-center justify-center gap-2 mb-2 px-2.5 py-1 rounded-full sfms-chip">
        <span className="relative flex h-1.5 w-1.5">
          <span className="sfms-dot-pulse absolute inline-flex h-full w-full rounded-full bg-blue-500" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-blue-500" />
        </span>
        <span className="text-[10px] font-semibold tracking-[0.2em] text-blue-700 uppercase">
          Secure &middot; Intelligent &middot; Connected
        </span>
      </div>
      <div className="flex items-center justify-center gap-2">
        <div className="w-8 h-8 rounded-xl bg-white/40 backdrop-blur-sm border border-blue-200/30 flex items-center justify-center shadow-lg shadow-blue-500/10">
          <svg viewBox="0 0 24 24" className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <div>
          <p className="sfms-display text-lg font-semibold text-slate-900 tracking-tight">SFMS</p>
          <p className="text-[10px] text-slate-400 -mt-0.5">Secure File Management</p>
        </div>
      </div>
    </div>
  );
}

// Six-cell visual presentation for the OTP code
function OtpCells({ value, focused }) {
  const cells = Array.from({ length: 6 });
  const activeIndex = value.length < 6 ? value.length : 5;
  return (
    <div aria-hidden className="grid grid-cols-6 gap-2 sm:gap-2.5">
      {cells.map((_, i) => {
        const char = value[i];
        const isActive = focused && i === activeIndex;
        return (
          <div
            key={i}
            className={`sfms-otp-cell h-12 sm:h-14 rounded-xl flex items-center justify-center text-lg sm:text-xl font-semibold ${
              char ? 'sfms-otp-cell-filled' : ''
            } ${isActive ? 'sfms-otp-cell-active' : ''}`}
          >
            {char || ''}
          </div>
        );
      })}
    </div>
  );
}

/* ============================================================================
   MAIN COMPONENT
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

    useEffect(() => {
        if (step === 'otp' && otpInputRef.current) {
            otpInputRef.current.focus();
        }
    }, [step]);

    // ── Handlers (unchanged business logic) ───────────────────────────────
    const handleCredentialsSubmit = async (e) => {
        e.preventDefault();

        if (!userId.trim() || !pin.trim()) {
            const msg = 'Please fill in all security fields.';
            toast.error(msg);
            setFormError(msg);
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

            const { token, user } = response.data;
            login(token, user);
            toast.success('Access granted. Welcome back!', { id: toastId });
            navigate('/dashboard');
        } catch (error) {
            console.error('Login error:', error);
            const msg = error.response?.data?.message || error.response?.data?.error || 'Invalid User ID or Security PIN.';
            toast.error(msg, { id: toastId });
            setFormError(msg);
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
        <div className="sfms-page relative h-screen w-full overflow-hidden bg-[#F3F6FB] text-slate-900">
            <style>{`
                @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=swap');

                .sfms-page { font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif; }
                .sfms-display { font-family: 'Space Grotesk', 'Inter', ui-sans-serif, system-ui, sans-serif; }

                .sfms-text-gradient {
                    background: linear-gradient(120deg, #2563eb, #3B82F6 55%, #0EA5E9);
                    -webkit-background-clip: text;
                    background-clip: text;
                    color: transparent;
                }

                /* ---------- background ---------- */
                .sfms-bg {
                    background:
                        radial-gradient(circle at 15% 10%, rgba(37,99,235,0.08), transparent 45%),
                        radial-gradient(circle at 85% 80%, rgba(14,165,233,0.08), transparent 50%),
                        radial-gradient(circle at 50% 100%, rgba(59,130,246,0.06), transparent 55%),
                        linear-gradient(180deg, #F7F9FC 0%, #EEF2F9 45%, #F3F6FB 100%);
                }
                .sfms-grid {
                    background-image:
                        linear-gradient(rgba(15,23,42,0.04) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(15,23,42,0.04) 1px, transparent 1px);
                    background-size: 48px 48px;
                    -webkit-mask-image: radial-gradient(ellipse 80% 70% at 50% 30%, black 40%, transparent 90%);
                    mask-image: radial-gradient(ellipse 80% 70% at 50% 30%, black 40%, transparent 90%);
                }
                .sfms-blob { position: absolute; border-radius: 9999px; filter: blur(70px); opacity: 0.5; will-change: transform; }
                .sfms-blob-a { width: 460px; height: 460px; top: -120px; left: -100px; background: radial-gradient(circle, rgba(37,99,235,0.15), transparent 70%); animation: sfmsFloatA 22s ease-in-out infinite; }
                .sfms-blob-b { width: 400px; height: 400px; bottom: -140px; right: -80px; background: radial-gradient(circle, rgba(14,165,233,0.12), transparent 70%); animation: sfmsFloatB 26s ease-in-out infinite; }
                .sfms-blob-c { width: 340px; height: 340px; top: 35%; left: 45%; background: radial-gradient(circle, rgba(59,130,246,0.10), transparent 70%); animation: sfmsFloatC 30s ease-in-out infinite; }

                @keyframes sfmsFloatA { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(40px,50px) scale(1.08); } }
                @keyframes sfmsFloatB { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(-50px,-30px) scale(1.06); } }
                @keyframes sfmsFloatC { 0%,100% { transform: translate(-50%,-50%) scale(1); } 50% { transform: translate(-45%,-55%) scale(1.12); } }

                /* ---------- chip ---------- */
                .sfms-chip { background: rgba(37,99,235,0.08); border: 1px solid rgba(37,99,235,0.15); }
                .sfms-dot-pulse { animation: sfmsDotPing 2.4s ease-out infinite; }
                @keyframes sfmsDotPing { 0% { transform: scale(1); opacity: 0.7; } 100% { transform: scale(2.4); opacity: 0; } }

                /* ---------- entrance ---------- */
                .sfms-enter { opacity: 0; animation: sfmsFadeUp 0.6s ease forwards; }
                .sfms-enter-1 { animation-delay: 0.05s; }
                .sfms-enter-2 { animation-delay: 0.16s; }
                .sfms-enter-3 { animation-delay: 0.26s; }
                .sfms-enter-4 { animation-delay: 0.34s; }
                @keyframes sfmsFadeUp { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }

                /* ---------- glass card ---------- */
                .sfms-glass-card {
                    background: rgba(255,255,255,0.82);
                    border: 1px solid rgba(15,23,42,0.08);
                    backdrop-filter: blur(20px);
                    -webkit-backdrop-filter: blur(20px);
                    box-shadow:
                        0 1px 0 rgba(255,255,255,0.6) inset,
                        0 30px 60px -24px rgba(15,23,42,0.18),
                        0 0 0 1px rgba(37,99,235,0.04);
                    transition: box-shadow 0.3s ease;
                }
                .sfms-glass-card:hover {
                    box-shadow:
                        0 1px 0 rgba(255,255,255,0.7) inset,
                        0 34px 70px -20px rgba(15,23,42,0.22),
                        0 0 0 1px rgba(37,99,235,0.07);
                }

                .sfms-logo-badge {
                    background: linear-gradient(145deg, #2563eb, #1D4ED8);
                    box-shadow: 0 0 0 1px rgba(255,255,255,0.5), 0 12px 26px -10px rgba(37,99,235,0.45);
                    animation: sfmsLogoFloat 7s ease-in-out infinite;
                }
                @keyframes sfmsLogoFloat { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }

                /* ---------- inputs ---------- */
                .sfms-input-wrap {
                    background: rgba(15,23,42,0.03);
                    border: 1px solid rgba(15,23,42,0.12);
                    transition: border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease;
                }
                .sfms-input-wrap:hover { background: rgba(15,23,42,0.045); }
                .sfms-input-wrap:focus-within {
                    border-color: rgba(37,99,235,0.55);
                    background: rgba(37,99,235,0.04);
                    box-shadow: 0 0 0 3px rgba(37,99,235,0.12);
                }
                .sfms-input-wrap-error { border-color: rgba(220,38,38,0.55) !important; }
                .sfms-input-wrap-error:focus-within { box-shadow: 0 0 0 3px rgba(220,38,38,0.12); }

                .sfms-input { background: transparent; color: #0f172a; caret-color: #2563eb; }
                .sfms-input::placeholder { color: rgba(100,116,139,0.65); }
                .sfms-input:-webkit-autofill {
                    -webkit-text-fill-color: #0f172a;
                    -webkit-box-shadow: 0 0 0 1000px rgba(255,255,255,0.01) inset;
                    transition: background-color 9999s ease-in-out 0s;
                }

                .sfms-icon { color: rgba(100,116,139,0.8); transition: color 0.2s ease; }
                .sfms-input-wrap:focus-within .sfms-icon { color: #2563eb; }

                .sfms-checkbox { accent-color: #2563eb; }

                .sfms-link { color: #2563eb; transition: color 0.2s ease; }
                .sfms-link:hover { color: #1d4ed8; }

                /* ---------- button ---------- */
                .sfms-btn-primary {
                    position: relative;
                    background: linear-gradient(135deg, #2563eb, #1D4ED8 55%, #0EA5E9);
                    background-size: 160% 160%;
                    background-position: 0% 50%;
                    color: white;
                    transition: background-position 0.5s ease, transform 0.15s ease, box-shadow 0.25s ease;
                    box-shadow: 0 12px 28px -10px rgba(37,99,235,0.4);
                }
                .sfms-btn-primary:hover:not(:disabled) {
                    background-position: 100% 50%;
                    transform: translateY(-1px);
                    box-shadow: 0 16px 34px -10px rgba(37,99,235,0.5);
                }
                .sfms-btn-primary:active:not(:disabled) { transform: translateY(0); }
                .sfms-btn-primary:disabled {
                    background: rgba(15,23,42,0.08);
                    color: rgba(100,116,139,0.6);
                    box-shadow: none;
                    cursor: not-allowed;
                }
                .sfms-btn-arrow { transition: transform 0.2s ease; }
                .sfms-btn-primary:hover:not(:disabled) .sfms-btn-arrow { transform: translateX(3px); }

                /* ---------- otp ---------- */
                .sfms-otp-cell { background: rgba(15,23,42,0.03); border: 1px solid rgba(15,23,42,0.12); color: #0f172a; }
                .sfms-otp-cell-filled { border-color: rgba(37,99,235,0.4); background: rgba(37,99,235,0.06); }
                .sfms-otp-cell-active { border-color: rgba(37,99,235,0.65); box-shadow: 0 0 0 3px rgba(37,99,235,0.14); }
                .sfms-otp-real-input {
                    position: absolute;
                    inset: 0;
                    width: 100%;
                    height: 100%;
                    opacity: 0;
                    color: transparent;
                    background: transparent;
                    border: none;
                    text-align: center;
                    letter-spacing: 1em;
                }

                @media (prefers-reduced-motion: reduce) {
                    .sfms-page * {
                        animation-duration: 0.001ms !important;
                        animation-iteration-count: 1 !important;
                        transition-duration: 0.001ms !important;
                        scroll-behavior: auto !important;
                    }
                }
            `}</style>

            <AnimatedBackground />

            <div className="relative z-10 h-full w-full grid lg:grid-cols-2 overflow-hidden">
                <BrandPanel />

                <div className="min-h-0 overflow-hidden flex flex-col items-center justify-center px-4 sm:px-6 py-4 lg:py-6">
                    <div className="w-full max-w-[400px]">
                        <MobileBrandHeader />

                        {/* Login card */}
                        <div className="sfms-enter sfms-enter-3 sfms-glass-card w-full rounded-3xl p-5 sm:p-7">

                            {/* Header */}
                            <div className="text-center mb-4">
                                <div className="sfms-logo-badge inline-flex items-center justify-center w-12 h-12 rounded-2xl text-white mb-3">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75}>
                                        {step === 'credentials' ? (
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                        ) : (
                                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3zM9.4 12.2l1.8 1.8L15 10" />
                                        )}
                                    </svg>
                                </div>
                                <h1 className="sfms-display text-[1.5rem] sm:text-2xl font-semibold text-slate-900 tracking-tight">
                                    {step === 'credentials' ? 'Welcome back' : 'Verify your identity'}
                                </h1>
                                <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
                                    {step === 'credentials'
                                        ? 'Sign in to securely access your SFMS workspace.'
                                        : 'Enter the 6-digit verification code from your authenticator app.'}
                                </p>
                            </div>

                            {step === 'credentials' ? (
                                <form onSubmit={handleCredentialsSubmit} className="space-y-4" noValidate>

                                    {/* User ID Field */}
                                    <div>
                                        <label htmlFor="sfms-user-id" className="block text-xs font-medium text-slate-600 mb-1">
                                            User ID
                                        </label>
                                        <div className={`sfms-input-wrap relative rounded-xl ${formError ? 'sfms-input-wrap-error' : ''}`}>
                                            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="sfms-icon h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                                </svg>
                                            </div>
                                            <input
                                                id="sfms-user-id"
                                                type="text"
                                                value={userId}
                                                onChange={(e) => { setUserId(e.target.value); if (formError) setFormError(null); }}
                                                placeholder="Enter your user ID"
                                                className="sfms-input w-full rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none"
                                                disabled={isSubmitting}
                                                autoFocus
                                                autoComplete="username"
                                            />
                                        </div>
                                    </div>

                                    {/* PIN Field */}
                                    <div>
                                        <label htmlFor="sfms-pin" className="block text-xs font-medium text-slate-600 mb-1">
                                            Security PIN
                                        </label>
                                        <div className={`sfms-input-wrap relative rounded-xl ${formError ? 'sfms-input-wrap-error' : ''}`}>
                                            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                                                <svg xmlns="http://www.w3.org/2000/svg" className="sfms-icon h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                                                </svg>
                                            </div>
                                            <input
                                                id="sfms-pin"
                                                type={showPin ? 'text' : 'password'}
                                                value={pin}
                                                onChange={(e) => { setPin(e.target.value); if (formError) setFormError(null); }}
                                                placeholder="Enter your security PIN"
                                                className="sfms-input w-full rounded-xl pl-9 pr-10 py-2.5 text-sm focus:outline-none"
                                                disabled={isSubmitting}
                                                autoComplete="current-password"
                                            />
                                            <button
                                                type="button"
                                                onClick={() => setShowPin((v) => !v)}
                                                disabled={isSubmitting}
                                                aria-label={showPin ? 'Hide security PIN' : 'Show security PIN'}
                                                className="sfms-icon absolute inset-y-0 right-0 flex items-center pr-3 hover:text-slate-700 transition-colors"
                                            >
                                                {showPin ? (
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                                                    </svg>
                                                ) : (
                                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                                                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                                    </svg>
                                                )}
                                            </button>
                                        </div>
                                        {formError && (
                                            <p role="alert" className="text-xs text-red-600 mt-1">
                                                {formError}
                                            </p>
                                        )}
                                    </div>

                                    {/* Options Row */}
                                    <div className="flex items-center justify-between pt-0.5">
                                        <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer group">
                                            <input
                                                type="checkbox"
                                                checked={rememberMe}
                                                onChange={(e) => setRememberMe(e.target.checked)}
                                                className="sfms-checkbox w-3.5 h-3.5 rounded border-slate-300 focus:ring-2 focus:ring-blue-500/40 transition-all duration-200"
                                            />
                                            <span className="select-none group-hover:text-slate-700 transition-colors">
                                                Keep me signed in
                                            </span>
                                        </label>
                                        <button type="button" className="sfms-link text-xs font-medium">
                                            Forgot PIN?
                                        </button>
                                    </div>

                                    {/* Login Button */}
                                    <button
                                        type="submit"
                                        disabled={isSubmitting}
                                        className="sfms-btn-primary w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-blue-500/40 focus:outline-none"
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                Signing you in...
                                            </>
                                        ) : (
                                            <>
                                                Sign In
                                                <svg className="sfms-btn-arrow h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M17 8l4 4m0 0l-4 4m4-4H3" />
                                                </svg>
                                            </>
                                        )}
                                    </button>

                                    {/* Registration link */}
                                    <p className="text-center text-xs text-slate-500 mt-1">
                                        Don't have an account?{' '}
                                        <a href="/register" className="sfms-link font-medium">
                                            Get Registered
                                        </a>
                                    </p>

                                </form>
                            ) : (
                                <form onSubmit={handleOtpSubmit} className="space-y-5" noValidate>

                                    {/* OTP Field */}
                                    <div>
                                        <div className="flex items-center justify-center gap-1.5 mb-2.5">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v5c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" />
                                            </svg>
                                            <span className="text-[10px] font-semibold tracking-[0.15em] text-blue-700 uppercase">
                                                Two-factor authentication
                                            </span>
                                        </div>

                                        <div className="relative">
                                            <OtpCells value={otp} focused={otpFocused} />
                                            <input
                                                ref={otpInputRef}
                                                type="text"
                                                inputMode="numeric"
                                                autoComplete="one-time-code"
                                                maxLength={6}
                                                value={otp}
                                                onChange={(e) => { setOtp(e.target.value.replace(/\D/g, '')); if (otpError) setOtpError(null); }}
                                                onFocus={() => setOtpFocused(true)}
                                                onBlur={() => setOtpFocused(false)}
                                                disabled={isSubmitting}
                                                aria-label="6-digit verification code"
                                                className="sfms-otp-real-input"
                                            />
                                        </div>

                                        {otpError ? (
                                            <p role="alert" className="text-xs text-red-600 mt-2.5 text-center">
                                                {otpError}
                                            </p>
                                        ) : (
                                            <p className="text-xs text-slate-500 mt-2.5 text-center">
                                                Enter the 6-digit code from your authenticator app
                                            </p>
                                        )}
                                    </div>

                                    {/* Verify Button */}
                                    <button
                                        type="submit"
                                        disabled={isSubmitting || otp.length !== 6}
                                        className="sfms-btn-primary w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-blue-500/40 focus:outline-none"
                                    >
                                        {isSubmitting ? (
                                            <>
                                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                                Verifying...
                                            </>
                                        ) : (
                                            'Verify & Continue'
                                        )}
                                    </button>

                                    {/* Back button */}
                                    <button
                                        type="button"
                                        onClick={handleBackToLogin}
                                        disabled={isSubmitting}
                                        className="w-full text-center text-xs text-slate-500 hover:text-slate-700 transition-colors duration-200"
                                    >
                                        &larr; Back to login
                                    </button>

                                </form>
                            )}

                            {/* Security footer */}
                            <div className="mt-4 pt-3.5 border-t border-slate-200 flex items-center justify-center gap-2">
                                <span className="relative flex h-1.5 w-1.5">
                                    <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75 animate-ping" />
                                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                </span>
                                <span className="text-[10px] text-slate-500">
                                    End-to-End Encrypted Session
                                </span>
                            </div>

                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}