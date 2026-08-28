import React, { useState, useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';
import { Navigate, Outlet } from 'react-router-dom';
import api from '@/services/api';

export default function AdminRoute() {
  const { isLoaded, isSignedIn, user } = useUser();
  // null = still checking, true = admin, false = not admin
  const [adminStatus, setAdminStatus] = useState(null);
  const [errorDetails, setErrorDetails] = useState(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user) {
      setAdminStatus(null);
      return;
    }

    let cancelled = false;

    async function verifyAdmin() {
      // 1. Fast path: check Clerk publicMetadata directly
      if (user.publicMetadata?.role === 'admin') {
        if (!cancelled) setAdminStatus(true);
        return;
      }

      // 2. Force-reload user from Clerk API to get fresh metadata
      try {
        await user.reload();
        if (cancelled) return;

        if (user.publicMetadata?.role === 'admin') {
          setAdminStatus(true);
          return;
        }
      } catch (reloadErr) {
        console.warn('[AdminRoute] User reload failed:', reloadErr.message);
      }

      // 3. Fallback: verify via backend API (In case role is in privateMetadata)
      try {
        await api.get('/admin/stats');
        if (!cancelled) setAdminStatus(true);
      } catch (apiErr) {
        console.warn('[AdminRoute] Backend admin check failed:', apiErr?.response?.status, apiErr?.response?.data?.error || apiErr.message);
        
        if (!cancelled) {
          // If the backend is outright crashing (500), it's a configuration error.
          // We should show this to the admin so they know WHY it failed, rather than silently kicking them.
          if (apiErr?.response?.status >= 500) {
            setErrorDetails(apiErr?.response?.data?.message || apiErr?.response?.data?.error || apiErr.message);
            // Don't set adminStatus to false yet, let them see the error
          } else {
            setAdminStatus(false);
          }
        }
      }
    }

    verifyAdmin();

    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, user?.id]);

  // Still loading Clerk
  if (!isLoaded || (isSignedIn && !user)) {
    return null; // Return null instead of a loading screen for better UX
  }

  // If not signed in at all, redirect to home
  if (!isSignedIn) {
    return <Navigate to="/" replace />;
  }

  // Show backend configuration errors to the user instead of silently redirecting
  if (errorDetails) {
    return (
      <div className="flex flex-col h-screen w-full items-center justify-center bg-zinc-950 p-6 text-center">
        <div className="bg-red-950/40 border border-red-800/60 p-8 rounded-2xl max-w-lg">
          <div className="w-12 h-12 bg-red-900/50 rounded-full flex items-center justify-center mx-auto mb-4 text-red-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Backend Configuration Error</h2>
          <p className="text-sm text-red-300 mb-6">The backend server crashed while verifying your admin status. This is usually due to missing environment variables on Render.</p>
          <div className="bg-zinc-950 text-red-400 font-mono text-xs p-3 rounded text-left overflow-x-auto mb-6 border border-red-900/30">
            {errorDetails}
          </div>
          <button onClick={() => window.location.href = '/dashboard'} className="px-4 py-2 bg-zinc-800 text-white rounded-lg text-sm font-medium hover:bg-zinc-700">
            Return to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // Still verifying admin status
  if (adminStatus === null) {
    // Only show loading state if it takes more than a split second
    return (
      <div className="flex flex-col h-screen w-full items-center justify-center bg-zinc-950 text-zinc-400 gap-4">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm">Verifying access...</p>
      </div>
    );
  }

  // If signed in but NOT an admin, redirect to regular dashboard
  if (!adminStatus) {
    return <Navigate to="/dashboard" replace />;
  }

  // Render nested admin child routes
  return <Outlet />;
}
