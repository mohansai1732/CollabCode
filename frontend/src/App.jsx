import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
// import HomePage from '@/pages/HomePage';
import LandingPage from '@/pages/LandingPage';
// import LoginPage from './pages/LoginPage';
// import SignupPage from './pages/SignupPage';
import DashboardPage from './pages/DashboardPage';
import EditorWorkspace from './pages/EditorWorkspace';


export default function App() {
  return (
     <div className="min-h-screen bg-zinc-950 text-zinc-50 antialiased">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />}></Route>
          {/* <Route path="/login" element={<LoginPage />}></Route>
          <Route path="/signup" element={<SignupPage />}></Route> */}
          <Route path="/dashboard" element={<DashboardPage />}></Route>
          <Route path="/editor/:roomId" element={<EditorWorkspace />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}
