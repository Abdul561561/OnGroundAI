import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCall } from '../../context/CallContext';
import { api } from '../../services/api';
import { QueueTicket, SupervisorAgent, CallRecord, Contact } from '../../types';
import {
  Radio,
  PhoneCall,
  Users,
  Bot,
  AlertTriangle,
  Clock,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  RefreshCw,
  Phone,
  Sparkles,
  ExternalLink,
  UserCheck,
  PhoneIncoming,
  Activity
} from 'lucide-react';
import { TabType } from '../layout/Sidebar';

interface LiveCallCentreProps {
  onNavigate: (tab: TabType) => void;
  onSelectForCall?: (phoneNumber: string, contact?: Contact) => void;
}

export const LiveCallCentre: React.FC<LiveCallCentreProps> = ({ onNavigate, onSelectForCall }) => {
  const { user } = useAuth();
  const { onlineUserIds, activeCall, startCall } = useCall();

  const [queues, setQueues] = useState<QueueTicket[]>([]);
  const [agents, setAgents] = useState<SupervisorAgent[]>([]);
  const [recentCalls, setRecentCalls] = useState<CallRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [claimingTicketId, setClaimingTicketId] = useState<string | null>(null);

  const fetchLiveOpsData = async () => {
    setIsLoading(true);
    try {
      const [qRes, aRes, cRes] = await Promise.allSettled([
        api.getQueues(),
        api.getSupervisorAgents(),
        api.getCalls(),
      ]);

      if (qRes.status === 'fulfilled') setQueues(qRes.value);
      if (aRes.status === 'fulfilled') setAgents(aRes.value);
      if (cRes.status === 'fulfilled') setRecentCalls(cRes.value.slice(0, 8));
    } catch (e) {
      console.error('Error fetching live operations data:', e);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLiveOpsData();
    const interval = setInterval(fetchLiveOpsData, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleClaimTicket = async (ticket: QueueTicket) => {
    setClaimingTicketId(ticket._id);
    try {
      await api.claimQueueTicket(ticket._id);
      fetchLiveOpsData();
      if (ticket.customer_phone && onSelectForCall) {
        onSelectForCall(ticket.customer_phone);
      }
    } catch (err: any) {
      alert(`Could not claim ticket: ${err.message}`);
    } finally {
      setClaimingTicketId(null);
    }
  };

  const waitingTickets = queues.filter((q) => q.status === 'waiting');
  const escalations = waitingTickets.filter((q) => q.queue_type === 'ai_escalation');
  const availableAgents = agents.filter((a) => a.is_online && a.presence === 'available');

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950/60 to-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              <Radio className="w-6 h-6 text-indigo-400 animate-pulse" />
              Live Contact Centre Operations
            </h1>
            <span className="px-2.5 py-0.5 text-[11px] font-semibold rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
              <Activity className="w-3.5 h-3.5" /> Real-Time Engine Active
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400">
            Real-time unified command room: incoming queue dispatcher, AI-to-human escalations, active peer lines, and agent workforce routing.
          </p>
        </div>

        <button
          onClick={fetchLiveOpsData}
          disabled={isLoading}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-4 py-2.5 rounded-xl transition-all border border-slate-700/60 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Live Feeds</span>
        </button>
      </div>

      {/* Real-Time Operational Telemetry Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Waiting in Queue */}
        <div
          onClick={() => onNavigate('queues')}
          className="bg-slate-900/80 border border-slate-800 hover:border-amber-500/40 p-4 rounded-2xl shadow-sm cursor-pointer transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400">Calls in Queue</span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <PhoneIncoming className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-400 tracking-tight">{waitingTickets.length}</div>
          <p className="text-[11px] text-slate-500 mt-1">
            {escalations.length} AI handoff escalations waiting
          </p>
        </div>

        {/* Available Agents */}
        <div
          onClick={() => onNavigate('supervisor')}
          className="bg-slate-900/80 border border-slate-800 hover:border-emerald-500/40 p-4 rounded-2xl shadow-sm cursor-pointer transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400">Available Agents</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-400 tracking-tight">
            {availableAgents.length} <span className="text-xs font-normal text-slate-500">/ {agents.length}</span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">Ready for inbound routing</p>
        </div>

        {/* AI Voice Agent Status */}
        <div
          onClick={() => onNavigate('voice_ai')}
          className="bg-slate-900/80 border border-slate-800 hover:border-indigo-500/40 p-4 rounded-2xl shadow-sm cursor-pointer transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400">AI Voice Agents</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-indigo-400 tracking-tight">Online</div>
          <p className="text-[11px] text-slate-500 mt-1">OpenRouter Speech Engine Active</p>
        </div>

        {/* Active Line Status */}
        <div
          onClick={() => onNavigate('calls')}
          className="bg-slate-900/80 border border-slate-800 hover:border-cyan-500/40 p-4 rounded-2xl shadow-sm cursor-pointer transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400">Active Intercom</span>
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
              <PhoneCall className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-cyan-400 tracking-tight">
            {activeCall ? '1 Connected' : 'Standby'}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">P2P WebRTC duplex audio</p>
        </div>
      </div>

      {/* Main Grid: Priority Queues & Agent Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Priority Incoming & Escalated Queue (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <PhoneIncoming className="w-4 h-4 text-amber-400" />
              Live Incoming Queue & Escalations ({waitingTickets.length})
            </h2>
            <button
              onClick={() => onNavigate('queues')}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 cursor-pointer"
            >
              <span>View Full Queue</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {waitingTickets.length === 0 ? (
            <div className="bg-slate-900/40 border border-slate-800/80 rounded-2xl p-8 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 mx-auto flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <p className="text-sm font-semibold text-white">Queue is Clear</p>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                No customer calls or AI escalations waiting. All inbound lines and AI conversations are fully attended.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {waitingTickets.map((ticket) => (
                <div
                  key={ticket._id}
                  className="bg-slate-900 border border-slate-800 hover:border-slate-700 p-4 rounded-2xl space-y-3 shadow-md transition-all"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-sm">{ticket.customer_name}</span>
                        {ticket.queue_type === 'ai_escalation' ? (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-rose-500/15 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                            <Bot className="w-3 h-3" /> AI Escalation
                          </span>
                        ) : (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
                            Inbound Queue
                          </span>
                        )}
                        <span className="text-[10px] font-semibold text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Wait: {ticket.wait_time_seconds}s
                        </span>
                      </div>
                      <p className="text-xs text-slate-300">{ticket.reason || 'General inquiry'}</p>
                    </div>

                    <button
                      onClick={() => handleClaimTicket(ticket)}
                      disabled={claimingTicketId === ticket._id}
                      className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold px-3 py-1.5 rounded-xl shadow-md transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>{claimingTicketId === ticket._id ? 'Connecting...' : 'Claim & Answer'}</span>
                    </button>
                  </div>

                  {ticket.transcript_summary && (
                    <div className="bg-slate-950/70 p-2.5 rounded-xl border border-slate-800/80 text-[11px] text-slate-400">
                      <span className="text-indigo-400 font-semibold">AI Context Summary: </span>
                      {ticket.transcript_summary}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right: Live Agent Workforce Matrix (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-400" />
              Staff Workforce Roster ({agents.length})
            </h2>
            <button
              onClick={() => onNavigate('supervisor')}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 cursor-pointer"
            >
              <span>Workforce Hub</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-3 divide-y divide-slate-800/60 max-h-[420px] overflow-y-auto">
            {agents.map((ag) => (
              <div key={ag.id} className="py-2.5 px-2 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <div className="w-8 h-8 rounded-xl bg-slate-800 text-slate-200 font-bold flex items-center justify-center text-xs">
                      {ag.name.substring(0, 2).toUpperCase()}
                    </div>
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-slate-900 ${
                        ag.is_online ? 'bg-emerald-400' : 'bg-slate-500'
                      }`}
                    />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-white">{ag.name}</p>
                    <p className="text-[10px] text-slate-400 capitalize">{ag.role} • {ag.presence}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-700/50">
                    {ag.calls_handled} calls
                  </span>
                  {ag.is_online && ag.id !== user?._id && (
                    <button
                      onClick={() => startCall(ag.id, ag.name)}
                      className="p-1.5 rounded-lg bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/40 transition-all cursor-pointer"
                      title={`Call ${ag.name} via WebRTC Intercom`}
                    >
                      <PhoneCall className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
