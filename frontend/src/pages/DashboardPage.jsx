import { Link } from 'react-router-dom';
import { Button } from '../components/Button';
import { Card } from '../components/Card';

import { Code2, Plus, Users, Clock, LogOut, Home, FolderCode, TrendingUp, Activity, Trash2, Crown, FileText, CheckCircle2 } from 'lucide-react';
import { useState, useEffect } from 'react';
import { useUser, useClerk, UserButton } from '@clerk/clerk-react';
import { fetchUserRooms, createRoom, deleteRoom, fetchRoomRequests, fetchRoomById, fetchMyRequests, cancelJoinRequest, createJoinRequest, upgradeSubscription, cancelSubscription, exitOrDeleteRoom, leaveRoom } from '../services/roomsApi';


export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState('rooms');
  const { user, isLoaded: isUserLoaded } = useUser();
  const { signOut } = useClerk();
  const [myRooms, setMyRooms] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [showPending, setShowPending] = useState(false);
  const [incomingRequests, setIncomingRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [subscription, setSubscription] = useState({ tier: 'free', plan: 'free', status: 'active' });

  // Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [roomInputValue, setRoomInputValue] = useState('');
  const [actionError, setActionError] = useState('');
  const [isJoining, setIsJoining] = useState(false);
  const [isUpgrading, setIsUpgrading] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [isUpgradeModalOpen, setIsUpgradeModalOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);

  const isAdmin = user?.publicMetadata?.role === 'admin';
  const isPro = (subscription?.tier === 'pro' || subscription?.plan === 'pro') && subscription?.status === 'active';

  useEffect(() => {
    if (!user?.id) return;
    loadRooms();
    const interval = setInterval(() => {loadRooms(); loadPendingRequests();}, 3000);
    return () => clearInterval(interval);
  }, [user?.id]);

  const loadRooms = async () => {
    try {
      setLoading(true);
      const res = await fetchUserRooms(user.id, user.fullName);
      const roomList = Array.isArray(res) ? res : res?.rooms || [];
      const sub = res?.subscription;
      setMyRooms(roomList);
      if (sub) setSubscription(sub);
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
      console.error('Failed to load pending requests:', err.message);
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
      const { roomId } = await createRoom(user.id, roomInputValue, user.fullName);
      window.location.href = `/editor/${roomId}`;
    } catch (err) {
      console.error(err);
      setActionError(err?.response?.data?.message || 'Failed to create room. Please try again.');
    }
  };

  const handleDeleteRoom = async (room) => {
    try {
      await exitOrDeleteRoom( room, user.id );
      setMyRooms(prev => prev.filter( r => r.id !== room.id ));
    } catch (err) {
      console.error(err);
      console.error('Failed to delete room', err.message);
    }
  };

  const handleJoinRoomSubmit = async (e) => {
    e.preventDefault();
    if (!isUserLoaded || !user?.id) {
      setActionError('Your account is still loading. Please try again in a moment.');
      return;
    }

    if (!roomInputValue?.trim() || isJoining) return;
    try {
      setActionError('');
      setIsJoining(true);

      const roomId = roomInputValue.trim();
      const alreadyRequested = pendingRequests.some( req => req.roomId === roomId );

      if (alreadyRequested) {
        setActionError( 'Request already pending' );
        return;
      }

      await createJoinRequest(user, { id: roomId });

      setIsJoinModalOpen(false);
      setRoomInputValue('');

      await loadPendingRequests();
    } catch (err) {
      console.error(err);
      setActionError(err?.response?.data?.message || 'Failed to send join request. Please try again.');
    } finally {
      setIsJoining(false);
    }
  }

  const handleUpgrade = async () => {
    if (isUpgrading) return;
    if (!isAdmin) {
      setActionError('This feature is currently unavailable.');
      return;
    }
    try {
      setIsUpgrading(true);
      setActionError('');
      const res = await upgradeSubscription(user.id, isAdmin);
      if (res?.subscription) {
        setSubscription(res.subscription);
      }
      setIsUpgradeModalOpen(false);
    } catch (err) {
      setActionError(err?.response?.data?.message || 'Failed to start free trial. Please try again.');
    } finally {
      setIsUpgrading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (isCancelling) return;
    try {
      setIsCancelling(true);
      setActionError('');
      const res = await cancelSubscription(user.id);
      if (res?.subscription) {
        setSubscription(res.subscription);
      } else {
        setSubscription(prev => ({ ...prev, status: 'cancelled' }));
      }
      setIsInvoiceModalOpen(false);
    } catch (err) {
      setActionError(err?.response?.data?.message || 'Failed to cancel subscription.');
    } finally {
      setIsCancelling(false);
    }
  };

  const formatDate = (rawDate) => {
    if (!rawDate) return 'N/A';
    let d;
    if (typeof rawDate.toDate === 'function') {
      d = rawDate.toDate();
    } else if (rawDate._seconds) {
      d = new Date(rawDate._seconds * 1000);
    } else if (typeof rawDate === 'number') {
      d = new Date(rawDate);
    } else if (typeof rawDate === 'string') {
      d = new Date(rawDate);
    } else if (rawDate instanceof Date) {
      d = rawDate;
    }
    if (!d || isNaN(d.getTime())) return 'N/A';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const handleCancelRequest =
  async (requestId) => {
    try {
      await cancelJoinRequest( requestId, user.id );
      setPendingRequests(prev => prev.filter( r => r.id !== requestId ));
    } catch (err) {
      console.error(err);
      console.error('Failed to cancel request', err.message);
    }
  };

  const stats = [
    { label: 'Total Sessions',
      value: 'stay tuned',
      icon: Activity,
      bgColor: 'bg-blue-500/10',
      textColor: 'text-blue-400'},

    { label: 'Active Rooms',
      value: myRooms.length,
      icon: FolderCode,
      bgColor: 'bg-purple-500/10',
      textColor: 'text-purple-400'},

    { label: 'Collaborators',
      value: 'stay tuned',
      icon: Users,
      bgColor: 'bg-pink-500/10',
      textColor: 'text-pink-400' },

    { label: 'Hours Coded',
      value: 'stay tuned',
      icon: TrendingUp,
      bgColor: 'bg-green-500/10',
      textColor: 'text-green-400' },
  ];


  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden bg-gradient-to-br from-gray-950 via-gray-900 to-blue-950">
      <div className="flex min-h-screen lg:min-h-0 lg:h-full flex-col lg:flex-row">
        <aside className="w-full shrink-0 border-b border-white/10 bg-gray-900/50 p-4 backdrop-blur-xl lg:h-full lg:min-h-0 lg:w-64 lg:border-b-0 lg:border-r lg:p-6 flex flex-col">
          <Link to="/" className="flex items-center gap-2 mb-8 hover:opacity-80 transition-opacity">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center">
              <Code2 className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl text-white font-bold tracking-tight"> CollabCode </span>
          </Link>

          <nav className="space-y-2">
            <button
              onClick={() => setActiveTab('rooms')}
              className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all ${
              activeTab === 'rooms' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white' }`} >
              <Home className="w-5 h-5" />
              <span>My Rooms</span>
            </button>

            <button
              onClick={() => setActiveTab('pending')}
              className={`
                w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all
                ${activeTab === 'pending' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-white'}`}>
              <Users className="w-5 h-5" />
              <span>Pending Approvals</span>

              {pendingRequests.length > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs min-w-[20px] h-5 px-1 rounded-full flex items-center justify-center">
                  {pendingRequests.length}
                </span>
              )}
            </button>
          </nav>

          <div className="mt-auto flex flex-col gap-3 pt-4 border-t border-zinc-800">
            <div className={`flex items-center gap-3 px-3 py-2 rounded-xl transition-all ${
              isPro 
                ? 'bg-purple-950/60 border border-purple-500/30 text-white shadow-[0_0_15px_rgba(168,85,247,0.15)]' 
                : 'px-2 py-1'
            }`}>
              <UserButton afterSignOutUrl="/" />
              <div className="flex-1 text-left min-w-0">
                <div className="flex items-center gap-1.5">
                  <p className="text-white text-sm truncate font-medium"> {user?.fullName} </p>
                  {isPro && (
                    <span className="text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30 px-1.5 py-0.5 rounded font-semibold tracking-wide">
                      PRO
                    </span>
                  )}
                </div>
                <p className="text-zinc-400 text-xs truncate"> {user?.primaryEmailAddress?.emailAddress} </p>
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 p-4 sm:p-8 lg:h-full lg:overflow-hidden flex flex-col">
          <div className="max-w-6xl mx-auto w-full flex-1 flex flex-col min-h-0">
            <div className="mb-6 flex shrink-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">

              <div>
                <h1 className="text-3xl text-white mb-2"> Welcome back, {user?.firstName || 'Developer'} </h1>
                <p className="text-gray-400"> Ready to code together? </p>
              </div>

              <div className="flex flex-wrap items-center gap-3 sm:justify-end">
                {isPro ? (
                  <Button
                    variant="outline"
                    onClick={() => { setActionError(''); setIsInvoiceModalOpen(true); }}
                    className="shrink-0 border-purple-500/30 text-purple-300 hover:text-white hover:bg-purple-950/40" >
                    <FileText className="h-4 w-4 text-purple-400" />
                    Invoice
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    onClick={() => { setActionError(''); setIsUpgradeModalOpen(true); }}
                    className="shrink-0 border-purple-400/70 bg-gradient-to-r from-purple-500/10 to-blue-500/10 shadow-[0_0_16px_rgba(139,92,246,0.3)]" >
                    <Crown className="h-4 w-4 text-amber-300" />
                    Upgrade Pro
                  </Button>
                )}

                <Button variant="outline" onClick={openJoinModal} className="shrink-0" >
                  <Plus className="w-5 h-5" />
                  Join Room
                </Button>

                <Button variant="primary" onClick={openCreateModal} className="shrink-0" >
                  <Plus className="w-5 h-5" />
                  Create Room
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-6 mb-6 shrink-0">
              {stats.map((stat) => (
                <Card key={stat.label} glass hover
                  className=" p-6 group cursor-pointer transition-all duration-300 border border-white/10 backdrop-blur-xl
                  hover:border-blue-500/40 hover:bg-white/[0.07] hover:shadow-[0_0_30px_rgba(59,130,246,0.15)] " >
                  <div className="flex items-start justify-between">

                    <div>
                      <p className=" text-gray-400 text-sm mb-1 transition-all duration-300 // group-hover:text-blue-300 "> {stat.label} </p>
                      <p className="text-3xl text-white transition-all duration-300 group-hover:text-white">{stat.value}</p>
                    </div>

                    <div
                      className={`w-12 h-12 rounded-xl ${stat.bgColor} flex items-center justify-center transition-all duration-300 group-hover:shadow-lg`}>
                      <stat.icon className={`w-6 h-6 ${stat.textColor} transition-all duration-300 group-hover:scale-110`}/>
                    </div>
                 </div>
                </Card>
              ))}
           </div>

            <h2 className="text-2xl font-bold text-white mb-4 shrink-0">
              {activeTab === 'pending' ? 'Pending Approvals' : 'My Rooms'}
            </h2>

            <div className="flex-1 min-h-0 overflow-y-auto pr-1 pb-6">
              <div className="grid gap-4">
                {activeTab === 'pending' ? (
                  pendingRequests.length === 0 ? (
                    <h3 className="text-gray-400 text-center"> No Pending Approvals </h3> ) : (

                    pendingRequests.map((req) => (
                      <Card key={req.id} glass hover className="group" >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 flex-1">
                            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
                              <Code2 className="w-6 h-6 text-white" />
                            </div>

                            <div className="flex-1">
                              <h3 className="text-white text-lg mb-1"> {req.roomName} </h3>
                              <div className="flex items-center gap-4 text-sm text-gray-400">
                                <span className="flex items-center gap-1"><Users className="w-4 h-4" />
                                  Host: {req.ownerName || req.roomOwnerName || req.roomOwner || 'Host'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            <Button variant="ghost" className="bg-yellow-500/10 text-yellow-400 cursor-default" >
                              Waiting for approval
                            </Button>

                            <Button variant="ghost" className="group-hover:bg-red-500/10 text-red-400"
                              onClick={() => handleCancelRequest(req.id)} > 
                              Cancel
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))
                  )
                ) : (
                  myRooms.length === 0 ? (
                    <h3 className="text-gray-400 text-center"> No Rooms Available </h3> ) : (
                      myRooms.map((room) => (
                        <Link key={room.id} to={`/editor/${room.id}`} >
                          <Card glass hover className="group">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-4 flex-1">
                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center group-hover:scale-110 transition-transform">
                                  <Code2 className="w-6 h-6 text-white" />
                                </div>

                                <div className="flex-1">
                                  <h3 className="text-white text-lg mb-1"> {room.name} </h3>
                                  <div className="flex items-center gap-4 text-sm text-gray-400">
                                    <span className="flex items-center gap-1">
                                      <span className="text-zinc-500 font-mono text-xs">CODE:</span>
                                      <code className="bg-white/10 px-2 py-0.5 rounded text-amber-300 font-mono font-bold text-xs tracking-wider">{room.id}</code>
                                    </span>
                                    <span className="flex items-center gap-1"><FolderCode className="w-4 h-4" />{room.language}</span>
                                    <span className="flex items-center gap-1"><Users className="w-4 h-4" />{room.members} members</span>
                                    <span className="flex items-center gap-1"><Clock className="w-4 h-4" />{room.lastActive}</span>
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                <Button variant="ghost" className="group-hover:bg-red-500/10 text-red-400"
                                  onClick={(e) => { e.preventDefault(); handleDeleteRoom(room); }} >
                                  <Trash2 className="w-4 h-4" />
                                </Button>

                                <Button variant="ghost" className="group-hover:bg-white/10" > Open </Button>
                              </div>
                            </div>
                          </Card>
                       </Link>
                     ))  
                   ))}
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
                <input type="text" autoFocus value={roomInputValue}
                  onChange={(e) => setRoomInputValue(e.target.value)}
                  placeholder="e.g. My Awesome Project"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-white outline-none focus:border-blue-500 transition-colors mb-2" />
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
                <input type="text" autoFocus value={roomInputValue}
                  onChange={(e) => setRoomInputValue(e.target.value)}
                  placeholder="Room ID"
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-white font-mono outline-none focus:border-blue-500 transition-colors mb-2" />
                  {actionError && <p className="text-red-400 text-sm mb-4">{actionError}</p>}
                
                <div className="flex gap-3 mt-6">
                  <Button type="button" variant="ghost" className="flex-1" onClick={() => setIsJoinModalOpen(false)}>Cancel</Button>
                  <Button type="submit" variant="primary" className="flex-1" disabled={!isUserLoaded || !user?.id || isJoining}>{!isUserLoaded ? 'Loading account...' : isJoining ? 'Joining...' : 'Join Room'}</Button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Upgrade / Free Trial Modal */}
      {isUpgradeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-purple-400/30 bg-zinc-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3 text-white">
              <Crown className="h-7 w-7 text-amber-300" />
              <h2 className="text-xl font-bold">{isAdmin ? 'Start Free Trial' : 'Upgrade to Pro'}</h2>
            </div>

            {isAdmin ? (
              <p className="text-sm text-zinc-300 mb-4">
                As an Admin, claim your <strong className="text-white">3-month free Pro trial</strong>: create unlimited rooms and collaborate with unlimited participants per room.
              </p>
            ) : (
              <div className="space-y-3 mb-4">
                <div className="flex items-baseline gap-2">
                  <span className="text-3xl font-extrabold text-white">₹99</span>
                  <span className="text-sm text-zinc-400">/ month</span>
                </div>
                <p className="text-sm text-zinc-300">
                  Supercharge your real-time collaborative coding workflow.
                </p>
                <ul className="text-sm text-zinc-300 space-y-1.5 pt-2">
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                    <span>Unlimited room creation</span>
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                    <span>Unlimited users per room</span>
                  </li>
                </ul>
              </div>
            )}

            {actionError && (
              <div className="p-3 mb-4 rounded-lg bg-red-900/30 border border-red-500/30 text-red-300 text-sm">
                {actionError}
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <Button variant="ghost" className="flex-1" onClick={() => setIsUpgradeModalOpen(false)} disabled={isUpgrading}>
                Cancel
              </Button>
              <Button className="flex-1" onClick={handleUpgrade} disabled={isUpgrading}>
                {isUpgrading ? 'Processing...' : isAdmin ? 'Start Free Trial' : 'Pay ₹99 / Month'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Invoice & Subscription Details Modal */}
      {isInvoiceModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-purple-500/30 bg-zinc-900 p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-3 text-white">
                <FileText className="h-6 w-6 text-purple-400" />
                <h2 className="text-xl font-bold">Subscription & Invoice</h2>
              </div>
              <button onClick={() => setIsInvoiceModalOpen(false)} className="text-zinc-500 hover:text-white text-lg">×</button>
            </div>

            <div className="space-y-3 bg-zinc-950/80 p-4 rounded-xl border border-zinc-800 text-sm">
              <div className="flex justify-between items-center py-1 border-b border-zinc-800/60">
                <span className="text-zinc-400">Plan:</span>
                <span className="text-white font-semibold flex items-center gap-1.5">
                  <Crown className="w-3.5 h-3.5 text-amber-300" /> Pro
                </span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-zinc-800/60">
                <span className="text-zinc-400">Start Date:</span>
                <span className="text-zinc-200 font-mono text-xs">{formatDate(subscription?.startDate)}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-zinc-800/60">
                <span className="text-zinc-400">End Date:</span>
                <span className="text-zinc-200 font-mono text-xs">{formatDate(subscription?.endDate)}</span>
              </div>
              <div className="flex justify-between items-center py-1">
                <span className="text-zinc-400">Status:</span>
                <span className="text-xs px-2 py-0.5 rounded font-medium bg-green-500/20 text-green-300 border border-green-500/30">
                  Active
                </span>
              </div>
            </div>

            {actionError && (
              <div className="p-3 mt-4 rounded-lg bg-red-900/30 border border-red-500/30 text-red-300 text-sm">
                {actionError}
              </div>
            )}

            <div className="mt-6 flex gap-3">
              <Button
                variant="ghost"
                className="flex-1 text-red-400 hover:bg-red-900/20 hover:text-red-300 border border-red-500/20"
                onClick={handleCancelSubscription}
                disabled={isCancelling}
              >
                {isCancelling ? 'Cancelling...' : 'Cancel Subscription'}
              </Button>
              <Button
                variant="ghost"
                className="flex-1"
                onClick={() => setIsInvoiceModalOpen(false)}
              >
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
