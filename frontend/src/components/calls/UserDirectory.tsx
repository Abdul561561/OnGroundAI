import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useCall } from '../../context/CallContext';
import { User } from '../../types';
import {
  Users,
  Phone,
  Search,
  RefreshCw,
  Info,
  Shield,
  CheckCircle,
  ExternalLink,
} from 'lucide-react';

export const UserDirectory: React.FC = () => {
  const { user } = useAuth();
  const { onlineUserIds, startCall, activeCall } = useCall();
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const list = await api.getUsers();
      setUsers(list);
    } catch (e) {
      console.error('Error fetching user directory:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const filteredUsers = users.filter((u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Human Calls Directory
            </h1>
            <span className="px-2 py-0.5 text-[10px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 rounded-full flex items-center gap-1">
              <Shield className="w-3 h-3" /> WebRTC P2P Audio
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Browser-to-browser voice calling between authenticated platform users over encrypted WebRTC media streams.
          </p>
        </div>

        <button
          onClick={fetchUsers}
          disabled={loading}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 rounded-xl transition-all border border-slate-700/60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Directory</span>
        </button>
      </div>

      {/* Peer Testing Instructions Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-950/40 via-slate-900 to-blue-950/40 border border-blue-500/20 flex items-start gap-3.5 text-xs text-slate-300">
        <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-white">How to test 2-way WebRTC calling locally:</p>
          <p className="text-slate-400 leading-relaxed">
            1. Open an <strong>Incognito or Private window</strong> in your browser (or another browser like Edge / Chrome).
            <br />
            2. Go to <code>http://localhost:5173</code> and register a second account (e.g., <em>Agent Bob</em>).
            <br />
            3. Both users will immediately appear <strong>Online</strong> in this directory. Click <strong>Call</strong> to initiate an authentic two-way WebRTC audio stream!
          </p>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative">
        <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by agent name or email..."
          className="w-full bg-slate-900/80 border border-slate-800 rounded-2xl pl-10 pr-4 py-3 text-xs sm:text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
        />
      </div>

      {/* Directory Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredUsers.length === 0 ? (
          <div className="col-span-full bg-slate-900/50 border border-slate-800 rounded-2xl p-8 text-center space-y-2">
            <Users className="w-8 h-8 text-slate-600 mx-auto" />
            <h3 className="text-sm font-semibold text-slate-300">No other users found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              You are currently the only registered user in this workspace. Register a second account in another browser window to test live calling.
            </p>
          </div>
        ) : (
          filteredUsers.map((u) => {
            const isOnline = onlineUserIds.has(u._id);
            const isCallInProgress = Boolean(activeCall);

            return (
              <div
                key={u._id}
                className="bg-slate-900/70 border border-slate-800 hover:border-slate-700/80 rounded-2xl p-4 flex items-center justify-between transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-cyan-600/30 to-blue-600/30 text-cyan-300 font-bold text-sm flex items-center justify-center border border-cyan-500/20">
                      {u.name.charAt(0).toUpperCase()}
                    </div>
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-slate-900 ${
                        isOnline ? 'bg-emerald-400' : 'bg-slate-600'
                      }`}
                      title={isOnline ? 'Online via WebSocket' : 'Offline'}
                    />
                  </div>
                  <div>
                    <h3 className="font-semibold text-white text-sm">{u.name}</h3>
                    <p className="text-xs text-slate-400">{u.email}</p>
                    <span className="text-[10px] text-slate-500 inline-flex items-center gap-1 mt-0.5">
                      <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                      {isOnline ? 'Available for WebRTC Call' : 'Offline'}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => startCall(u._id, u.name)}
                  disabled={!isOnline || isCallInProgress}
                  className="flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:from-slate-800 disabled:to-slate-800 text-white disabled:text-slate-600 text-xs font-semibold px-4 py-2.5 rounded-xl transition-all shadow-md shadow-emerald-600/20 disabled:shadow-none cursor-pointer disabled:cursor-not-allowed"
                >
                  <Phone className="w-3.5 h-3.5" />
                  <span>Call</span>
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
