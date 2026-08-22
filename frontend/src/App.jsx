import React, { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { useAuth, useUser } from '@clerk/clerk-react';

import LandingPage from '@/pages/LandingPage';
import DashboardPage from '@/pages/DashboardPage';
import EditorWorkspace from '@/pages/EditorWorkspace';
import JoinRoomPage from './pages/JoinRoomPage';

import AdminPage from "@/pages/admin/AdminPage";

import ProtectedRoute from '@/components/ProtectedRoute';
import AdminRoute from '@/components/AdminRoute';

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
      <BrowserRouter>
        {/* Placed inside BrowserRouter to maintain clean context execution */}
        <AxiosAuthBridge />
        
        <Routes>
          {/* Public Route */}
          <Route path="/" element={<LandingPage />} />

          {/* Authenticated Users */}
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/editor/:roomId" element={<EditorWorkspace />} />
            <Route path="/join/:roomId" element={<JoinRoomPage />} />

            {/* Admin (Requires Auth + Admin Role) */}
            <Route element={<AdminRoute />}>
              <Route path="/admin" element={<AdminPage />} />
              {/* <Route path="/admin/users" element={<ManageUsers />} /> */}
            </Route>
          </Route>

          {/* Global Fallback Route */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}