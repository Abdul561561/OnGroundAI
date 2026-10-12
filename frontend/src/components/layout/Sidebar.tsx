import React from 'react';
import {
  LayoutDashboard,
  MessageSquare,
  Mic,
  PhoneCall,
  History,
  Settings,
  Server,
  Cpu,
  Database,
} from 'lucide-react';
import { useCall } from '../../context/CallContext';

export type TabType = 'dashboard' | 'text_ai' | 'voice_ai' | 'calls' | 'history' | 'settings';

interface SidebarProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, onTabChange }) => {
  const { activeCall } = useCall();

  const navItems = [
    { id: 'dashboard' as TabType, label: 'Dashboard', icon: LayoutDashboard },
    { id: 'text_ai' as TabType, label: 'AI Text Chat', icon: MessageSquare },
    { id: 'voice_ai' as TabType, label: 'AI Voice Assistant', icon: Mic, badge: 'Live Audio' },
    { id: 'calls' as TabType, label: 'Human Calls', icon: PhoneCall, badge: 'WebRTC' },
    { id: 'history' as TabType, label: 'Call History', icon: History },
    { id: 'settings' as TabType, label: 'Settings & Limits', icon: Settings },
  ];

  return (
    <aside className="w-64 border-r border-slate-800 bg-slate-900/50 flex-col justify-between hidden md:flex shrink-0">
      <div className="p-4 space-y-6">
        {/* Navigation Items */}
        <div className="space-y-1">
          <p className="px-3 text-[11px] font-semibold tracking-wider text-slate-500 uppercase mb-2">
            Workspace
          </p>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onTabChange(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30 shadow-sm shadow-blue-500/10'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-blue-400' : 'text-slate-400'}`} />
                  <span>{item.label}</span>
                </div>
                {item.badge && (
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-slate-800 text-slate-400 border border-slate-700/60">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Active Call Alert in Sidebar */}
        {activeCall && activeCall.state === 'connected' && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 space-y-1 animate-pulse">
            <div className="flex items-center gap-2 text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>Active Call in Progress</span>
            </div>
            <p className="text-[11px] text-emerald-300/80">
              With: {activeCall.peerName} ({Math.floor(activeCall.durationSeconds / 60)}:
              {(activeCall.durationSeconds % 60).toString().padStart(2, '0')})
            </p>
          </div>
        )}
      </div>

      {/* Tech Stack Verified Pill */}
      <div className="p-4 border-t border-slate-800/80 space-y-2">
        <p className="text-[11px] font-medium text-slate-400 flex items-center gap-1.5">
          <Server className="w-3.5 h-3.5 text-blue-400" />
          <span>Real-time Stack</span>
        </p>
        <div className="space-y-1.5 text-[11px] text-slate-400 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-slate-400">
              <Cpu className="w-3 h-3 text-emerald-400" />
              <span>LLM:</span>
            </span>
            <span className="font-semibold text-slate-300">OpenRouter</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-slate-400">
              <PhoneCall className="w-3 h-3 text-cyan-400" />
              <span>Media:</span>
            </span>
            <span className="font-semibold text-slate-300">WebRTC Audio</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-slate-400">
              <Database className="w-3 h-3 text-amber-400" />
              <span>DB:</span>
            </span>
            <span className="font-semibold text-slate-300">MongoDB Atlas</span>
          </div>
        </div>
      </div>
    </aside>
  );
};
