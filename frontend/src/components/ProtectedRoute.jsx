import React from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Navigate, Outlet } from 'react-router-dom';

export default function ProtectedRoute() {
  const { isLoaded, isSignedIn } = useAuth();

  // Show a loading state while Clerk initializes session state
  if (!isLoaded) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-zinc-950 text-zinc-400">
        Loading...
      </div>
    );
  }

  // If not signed in, redirect to home/landing page
  if (!isSignedIn) {
    return <Navigate to="/" replace />;
  }

  // Render nested child routes
  return <Outlet />;
}