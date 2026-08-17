import React from 'react';
import { useUser } from '@clerk/clerk-react';
import { Navigate, Outlet } from 'react-router-dom';

export default function AdminRoute() {
  const { isLoaded, isSignedIn, user } = useUser();

  if (!isLoaded) {
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

  // Read admin role from Clerk Public Metadata
  const isAdmin = user?.publicMetadata?.role === 'admin';

  // If signed in but NOT an admin, redirect to regular dashboard
  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  // Render nested admin child routes
  return <Outlet />;
}