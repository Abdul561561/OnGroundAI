import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCall } from '../../context/CallContext';
import { api } from '../../services/api';
import { CallRecord, Conversation, User } from '../../types';
import {
  Users,
  PhoneCall,
  MessageSquare,
  Mic,
  Clock,
  ArrowUpRight,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { TabType } from '../layout/Sidebar';

interface DashboardProps {
  onNavigate: (tab: TabType) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate }) => {
  const { user } = useAuth();
  const { onlineUserIds, activeCall } = useCall();
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [directoryUsers, setDirectoryUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [callsRes, convsRes, usersRes] = await Promise.allSettled([
        api.getCalls(),
        api.getConversations(),
        api.getUsers(),
      ]);

      if (callsRes.status === 'fulfilled') setCalls(callsRes.value);
      if (convsRes.status === 'fulfilled') setConversations(convsRes.value);
      if (usersRes.status === 'fulfilled') setDirectoryUsers(usersRes.value);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const onlineAgentsCount = directoryUsers.filter((u) => onlineUserIds.has(u._id)).length + (user ? 1 : 0);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'connected':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" /> Connected
          </span>
        );
      case 'ended':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-300 bg-slate-800 px-2 py-0.5 rounded-full border border-slate-700">
            <Clock className="w-3 h-3 text-slate-400" /> Completed
          </span>
        );
      case 'rejected':
      case 'missed':
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-400 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/20">
            <XCircle className="w-3 h-3" /> {status}
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded-full border border-amber-500/20">
            <AlertCircle className="w-3 h-3" /> {status}
          </span>
        );
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Welcome Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-blue-950/40 to-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Call-Centre Command Hub
            </h1>
            <span className="px-2 py-0.5 text-[11px] font-semibold rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Live Atlas Connected
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400">
            Real-time human calling with WebRTC, automated AI dialogue, and persistent session intelligence.
          </p>
        </div>
        <button
          onClick={fetchDashboardData}
          disabled={loading}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3 py-2 rounded-xl transition-all border border-slate-700/60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Sync Real Data</span>
        </button>
      </div>

      {/* Real Statistics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/70 border border-slate-800 p-4 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400">Online Agents</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">{onlineAgentsCount}</div>
          <p className="text-[11px] text-slate-500 mt-1">Live WebSocket presence</p>
        </div>

        <div className="bg-slate-900/70 border border-slate-800 p-4 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400">Active WebRTC Call</span>
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 text-blue-400 flex items-center justify-center">
              <PhoneCall className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">
            {activeCall && activeCall.state === 'connected' ? '1' : '0'}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {activeCall && activeCall.state === 'connected' ? `In call with ${activeCall.peerName}` : 'Idle channel'}
          </p>
        </div>

        <div className="bg-slate-900/70 border border-slate-800 p-4 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400">Total Calls Logged</span>
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">{calls.length}</div>
          <p className="text-[11px] text-slate-500 mt-1">MongoDB Atlas records</p>
        </div>

        <div className="bg-slate-900/70 border border-slate-800 p-4 rounded-2xl shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400">AI Conversations</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <MessageSquare className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">{conversations.length}</div>
          <p className="text-[11px] text-slate-500 mt-1">OpenRouter sessions</p>
        </div>
      </div>

      {/* Quick Launch Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div
          onClick={() => onNavigate('voice_ai')}
          className="group cursor-pointer bg-gradient-to-b from-slate-900 to-blue-950/20 border border-slate-800 hover:border-blue-500/50 p-5 rounded-2xl transition-all shadow-md hover:shadow-blue-500/10"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
              <Mic className="w-5 h-5" />
            </div>
            <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-blue-400 transition-colors" />
          </div>
          <h3 className="font-semibold text-white text-sm mb-1">AI Voice Assistant</h3>
          <p className="text-xs text-slate-400">
            Real spoken audio dialogue using your microphone and OpenRouter LLM.
          </p>
        </div>

        <div
          onClick={() => onNavigate('text_ai')}
          className="group cursor-pointer bg-gradient-to-b from-slate-900 to-indigo-950/20 border border-slate-800 hover:border-indigo-500/50 p-5 rounded-2xl transition-all shadow-md hover:shadow-indigo-500/10"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
              <MessageSquare className="w-5 h-5" />
            </div>
            <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition-colors" />
          </div>
          <h3 className="font-semibold text-white text-sm mb-1">AI Text Intelligence</h3>
          <p className="text-xs text-slate-400">
            Multi-turn contextual chat powered by OpenRouter free-tier LLM models.
          </p>
        </div>

        <div
          onClick={() => onNavigate('calls')}
          className="group cursor-pointer bg-gradient-to-b from-slate-900 to-cyan-950/20 border border-slate-800 hover:border-cyan-500/50 p-5 rounded-2xl transition-all shadow-md hover:shadow-cyan-500/10"
        >
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-600/20 text-cyan-400 flex items-center justify-center group-hover:bg-cyan-600 group-hover:text-white transition-colors">
              <PhoneCall className="w-5 h-5" />
            </div>
            <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors" />
          </div>
          <h3 className="font-semibold text-white text-sm mb-1">WebRTC Calling</h3>
          <p className="text-xs text-slate-400">
            Browser-to-browser live 2-way microphone calls with peer directory.
          </p>
        </div>
      </div>

      {/* Two Column Layout: Agents Directory & Recent Call Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Agent Availability Card */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-400" />
              <h2 className="text-sm font-bold text-white">Agent Directory</h2>
            </div>
            <span className="text-[11px] text-slate-500">{directoryUsers.length} registered</span>
          </div>

          {directoryUsers.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-500 space-y-2">
              <p>No other colleagues registered yet.</p>
              <p className="text-[11px] text-slate-600">
                Tip: Open an Incognito window to register a second user and test 2-way WebRTC calling.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {directoryUsers.map((u) => {
                const isOnline = onlineUserIds.has(u._id);
                return (
                  <div
                    key={u._id}
                    className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/40 border border-slate-800 hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="relative">
                        <div className="w-8 h-8 rounded-lg bg-blue-600/20 text-blue-400 font-bold text-xs flex items-center justify-center">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <span
                          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${
                            isOnline ? 'bg-emerald-400' : 'bg-slate-500'
                          }`}
                        />
                      </div>
                      <div>
                        <p className="text-xs font-semibold text-slate-200">{u.name}</p>
                        <p className="text-[10px] text-slate-400">{u.email}</p>
                      </div>
                    </div>
                    <span className="text-[10px] font-medium text-slate-400">
                      {isOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Recent Call Records Table */}
        <div className="lg:col-span-2 bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <PhoneCall className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-bold text-white">Recent Call Activity</h2>
            </div>
            <button
              onClick={() => onNavigate('history')}
              className="text-xs text-blue-400 hover:text-blue-300 font-semibold"
            >
              View Full History →
            </button>
          </div>

          {calls.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs space-y-1">
              <p>No call history recorded yet.</p>
              <p className="text-[11px] text-slate-600">
                Calls initiated from the Human Calls directory will appear here with duration and transcripts.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-800 pb-2">
                    <th className="py-2 font-medium">Participants</th>
                    <th className="py-2 font-medium">Type</th>
                    <th className="py-2 font-medium">Duration</th>
                    <th className="py-2 font-medium">Status</th>
                    <th className="py-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {calls.slice(0, 5).map((c) => (
                    <tr key={c._id} className="hover:bg-slate-800/30">
                      <td className="py-3 text-slate-200 font-medium">
                        {c.caller_name || 'Caller'} → {c.recipient_name || 'Recipient'}
                      </td>
                      <td className="py-3 text-slate-400 uppercase text-[10px] font-semibold tracking-wider">
                        {c.call_type}
                      </td>
                      <td className="py-3 text-slate-300">
                        {c.duration_seconds ? formatDuration(c.duration_seconds) : '—'}
                      </td>
                      <td className="py-3">{getStatusBadge(c.status)}</td>
                      <td className="py-3 text-slate-400 text-[11px]">
                        {new Date(c.started_at).toLocaleDateString([], {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
