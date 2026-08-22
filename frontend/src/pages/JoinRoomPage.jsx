import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useUser } from '@clerk/clerk-react';
import { 
  fetchInviteRoom, 
  fetchRoomById, 
  createJoinRequest, 
  fetchMyRequests,
  cancelJoinRequest 
} from '../services/roomsApi';

export default function JoinRoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user, isLoaded, isSignedIn } = useUser(); 

  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('checking'); // 'checking' | 'not_found' | 'pending' | 'rejected'
  const [myRequest, setMyRequest] = useState(null);
  const [countdown, setCountdown] = useState(5);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!isLoaded) return;

    // 1. Unauthenticated users go to landing page
    if (!isSignedIn || !user) {
      navigate('/', { replace: true });
      return;
    }

    let active = true;

    const processJoinRequest = async () => {
      setLoading(true);

      try {
        // Step A: Check room metadata (Returns 404 if room does not exist)
        const roomData = await fetchInviteRoom(roomId);
        if (!active) return;

        if (!roomData) {
          setStatus('not_found');
          setLoading(false);
          return;
        }

        setRoom(roomData);

        // Step B: Host or Approved Member -> Go straight to editor
        if (roomData.ownerId === user.id) {
          navigate(`/editor/${roomId}`, { replace: true });
          return;
        }

        try {
          await fetchRoomById(roomId, user.id);
          if (!active) return;
          // User is already an approved collaborator
          navigate(`/editor/${roomId}`, { replace: true });
          return;
        } catch (memberErr) {
          // Expected 403 when user is not yet approved
        }

        // Step C: Check or create join request
        const myRequests = await fetchMyRequests(user.id);
        if (!active) return;

        let existingReq = myRequests.find((r) => r.roomId === roomId);

        if (!existingReq) {
          try {
            existingReq = await createJoinRequest(
              roomId, 
              user.id, 
              user.fullName || user.primaryEmailAddress
            );
          } catch (createErr) {
            console.error('Failed to create join request:', createErr);
          }
        }

        if (existingReq?.status === 'rejected') {
          setStatus('rejected');
          setLoading(false);
          return;
        }

        setMyRequest(existingReq || null);
        setStatus('pending');
        setLoading(false);

      } catch (err) {
        console.error('Join verification error:', err);
        if (active) {
          setStatus('not_found');
          setLoading(false);
        }
      }
    };

    processJoinRequest();

    return () => {
      active = false;
    };
  }, [roomId, user, isLoaded, isSignedIn, navigate]);

  // Step D: Countdown timer and auto-redirect to dashboard after 5 seconds of showing "Waiting for Approval"
  useEffect(() => {
    if (status === 'pending') {
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            navigate('/dashboard', { replace: true });
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [status, navigate]);

  const handleCancel = async () => {
    if (myRequest?.id && user?.id) {
      setCancelling(true);
      try {
        await cancelJoinRequest(myRequest.id, user.id);
      } catch (e) {
        console.warn('Error cancelling request:', e);
      }
    }
    navigate('/dashboard');
  };

  // --- RENDER VIEWS ---

  if (!isLoaded || loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-zinc-100 font-sans">
        <div className="w-full max-w-md p-8 bg-zinc-900/90 border border-zinc-800 rounded-2xl shadow-xl flex flex-col items-center text-center space-y-4">
          <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <div>
            <h2 className="text-lg font-bold text-white">Verifying Room Link</h2>
            <p className="text-xs text-zinc-400 mt-1 font-mono">Room Code: {roomId}</p>
          </div>
        </div>
      </div>
    );
  }

  // View 1: Invalid Room Code / Link
  if (status === 'not_found') {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-zinc-100 font-sans">
        <div className="w-full max-w-md p-8 bg-zinc-900/90 border border-red-900/50 rounded-2xl shadow-xl flex flex-col items-center text-center space-y-5">
          <div className="w-12 h-12 rounded-full bg-red-950/60 border border-red-800/60 flex items-center justify-center text-red-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Room Doesn't Exist</h2>
            <p className="text-sm text-zinc-400 mt-2">The invite link or room code <span className="font-mono text-zinc-300 font-semibold">{roomId}</span> is invalid or has expired.</p>
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-sm font-medium transition shadow-sm"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // View 2: Rejected Access
  if (status === 'rejected') {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-zinc-100 font-sans">
        <div className="w-full max-w-md p-8 bg-zinc-900/90 border border-red-900/50 rounded-2xl shadow-xl flex flex-col items-center text-center space-y-5">
          <div className="w-12 h-12 rounded-full bg-red-950/60 border border-red-800/60 flex items-center justify-center text-red-400">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Access Denied</h2>
            <p className="text-sm text-zinc-400 mt-2">The host declined your request to join <strong className="text-zinc-200">{room?.name || roomId}</strong>.</p>
          </div>
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-sm font-medium transition shadow-sm"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // View 3: Pending Approval Notice
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-zinc-100 font-sans">
      <div className="w-full max-w-md p-8 bg-zinc-900/90 border border-zinc-800 rounded-2xl shadow-xl flex flex-col items-center text-center space-y-6">
        <div className="relative">
          <div className="w-14 h-14 rounded-full bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <svg className="w-7 h-7 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white">Waiting for Host Approval</h2>
          <p className="text-sm text-zinc-400">
            Join request sent to <strong className="text-zinc-200">{room?.name || roomId}</strong> hosted by{' '}
            <strong className="text-indigo-400">{room?.ownerName || 'Host'}</strong>.
          </p>
        </div>

        <div className="w-full bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-3 text-xs text-zinc-400 flex items-center justify-between">
          <span>Redirecting to dashboard in:</span>
          <span className="font-mono font-bold text-indigo-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">{countdown}s</span>
        </div>

        <button 
          onClick={handleCancel}
          disabled={cancelling}
          className="w-full py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl text-sm font-medium transition shadow-sm disabled:opacity-50"
        >
          {cancelling ? 'Cancelling...' : 'Cancel Request'}
        </button>
      </div>
    </div>
  );
}