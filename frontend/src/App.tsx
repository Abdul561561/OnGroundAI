import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CallProvider } from './context/CallContext';
import { Navbar } from './components/layout/Navbar';
import { Sidebar, TabType } from './components/layout/Sidebar';
import { MobileNav } from './components/layout/MobileNav';
import { Dashboard } from './components/dashboard/Dashboard';
import { ContactManager } from './components/crm/ContactManager';
import { SoftphoneDialer } from './components/softphone/SoftphoneDialer';
import { AgentAssistPanel } from './components/voice_ai/AgentAssistPanel';
import { SupervisorHub } from './components/supervisor/SupervisorHub';
import { TextAIChat } from './components/text_ai/TextAIChat';
import { VoiceAIAssistant } from './components/voice_ai/VoiceAIAssistant';
import { UserDirectory } from './components/calls/UserDirectory';
import { CallHistory } from './components/history/CallHistory';
import { SettingsView } from './components/settings/SettingsView';
import { LiveCallCentre } from './components/live_ops/LiveCallCentre';
import { IncomingQueueView } from './components/queues/IncomingQueueView';
import { KnowledgeBaseView } from './components/knowledge_base/KnowledgeBaseView';
import { CasesManager } from './components/cases/CasesManager';
import { AnalyticsReports } from './components/analytics/AnalyticsReports';
import { IncomingCallModal } from './components/calls/IncomingCallModal';
import { ActiveCallModal } from './components/calls/ActiveCallModal';
import { AuthModal } from './components/auth/AuthModal';
import { Contact } from './types';
import {
  Phone,
  Users,
  Sparkles,
  ShieldCheck,
  Radio,
  ArrowRight,
  PhoneCall,
  MessageSquare,
  Mic
} from 'lucide-react';

const MainAppContent: React.FC = () => {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [currentTab, setCurrentTab] = useState<TabType>('dashboard');
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);

  // Softphone cross-component preloads
  const [softphonePreloadNumber, setSoftphonePreloadNumber] = useState<string>('');
  const [softphonePreloadContact, setSoftphonePreloadContact] = useState<Contact | null>(null);

  // Agent Assist cross-component preload
  const [assistPreloadContact, setAssistPreloadContact] = useState<Contact | null>(null);

  const handleSelectContactForCall = (phoneNumber: string, contact?: Contact) => {
    setSoftphonePreloadNumber(phoneNumber);
    setSoftphonePreloadContact(contact || null);
    setCurrentTab('softphone');
  };

  const handleOpenAgentAssistForContact = (contact: Contact) => {
    setAssistPreloadContact(contact);
    setCurrentTab('agent_assist');
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-xs">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center animate-pulse">
            <Radio className="w-5 h-5 text-white" />
          </div>
          <span>Connecting to OnGround AI Call Centre Platform...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <Navbar onOpenAuth={() => setIsAuthModalOpen(true)} />

      {/* Unauthenticated Welcome Screen */}
      {!isAuthenticated ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-4xl mx-auto space-y-6">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-400 flex items-center justify-center shadow-xl shadow-blue-500/30">
            <PhoneCall className="w-8 h-8 text-white" />
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              OnGround AI
            </h1>
            <p className="text-base text-indigo-400 font-semibold">
              Intelligent Call Centre Platform
            </p>
            <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto pt-2 leading-relaxed">
              Professional call-centre staff application demonstrating Customer CRM with telephone lookup,
              Click-to-Call softphone dialer, modular PSTN carrier integration, real-time Agent Assist AI copilot,
              hands-free spoken Voice AI, and Supervisor operations oversight.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 w-full max-w-2xl text-left text-xs pt-4">
            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1.5 shadow-lg">
              <div className="w-8 h-8 rounded-xl bg-indigo-600/20 text-indigo-400 flex items-center justify-center font-bold">
                <Users className="w-4 h-4" />
              </div>
              <p className="font-bold text-white text-sm">Customer CRM & Search</p>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Lookup contacts by telephone number or name, inspect interaction history, and schedule follow-ups.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1.5 shadow-lg">
              <div className="w-8 h-8 rounded-xl bg-emerald-600/20 text-emerald-400 flex items-center justify-center font-bold">
                <Phone className="w-4 h-4" />
              </div>
              <p className="font-bold text-white text-sm">Softphone & Carrier Gateway</p>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Click-to-Call ordinary phone numbers with DTMF audio feedback, live call timers, and outcome wrap-up.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 space-y-1.5 shadow-lg">
              <div className="w-8 h-8 rounded-xl bg-purple-600/20 text-purple-400 flex items-center justify-center font-bold">
                <Sparkles className="w-4 h-4" />
              </div>
              <p className="font-bold text-white text-sm">Agent Assist AI Copilot</p>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Real-time conversation coaching powered by OpenRouter: smart talking points, objection handling, and action items.
              </p>
            </div>
          </div>

          <div className="pt-4">
            <button
              onClick={() => setIsAuthModalOpen(true)}
              className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-semibold text-sm px-6 py-3 rounded-2xl shadow-xl shadow-indigo-600/30 transition-all cursor-pointer"
            >
              <span>Enter Staff Workspace</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-500 pt-6">
            <span className="flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Free tools only (Zero-Payment Policy)
            </span>
            <span>•</span>
            <span>MongoDB Atlas (onground_ai)</span>
            <span>•</span>
            <span>OpenRouter LLM</span>
            <span>•</span>
            <span>WebRTC Audio</span>
          </div>
        </div>
      ) : (
        /* Authenticated Staff Workspace */
        <div className="flex-1 flex overflow-hidden">
          <Sidebar currentTab={currentTab} onTabChange={setCurrentTab} />

          <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
            {currentTab === 'dashboard' && (
              <Dashboard
                onNavigate={setCurrentTab}
                onSelectContactForCall={handleSelectContactForCall}
              />
            )}

            {currentTab === 'crm' && (
              <ContactManager
                onSelectForCall={handleSelectContactForCall}
                onOpenAgentAssist={handleOpenAgentAssistForContact}
              />
            )}

            {currentTab === 'softphone' && (
              <SoftphoneDialer
                initialPhoneNumber={softphonePreloadNumber}
                initialContact={softphonePreloadContact}
                onCallEnded={() => {
                  setSoftphonePreloadNumber('');
                  setSoftphonePreloadContact(null);
                }}
              />
            )}

            {currentTab === 'agent_assist' && (
              <AgentAssistPanel
                initialContact={assistPreloadContact}
                onScheduleFollowUp={(action) => {
                  setCurrentTab('crm');
                }}
              />
            )}

            {currentTab === 'supervisor' && <SupervisorHub />}

            {currentTab === 'live_ops' && (
              <LiveCallCentre
                onNavigate={setCurrentTab}
                onSelectForCall={handleSelectContactForCall}
              />
            )}

            {currentTab === 'queues' && (
              <IncomingQueueView
                onSelectForCall={handleSelectContactForCall}
              />
            )}

            {currentTab === 'cases' && (
              <CasesManager
                onSelectForCall={handleSelectContactForCall}
              />
            )}

            {currentTab === 'knowledge_base' && <KnowledgeBaseView />}

            {currentTab === 'analytics' && <AnalyticsReports />}

            {currentTab === 'voice_ai' && <VoiceAIAssistant />}

            {currentTab === 'text_ai' && <TextAIChat />}

            {currentTab === 'calls' && <UserDirectory />}

            {currentTab === 'history' && <CallHistory />}

            {currentTab === 'settings' && <SettingsView />}
          </main>

          <MobileNav currentTab={currentTab} onTabChange={setCurrentTab} />
        </div>
      )}

      {/* Global Call Overlays for Intercom */}
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
