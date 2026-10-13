import React, { useState, useEffect } from 'react';
import { api } from '../../services/api';
import { AnalyticsOverview } from '../../types';
import {
  BarChart3,
  TrendingUp,
  Clock,
  PhoneCall,
  Bot,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Users,
  ShieldCheck,
  Radio,
  FileCheck2,
  PieChart,
} from 'lucide-react';

export const AnalyticsReports: React.FC = () => {
  const [data, setData] = useState<AnalyticsOverview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState<Date>(new Date());
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await api.getAnalyticsOverview();
      setData(res);
      setLastRefreshed(new Date());
    } catch (err: any) {
      setError(err.message || 'Failed to aggregate analytics data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
    const interval = setInterval(fetchAnalytics, 15000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-800">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-white flex items-center gap-2.5">
            <BarChart3 className="w-6 h-6 text-indigo-400" />
            <span>Call Centre Analytics & Reports</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Aggregated operational metrics from MongoDB Atlas across WebRTC audio, Spoken Voice AI, queues, and customer CRM.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[11px] text-slate-500">
            Updated: {lastRefreshed.toLocaleTimeString()}
          </span>
          <button
            onClick={fetchAnalytics}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700/60 transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Primary KPI Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* FCR Rate */}
        <div className="p-4 sm:p-5 rounded-2xl bg-slate-900 border border-slate-800/80 shadow-lg space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">First Contact Resolution</span>
            <span className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-white">
              {data ? `${data.cases.first_contact_resolution_pct}%` : '...'}
            </span>
            <span className="text-[10px] text-emerald-400 font-bold bg-emerald-500/10 px-1.5 py-0.5 rounded">
              Goal &gt; 80%
            </span>
          </div>
          <p className="text-[11px] text-slate-400">
            {data?.cases.resolved_cases || 0} of {data?.cases.total_cases || 0} CRM cases resolved
          </p>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-3">
            <div
              className="bg-emerald-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, data?.cases.first_contact_resolution_pct || 0)}%` }}
            />
          </div>
        </div>

        {/* AI Containment Rate */}
        <div className="p-4 sm:p-5 rounded-2xl bg-slate-900 border border-slate-800/80 shadow-lg space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">AI Containment Rate</span>
            <span className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
              <Bot className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-white">
              {data ? `${data.modes.ai_containment_rate_pct}%` : '...'}
            </span>
            <span className="text-[10px] text-indigo-400 font-bold bg-indigo-500/10 px-1.5 py-0.5 rounded">
              Self-Serve
            </span>
          </div>
          <p className="text-[11px] text-slate-400">
            {data?.modes.human_to_ai_voice || 0} AI voice sessions resolved without handoff
          </p>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-3">
            <div
              className="bg-indigo-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, data?.modes.ai_containment_rate_pct || 0)}%` }}
            />
          </div>
        </div>

        {/* Average Handle Time (AHT) */}
        <div className="p-4 sm:p-5 rounded-2xl bg-slate-900 border border-slate-800/80 shadow-lg space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Average Handle Time (AHT)</span>
            <span className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <Clock className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-white">
              {data ? `${Math.round(data.calls.average_handle_duration_seconds)}s` : '...'}
            </span>
            <span className="text-[11px] text-slate-400">
              ({data ? Math.round((data.calls.average_handle_duration_seconds / 60) * 10) / 10 : 0} min)
            </span>
          </div>
          <p className="text-[11px] text-slate-400">
            Across {data?.calls.completed_calls || 0} completed call sessions
          </p>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-3">
            <div className="bg-amber-500 h-full rounded-full transition-all duration-500" style={{ width: '65%' }} />
          </div>
        </div>

        {/* Workforce Occupancy */}
        <div className="p-4 sm:p-5 rounded-2xl bg-slate-900 border border-slate-800/80 shadow-lg space-y-2 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400">Staff Active on Shift</span>
            <span className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
              <Users className="w-4 h-4" />
            </span>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl sm:text-3xl font-black text-white">
              {data ? `${data.workforce.occupancy_rate_pct}%` : '...'}
            </span>
            <span className="text-[10px] text-cyan-400 font-bold bg-cyan-500/10 px-1.5 py-0.5 rounded">
              Ready
            </span>
          </div>
          <p className="text-[11px] text-slate-400">
            {data?.workforce.active_on_shift || 0} / {data?.workforce.total_staff || 0} staff available or busy
          </p>
          <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden mt-3">
            <div
              className="bg-cyan-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, data?.workforce.occupancy_rate_pct || 0)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Modes & Architecture Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Operational Modes Summary */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800/80 shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <PieChart className="w-4 h-4 text-indigo-400" />
                <span>Call Center Modes Breakdown</span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Volume distribution across all 4 operational communication modes
              </p>
            </div>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
              Active Modes
            </span>
          </div>

          <div className="space-y-3">
            {/* Mode A: Human-to-Human */}
            <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center font-bold text-xs">
                  A
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-200">Mode A — Human-to-Human WebRTC</p>
                  <p className="text-[10px] text-slate-400">Browser-to-browser P2P intercom audio</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-sm font-extrabold text-white">
                  {data?.modes.human_to_human_webrtc || 0}
                </span>
                <p className="text-[10px] text-slate-400">Calls logged</p>
              </div>
            </div>

            {/* Mode B: Voice AI */}
            <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 text-indigo-400 flex items-center justify-center font-bold text-xs">
                  B
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-200">Mode B — Spoken Voice AI Agent</p>
                  <p className="text-[10px] text-slate-400">Microphone speech input + OpenRouter + Audio synthesis</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-sm font-extrabold text-white">
                  {data?.modes.human_to_ai_voice || 0}
                </span>
                <p className="text-[10px] text-slate-400">AI sessions</p>
              </div>
            </div>

            {/* Mode C: AI-to-Human Handoff */}
            <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center font-bold text-xs">
                  C
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-200">Mode C — AI-to-Human Escalation</p>
                  <p className="text-[10px] text-slate-400">Automatic intent handoff into live incoming queue</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-sm font-extrabold text-amber-400">
                  {data?.modes.ai_to_human_escalations || 0}
                </span>
                <p className="text-[10px] text-slate-400">Escalated tickets</p>
              </div>
            </div>

            {/* Mode D: Agent Assist */}
            <div className="p-3 rounded-xl bg-slate-800/50 border border-slate-700/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 flex items-center justify-center font-bold text-xs">
                  D
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-200">Mode D — Agent Assist AI Copilot</p>
                  <p className="text-[10px] text-slate-400">Live coaching grounded by company knowledge base</p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-sm font-extrabold text-emerald-400">Active</span>
                <p className="text-[10px] text-slate-400">On-demand LLM</p>
              </div>
            </div>
          </div>
        </div>

        {/* Call Outcomes & Carrier Compliance */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800/80 shadow-lg space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-emerald-400" />
                <span>Call Outcomes & Telephony Status</span>
              </h2>
              <p className="text-[11px] text-slate-400">
                Wrap-up dispositions and carrier adapter compliance
              </p>
            </div>
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300">
              Zero-Payment Rule
            </span>
          </div>

          {/* Outcome Dispositions */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-300">Call Wrap-Up Dispositions Recorded:</p>
            {data && Object.keys(data.call_outcomes).length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {Object.entries(data.call_outcomes).map(([outcome, count]) => (
                  <div key={outcome} className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/40 flex items-center justify-between">
                    <span className="text-xs capitalize text-slate-300">{outcome.replace('_', ' ')}</span>
                    <span className="text-xs font-bold text-indigo-400">{count}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-slate-850 border border-slate-800 text-center text-xs text-slate-400">
                No custom wrap-up dispositions recorded yet. Use the Softphone outcome picker upon call conclusion.
              </div>
            )}
          </div>

          {/* Infrastructure Guarantee Card */}
          <div className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2 text-xs">
            <p className="font-bold text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Free Tools & Carrier Constraint Guarantee</span>
            </p>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              PSTN telephony adapter defaults to <code className="text-indigo-300">UnconfiguredAdapter</code> (unconfigured status displayed honestly, with zero simulated dial tones or fake connection screens). Browser WebRTC and Web Speech APIs provide genuine, unbilled real-time audio and voice synthesis.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
