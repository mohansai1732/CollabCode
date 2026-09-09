import React from 'react';
import { SignIn, SignUp, useAuth } from '@clerk/clerk-react';
import { Link, Navigate } from 'react-router-dom';
import { Code2 } from 'lucide-react';

export default function AuthPage({ mode = 'sign-in' }) {
  const { isLoaded, isSignedIn } = useAuth();

  // If user is already authenticated, redirect straight to dashboard
  if (isLoaded && isSignedIn) {
    return <Navigate to="/dashboard" replace />;
  }

  const isSignUp = mode === 'sign-up';

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-blue-950 flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="mb-6 flex items-center gap-2">
        <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Code2 className="w-6 h-6 text-white" />
          </div>
          <span className="text-2xl text-white font-bold tracking-tight">CollabCode</span>
        </Link>
      </div>

      <div className="w-full flex justify-center">
        {isSignUp ? (
          <SignUp
            routing="path"
            path="/register"
            signInUrl="/login"
            fallbackRedirectUrl="/dashboard"
          />
        ) : (
          <SignIn
            routing="path"
            path="/login"
            signUpUrl="/register"
            fallbackRedirectUrl="/dashboard"
          />
        )}
      </div>
    </div>
  );
}
