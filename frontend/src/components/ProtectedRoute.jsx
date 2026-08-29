import React from 'react';
import { useAuth } from '@clerk/clerk-react';
import { Navigate, Outlet } from 'react-router-dom';

export default function ProtectedRoute() {
  const { isLoaded, isSignedIn } = useAuth();

  // Show a loading state while Clerk initializes session state
  if (!isLoaded) {
    return null; // Return null instead of a loading screen for better UX
  }

  // If not signed in, redirect to home/landing page
  if (!isSignedIn) {
    return <Navigate to="/" replace />;
  }

  // Render nested child routes
  return <Outlet />;
}