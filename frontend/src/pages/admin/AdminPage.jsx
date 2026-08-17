import React, { useEffect, useState } from 'react';
import api from '@/services/api';

export default function AdminPage() {
  const [stats, setStats] = useState({ usersCount: 0, roomsCount: 0, activeSubsCount: 0 });
  const [rooms, setRooms] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [statsRes, roomsRes] = await Promise.all([
        api.get('/admin/stats'),
        api.get('/admin/rooms'),
      ]);
      setStats(statsRes.data);
      setRooms(roomsRes.data);
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteRoom = async (roomId) => {
    if (!confirm('Are you sure you want to terminate this room?')) return;
    try {
      await api.delete(`/admin/rooms/${roomId}`);
      setRooms((prev) => prev.filter((r) => r.id !== roomId));
    } catch (err) {
      alert('Failed to delete room');
    }
  };

  return (
    <div className="p-8 max-w-6xl mx-auto text-zinc-100">
      <h1 className="text-3xl font-bold mb-6 text-zinc-50">Admin Control Panel</h1>

      {/* Tabs */}
      <div className="flex gap-4 border-b border-zinc-800 pb-4 mb-6">
        <button
          onClick={() => setActiveTab('overview')}
          className={`px-4 py-2 rounded-md font-medium transition ${
            activeTab === 'overview'
              ? 'bg-zinc-800 text-white'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('rooms')}
          className={`px-4 py-2 rounded-md font-medium transition ${
            activeTab === 'rooms'
              ? 'bg-zinc-800 text-white'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          Rooms Management
        </button>
      </div>

      {loading ? (
        <div className="text-zinc-400">Loading admin panel...</div>
      ) : (
        <>
          {/* TAB 1: OVERVIEW STATS */}
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl">
                <h3 className="text-zinc-400 text-sm font-medium">Total Users</h3>
                <p className="text-3xl font-bold mt-2 text-zinc-100">{stats.usersCount}</p>
              </div>
              <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl">
                <h3 className="text-zinc-400 text-sm font-medium">Active Rooms</h3>
                <p className="text-3xl font-bold mt-2 text-zinc-100">{stats.roomsCount}</p>
              </div>
              <div className="p-6 bg-zinc-900 border border-zinc-800 rounded-xl">
                <h3 className="text-zinc-400 text-sm font-medium">Active Subscriptions</h3>
                <p className="text-3xl font-bold mt-2 text-zinc-100">{stats.activeSubsCount}</p>
              </div>
            </div>
          )}

          {/* TAB 2: ROOM MANAGEMENT */}
          {activeTab === 'rooms' && (
            <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 bg-zinc-900/50 text-zinc-400 text-sm">
                    <th className="p-4">Room ID</th>
                    <th className="p-4">Created At</th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800">
                  {rooms.length === 0 ? (
                    <tr>
                      <td colSpan="3" className="p-4 text-center text-zinc-500">
                        No active rooms found.
                      </td>
                    </tr>
                  ) : (
                    rooms.map((room) => (
                      <tr key={room.id} className="hover:bg-zinc-800/50">
                        <td className="p-4 font-mono text-sm">{room.id}</td>
                        <td className="p-4 text-zinc-400 text-sm">{room.createdAt || 'N/A'}</td>
                        <td className="p-4 text-right">
                          <button
                            onClick={() => handleDeleteRoom(room.id)}
                            className="px-3 py-1 text-xs bg-red-600/20 text-red-400 hover:bg-red-600/30 rounded border border-red-500/30 transition"
                          >
                            Terminate Room
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}