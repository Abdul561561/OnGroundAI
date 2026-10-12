import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Users,
  PhoneCall,
  Clock,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  ArrowRightLeft,
  Calendar,
  Filter,
  RefreshCw,
  UserCheck
} from 'lucide-react';
import { api } from '../../services/api';
import { SupervisorAgent, SupervisorMetrics, Contact, FollowUp } from '../../types';

export const SupervisorHub: React.FC = () => {
  const [agents, setAgents] = useState<SupervisorAgent[]>([]);
  const [metrics, setMetrics] = useState<SupervisorMetrics | null>(null);
  const [queues, setQueues] = useState<{
    unassigned_contacts_count: number;
    unassigned_contacts: Contact[];
    pending_follow_ups_count: number;
    pending_follow_ups: FollowUp[];
    active_calls_count: number;
  } | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'workforce' | 'queues' | 'metrics'>('workforce');

  // Reassignment Modal State
  const [reassignModal, setReassignModal] = useState<{
    itemType: 'contact' | 'follow_up';
    itemId: string;
    itemTitle: string;
  } | null>(null);
  const [selectedTargetAgent, setSelectedTargetAgent] = useState<string>('');
  const [isReassigning, setIsReassigning] = useState(false);

  useEffect(() => {
    loadSupervisorData();
  }, []);

  const loadSupervisorData = async () => {
    setIsLoading(true);
    try {
      const [agentList, metricsData, queuesData] = await Promise.all([
        api.getSupervisorAgents(),
        api.getSupervisorMetrics(),
        api.getSupervisorQueues(),
      ]);
      setAgents(agentList);
      setMetrics(metricsData);
      setQueues(queuesData);
      if (agentList.length > 0) {
        setSelectedTargetAgent(agentList[0].id);
      }
    } catch (err) {
      console.error('Failed to load supervisor data:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecuteReassign = async () => {
    if (!reassignModal || !selectedTargetAgent) return;
    setIsReassigning(true);
    try {
      await api.reassignItem(
        reassignModal.itemType,
        reassignModal.itemId,
        selectedTargetAgent
      );
      setReassignModal(null);
      loadSupervisorData();
    } catch (err: any) {
      alert(err.message || 'Failed to reassign workload.');
    } finally {
      setIsReassigning(false);
    }
  };

  const getPresenceColor = (presence: string, isOnline: boolean) => {
    if (!isOnline) return 'bg-slate-700 text-slate-300';
    switch (presence) {
      case 'available':
        return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
      case 'busy':
        return 'bg-rose-500/20 text-rose-400 border border-rose-500/30';
      case 'away':
        return 'bg-amber-500/20 text-amber-400 border border-amber-500/30';
      default:
        return 'bg-slate-800 text-slate-400';
    }
  };

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <ShieldCheck className="w-6 h-6 text-indigo-400" />
            Supervisor & Operations Command
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time workforce presence, workload balance, queue oversight, and operational metrics
          </p>
        </div>

        <button
          onClick={loadSupervisorData}
          disabled={isLoading}
          className="px-3.5 py-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-2 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Refresh Live Feeds</span>
        </button>
      </div>

      {/* KPI Metric Cards */}
      {metrics && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl shadow-lg">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
              <span>Total Volume</span>
              <PhoneCall className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="text-2xl font-bold text-white">{metrics.total_calls}</div>
            <div className="text-[11px] text-slate-500 mt-1">Total recorded customer calls</div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl shadow-lg">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
              <span>Resolution Rate</span>
              <CheckCircle className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold text-emerald-400">{metrics.answer_rate_pct}%</div>
            <div className="text-[11px] text-slate-500 mt-1">{metrics.completed_calls} successfully answered</div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl shadow-lg">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
              <span>Avg Handle Time</span>
              <Clock className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-bold text-amber-300">{metrics.average_handle_seconds}s</div>
            <div className="text-[11px] text-slate-500 mt-1">Mean duration per conversation</div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 p-4 rounded-xl shadow-lg">
            <div className="flex items-center justify-between text-slate-400 text-xs font-medium mb-1">
              <span>Active Queues</span>
              <AlertCircle className="w-4 h-4 text-rose-400" />
            </div>
            <div className="text-2xl font-bold text-white">
              {(queues?.unassigned_contacts_count || 0) + (queues?.pending_follow_ups_count || 0)}
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {queues?.pending_follow_ups_count || 0} follow-ups, {queues?.unassigned_contacts_count || 0} unassigned
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        {[
          { id: 'workforce', label: 'Agent Workforce & Presence', count: agents.length },
          { id: 'queues', label: 'Queue & Workload Reassign', count: (queues?.unassigned_contacts_count || 0) + (queues?.pending_follow_ups_count || 0) },
          { id: 'metrics', label: 'Call Outcomes & Analytics' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-2 ${
              activeTab === tab.id
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${activeTab === tab.id ? 'bg-indigo-700 text-indigo-100' : 'bg-slate-800 text-slate-400'}`}>
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab 1: Workforce Grid */}
      {activeTab === 'workforce' && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800/80 bg-slate-950/60 text-slate-400 text-[11px] uppercase tracking-wider font-semibold">
                  <th className="py-3.5 px-4">Staff Member</th>
                  <th className="py-3.5 px-4">Role</th>
                  <th className="py-3.5 px-4">Live Presence</th>
                  <th className="py-3.5 px-4">Assigned Customers</th>
                  <th className="py-3.5 px-4">Pending Follow-Ups</th>
                  <th className="py-3.5 px-4">Calls Handled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50">
                {agents.map((agent) => (
                  <tr key={agent.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 px-4 font-semibold text-white flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full bg-indigo-600/20 text-indigo-400 font-bold flex items-center justify-center text-xs">
                        {agent.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div>{agent.name}</div>
                        <div className="text-[10px] text-slate-500 font-normal">{agent.email}</div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 uppercase text-[10px] font-mono text-slate-400">
                      {agent.role}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-semibold capitalize ${getPresenceColor(agent.presence, agent.is_online)}`}>
                        {agent.is_online ? agent.presence : 'Offline'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-medium text-slate-200">
                      {agent.assigned_contacts}
                    </td>
                    <td className="py-3.5 px-4 font-mono font-medium text-slate-200">
                      <span className={agent.pending_follow_ups > 5 ? 'text-amber-400' : 'text-slate-300'}>
                        {agent.pending_follow_ups}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 font-mono font-medium text-slate-200">
                      {agent.calls_handled}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab 2: Queues & Reassignments */}
      {activeTab === 'queues' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Unassigned Contacts */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-400" />
                Unassigned Customer Contacts ({queues?.unassigned_contacts_count || 0})
              </h2>
            </div>

            {queues?.unassigned_contacts && queues.unassigned_contacts.length > 0 ? (
              <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                {queues.unassigned_contacts.map((c) => (
                  <div
                    key={c._id}
                    className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-xl flex items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="font-semibold text-white">{c.name}</div>
                      <div className="text-[11px] font-mono text-slate-400">{c.phone_number}</div>
                    </div>
                    <button
                      onClick={() => setReassignModal({
                        itemType: 'contact',
                        itemId: c._id,
                        itemTitle: `Contact: ${c.name}`
                      })}
                      className="px-2.5 py-1.5 bg-indigo-600/20 hover:bg-indigo-600 text-indigo-300 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border border-indigo-500/30"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                      <span>Assign</span>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 text-xs text-slate-500">
                All contacts are currently assigned to agents.
              </div>
            )}
          </div>

          {/* Pending Follow-Ups */}
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-amber-400" />
                Pending Follow-Up Tasks ({queues?.pending_follow_ups_count || 0})
              </h2>
            </div>

            {queues?.pending_follow_ups && queues.pending_follow_ups.length > 0 ? (
              <div className="space-y-2.5 max-h-96 overflow-y-auto pr-1">
                {queues.pending_follow_ups.map((fu) => (
                  <div
                    key={fu._id}
                    className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-xl flex items-start justify-between gap-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="font-medium text-slate-200">{fu.description}</div>
                      <div className="text-[10px] text-slate-500">
                        Assigned to: <span className="text-indigo-300">{fu.assigned_agent_name}</span> • Due: {new Date(fu.due_at).toLocaleDateString()}
                      </div>
                    </div>
                    <button
                      onClick={() => setReassignModal({
                        itemType: 'follow_up',
                        itemId: fu._id,
                        itemTitle: `Task: ${fu.description}`
                      })}
                      className="px-2.5 py-1.5 bg-amber-600/20 hover:bg-amber-600 text-amber-300 hover:text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors border border-amber-500/30 shrink-0"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                      <span>Reassign</span>
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-10 text-xs text-slate-500">
                No outstanding follow-up tasks in queue.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Call Outcomes & Analytics */}
      {activeTab === 'metrics' && metrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h2 className="text-sm font-bold text-white flex items-center gap-2 pb-3 border-b border-slate-800">
              <TrendingUp className="w-4 h-4 text-emerald-400" />
              Call Outcome Breakdown
            </h2>

            {Object.keys(metrics.outcomes).length > 0 ? (
              <div className="space-y-3">
                {Object.entries(metrics.outcomes).map(([outcome, count]) => {
                  const pct = Math.round((count / (metrics.total_calls || 1)) * 100);
                  return (
                    <div key={outcome} className="space-y-1 text-xs">
                      <div className="flex items-center justify-between text-slate-300">
                        <span className="capitalize font-medium">{outcome.replace('_', ' ')}</span>
                        <span className="font-mono text-slate-400">{count} calls ({pct}%)</span>
                      </div>
                      <div className="w-full bg-slate-950 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-8 text-center text-xs text-slate-500">
                No categorized call outcomes recorded yet.
              </div>
            )}
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <h2 className="text-sm font-bold text-white flex items-center gap-2 pb-3 border-b border-slate-800">
              <ShieldCheck className="w-4 h-4 text-indigo-400" />
              Operational Integrity Summary
            </h2>

            <div className="space-y-3 text-xs text-slate-300">
              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                <span className="font-semibold text-white">Truth-in-Calling Enforcement:</span>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Active policy prevents mock ringing, simulated connected states, or fabricated telephone numbers. PSTN calls strictly route through genuine carrier gateways when credentials are supplied.
                </p>
              </div>

              <div className="p-3 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                <span className="font-semibold text-white">AI Copilot Grounding:</span>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Agent Assist and Text AI are grounded in real customer MongoDB documents and past call notes via OpenRouter LLM context injection.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Workload Reassign Modal */}
      {reassignModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-indigo-400" />
                Reassign Item Workload
              </h3>
              <button onClick={() => setReassignModal(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>

            <p className="text-xs text-slate-300 font-medium">
              Target Item: <span className="text-indigo-300">{reassignModal.itemTitle}</span>
            </p>

            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">Assign to Staff Agent</label>
              <select
                value={selectedTargetAgent}
                onChange={(e) => setSelectedTargetAgent(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2.5 text-xs text-white focus:outline-none focus:border-indigo-500"
              >
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.role}) — {a.assigned_contacts} contacts
                  </option>
                ))}
              </select>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setReassignModal(null)}
                className="px-4 py-2 rounded-lg border border-slate-800 text-slate-400 hover:text-white text-xs"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isReassigning}
                onClick={handleExecuteReassign}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold"
              >
                {isReassigning ? 'Reassigning...' : 'Confirm Assignment'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
