import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CallProvider } from './context/CallContext';
import { Navbar } from './components/layout/Navbar';
import { Sidebar, TabType } from './components/layout/Sidebar';
import { MobileNav } from './components/layout/MobileNav';
import { Dashboard } from './components/dashboard/Dashboard';
import { TextAIChat } from './components/text_ai/TextAIChat';
import { VoiceAIAssistant } from './components/voice_ai/VoiceAIAssistant';
import { UserDirectory } from './components/calls/UserDirectory';
import { CallHistory } from './components/history/CallHistory';
import { SettingsView } from './components/settings/SettingsView';
import { IncomingCallModal } from './components/calls/IncomingCallModal';
import { ActiveCallModal } from './components/calls/ActiveCallModal';
import { AuthModal } from './components/auth/AuthModal';
import { Radio, Mic, MessageSquare, PhoneCall, ArrowRight, ShieldCheck } from 'lucide-react';

const MainAppContent: React.FC = () => {
  const { isAuthenticated, isLoading } = useAuth();
  const [currentTab, setCurrentTab] = useState<TabType>('dashboard');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-xs">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center animate-pulse">
            <Radio className="w-5 h-5 text-white" />
          </div>
          <span>Connecting to OnGround AI Platform...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Navbar onOpenAuth={() => setIsAuthModalOpen(true)} />

      {/* Unauthenticated Welcome Banner if not logged in */}
      {!isAuthenticated ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-3xl mx-auto space-y-6">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-400 flex items-center justify-center shadow-xl shadow-blue-500/30">
            <Radio className="w-8 h-8 text-white" />
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              OnGround AI
            </h1>
            <p className="text-base text-slate-400 font-medium">
              Voice & Text Intelligence Platform
            </p>
            <p className="text-xs sm:text-sm text-slate-400 max-w-lg mx-auto pt-2 leading-relaxed">
              Full-stack AI platform demonstrating OpenRouter LLM text reasoning, live microphone
              spoken voice assistant with browser speech APIs, and authentic browser-to-browser
              WebRTC audio calling backed by MongoDB Atlas.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-xl text-left text-xs pt-4">
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1.5">
              <div className="w-7 h-7 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold">
                <MessageSquare className="w-4 h-4" />
              </div>
              <p className="font-bold text-white">Text AI Chat</p>
              <p className="text-slate-400 text-[11px]">Multi-turn contextual reasoning via OpenRouter free model routing.</p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1.5">
              <div className="w-7 h-7 rounded-lg bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold">
                <Mic className="w-4 h-4" />
              </div>
              <p className="font-bold text-white">Voice AI Agent</p>
              <p className="text-slate-400 text-[11px]">Live microphone input, spoken synthesis, and conversational interrupt.</p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1.5">
              <div className="w-7 h-7 rounded-lg bg-cyan-600/20 text-cyan-400 flex items-center justify-center font-bold">
                <PhoneCall className="w-4 h-4" />
              </div>
              <p className="font-bold text-white">WebRTC Calling</p>
              <p className="text-slate-400 text-[11px]">Real 2-way peer audio calling with live WebSocket signaling.</p>
            </div>
          </div>

          <div className="pt-4">
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-semibold text-sm px-6 py-3 rounded-2xl shadow-xl shadow-blue-600/30 transition-all cursor-pointer"
            >
              <span>Get Started / Sign In</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-center gap-4 text-[11px] text-slate-500 pt-6">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Free tools only
            </span>
            <span>•</span>
            <span>MongoDB Atlas (onground_ai)</span>
            <span>•</span>
            <span>OpenRouter LLM</span>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden">
          <Sidebar currentTab={currentTab} onTabChange={setCurrentTab} />

          <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
            {currentTab === 'dashboard' && <Dashboard onNavigate={setCurrentTab} />}
            {currentTab === 'text_ai' && <TextAIChat />}
            {currentTab === 'voice_ai' && <VoiceAIAssistant />}
            {currentTab === 'calls' && <UserDirectory />}
            {currentTab === 'history' && <CallHistory />}
            {currentTab === 'settings' && <SettingsView />}
          </main>

          <MobileNav currentTab={currentTab} onTabChange={setCurrentTab} />
        </div>
      )}

      {/* Global Call Overlays */}
      <IncomingCallModal />
      <ActiveCallModal />

      {/* Auth Modal */}
      <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} />
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <CallProvider>
        <MainAppContent />
      </CallProvider>
    </AuthProvider>
  );
}
