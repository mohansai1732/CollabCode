import React, { useState, useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';
import { Navigate, Outlet } from 'react-router-dom';
import api from '@/services/api';

export default function AdminRoute() {
  const { isLoaded, isSignedIn, user } = useUser();
  // null = still checking, true = admin, false = not admin
  const [adminStatus, setAdminStatus] = useState(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn || !user) {
      setAdminStatus(null);
      return;
    }

    let cancelled = false;

    async function verifyAdmin() {
      console.log('[AdminRoute] Verifying admin for user:', user.id);
      console.log('[AdminRoute] publicMetadata:', JSON.stringify(user.publicMetadata));

      // 1. Fast path: check Clerk publicMetadata directly
      if (user.publicMetadata?.role === 'admin') {
        console.log('[AdminRoute] ✅ Admin confirmed via publicMetadata');
        if (!cancelled) setAdminStatus(true);
        return;
      }

      // 2. Force-reload user from Clerk API to get fresh metadata
      //    (handles stale session cache after metadata was updated in dashboard)
      try {
        console.log('[AdminRoute] publicMetadata.role not found, reloading user from Clerk...');
        await user.reload();
        console.log('[AdminRoute] Reloaded publicMetadata:', JSON.stringify(user.publicMetadata));
        if (cancelled) return;

        if (user.publicMetadata?.role === 'admin') {
          console.log('[AdminRoute] ✅ Admin confirmed after reload');
          setAdminStatus(true);
          return;
        }
      } catch (reloadErr) {
        console.warn('[AdminRoute] User reload failed:', reloadErr.message);
      }

      // 3. Fallback: verify via backend API
      try {
        console.log('[AdminRoute] Trying backend fallback /admin/stats...');
        await api.get('/admin/stats');
        console.log('[AdminRoute] ✅ Admin confirmed via backend API');
        if (!cancelled) setAdminStatus(true);
      } catch (apiErr) {
        console.warn('[AdminRoute] ❌ Backend admin check failed:', apiErr?.response?.status, apiErr?.response?.data?.error || apiErr.message);
        if (!cancelled) setAdminStatus(false);
      }
    }

    verifyAdmin();

    return () => { cancelled = true; };
  }, [isLoaded, isSignedIn, user?.id]);

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

  // Still verifying admin status
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
