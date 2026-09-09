import React, { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth, useUser } from '@clerk/clerk-react';

import LandingPage from '@/pages/LandingPage';
import DashboardPage from '@/pages/DashboardPage';
import EditorWorkspace from '@/pages/EditorWorkspace';
import JoinRoomPage from './pages/JoinRoomPage';
import AuthPage from '@/pages/AuthPage';

import AdminGateway from "@/components/AdminGateway";

import ProtectedRoute from '@/components/ProtectedRoute';
import ErrorBoundary from '@/components/ErrorBoundary';

import { setClerkTokenGetter } from '@/services/api';

// Bridge component to dynamically attach Clerk token & user getters to Axios
function AxiosAuthBridge() {
  const { getToken } = useAuth();
  const { user } = useUser();

  useEffect(() => {
    setClerkTokenGetter(getToken, () => user);
  }, [getToken, user]);

  return null;
}

export default function App() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 antialiased">
      <ErrorBoundary>
        <BrowserRouter>
          {/* Placed inside BrowserRouter to maintain clean context execution */}
          <AxiosAuthBridge />

          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/login/*" element={<AuthPage mode="sign-in" />} />
            <Route path="/login" element={<AuthPage mode="sign-in" />} />
            <Route path="/sign-in/*" element={<AuthPage mode="sign-in" />} />
            <Route path="/register/*" element={<AuthPage mode="sign-up" />} />
            <Route path="/register" element={<AuthPage mode="sign-up" />} />
            <Route path="/sign-up/*" element={<AuthPage mode="sign-up" />} />

            {/* Admin Gateway (Accessible to anyone; prompts for Admin password if no active session) */}
            <Route path="/admin" element={<AdminGateway />} />

            {/* Authenticated Users */}
            <Route element={<ProtectedRoute />}>
              <Route path="/dashboard" element={<DashboardPage />} />
              <Route path="/editor/:roomId" element={<EditorWorkspace />} />
              <Route path="/join/:roomId" element={<JoinRoomPage />} />
            </Route>

            {/* Global Fallback Route */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </ErrorBoundary>
    </div>
  );
}