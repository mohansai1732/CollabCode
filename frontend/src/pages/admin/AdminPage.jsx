import React, { useEffect, useState, useMemo } from 'react';
import api from '@/services/api';

// Safe helper to render dates without crashing React
function formatDate(val) {
  if (!val) return 'N/A';
  if (typeof val === 'string') return val;
  if (typeof val === 'number') return new Date(val).toLocaleString();
  if (val._seconds) return new Date(val._seconds * 1000).toLocaleString();
  if (val.seconds) return new Date(val.seconds * 1000).toLocaleString();
  if (typeof val.toDate === 'function') return val.toDate().toLocaleString();
  return 'N/A';
}

// Safe string renderer
function safeText(val, fallback = 'N/A') {
  if (val === null || val === undefined) return fallback;
  if (typeof val === 'object') return fallback;
  return String(val);
}

export default function AdminPage() {
  const [stats, setStats] = useState({ usersCount: 0, roomsCount: 0, activeSubsCount: 0 });
  const [rooms, setRooms] = useState([]);
  const [users, setUsers] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [actionLoading, setActionLoading] = useState({});
  const [roomSearch, setRoomSearch] = useState('');
  const [userSearch, setUserSearch] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const [statsRes, roomsRes, usersRes] = await Promise.allSettled([
        api.get('/admin/stats'),
        api.get('/admin/rooms'),
        api.get('/admin/users'),
      ]);

      if (statsRes.status === 'fulfilled') {
        setStats(statsRes.value.data || { usersCount: 0, roomsCount: 0, activeSubsCount: 0 });
      } else {
        console.warn('Failed to load stats:', statsRes.reason);
      }

      if (roomsRes.status === 'fulfilled') {
        setRooms(Array.isArray(roomsRes.value.data) ? roomsRes.value.data : []);
      } else {
        console.warn('Failed to load rooms:', roomsRes.reason);
      }

      if (usersRes.status === 'fulfilled') {
        setUsers(Array.isArray(usersRes.value.data) ? usersRes.value.data : []);
      } else {
        console.warn('Failed to load users:', usersRes.reason);
      }

      const failures = [statsRes, roomsRes, usersRes].filter(r => r.status === 'rejected');
      if (failures.length === 3) {
        setErrorMsg('Failed to connect to backend admin endpoints. Please ensure your backend is running.');
      }
    } catch (err) {
      console.error('Failed to load admin data:', err);
      setErrorMsg(err?.response?.data?.error || err?.message || 'Error connecting to admin services.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRoom = async (roomId) => {
    if (!window.confirm(`Are you sure you want to terminate Room ${roomId}? This cannot be undone.`)) return;
    setActionLoading(prev => ({ ...prev, [`room-${roomId}`]: true }));
    try {
      await api.delete(`/admin/rooms/${roomId}`);
      setRooms((prev) => prev.filter((r) => r.id !== roomId));
      setStats((prev) => ({ ...prev, roomsCount: Math.max(0, prev.roomsCount - 1) }));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to terminate room');
    } finally {
      setActionLoading(prev => ({ ...prev, [`room-${roomId}`]: false }));
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm(`Are you sure you want to permanently delete User ${userId}?`)) return;
    setActionLoading(prev => ({ ...prev, [`user-${userId}`]: true }));
    try {
      await api.delete(`/admin/users/${userId}`);
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      setStats((prev) => ({ ...prev, usersCount: Math.max(0, prev.usersCount - 1) }));
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete user');
    } finally {
      setActionLoading(prev => ({ ...prev, [`user-${userId}`]: false }));
    }
  };

  const handleUpdateSubscription = async (userId, targetPlan) => {
    const isPro = targetPlan === 'pro';
    setActionLoading(prev => ({ ...prev, [`sub-${userId}`]: true }));
    try {
      await api.post(`/admin/users/${userId}/subscription`, {
        plan: targetPlan,
        status: isPro ? 'active' : 'active',
        expiresAt: isPro ? new Date(Date.now() + 90 * 86400000).toISOString() : null
      });

      setUsers(prev => prev.map(u => {
        if (u.id === userId) {
          return {
            ...u,
            subscription: {
              ...u.subscription,
              plan: targetPlan,
              tier: targetPlan,
              status: 'active'
            }
          };
        }
        return u;
      }));

      // Refresh stats
      const statsRes = await api.get('/admin/stats').catch(() => null);
      if (statsRes?.data) setStats(statsRes.data);

    } catch (err) {
      alert(err.response?.data?.error || 'Failed to update subscription');
    } finally {
      setActionLoading(prev => ({ ...prev, [`sub-${userId}`]: false }));
    }
  };

  // Filtered rooms based on search input
  const filteredRooms = useMemo(() => {
    if (!roomSearch.trim()) return rooms;
    const q = roomSearch.toLowerCase().trim();
    return rooms.filter(r => 
      safeText(r.id).toLowerCase().includes(q) ||
      safeText(r.name).toLowerCase().includes(q) ||
      safeText(r.ownerName).toLowerCase().includes(q) ||
      safeText(r.ownerId).toLowerCase().includes(q)
    );
  }, [rooms, roomSearch]);

  // Filtered users based on search input
  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return users;
    const q = userSearch.toLowerCase().trim();
    return users.filter(u => 
      safeText(u.id).toLowerCase().includes(q) ||
      safeText(u.name || u.fullName).toLowerCase().includes(q) ||
      safeText(u.email).toLowerCase().includes(q) ||
      safeText(u.role).toLowerCase().includes(q)
    );
  }, [users, userSearch]);

  return (
    <div className="min-h-screen bg-zinc-950 p-6 md:p-10 text-zinc-100 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* Header Section */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-zinc-800/80 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse" />
              <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white">Admin Control Panel</h1>
            </div>
            <p className="text-sm text-zinc-400 mt-1">CollabCode System Monitoring & Resource Management</p>
          </div>
          
          <button
            onClick={fetchData}
            disabled={loading}
            className="self-start sm:self-auto inline-flex items-center gap-2 px-4 py-2 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-sm font-medium rounded-lg text-zinc-200 transition shadow-sm active:scale-95 disabled:opacity-50"
          >
            <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.033 8.033 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh Data
          </button>
        </div>

        {/* Global Error Banner */}
        {errorMsg && (
          <div className="p-4 bg-red-950/40 border border-red-800/60 rounded-xl text-red-300 text-sm flex items-center justify-between">
            <span>{errorMsg}</span>
            <button onClick={fetchData} className="underline text-red-200 hover:text-white ml-4 font-medium">Retry</button>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-2 border-b border-zinc-800 pb-2">
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'rooms', label: `Rooms (${rooms.length})` },
            { id: 'users', label: `Users (${users.length})` },
            { id: 'subscriptions', label: `Subscriptions (${stats.activeSubsCount})` },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                activeTab === tab.id
                  ? 'bg-zinc-800 text-white shadow-inner border border-zinc-700'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/60'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Loading Indicator */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3 text-zinc-400">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm">Synchronizing Admin Panel...</p>
          </div>
        ) : (
          <>
            {/* TAB 1: OVERVIEW */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
                  <div className="p-6 bg-zinc-900/80 border border-zinc-800/80 rounded-2xl shadow-sm hover:border-zinc-700 transition">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Total Users</span>
                      <span className="p-2 bg-indigo-500/10 text-indigo-400 rounded-lg text-xs">Platform</span>
                    </div>
                    <p className="text-3xl font-extrabold text-white mt-3">{stats.usersCount}</p>
                    <p className="text-xs text-zinc-500 mt-1">Registered & synchronized accounts</p>
                  </div>

                  <div className="p-6 bg-zinc-900/80 border border-zinc-800/80 rounded-2xl shadow-sm hover:border-zinc-700 transition">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Active Rooms</span>
                      <span className="p-2 bg-emerald-500/10 text-emerald-400 rounded-lg text-xs">Live</span>
                    </div>
                    <p className="text-3xl font-extrabold text-white mt-3">{stats.roomsCount}</p>
                    <p className="text-xs text-zinc-500 mt-1">Collaborative editing sessions</p>
                  </div>

                  <div className="p-6 bg-zinc-900/80 border border-zinc-800/80 rounded-2xl shadow-sm hover:border-zinc-700 transition">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Active Subscriptions</span>
                      <span className="p-2 bg-amber-500/10 text-amber-400 rounded-lg text-xs">Pro & Active</span>
                    </div>
                    <p className="text-3xl font-extrabold text-white mt-3">{stats.activeSubsCount}</p>
                    <p className="text-xs text-zinc-500 mt-1">Users on premium/active tiers</p>
                  </div>
                </div>

                {/* Quick Summary Panels */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                  <div className="p-6 bg-zinc-900/40 border border-zinc-800/80 rounded-2xl">
                    <h3 className="text-base font-semibold text-zinc-200 mb-3">System Health & Services</h3>
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between items-center py-1 border-b border-zinc-800/50">
                        <span className="text-zinc-400">Firebase Firestore Database</span>
                        <span className="text-emerald-400 font-medium flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>Operational</span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-zinc-800/50">
                        <span className="text-zinc-400">Clerk Authentication Service</span>
                        <span className="text-emerald-400 font-medium flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>Connected</span>
                      </div>
                      <div className="flex justify-between items-center py-1">
                        <span className="text-zinc-400">Socket.IO & Yjs Real-Time Hub</span>
                        <span className="text-emerald-400 font-medium flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>Active</span>
                      </div>
                    </div>
                  </div>

                  <div className="p-6 bg-zinc-900/40 border border-zinc-800/80 rounded-2xl">
                    <h3 className="text-base font-semibold text-zinc-200 mb-3">Quick Navigation</h3>
                    <p className="text-sm text-zinc-400 mb-4">Jump directly to individual resource management tables to inspect or moderate data:</p>
                    <div className="flex flex-wrap gap-3">
                      <button onClick={() => setActiveTab('rooms')} className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs font-medium text-white transition">Manage Rooms ({rooms.length}) →</button>
                      <button onClick={() => setActiveTab('users')} className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs font-medium text-white transition">Manage Users ({users.length}) →</button>
                      <button onClick={() => setActiveTab('subscriptions')} className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs font-medium text-white transition">Subscriptions ({stats.activeSubsCount}) →</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: ROOM MANAGEMENT */}
            {activeTab === 'rooms' && (
              <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl overflow-hidden shadow-sm space-y-4">
                <div className="p-5 border-b border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-white">Active Collaborative Rooms</h2>
                    <p className="text-xs text-zinc-400">All live rooms and collaborative workspaces</p>
                  </div>
                  
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      placeholder="Search rooms..."
                      value={roomSearch}
                      onChange={(e) => setRoomSearch(e.target.value)}
                      className="px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
                    />
                    <span className="text-xs bg-zinc-800 text-zinc-300 px-2.5 py-1 rounded-full whitespace-nowrap">{filteredRooms.length} of {rooms.length}</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-900/90 text-zinc-400 text-xs uppercase tracking-wider">
                        <th className="p-4">Room Code</th>
                        <th className="p-4">Room Name</th>
                        <th className="p-4">Host / Owner</th>
                        <th className="p-4">Collaborators</th>
                        <th className="p-4">Created Date</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800 text-sm">
                      {filteredRooms.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="p-8 text-center text-zinc-500">
                            {roomSearch ? 'No matching rooms found.' : 'No active rooms found in the system.'}
                          </td>
                        </tr>
                      ) : (
                        filteredRooms.map((room) => {
                          const roomCode = safeText(room.id);
                          const roomName = safeText(room.name, 'Untitled Room');
                          const ownerName = safeText(room.ownerName, 'Host');
                          const ownerId = safeText(room.ownerId || room.createdBy, '');
                          const colCount = typeof room.collaboratorsCount === 'number' 
                            ? room.collaboratorsCount 
                            : (Array.isArray(room.collaborators) ? room.collaborators.length : 0);
                          const dateStr = formatDate(room.createdAt);

                          return (
                            <tr key={room.id} className="hover:bg-zinc-800/40 transition">
                              <td className="p-4 font-mono font-bold text-indigo-400 text-sm">{roomCode}</td>
                              <td className="p-4 font-medium text-zinc-200">{roomName}</td>
                              <td className="p-4 text-zinc-400 text-xs">
                                <div>{ownerName}</div>
                                {ownerId && (
                                  <div className="font-mono text-zinc-500 text-[11px] truncate max-w-[140px]">{ownerId}</div>
                                )}
                              </td>
                              <td className="p-4 text-zinc-300">
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs bg-zinc-800 text-zinc-300">
                                  {colCount} users
                                </span>
                              </td>
                              <td className="p-4 text-zinc-400 text-xs">{dateStr}</td>
                              <td className="p-4 text-right">
                                <button
                                  onClick={() => handleDeleteRoom(room.id)}
                                  disabled={actionLoading[`room-${room.id}`]}
                                  className="px-3 py-1.5 text-xs bg-red-950/40 text-red-400 hover:bg-red-900/60 hover:text-red-200 rounded-lg border border-red-800/40 transition font-medium disabled:opacity-50"
                                >
                                  {actionLoading[`room-${room.id}`] ? 'Terminating...' : 'Terminate'}
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 3: USER MANAGEMENT */}
            {activeTab === 'users' && (
              <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl overflow-hidden shadow-sm space-y-4">
                <div className="p-5 border-b border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-white">Registered Users</h2>
                    <p className="text-xs text-zinc-400">All registered users and member profiles</p>
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      placeholder="Search users..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      className="px-3 py-1.5 bg-zinc-950 border border-zinc-800 rounded-lg text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-zinc-700"
                    />
                    <span className="text-xs bg-zinc-800 text-zinc-300 px-2.5 py-1 rounded-full whitespace-nowrap">{filteredUsers.length} of {users.length}</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-800 bg-zinc-900/90 text-zinc-400 text-xs uppercase tracking-wider">
                        <th className="p-4">User</th>
                        <th className="p-4">User ID</th>
                        <th className="p-4">Role</th>
                        <th className="p-4">Plan / Status</th>
                        <th className="p-4">Created Date</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800 text-sm">
                      {filteredUsers.length === 0 ? (
                        <tr>
                          <td colSpan="6" className="p-8 text-center text-zinc-500">
                            {userSearch ? 'No matching users found.' : 'No registered users found.'}
                          </td>
                        </tr>
                      ) : (
                        filteredUsers.map((user) => {
                          const plan = safeText(user.subscription?.plan || user.subscription?.tier || 'free', 'free').toLowerCase();
                          const isPro = plan === 'pro';
                          const status = safeText(user.subscription?.status || 'active', 'active').toLowerCase();
                          const userName = safeText(user.name || user.fullName, 'User');
                          const userEmail = safeText(user.email, 'No email');
                          const dateStr = formatDate(user.createdAt);

                          return (
                            <tr key={user.id} className="hover:bg-zinc-800/40 transition">
                              <td className="p-4">
                                <div className="font-medium text-zinc-200">{userName}</div>
                                <div className="text-xs text-zinc-400">{userEmail}</div>
                              </td>
                              <td className="p-4 font-mono text-xs text-zinc-400 max-w-[140px] truncate" title={user.id}>{safeText(user.id)}</td>
                              <td className="p-4">
                                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                                  user.role === 'admin' 
                                    ? 'bg-purple-950/60 text-purple-300 border border-purple-800/50' 
                                    : 'bg-zinc-800 text-zinc-400'
                                }`}>
                                  {user.role === 'admin' ? 'Admin' : 'Member'}
                                </span>
                              </td>
                              <td className="p-4">
                                <div className="flex items-center gap-2">
                                  <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                                    isPro ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-zinc-800 text-zinc-400'
                                  }`}>
                                    {plan}
                                  </span>
                                  <span className="text-xs text-zinc-500 capitalize">({status})</span>
                                </div>
                              </td>
                              <td className="p-4 text-xs text-zinc-400">{dateStr}</td>
                              <td className="p-4 text-right">
                                <div className="inline-flex items-center gap-2">
                                  <button
                                    onClick={() => handleUpdateSubscription(user.id, isPro ? 'free' : 'pro')}
                                    disabled={actionLoading[`sub-${user.id}`]}
                                    className={`px-2.5 py-1 text-xs rounded-lg border transition font-medium disabled:opacity-50 ${
                                      isPro
                                        ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border-zinc-700'
                                        : 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30 border-amber-500/40'
                                    }`}
                                  >
                                    {actionLoading[`sub-${user.id}`] ? 'Saving...' : isPro ? 'Demote to Free' : 'Grant Pro'}
                                  </button>

                                  <button
                                    onClick={() => handleDeleteUser(user.id)}
                                    disabled={actionLoading[`user-${user.id}`]}
                                    className="px-2.5 py-1 text-xs bg-red-950/40 text-red-400 hover:bg-red-900/60 rounded-lg border border-red-800/40 transition font-medium disabled:opacity-50"
                                  >
                                    {actionLoading[`user-${user.id}`] ? '...' : 'Delete'}
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 4: SUBSCRIPTION MANAGEMENT */}
            {activeTab === 'subscriptions' && (
              <div className="space-y-6">
                <div className="bg-zinc-900/80 border border-zinc-800/80 rounded-2xl p-6">
                  <h2 className="text-lg font-semibold text-white mb-1">Subscription Overview & Plan Controls</h2>
                  <p className="text-sm text-zinc-400 mb-6">Manage user subscription plans, grant trials, or toggle feature limits directly.</p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {users.map(user => {
                      const plan = safeText(user.subscription?.plan || user.subscription?.tier || 'free', 'free').toLowerCase();
                      const isPro = plan === 'pro';
                      const status = safeText(user.subscription?.status || 'active', 'active').toLowerCase();
                      const userName = safeText(user.name || user.fullName, 'User');
                      const userEmail = safeText(user.email || user.id, 'N/A');

                      return (
                        <div key={user.id} className="p-4 bg-zinc-950/60 border border-zinc-800 rounded-xl space-y-3">
                          <div className="flex justify-between items-start">
                            <div>
                              <div className="font-semibold text-white text-sm">{userName}</div>
                              <div className="text-xs text-zinc-400 truncate max-w-[180px]">{userEmail}</div>
                            </div>
                            <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${
                              isPro ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-zinc-800 text-zinc-400'
                            }`}>
                              {plan}
                            </span>
                          </div>

                          <div className="text-xs text-zinc-400 flex justify-between border-t border-zinc-800/80 pt-2">
                            <span>Status: <strong className="text-zinc-200 capitalize">{status}</strong></span>
                            <span>Rooms: <strong className="text-zinc-200">{user.roomsCount || 0}</strong></span>
                          </div>

                          <div className="pt-1">
                            <button
                              onClick={() => handleUpdateSubscription(user.id, isPro ? 'free' : 'pro')}
                              disabled={actionLoading[`sub-${user.id}`]}
                              className={`w-full py-1.5 rounded-lg text-xs font-medium border transition disabled:opacity-50 ${
                                isPro
                                  ? 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700 border-zinc-700'
                                  : 'bg-amber-600/20 text-amber-300 hover:bg-amber-600/30 border-amber-500/40'
                              }`}
                            >
                              {actionLoading[`sub-${user.id}`] ? 'Updating...' : isPro ? 'Downgrade to Free' : 'Upgrade to Pro'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}