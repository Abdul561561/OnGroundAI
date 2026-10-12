import React from 'react';
import {
  LayoutDashboard,
  MessageSquare,
  Mic,
  PhoneCall,
  History,
  Settings,
} from 'lucide-react';
import { TabType } from './Sidebar';

interface MobileNavProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({ currentTab, onTabChange }) => {
  const navItems = [
    { id: 'dashboard' as TabType, label: 'Dash', icon: LayoutDashboard },
    { id: 'text_ai' as TabType, label: 'Text AI', icon: MessageSquare },
    { id: 'voice_ai' as TabType, label: 'Voice AI', icon: Mic },
    { id: 'calls' as TabType, label: 'Calls', icon: PhoneCall },
    { id: 'history' as TabType, label: 'History', icon: History },
    { id: 'settings' as TabType, label: 'Settings', icon: Settings },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-lg border-t border-slate-800 px-2 py-2 flex items-center justify-around">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isActive = currentTab === item.id;
        return (
          <button
            key={item.id}
            onClick={() => onTabChange(item.id)}
            className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all ${
              isActive ? 'text-blue-400 font-semibold' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Icon className="w-5 h-5" />
            <span className="text-[10px]">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
