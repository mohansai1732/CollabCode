import React, { useState, useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';
import { Navigate, Outlet } from 'react-router-dom';
import api from '@/services/api';

export default function AdminRoute() {
  const { isLoaded, isSignedIn, user } = useUser();
  // null = still checking, true = admin, false = not admin
  const [adminStatus, setAdminStatus] = useState(null);

  useEffect(() => {
    // Reset when auth state changes
    if (!isLoaded || !isSignedIn || !user) {
      setAdminStatus(null);
      return;
    }

    // 1. Fast path: check Clerk publicMetadata directly
    if (user.publicMetadata?.role === 'admin') {
      setAdminStatus(true);
      return;
    }

    // 2. Fallback: verify via backend API (handles cases where
    //    publicMetadata isn't in the session token / not yet synced)
    let cancelled = false;
    api.get('/admin/stats')
      .then(() => {
        if (!cancelled) setAdminStatus(true);
      })
      .catch(() => {
        if (!cancelled) setAdminStatus(false);
      });

    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, user?.id, user?.publicMetadata?.role]);

  // Still loading Clerk
  if (!isLoaded || (isSignedIn && !user)) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-zinc-950 text-zinc-400">
        Verifying permissions...
      </div>
    );
  }

  // If not signed in at all, redirect to home
  if (!isSignedIn) {
    return <Navigate to="/" replace />;
  }

  // Still verifying admin status via backend
  if (adminStatus === null) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-zinc-950 text-zinc-400">
        Verifying admin access...
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