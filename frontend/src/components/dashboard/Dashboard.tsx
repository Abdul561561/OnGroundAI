import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCall } from '../../context/CallContext';
import { api } from '../../services/api';
import { CallRecord, Conversation, Contact, FollowUp, TelephonyStatus } from '../../types';
import {
  Users,
  PhoneCall,
  Phone,
  MessageSquare,
  Mic,
  Clock,
  ArrowUpRight,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Sparkles,
  Calendar,
  AlertTriangle
} from 'lucide-react';
import { TabType } from '../layout/Sidebar';

interface DashboardProps {
  onNavigate: (tab: TabType) => void;
  onSelectContactForCall?: (phoneNumber: string, contact: Contact) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onNavigate, onSelectContactForCall }) => {
  const { user } = useAuth();
  const { onlineUserIds, activeCall } = useCall();
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [carrierStatus, setCarrierStatus] = useState<TelephonyStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchDashboardData = async () => {
    setLoading(true);
    try {
      const [callsRes, contactsRes, followUpsRes, carrierRes] = await Promise.allSettled([
        api.getCalls(),
        api.getContacts(undefined, undefined, true), // My assigned contacts
        api.getFollowUps('pending'),
        api.getTelephonyStatus(),
      ]);

      if (callsRes.status === 'fulfilled') setCalls(callsRes.value);
      if (contactsRes.status === 'fulfilled') setContacts(contactsRes.value);
      if (followUpsRes.status === 'fulfilled') setFollowUps(followUpsRes.value);
      if (carrierRes.status === 'fulfilled') setCarrierStatus(carrierRes.value);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs.toString().padStart(2, '0')}s`;
  };

  const getOutcomeBadge = (outcome?: string) => {
    if (!outcome) return null;
    return (
      <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold capitalize bg-indigo-500/10 text-indigo-300 border border-indigo-500/30">
        {outcome.replace('_', ' ')}
      </span>
    );
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Welcome & Shift Overview Banner */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 p-6 rounded-2xl border border-slate-800 shadow-xl">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              Agent Workspace & Operations Hub
            </h1>
            <span className="px-2.5 py-0.5 text-[11px] font-semibold rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Shift Active
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400">
            Intelligent call-centre operations: customer CRM, click-to-call softphone, real-time agent assist, and spoken Voice AI.
          </p>
        </div>
        <button
          onClick={fetchDashboardData}
          disabled={loading}
          className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold px-3.5 py-2 rounded-xl transition-all border border-slate-700/60"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Live Data</span>
        </button>
      </div>

      {/* Real Workload & Operational Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Assigned Customers */}
        <div
          onClick={() => onNavigate('crm')}
          className="bg-slate-900/70 border border-slate-800 hover:border-indigo-500/40 p-4 rounded-2xl shadow-sm cursor-pointer transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400">Assigned Customers</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">{contacts.length}</div>
          <p className="text-[11px] text-slate-500 mt-1">CRM directory profiles</p>
        </div>

        {/* Pending Follow-Ups */}
        <div
          onClick={() => onNavigate('crm')}
          className="bg-slate-900/70 border border-slate-800 hover:border-amber-500/40 p-4 rounded-2xl shadow-sm cursor-pointer transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400">Pending Follow-Ups</span>
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-amber-400 tracking-tight">{followUps.length}</div>
          <p className="text-[11px] text-slate-500 mt-1">Scheduled callbacks & tasks</p>
        </div>

        {/* Calls Handled */}
        <div
          onClick={() => onNavigate('history')}
          className="bg-slate-900/70 border border-slate-800 hover:border-cyan-500/40 p-4 rounded-2xl shadow-sm cursor-pointer transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400">Call Logs & Audits</span>
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center">
              <PhoneCall className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">{calls.length}</div>
          <p className="text-[11px] text-slate-500 mt-1">MongoDB Atlas records</p>
        </div>

        {/* Carrier Status */}
        <div
          onClick={() => onNavigate('softphone')}
          className="bg-slate-900/70 border border-slate-800 hover:border-emerald-500/40 p-4 rounded-2xl shadow-sm cursor-pointer transition-all"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-slate-400">PSTN Carrier</span>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              carrierStatus?.is_configured ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
            }`}>
              {carrierStatus?.is_configured ? <ShieldCheck className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
            </div>
          </div>
          <div className="text-sm font-bold text-white truncate">
            {carrierStatus?.is_configured ? 'Connected' : 'Zero-Payment Mode'}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {carrierStatus?.provider === 'twilio' ? 'Twilio Telecom' : 'Simulated dialing disabled'}
          </p>
        </div>
      </div>

      {/* Main Action Workflows */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Staff Intercom WebRTC Calling */}
        <div
          onClick={() => onNavigate('calls')}
          className="group cursor-pointer bg-gradient-to-b from-slate-900 to-emerald-950/20 border border-slate-800 hover:border-emerald-500/50 p-5 rounded-2xl transition-all shadow-md hover:shadow-emerald-500/10 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                <PhoneCall className="w-5 h-5" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors" />
            </div>
            <div className="flex items-center gap-1.5 mb-1">
              <h3 className="font-semibold text-white text-sm">Staff Intercom</h3>
              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                P2P
              </span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Live two-way WebRTC microphone audio calling between staff browser sessions.
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-800/80 flex items-center gap-1.5 text-[10px] text-emerald-400 font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>{onlineUserIds.size} Colleagues Online</span>
          </div>
        </div>

        {/* Softphone Dialer */}
        <div
          onClick={() => onNavigate('softphone')}
          className="group cursor-pointer bg-gradient-to-b from-slate-900 to-indigo-950/20 border border-slate-800 hover:border-indigo-500/50 p-5 rounded-2xl transition-all shadow-md hover:shadow-indigo-500/10 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                <Phone className="w-5 h-5" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-indigo-400 transition-colors" />
            </div>
            <h3 className="font-semibold text-white text-sm mb-1">Softphone Dialer</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              E.164 telephone keypad with DTMF audio tones, live call timer, and wrap-up outcome logger.
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-800/80 text-[10px] text-slate-500">
            PSTN Carrier: {carrierStatus?.is_configured ? 'Configured' : 'Unconfigured'}
          </div>
        </div>

        {/* Customer CRM */}
        <div
          onClick={() => onNavigate('crm')}
          className="group cursor-pointer bg-gradient-to-b from-slate-900 to-blue-950/20 border border-slate-800 hover:border-blue-500/50 p-5 rounded-2xl transition-all shadow-md hover:shadow-blue-500/10 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600/20 text-blue-400 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors">
                <Users className="w-5 h-5" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-blue-400 transition-colors" />
            </div>
            <h3 className="font-semibold text-white text-sm mb-1">Customer CRM</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Search customers by phone number or name with 1-click Click-to-Call and interaction history.
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-800/80 text-[10px] text-slate-500">
            {contacts.length} Customers Available
          </div>
        </div>

        {/* Agent Assist AI */}
        <div
          onClick={() => onNavigate('agent_assist')}
          className="group cursor-pointer bg-gradient-to-b from-slate-900 to-purple-950/20 border border-slate-800 hover:border-purple-500/50 p-5 rounded-2xl transition-all shadow-md hover:shadow-purple-500/10 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center group-hover:bg-purple-600 group-hover:text-white transition-colors">
                <Sparkles className="w-5 h-5" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-purple-400 transition-colors" />
            </div>
            <h3 className="font-semibold text-white text-sm mb-1">Agent Assist AI</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Real-time copilot extracting customer objections, suggesting immediate spoken replies, and action items.
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-800/80 text-[10px] text-slate-500">
            OpenRouter LLM Ready
          </div>
        </div>

        {/* Spoken Voice AI */}
        <div
          onClick={() => onNavigate('voice_ai')}
          className="group cursor-pointer bg-gradient-to-b from-slate-900 to-cyan-950/20 border border-slate-800 hover:border-cyan-500/50 p-5 rounded-2xl transition-all shadow-md hover:shadow-cyan-500/10 flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-600/20 text-cyan-400 flex items-center justify-center group-hover:bg-cyan-600 group-hover:text-white transition-colors">
                <Mic className="w-5 h-5" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-500 group-hover:text-cyan-400 transition-colors" />
            </div>
            <h3 className="font-semibold text-white text-sm mb-1">Spoken Voice AI</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Interactive AI conversation utilizing real microphone speech recognition and natural spoken synthesis.
            </p>
          </div>
          <div className="mt-3 pt-2 border-t border-slate-800/80 text-[10px] text-slate-500">
            Browser Web Speech API
          </div>
        </div>
      </div>

      {/* Two Column Layout: Assigned Customers & Recent Call Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Assigned Customers Quick Queue */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-bold text-white">My Assigned Customers</h2>
            </div>
            <button
              onClick={() => onNavigate('crm')}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-medium"
            >
              View CRM →
            </button>
          </div>

          {contacts.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-500 space-y-1">
              <p>No customers assigned to you yet.</p>
              <p className="text-[11px] text-slate-600">Create customers in CRM or request assignments from a supervisor.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {contacts.map((c) => (
                <div
                  key={c._id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-800/40 border border-slate-800 hover:border-slate-700 transition-colors"
                >
                  <div>
                    <p className="text-xs font-semibold text-slate-200">{c.name}</p>
                    <p className="text-[10px] font-mono text-slate-400">{c.phone_number}</p>
                  </div>
                  {onSelectContactForCall && (
                    <button
                      onClick={() => onSelectContactForCall(c.phone_number, c)}
                      className="px-2 py-1 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white rounded text-[11px] font-medium transition-colors border border-emerald-500/30 flex items-center gap-1"
                    >
                      <Phone className="w-3 h-3" />
                      <span>Call</span>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Call Records Table */}
        <div className="lg:col-span-2 bg-slate-900/70 border border-slate-800 rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <PhoneCall className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-bold text-white">Recent Call Activity & Outcomes</h2>
            </div>
            <button
              onClick={() => onNavigate('history')}
              className="text-xs text-indigo-400 hover:text-indigo-300 font-semibold"
            >
              View Full History →
            </button>
          </div>

          {calls.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-xs space-y-1">
              <p>No call history recorded yet.</p>
              <p className="text-[11px] text-slate-600">
                Calls placed with the Softphone or Intercom will appear here with duration, outcomes, and AI summaries.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-800 pb-2">
                    <th className="py-2 font-medium">Customer / Recipient</th>
                    <th className="py-2 font-medium">Outcome</th>
                    <th className="py-2 font-medium">Duration</th>
                    <th className="py-2 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {calls.slice(0, 6).map((c) => (
                    <tr key={c._id} className="hover:bg-slate-800/30">
                      <td className="py-3 text-slate-200 font-medium">
                        {c.contact_name || c.recipient_name || c.recipient_number || 'External Phone'}
                      </td>
                      <td className="py-3">
                        {getOutcomeBadge(c.outcome) || (
                          <span className="text-[10px] text-slate-500 capitalize">{c.status}</span>
                        )}
                      </td>
                      <td className="py-3 text-slate-300">
                        {c.duration_seconds ? formatDuration(c.duration_seconds) : '—'}
                      </td>
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
