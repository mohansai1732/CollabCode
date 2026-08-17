import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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

  // Replace with your actual auth hook/context
  const { user, isLoaded, isSignedIn } = useUser(); 

  const [room, setRoom] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('checking'); // 'checking' | 'not_found' | 'pending' | 'rejected'
  const [myRequest, setMyRequest] = useState(null);

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

  // Step D: Auto-redirect to dashboard after 5 seconds of showing "Waiting for Approval"
  useEffect(() => {
    if (status === 'pending') {
      const timer = setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 5000);

      return () => clearTimeout(timer);
    }
  }, [status, navigate]);

  // --- RENDER VIEWS ---

  if (!isLoaded || loading) {
    return <div className="loading-spinner">Verifying room link...</div>;
  }

  // View 1: Invalid Room Code / Link
  if (status === 'not_found') {
    return (
      <div className="error-container">
        <h2>Room Doesn't Exist</h2>
        <p>The code or invite link you used is invalid or has expired.</p>
        <button onClick={() => navigate('/dashboard')}>Back to Dashboard</button>
      </div>
    );
  }

  // View 2: Rejected Access
  if (status === 'rejected') {
    return (
      <div className="rejected-container">
        <h2>Access Denied</h2>
        <p>The host rejected your request to join <strong>{room?.name}</strong>.</p>
        <button onClick={() => navigate('/dashboard')}>Back to Dashboard</button>
      </div>
    );
  }

  // View 3: Pending Approval Notice (Auto-disappears in 5s)
  return (
    <div className="pending-container">
      <h2>Waiting for Host Approval</h2>
      <p>
        Request sent to join <strong>{room?.name}</strong> hosted by{' '}
        <strong>{room?.ownerName}</strong>.
      </p>
      <p className="notice-subtext">Redirecting to dashboard in 5 seconds...</p>
      <button 
        onClick={async () => {
          if (myRequest?.id) await cancelJoinRequest(myRequest.id);
          navigate('/dashboard');
        }}
      >
        Cancel Request
      </button>
    </div>
  );
}