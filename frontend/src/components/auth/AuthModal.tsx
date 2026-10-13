import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { X, Lock, Mail, User, AlertCircle, Loader2 } from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'agent' | 'supervisor' | 'admin'>('agent');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegister) {
        if (!name.trim()) throw new Error('Please enter your full name.');
        if (password.length < 6) throw new Error('Password must be at least 6 characters.');
        await register(name.trim(), email.trim(), password, role);
      } else {
        await login(email.trim(), password);
      }
      onClose();
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please check credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-white tracking-tight">
            {isRegister ? 'Create Agent Account' : 'Welcome to OnGround AI'}
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {isRegister
              ? 'Register to access real-time AI and WebRTC calling'
              : 'Sign in to access your dashboard, AI sessions, and calls'}
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {isRegister && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Full Name</label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Agent Jane Doe"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Staff Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500"
                >
                  <option value="agent">Staff Agent (Frontline Calls & CRM)</option>
                  <option value="supervisor">Supervisor (Workforce & Queue Oversight)</option>
                  <option value="admin">Administrator (System & Carrier Config)</option>
                </select>
              </div>
            </>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Email Address</label>
            <div className="relative">
              <Mail className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="agent@onground.ai"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">Password</label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-semibold py-2.5 rounded-xl text-sm transition-all shadow-md shadow-blue-500/20 flex items-center justify-center gap-2 mt-2 disabled:opacity-50"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Processing...</span>
              </>
            ) : (
              <span>{isRegister ? 'Register & Enter Platform' : 'Sign In'}</span>
            )}
          </button>
        </form>

        <div className="mt-5 text-center text-xs text-slate-400">
          {isRegister ? 'Already registered?' : "Don't have an account yet?"}{' '}
          <button
            onClick={() => {
              setIsRegister(!isRegister);
              setError(null);
            }}
            className="text-blue-400 font-semibold hover:underline ml-1"
          >
            {isRegister ? 'Sign In' : 'Create Free Account'}
          </button>
        </div>

        {/* Quick Demo Staff Logins */}
        {!isRegister && (
          <div className="mt-4 pt-4 border-t border-slate-800/80 space-y-2">
            <p className="text-[11px] font-semibold text-slate-400 text-center">
              Quick 1-Click Demo Accounts (2 Browser Sessions):
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setEmail('alice@onground.ai');
                  setPassword('Password123!');
                }}
                className="px-2.5 py-2 bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 text-xs rounded-xl border border-slate-700/60 flex items-center justify-center gap-1.5 transition-all text-center cursor-pointer shadow-sm hover:border-emerald-500/40"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                <span className="font-semibold text-white">Agent Alice</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setEmail('bob@onground.ai');
                  setPassword('Password123!');
                }}
                className="px-2.5 py-2 bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 text-xs rounded-xl border border-slate-700/60 flex items-center justify-center gap-1.5 transition-all text-center cursor-pointer shadow-sm hover:border-blue-500/40"
              >
                <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
                <span className="font-semibold text-white">Agent Bob</span>
              </button>
            </div>
            <p className="text-[10px] text-slate-500 text-center">
              Click either to pre-fill email & password, then press Sign In.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
