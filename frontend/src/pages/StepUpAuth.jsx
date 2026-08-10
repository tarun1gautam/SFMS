import React, { useState, useRef, useEffect } from 'react';
import { toast } from 'react-hot-toast';
import api from '../utils/api';

const SESSION_FLAG_KEY = 'sfms_stepup_verified';

// --- Session-scoped unlock check --------------------------------------
// sessionStorage clears automatically when the tab/browser closes, which
// matches "unlock for the rest of this session" — no expiry timer needed,
// and it's per-tab so it can't leak into a different logged-in session.
export function isStepUpVerified() {
  return sessionStorage.getItem(SESSION_FLAG_KEY) === 'true';
}

function markStepUpVerified() {
  sessionStorage.setItem(SESSION_FLAG_KEY, 'true');
}

// Call this from your logout handler so a fresh login always re-prompts.
export function clearStepUpVerified() {
  sessionStorage.removeItem(SESSION_FLAG_KEY);
}

// --- Modal --------------------------------------------------------------
// Renders nothing when closed. Pass onVerified — called once the code checks
// out; the modal also marks the session as unlocked before calling it.
export function StepUpModal({ open, onVerified, onCancel }) {
  const [code, setCode] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (open) {
      setCode('');
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  if (!open) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      toast.error('Enter the 6-digit code from your authenticator app.');
      return;
    }

    setIsSubmitting(true);
    try {
      await api.post('/auth/mfa/verify-code', { token: code });
      markStepUpVerified();
      toast.success('Identity verified.');
      onVerified();
    } catch (error) {
      console.error('Step-up verify error:', error);
      toast.error(error.response?.data?.error || 'Invalid code. Please try again.');
      setCode('');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-xl w-full max-w-xs p-5">
        <h3 className="font-bold text-sm text-slate-900 dark:text-white mb-1">
          Verification Required
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
          Enter the code from your authenticator app to continue.
        </p>

        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
            placeholder="000000"
            disabled={isSubmitting}
            className="w-full text-center text-lg tracking-[0.4em] bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded px-3 py-2 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
          />

          <div className="flex gap-2 mt-4">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="flex-1 py-2 rounded text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || code.length !== 6}
              className="flex-1 py-2 rounded text-xs font-semibold bg-blue-600 hover:bg-blue-500 text-white transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Verifying...' : 'Verify'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// --- Hook -----------------------------------------------------------------
// Usage:
//   const { guardedNavigate, modal } = useStepUpGuard();
//   <button onClick={() => guardedNavigate('/mgmt')}>MGMT</button>
//   {modal}
//
// Or, to guard an arbitrary action instead of a navigation:
//   const { guard, modal } = useStepUpGuard();
//   <button onClick={() => guard(() => setShowAdminPanel(true))}>ADMIN</button>
export function useStepUpGuard() {
  const [pendingAction, setPendingAction] = useState(null); // () => void, or null

  const guard = (action) => {
    if (isStepUpVerified()) {
      action();
    } else {
      setPendingAction(() => action);
    }
  };

  const guardedNavigate = (navigate, path) => guard(() => navigate(path));

  const modal = (
    <StepUpModal
      open={pendingAction !== null}
      onVerified={() => {
        const action = pendingAction;
        setPendingAction(null);
        action?.();
      }}
      onCancel={() => setPendingAction(null)}
    />
  );

  return { guard, guardedNavigate, modal };
}
