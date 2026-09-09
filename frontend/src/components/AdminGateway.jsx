import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '@/services/api';
import AdminPage from '@/pages/admin/AdminPage';

export default function AdminGateway() {
  const [sessionStatus, setSessionStatus] = useState('checking'); // 'checking' | 'unauthenticated' | 'authenticated'
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState(null);
  const [isLocked, setIsLocked] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  // Check existing session token on mount
  useEffect(() => {
    let isCancelled = false;

    async function checkExistingSession() {
      const token = typeof window !== 'undefined' ? sessionStorage.getItem('collabcode_admin_session_token') : null;
      if (!token) {
        if (!isCancelled) setSessionStatus('unauthenticated');
        return;
      }

      try {
        const res = await api.get('/admin/verify-session');
        if (!isCancelled) {
          if (res.data?.valid) {
            setSessionStatus('authenticated');
          } else {
            sessionStorage.removeItem('collabcode_admin_session_token');
            setSessionStatus('unauthenticated');
          }
        }
      } catch (err) {
        if (!isCancelled) {
          sessionStorage.removeItem('collabcode_admin_session_token');
          setSessionStatus('unauthenticated');
        }
      }
    }

    checkExistingSession();
    return () => { isCancelled = true; };
  }, []);

  // Lockout countdown timer
  useEffect(() => {
    if (!isLocked || remainingSeconds <= 0) return;

    const timer = setInterval(() => {
      setRemainingSeconds(prev => {
        if (prev <= 1) {
          setIsLocked(false);
          setError(null);
          setAttemptsRemaining(3);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isLocked, remainingSeconds]);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!password.trim() || isLocked || loading) return;

    setLoading(true);
    setError(null);

    try {
      const res = await api.post('/admin/login', { password: password.trim() });
      if (res.data?.token) {
        sessionStorage.setItem('collabcode_admin_session_token', res.data.token);
        setSessionStatus('authenticated');
        setPassword('');
        setError(null);
      }
    } catch (err) {
      const resData = err.response?.data;
      const errMsg = resData?.error || 'Authentication failed. Please check your credentials.';
      setError(errMsg);

      if (resData?.locked) {
        setIsLocked(true);
        setRemainingSeconds(resData.remainingSeconds || 300);
      } else if (typeof resData?.attemptsRemaining === 'number') {
        setAttemptsRemaining(resData.attemptsRemaining);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      await api.post('/admin/logout');
    } catch (e) {
      // Ignore network errors on logout
    }
    sessionStorage.removeItem('collabcode_admin_session_token');
    setSessionStatus('unauthenticated');
    setPassword('');
    setError(null);
  };

  const formatCountdown = (totalSec) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins}m ${secs < 10 ? '0' : ''}${secs}s`;
  };

  // 1. Checking active session state
  if (sessionStatus === 'checking') {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-zinc-950 text-zinc-400">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
          <p className="text-sm font-medium text-zinc-500 animate-pulse">Verifying Admin Session...</p>
        </div>
      </div>
    );
  }

  // 2. Authenticated: Render the existing Admin Portal with logout capability
  if (sessionStatus === 'authenticated') {
    return <AdminPage onAdminLogout={handleLogout} />;
  }

  // 3. Unauthenticated: Render dedicated Admin Login
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col justify-center items-center p-4 relative overflow-hidden font-sans">
      {/* Subtle background glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 translate-y-1/2 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md bg-zinc-900/90 border border-zinc-800/80 p-8 rounded-2xl shadow-2xl backdrop-blur-sm z-10 space-y-6">
        {/* Header Branding */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 rounded-xl flex items-center justify-center mx-auto shadow-inner">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Admin Control Portal</h1>
          <p className="text-xs text-zinc-400">
            Dedicated administrative authentication is required to access system controls.
          </p>
        </div>

        {/* Lockout Notification Banner */}
        {isLocked && (
          <div className="p-4 bg-red-950/50 border border-red-800/80 rounded-xl text-red-300 text-xs space-y-1.5 animate-in fade-in">
            <div className="flex items-center gap-2 font-bold text-red-200">
              <svg className="w-4 h-4 flex-shrink-0 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>Access Locked (3 Failed Attempts)</span>
            </div>
            <p className="text-zinc-300">
              Too many failed password attempts. Login has been locked for 5 minutes.
            </p>
            <p className="font-mono font-semibold text-amber-400">
              Lockout expires in: {formatCountdown(remainingSeconds)}
            </p>
          </div>
        )}

        {/* Error Banner (Non-locked) */}
        {error && !isLocked && (
          <div className="p-3 bg-red-950/40 border border-red-800/60 rounded-xl text-red-300 text-xs flex items-start gap-2.5">
            <svg className="w-4 h-4 flex-shrink-0 text-red-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <span>{error}</span>
              {typeof attemptsRemaining === 'number' && (
                <div className="mt-1 font-semibold text-red-200">
                  {attemptsRemaining} attempt{attemptsRemaining === 1 ? '' : 's'} remaining
                </div>
              )}
            </div>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
              Admin Secret
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter dedicated Admin secret"
                disabled={isLocked || loading}
                autoFocus
                className="w-full px-4 py-2.5 bg-zinc-950/90 border border-zinc-800 rounded-xl text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:opacity-50 transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                disabled={isLocked || loading}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 text-xs px-1"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={isLocked || loading || !password.trim()}
            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-xl text-sm transition shadow-lg shadow-indigo-600/20 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Verifying Secret...</span>
              </>
            ) : isLocked ? (
              <span>Locked ({formatCountdown(remainingSeconds)})</span>
            ) : (
              <span>Authenticate as Admin</span>
            )}
          </button>
        </form>

        {/* Footer info & return link */}
        <div className="pt-4 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-500">
          <span>CollabCode Security</span>
          <Link to="/" className="hover:text-zinc-300 transition">
            ← Return to Home
          </Link>
        </div>
      </div>
    </div>
  );
}
