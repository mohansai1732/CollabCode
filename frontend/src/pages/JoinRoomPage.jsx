import React, { useEffect, useState, useRef } from 'react';
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
  // 'checking' | 'not_found' | 'confirming' | 'sending' | 'pending' | 'rejected'
  const [status, setStatus] = useState('checking'); 
  const [myRequest, setMyRequest] = useState(null);
  const [countdown, setCountdown] = useState(5);
  const [cancelling, setCancelling] = useState(false);
  
  const timerRef = useRef(null);
  const isActiveRef = useRef(true);

  useEffect(() => {
    if (!isLoaded) return;

    if (!isSignedIn || !user) {
      navigate('/', { replace: true });
      return;
    }

    isActiveRef.current = true;

    const processJoinRequest = async () => {
      setLoading(true);

      try {
        const roomData = await fetchInviteRoom(roomId);
        if (!isActiveRef.current) return;

        if (!roomData) {
          setStatus('not_found');
          setLoading(false);
          return;
        }

        setRoom(roomData);

        if (roomData.ownerId === user.id) {
          navigate(`/editor/${roomId}`, { replace: true });
          return;
        }

        try {
          await fetchRoomById(roomId, user.id);
          if (!isActiveRef.current) return;
          navigate(`/editor/${roomId}`, { replace: true });
          return;
        } catch (memberErr) {
          // Expected 403 when user is not yet approved
        }

        const myRequests = await fetchMyRequests(user.id);
        if (!isActiveRef.current) return;

        let existingReq = myRequests.find((r) => r.roomId === roomId);

        if (existingReq?.status === 'rejected') {
          setStatus('rejected');
          setLoading(false);
          return;
        }

        if (existingReq) {
          setMyRequest(existingReq);
          setStatus('pending');
          setCountdown(3); // 3 seconds before auto-redirect
          setLoading(false);
          return;
        }

        // New request: show confirming state with 5s countdown
        setStatus('confirming');
        setCountdown(5);
        setLoading(false);

      } catch (err) {
        console.error('Join verification error:', err);
        if (isActiveRef.current) {
          setStatus('not_found');
          setLoading(false);
        }
      }
    };

    processJoinRequest();

    return () => {
      isActiveRef.current = false;
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [roomId, user, isLoaded, isSignedIn, navigate]);

  // Handle confirming countdown and sending request
  useEffect(() => {
    if (status === 'confirming') {
      timerRef.current = setInterval(async () => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            executeJoinRequest();
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timerRef.current);
    }
  }, [status]);

  // Handle post-send countdown to redirect
  useEffect(() => {
    if (status === 'pending') {
      timerRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timerRef.current);
            navigate('/dashboard', { replace: true });
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timerRef.current);
    }
  }, [status, navigate]);

  const executeJoinRequest = async () => {
    if (!isActiveRef.current) return;
    setStatus('sending');
    try {
      const existingReq = await createJoinRequest(
        roomId, 
        user.id, 
        user.fullName || user.primaryEmailAddress
      );
      if (isActiveRef.current) {
        setMyRequest(existingReq);
        setStatus('pending');
        setCountdown(3);
      }
    } catch (createErr) {
      console.error('Failed to create join request:', createErr);
      if (isActiveRef.current) {
        setStatus('not_found');
      }
    }
  };

  const handleCancelConfirm = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    navigate('/dashboard');
  };

  const handleCancelPending = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
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

  if (status === 'confirming') {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-zinc-100 font-sans">
        <div className="w-full max-w-md p-8 bg-zinc-900/90 border border-zinc-800 rounded-2xl shadow-xl flex flex-col items-center text-center space-y-6">
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-white">Sending Join Request</h2>
            <p className="text-sm text-zinc-400">
              You are about to request access to <strong className="text-zinc-200">{room?.name || roomId}</strong> hosted by{' '}
              <strong className="text-indigo-400">{room?.ownerName || 'Host'}</strong>.
            </p>
          </div>

          <div className="w-full bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-4 flex flex-col items-center justify-center">
            <div className="text-3xl font-mono font-bold text-indigo-400 mb-2">{countdown}</div>
            <span className="text-xs text-zinc-400">Sending in...</span>
          </div>

          <div className="flex gap-3 w-full">
            <button 
              onClick={executeJoinRequest}
              className="flex-1 py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-medium transition shadow-sm"
            >
              Send Now
            </button>
            <button 
              onClick={handleCancelConfirm}
              className="flex-1 py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl text-sm font-medium transition shadow-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'sending') {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-zinc-100 font-sans">
        <div className="w-full max-w-md p-8 bg-zinc-900/90 border border-zinc-800 rounded-2xl shadow-xl flex flex-col items-center text-center space-y-4">
          <div className="w-10 h-10 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          <h2 className="text-lg font-bold text-white">Sending Request...</h2>
        </div>
      </div>
    );
  }

  // View: Pending Approval Notice
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-zinc-100 font-sans">
      <div className="w-full max-w-md p-8 bg-zinc-900/90 border border-zinc-800 rounded-2xl shadow-xl flex flex-col items-center text-center space-y-6">
        <div className="relative">
          <div className="w-14 h-14 rounded-full bg-green-500/10 border border-green-500/30 flex items-center justify-center text-green-400">
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white">Request Sent</h2>
          <p className="text-sm text-zinc-400">
            Waiting for <strong className="text-indigo-400">{room?.ownerName || 'Host'}</strong> to approve your request to join <strong className="text-zinc-200">{room?.name || roomId}</strong>.
          </p>
        </div>

        <div className="w-full bg-zinc-950/70 border border-zinc-800/80 rounded-xl p-3 text-xs text-zinc-400 flex items-center justify-between">
          <span>Redirecting to dashboard in:</span>
          <span className="font-mono font-bold text-indigo-400 bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">{countdown}s</span>
        </div>

        <button 
          onClick={handleCancelPending}
          disabled={cancelling}
          className="w-full py-2.5 px-4 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl text-sm font-medium transition shadow-sm disabled:opacity-50"
        >
          {cancelling ? 'Cancelling...' : 'Cancel Request'}
        </button>
      </div>
    </div>
  );
}