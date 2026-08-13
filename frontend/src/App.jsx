

import { BrowserRouter, Route, Routes } from 'react-router-dom';

import LandingPage from '@/pages/LandingPage';
import DashboardPage from '@/pages/DashboardPage';
import EditorWorkspace from '@/pages/EditorWorkspace';

export default function App() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 antialiased">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/editor/:roomId" element={<EditorWorkspace />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}


// after adding admin portal

// import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

// import LandingPage from '@/pages/LandingPage';
// import DashboardPage from '@/pages/DashboardPage';
// import EditorWorkspace from '@/pages/EditorWorkspace';

// import AdminDashboard from '@/pages/admin/AdminDashboard';
// import ManageUsers from '@/pages/admin/ManageUsers';

// import ProtectedRoute from '@/components/ProtectedRoute';
// import AdminRoute from '@/components/AdminRoute';

// export default function App() {
//   return (
//     <div className="min-h-screen bg-zinc-950 text-zinc-50 antialiased">
//       <BrowserRouter>
//         <Routes>

//           {/* Public */}
//           <Route path="/" element={<LandingPage />} />

//           {/* Authenticated users */}
//           <Route element={<ProtectedRoute />}>
//             <Route path="/dashboard" element={<DashboardPage />} />
//             <Route path="/editor/:roomId" element={<EditorWorkspace />} />

//             {/* Admin (requires auth + admin role) */}
//             <Route element={<AdminRoute />}>
//               <Route path="/admin" element={<AdminDashboard />} />
//               <Route path="/admin/users" element={<ManageUsers />} />
//             </Route>
//           </Route>

//           {/* Global fallback */}
//           <Route path="*" element={<Navigate to="/" replace />} />

//         </Routes>
//       </BrowserRouter>
//     </div>
//   );
// }