import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useCall } from '../../context/CallContext';
import { Radio, LogOut, User as UserIcon, ShieldCheck, AlertTriangle, PhoneCall } from 'lucide-react';
import { api } from '../../services/api';
import { TelephonyStatus } from '../../types';

interface NavbarProps {
  onOpenAuth: () => void;
  onOpenCarrierModal?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenAuth, onOpenCarrierModal }) => {
  const { user, isAuthenticated, logout, updateStatus } = useAuth();
  const { signalingStatus } = useCall();
  const [carrierStatus, setCarrierStatus] = useState<TelephonyStatus | null>(null);

  useEffect(() => {
    api.getTelephonyStatus().then(setCarrierStatus).catch(() => {});
  }, []);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'available':
        return 'bg-emerald-500';
      case 'busy':
        return 'bg-rose-500';
      case 'away':
        return 'bg-amber-500';
      default:
        return 'bg-slate-500';
    }
  };

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case 'admin':
        return <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">Admin</span>;
      case 'supervisor':
        return <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/40">Supervisor</span>;
      default:
        return <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-blue-500/20 text-blue-300 border border-blue-500/40">Staff Agent</span>;
    }
  };

  return (
    <header className="h-16 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md px-4 sm:px-6 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/20">
          <PhoneCall className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <span className="font-bold text-lg text-white tracking-tight">OnGround AI</span>
            <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Call Centre Platform
            </span>
          </div>
          <p className="text-xs text-slate-400 hidden sm:block">Intelligent Telephony & Staff Operations</p>
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-4">
        {/* Carrier Status Pill */}
        <button
          onClick={onOpenCarrierModal}
          className={`hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs transition-colors ${
            carrierStatus?.is_configured
              ? 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300 hover:bg-emerald-900/40'
              : 'bg-amber-950/40 border-amber-800/60 text-amber-300 hover:bg-amber-900/40'
          }`}
          title="Click to view carrier diagnostic specifications"
        >
          {carrierStatus?.is_configured ? (
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
          )}
          <span className="font-medium">
            {carrierStatus?.is_configured ? 'PSTN Carrier: Active' : 'Zero-Payment Mode'}
          </span>
        </button>

        {/* Signaling Status Indicator */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs text-slate-300">
          <span
            className={`w-2 h-2 rounded-full ${
              signalingStatus === 'connected'
                ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50'
                : signalingStatus === 'connecting'
                ? 'bg-amber-400 animate-ping'
                : 'bg-slate-500'
            }`}
          />
          <span className="hidden md:inline font-medium">
            {signalingStatus === 'connected'
              ? 'Signaling Live'
              : signalingStatus === 'connecting'
              ? 'Connecting...'
              : 'Signaling Offline'}
          </span>
        </div>

        {isAuthenticated && user ? (
          <div className="flex items-center gap-3">
            {/* Agent Status Selector */}
            <div className="relative flex items-center">
              <span className={`w-2.5 h-2.5 rounded-full mr-2 ${getStatusColor(user.status || user.presence || 'available')}`} />
              <select
                value={user.status || user.presence || 'available'}
                onChange={(e) => updateStatus(e.target.value as any)}
                className="bg-slate-800 border border-slate-700 text-xs rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-blue-500 cursor-pointer"
              >
                <option value="available">Available</option>
                <option value="busy">Busy (On Call)</option>
                <option value="away">Away</option>
                <option value="offline">Offline</option>
              </select>
            </div>

            {/* User Pill with Role Badge */}
            <div className="hidden sm:flex items-center gap-2 bg-slate-800/60 border border-slate-700/50 rounded-xl px-3 py-1.5">
              <div className="w-6 h-6 rounded-lg bg-indigo-600/30 text-indigo-400 flex items-center justify-center font-bold text-xs">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <span className="text-xs font-medium text-slate-200 max-w-[110px] truncate">
                {user.name}
              </span>
              {getRoleBadge(user.role)}
            </div>

            {/* Logout Button */}
            <button
              onClick={logout}
              title="Log out"
              className="p-2 text-slate-400 hover:text-rose-400 hover:bg-slate-800/80 rounded-lg transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button
            onClick={onOpenAuth}
            className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all shadow-md shadow-blue-600/20"
          >
            <UserIcon className="w-4 h-4" />
            <span>Staff Login</span>
          </button>
        )}
      </div>
    </header>
  );
};
