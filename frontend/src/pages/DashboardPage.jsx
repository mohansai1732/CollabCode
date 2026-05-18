import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { Card } from '../components/Card';

import {
  Code2,
  Plus,
  Users,
  Clock,
  LogOut,
  Home,
  FolderCode,
  TrendingUp,
  Activity,
  Trash2,
  Copy,
} from 'lucide-react';

import { useState, useEffect } from 'react';

import {
  useUser,
  useClerk,
} from '@clerk/clerk-react';

import {
  fetchUserRooms,
  createRoom,
  fetchRoomById,
  deleteRoom,
  fetchMyRequests,
  cancelJoinRequest,
  createJoinRequest,
  fetchRoomRequests,
} from '../services/roomsApi';

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState('rooms');
  const { user } = useUser();
  const { signOut } = useClerk();
  const [recentRooms, setRecentRooms] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [showPending, setShowPending] = useState(false);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [loading, setLoading] = useState(true);

  // Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [roomInputValue, setRoomInputValue] = useState('');
  const [actionError, setActionError] = useState('');

 useEffect(() => {

  if (!user?.id) return;

  loadRooms();

  const interval = setInterval(() => {
    loadRooms();
    loadPendingRequests();
  }, 3000);

  return () => clearInterval(interval);

}, [user?.id]);

  const loadRooms = async () => {
    try {
      setLoading(true);
      const rooms = await fetchUserRooms(user.id);
      setRecentRooms(rooms);
    } catch (err) {
      console.error('Failed to load rooms:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadPendingRequests = async () => {
    try {
      const requests = await fetchMyRequests(user.id);
      setPendingRequests(requests);
    } catch (err) {
      console.error(
        'Failed to load pending requests:',
        err.message
      );
    }
  };

  const loadIncomingRequests = async () => {

  try {

    const requests =
      await fetchRoomRequests(user.id);

    setIncomingRequests(requests);

  } catch (err) {

    console.error(
      'Failed to load incoming requests:',
      err.message
    );
  }
};

  const openCreateModal = () => {
    setRoomInputValue('');
    setActionError('');
    setIsCreateModalOpen(true);
  };

  const openJoinModal = () => {
    setRoomInputValue('');
    setActionError('');
    setIsJoinModalOpen(true);
  };

  const handleCreateRoomSubmit = async (e) => {
    e.preventDefault();
    if (!roomInputValue?.trim()) return;
    try {
      setActionError('');
      const { roomId } = await createRoom(user.id, roomInputValue);
      window.location.href = `/editor/${roomId}`;
    } catch (err) {
      setActionError('Failed to create room: ' + err.message);
    }
  };

  const handleDeleteRoom = async (roomId) => {

  try {

    await deleteRoom(
      roomId,
      user.id
    );

    setRecentRooms(prev =>
      prev.filter(
        room => room.id !== roomId
      )
    );

  } catch (err) {

    console.error(err);

    alert(
      'Failed to delete room'
    );
  }
};

  const handleJoinRoomSubmit = async (e) => {

  e.preventDefault();

  if (!roomInputValue?.trim()) return;

  try {

    setActionError('');

    const roomId = roomInputValue
      .trim()
      .toLowerCase();

    // verify room exists
    const room =
      await fetchRoomById(roomId);

    // prevent duplicate requests
    const alreadyRequested =
      pendingRequests.some(
        req => req.roomId === roomId
      );

    if (alreadyRequested) {

      setActionError(
        'Request already pending'
      );

      return;
    }

    // create pending request
    await createJoinRequest(
      user,
      room
    );

    setIsJoinModalOpen(false);

    setRoomInputValue('');

    loadPendingRequests();

  } catch (err) {

  console.error(err);

  setActionError(
    err?.message ||
    err?.response?.data?.message ||
    'Failed to send request'
  );
}
}

  const handleCopyRoomLink = async (roomId) => {
    const link = `${window.location.origin}/editor/${roomId}`;
    await navigator.clipboard.writeText(link);
    alert('Room link copied!');
  };

  const handleCancelRequest =
      async (requestId) => {

        try {

          await cancelJoinRequest(
            requestId
          );

          setPendingRequests(prev =>
            prev.filter(
              r => r.id !== requestId
            )
          );

        } catch (err) {

          console.error(err);

          alert(
            'Failed to cancel request'
          );
        }
      };

  const stats = [
    {
      label: 'Total Sessions',
      value: 'stay tuned',
      icon: Activity,
      color: 'blue',
    },
    {
      label: 'Active Rooms',
      value: recentRooms.length,
      icon: FolderCode,
      color: 'purple',
    },
    {
      label: 'Collaborators',
      value: 'stay tuned',
      icon: Users,
      color: 'pink',
    },
    {
      label: 'Hours Coded',
      value: 'stay tuned',
      icon: TrendingUp,
      color: 'green',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-blue-950">
      <div className="flex">
        <aside className="w-64 border-r border-white/10 bg-gray-900/50 backdrop-blur-xl min-h-screen p-6 flex flex-col">
          <Link to="/" className="flex items-center gap-2 mb-8 hover:opacity-80 transition-opacity">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
              <Code2 className="w-6 h-6 text-white" />
            </div>

            <span className="text-xl text-white font-bold tracking-tight">
              CodeSync
            </span>
          </Link>

          <nav className="space-y-2">
            <button
              onClick={() => setActiveTab('rooms')}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all ${
                activeTab === 'rooms'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Home className="w-5 h-5" />

              <span>My Rooms</span>
            </button>

            <button
              onClick={() => setActiveTab('recent')}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all ${
                activeTab === 'recent'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Clock className="w-5 h-5" />

              <span>Recent</span>
            </button>

            <button
              onClick={() => setActiveTab('pending')}
              className={`
                w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all
                ${activeTab === 'pending'
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }
              `}
            >
              <Users className="w-5 h-5" />

              <span>Pending Requests</span>

              {pendingRequests.length > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs min-w-[20px] h-5 px-1 rounded-full flex items-center justify-center">
                  {pendingRequests.length}
                </span>
              )}
            </button>

          </nav>

          

          <div className="mt-auto flex flex-col gap-1 pb-2">
            <Link to="/profile">
              <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-gray-300 hover:bg-white/5 hover:text-white transition-all">
                <img
                  src={user?.imageUrl}
                  alt="profile"
                  className="w-10 h-10 rounded-full object-cover"
                />

                <div className="flex-1 text-left min-w-0">
                  <p className="text-white text-sm truncate">
                    {user?.fullName}
                  </p>

                  <p className="text-gray-400 text-xs truncate">
                    {user?.primaryEmailAddress?.emailAddress}
                  </p>
                </div>
              </button>
            </Link>


            
            <div className="p-4 border-t border-zinc-800">
              <button 
                onClick={() => signOut(() => window.location.href = '/')}
                className="w-full flex items-center gap-2 p-2 text-zinc-500 hover:text-red-400 transition-colors text-sm"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          </div>
        </aside>

        <main className="flex-1 p-8">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-3xl text-white mb-2">
                  Welcome back, {user?.firstName || 'Developer'}
                </h1>

                <p className="text-gray-400">
                  Ready to code together?
                </p>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={openJoinModal}
                >
                  <Plus className="w-5 h-5" />

                  Join Room
                </Button>

                <Button
                  variant="primary"
                  onClick={openCreateModal}
                >
                  <Plus className="w-5 h-5" />

                  Create Room
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-6 mb-8">
            {stats.map((stat) => (
              <Card
                key={stat.label}
                glass
                hover
                className="
                  p-6
                  group
                  cursor-pointer
                  transition-all
                  duration-300
                  border border-white/10
                  backdrop-blur-xl
                  hover:border-blue-500/40
                  hover:bg-white/[0.07]
                  hover:shadow-[0_0_30px_rgba(59,130,246,0.15)]
                  "
                  >
                {/* hover:-translate-y-2
                hover:scale-[1.03]
                hover:border-blue-500/40
                hover:bg-gradient-to-br
                hover:from-blue-500/10
                hover:to-purple-500/10
                hover:shadow-[0_0_40px_rgba(59,130,246,0.25)] */}
                <div className="flex items-start justify-between">

                  <div>
                    <p className="
                      text-gray-400
                      text-sm
                      mb-1
                      transition-all
                      duration-300
                      // group-hover:text-blue-300
                    ">
                      {stat.label}
                    </p>

                    <p className="
                      text-3xl
                      text-white
                      transition-all
                      duration-300
                      group-hover:text-white
                      ">
                      {/* group-hover:tracking-wide */}
                      {stat.value}
                    </p>
                  </div>

                  <div
                    className={`
                      w-12 h-12 rounded-xl
                      bg-${stat.color}-500/10
                      flex items-center justify-center
                      transition-all duration-300
                      group-hover:shadow-lg
                      `}
                      // group-hover:bg-${stat.color}-500/20
                      // group-hover:scale-125
                      // group-hover:rotate-6
                  >
                    <stat.icon
                      className={`
                        w-6 h-6
                        text-${stat.color}-400
                        transition-all duration-300
                        group-hover:scale-110
                      `}
                    />
                  </div>

                </div>
              </Card>
            ))}
          </div>

            <div className="mb-6 grid grid-cols-1 xl:grid-cols-3 gap-6 items-center">

            <h2 className="text-2xl font-bold text-white">
              {activeTab === 'pending'
                ? 'Pending Requests'
                : 'Recent Rooms'}
            </h2>

            {/* <div className="flex justify-end">
            <button
              onClick={() => setShowPending(!showPending)}
              className="inline-flex items-center justify-center gap-2 font-medium transition px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl"
            >
              Pending Requests
            </button>
          </div> */}
{/* 
          {showPending && (
            <div className="absolute top-20 right-0 w-80 bg-[#111827] border border-white/10 rounded-2xl shadow-2xl overflow-hidden z-50">

              <div className="p-4 border-b border-white/10">
                <h3 className="text-white text-lg font-semibold">
                  Pending Requests
                </h3>
              </div>

              {pendingRequests.length === 0 ? (
                <div className="p-4 text-gray-400">
                  No pending requests
                </div>
              ) : (
                pendingRequests.map((req) => (
                  <div
                    key={req._id}
                    className="p-4 border-b border-white/5 hover:bg-white/5 transition-all"
                  >

                    <p className="text-white font-medium">
                      {req.roomName}
                    </p>

                    <p className="text-sm text-gray-400 mt-1">
                      Requested by {req.userName}
                    </p>

                  </div>
                ))
              )}

            </div>
          )} */}


          </div>

        <div className="mb-6">

          <div className="grid gap-4">

            {activeTab === 'pending' ? (

              pendingRequests.length === 0 ? (

                <Card glass className="p-8 text-center">
                  <p className="text-gray-400">
                    No pending requests
                  </p>
                </Card>

              ) : (

                pendingRequests.map((req) => (

                  <Card
                    key={req.id}
                    glass
                    hover
                    className="group"
                  >
                    <div className="flex items-center justify-between">

                      <div className="flex items-center gap-4 flex-1">

                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                          <Code2 className="w-6 h-6 text-white" />
                        </div>

                        <div className="flex-1">

                          <h3 className="text-white text-lg mb-1">
                            {req.roomName}
                          </h3>

                          <div className="flex items-center gap-4 text-sm text-gray-400">

                            <span className="flex items-center gap-1">
                              <FolderCode className="w-4 h-4" />
                              {req.roomLanguage || 'javascript'}
                            </span>

                            <span className="flex items-center gap-1">
                              <Users className="w-4 h-4" />
                              Host: {req.roomOwner || 'Unknown'}
                            </span>

                            <span className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              Waiting Approval
                            </span>

                          </div>

                        </div>

                      </div>

                      <div className="flex items-center gap-2">

                        <Button
                          variant="ghost"
                          className="bg-yellow-500/10 text-yellow-400 cursor-default"
                        >
                          Pending
                        </Button>

                        <Button
                          variant="ghost"
                          className="group-hover:bg-red-500/10 text-red-400"
                          onClick={() => handleCancelRequest(req.id)}
                        >
                          Cancel
                        </Button>

                      </div>

                    </div>
                  </Card>

                ))

              )

            ) : (

              recentRooms.map((room) => (

                <Link
                  key={room.id}
                  to={`/editor/${room.id}`}
                >

                  <Card glass hover className="group">

                    <div className="flex items-center justify-between">

                      <div className="flex items-center gap-4 flex-1">

                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                          <Code2 className="w-6 h-6 text-white" />
                        </div>

                        <div className="flex-1">

                          <h3 className="text-white text-lg mb-1">
                            {room.name}
                          </h3>

                          <div className="flex items-center gap-4 text-sm text-gray-400">

                            <span className="flex items-center gap-1">
                              <FolderCode className="w-4 h-4" />
                              {room.language}
                            </span>

                            <span className="flex items-center gap-1">
                              <Users className="w-4 h-4" />
                              {room.members} members
                            </span>

                            <span className="flex items-center gap-1">
                              <Clock className="w-4 h-4" />
                              {room.lastActive}
                            </span>

                          </div>

                        </div>

                      </div>

                      <div className="flex items-center gap-2">

                        <Button
                          variant="ghost"
                          className="group-hover:bg-white/10"
                          onClick={(e) => {
                            e.preventDefault();
                            handleCopyRoomLink(room.link);
                          }}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>

                        <Button
                          variant="ghost"
                          className="group-hover:bg-red-500/10 text-red-400"
                          onClick={(e) => {
                            e.preventDefault();
                            handleDeleteRoom(room.id);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>

                        <Button
                          variant="ghost"
                          className="group-hover:bg-white/10"
                        >
                          Open
                        </Button>

                      </div>

                    </div>

                  </Card>

                </Link>

              ))

            )}

          </div>

        </div>

        </div>
        </main>
      </div>

      {/* Create Room Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-2">Create New Room</h2>
              <p className="text-zinc-400 text-sm mb-6">Give your project a name to get started.</p>
              
              <form onSubmit={handleCreateRoomSubmit}>
                <input
                  type="text"
                  autoFocus
                  value={roomInputValue}
                  onChange={(e) => setRoomInputValue(e.target.value)}
                  placeholder="e.g. My Awesome Project"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-white outline-none focus:border-blue-500 transition-colors mb-2"
                />
                {actionError && <p className="text-red-400 text-sm mb-4">{actionError}</p>}
                
                <div className="flex gap-3 mt-6">
                  <Button type="button" variant="ghost" className="flex-1" onClick={() => setIsCreateModalOpen(false)}>Cancel</Button>
                  <Button type="submit" variant="primary" className="flex-1">Create Room</Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Join Room Modal */}
      {isJoinModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-6">
              <h2 className="text-xl font-bold text-white mb-2">Join a Room</h2>
              <p className="text-zinc-400 text-sm mb-6">Paste the 6-character room ID to join your team.</p>
              
              <form onSubmit={handleJoinRoomSubmit}>
                <input
                  type="text"
                  autoFocus
                  value={roomInputValue}
                  onChange={(e) => setRoomInputValue(e.target.value)}
                  placeholder="Room ID"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-white font-mono outline-none focus:border-blue-500 transition-colors mb-2"
                />
                {actionError && <p className="text-red-400 text-sm mb-4">{actionError}</p>}
                
                <div className="flex gap-3 mt-6">
                  <Button type="button" variant="ghost" className="flex-1" onClick={() => setIsJoinModalOpen(false)}>Cancel</Button>
                  <Button type="submit" variant="primary" className="flex-1">Join Room</Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}