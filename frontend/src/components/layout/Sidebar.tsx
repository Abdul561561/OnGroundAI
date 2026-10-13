import React from 'react';
import {
  LayoutDashboard,
  Users,
  Phone,
  Sparkles,
  ShieldCheck,
  MessageSquare,
  Mic,
  PhoneCall,
  History,
  Settings,
  Server,
  Cpu,
  Database,
  Radio,
  PhoneIncoming,
  ClipboardList,
  BookOpen,
  BarChart3,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useCall } from '../../context/CallContext';

export type TabType =
  | 'dashboard'
  | 'live_ops'
  | 'queues'
  | 'crm'
  | 'softphone'
  | 'cases'
  | 'knowledge_base'
  | 'agent_assist'
  | 'voice_ai'
  | 'text_ai'
  | 'calls'
  | 'history'
  | 'analytics'
  | 'supervisor'
  | 'settings';

interface SidebarProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
}

interface NavItem {
  id: TabType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onTabChange }) => {
  const { user } = useAuth();
  const { activeCall } = useCall();

  const isSupervisorOrAdmin = user?.role === 'supervisor' || user?.role === 'admin';

  const opsNavItems: NavItem[] = [
    { id: 'dashboard', label: 'Agent Workspace', icon: LayoutDashboard },
    { id: 'live_ops', label: 'Live Call Centre', icon: Radio, badge: 'Live Ops' },
    { id: 'queues', label: 'Incoming Queue', icon: PhoneIncoming, badge: 'Tickets' },
  ];

  const crmNavItems: NavItem[] = [
    { id: 'crm', label: 'Customer CRM', icon: Users, badge: 'Directory' },
    { id: 'softphone', label: 'Softphone Dialer', icon: Phone, badge: 'E.164' },
    { id: 'cases', label: 'Cases & Follow-ups', icon: ClipboardList },
    { id: 'knowledge_base', label: 'Knowledge Base', icon: BookOpen, badge: 'Docs' },
  ];

  const aiNavItems: NavItem[] = [
    { id: 'voice_ai', label: 'Spoken Voice AI', icon: Mic, badge: 'Mode B' },
    { id: 'agent_assist', label: 'Agent Assist AI', icon: Sparkles, badge: 'Copilot' },
    { id: 'text_ai', label: 'CRM Grounded Chat', icon: MessageSquare },
    { id: 'calls', label: 'Internal Intercom', icon: PhoneCall, badge: 'Mode A' },
    { id: 'history', label: 'Call Log & Audits', icon: History },
  ];

  const mgmtNavItems: NavItem[] = [
    { id: 'analytics', label: 'Analytics & Reports', icon: BarChart3, badge: 'KPIs' },
  ];

  if (isSupervisorOrAdmin) {
    mgmtNavItems.push({
      id: 'supervisor',
      label: 'Supervisor Hub',
      icon: ShieldCheck,
      badge: 'Team Ops',
    });
  }

  mgmtNavItems.push({
    id: 'settings',
    label: 'System & Carrier',
    icon: Settings,
  });

  const renderSection = (title: string, items: NavItem[]) => (
    <div className="space-y-1">
      <p className="px-3 text-[10px] font-bold tracking-wider text-slate-500 uppercase mb-1.5">
        {title}
      </p>
      {items.map((item) => {
        const Icon = item.icon;
        const isActive = currentTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition-all cursor-pointer ${
              isActive
                ? 'bg-indigo-600/20 text-indigo-300 border border-indigo-500/30 shadow-sm shadow-indigo-500/10'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-400' : 'text-slate-400'}`} />
              <span>{item.label}</span>
            </div>
            {item.badge && (
              <span
                className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${
                  isActive
                    ? 'bg-indigo-500/30 text-indigo-200'
                    : 'bg-slate-800 text-slate-400 border border-slate-700/60'
                }`}
              >
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );

  return (
    <aside className="w-64 border-r border-slate-800 bg-slate-900/60 flex-col justify-between hidden md:flex shrink-0">
      <div className="p-3.5 space-y-5 overflow-y-auto">
        {/* Active Call Alert in Sidebar */}
        {activeCall && activeCall.state === 'connected' && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 space-y-1 animate-pulse">
            <div className="flex items-center gap-2 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Call in Progress</span>
            </div>
            <p className="text-[11px] text-emerald-300/80 truncate">
              With: {activeCall.peerName} ({Math.floor(activeCall.durationSeconds / 60)}:
              {(activeCall.durationSeconds % 60).toString().padStart(2, '0')})
            </p>
          </div>
        )}

        {renderSection('Operations & Queues', opsNavItems)}
        {renderSection('CRM & Contact Care', crmNavItems)}
        {renderSection('AI & Communications', aiNavItems)}
        {renderSection('Intelligence & Admin', mgmtNavItems)}
      </div>

      {/* Tech Stack Verified Pill */}
      <div className="p-3.5 border-t border-slate-800/80 space-y-2">
        <p className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
          <Server className="w-3.5 h-3.5 text-indigo-400" />
          <span>Call Centre Stack</span>
        </p>
        <div className="space-y-1.5 text-[11px] text-slate-400 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-slate-400">
              <Cpu className="w-3 h-3 text-emerald-400" />
              <span>AI Engine:</span>
            </span>
            <span className="font-semibold text-slate-300">OpenRouter</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-slate-400">
              <PhoneCall className="w-3 h-3 text-cyan-400" />
              <span>Carrier:</span>
            </span>
            <span className="font-semibold text-slate-300">Modular PSTN</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-slate-400">
              <Database className="w-3 h-3 text-amber-400" />
              <span>Database:</span>
            </span>
            <span className="font-semibold text-slate-300">MongoDB Atlas</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
