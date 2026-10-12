import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  Mic,
  MicOff,
  Copy,
  Check,
  Volume2,
  Calendar,
  User,
  ArrowRight,
  ShieldAlert,
  HelpCircle,
  RefreshCw,
  Send
} from 'lucide-react';
import { api } from '../../services/api';
import { Contact, AgentAssistResponse } from '../../types';
import { speechService, SpeechService } from '../../services/speech';

interface AgentAssistPanelProps {
  initialContact?: Contact | null;
  onScheduleFollowUp?: (description: string) => void;
}

export const AgentAssistPanel: React.FC<AgentAssistPanelProps> = ({
  initialContact = null,
  onScheduleFollowUp,
}) => {
  const [customerQuery, setCustomerQuery] = useState('');
  const [selectedContact, setSelectedContact] = useState<Contact | null>(initialContact);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);

  const [isGenerating, setIsGenerating] = useState(false);
  const [assistData, setAssistData] = useState<AgentAssistResponse | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [copiedReply, setCopiedReply] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (initialContact) {
      setSelectedContact(initialContact);
    }
    loadContactsList();
  }, [initialContact]);

  const loadContactsList = async () => {
    setIsLoadingContacts(true);
    try {
      const data = await api.getContacts();
      setContacts(data);
    } catch {
      // fallback
    } finally {
      setIsLoadingContacts(false);
    }
  };

  const toggleMicListening = () => {
    if (!SpeechService.isRecognitionSupported()) {
      alert('Browser speech recognition is not supported in this browser. Please type the query.');
      return;
    }

    if (isListening) {
      speechService.stopListening();
      setIsListening(false);
    } else {
      setIsListening(true);
      speechService.startListening({
        onResult: (transcript: string) => {
          setCustomerQuery(transcript);
          setIsListening(false);
        },
        onInterim: (interim: string) => {
          setCustomerQuery(interim);
        },
        onError: (err: string) => {
          console.error('Speech recognition error:', err);
          setIsListening(false);
        },
        onEnd: () => {
          setIsListening(false);
        },
      });
    }
  };

  const handleGenerateAssist = async () => {
    if (!customerQuery.trim()) return;
    setIsGenerating(true);
    setErrorMsg(null);
    try {
      const res = await api.getAgentAssist(
        customerQuery.trim(),
        selectedContact?._id
      );
      setAssistData(res);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to generate agent assistance.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyReply = () => {
    if (!assistData) return;
    navigator.clipboard.writeText(assistData.recommended_reply);
    setCopiedReply(true);
    setTimeout(() => setCopiedReply(false), 2000);
  };

  const handleSpeakReply = () => {
    if (!assistData) return;
    if (isSpeaking) {
      speechService.stopSpeaking();
      setIsSpeaking(false);
    } else {
      setIsSpeaking(true);
      speechService.speak(assistData.recommended_reply, {
        onEnd: () => setIsSpeaking(false),
        onError: () => setIsSpeaking(false),
      });
    }
  };

  const handleQuickPreset = (presetText: string) => {
    setCustomerQuery(presetText);
  };

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <Sparkles className="w-6 h-6 text-indigo-400" />
            Agent Assist Copilot
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            Real-time conversational intelligence powered by OpenRouter: smart recommendations, objection handling, and follow-up generation
          </p>
        </div>

        {/* Customer Context Selector */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <User className="w-4 h-4 text-slate-500" />
          <select
            value={selectedContact?._id || ''}
            onChange={(e) => {
              const c = contacts.find((item) => item._id === e.target.value);
              setSelectedContact(c || null);
            }}
            className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-300 focus:outline-none focus:border-indigo-500 w-full sm:w-64"
          >
            <option value="">General (No Customer Context)</option>
            {contacts.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name} ({c.phone_number})
              </option>
            ))}
          </select>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 bg-red-950/50 border border-red-800/60 rounded-xl text-red-200 text-xs">
          {errorMsg}
        </div>
      )}

      {/* Query Input Box */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <label className="text-xs font-semibold text-slate-300">
            Customer Statement or Objection:
          </label>
          <div className="flex items-center gap-2 text-[11px] text-slate-500">
            <span>Quick Presets:</span>
            <button
              onClick={() => handleQuickPreset("Your pricing seems higher than what we currently pay for our SIP trunk.")}
              className="text-indigo-400 hover:text-indigo-300 underline"
            >
              Pricing
            </button>
            <span>•</span>
            <button
              onClick={() => handleQuickPreset("Can this system integrate with our on-premise PBX without hardware replacement?")}
              className="text-indigo-400 hover:text-indigo-300 underline"
            >
              PBX Integration
            </button>
            <span>•</span>
            <button
              onClick={() => handleQuickPreset("We'd like to schedule a formal demo with our engineering team next Tuesday.")}
              className="text-indigo-400 hover:text-indigo-300 underline"
            >
              Demo Request
            </button>
          </div>
        </div>

        <div className="relative">
          <textarea
            rows={3}
            value={customerQuery}
            onChange={(e) => setCustomerQuery(e.target.value)}
            placeholder="Type customer question or click the microphone to transcribe customer speech..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3.5 pr-24 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500 leading-relaxed"
          />

          <div className="absolute right-3 bottom-3 flex items-center gap-2">
            <button
              type="button"
              onClick={toggleMicListening}
              className={`p-2 rounded-lg border transition-colors ${
                isListening
                  ? 'bg-rose-500/20 border-rose-500 text-rose-400 animate-pulse'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
              }`}
              title={isListening ? 'Stop Listening' : 'Transcribe Customer Speech via Mic'}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={handleGenerateAssist}
              disabled={isGenerating || !customerQuery.trim()}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-all shadow-md shadow-indigo-950"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Assist</span>
                </>
              )}
            </button>
          </div>
        </div>

        {selectedContact && (
          <div className="text-[11px] text-indigo-300/80 bg-indigo-950/20 p-2.5 rounded-lg border border-indigo-900/40 flex items-center gap-2">
            <User className="w-3.5 h-3.5 shrink-0" />
            <span>Grounded in CRM Profile for <strong>{selectedContact.name}</strong> ({selectedContact.phone_number})</span>
          </div>
        )}
      </div>

      {/* AI Intelligence Output */}
      {assistData && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {/* Recommended Spoken Reply */}
          <div className="md:col-span-7 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h2 className="text-sm font-bold text-white flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                Recommended Response
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSpeakReply}
                  className={`p-1.5 rounded-lg border text-xs flex items-center gap-1 transition-colors ${
                    isSpeaking
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                      : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                  }`}
                  title="Read aloud with text-to-speech"
                >
                  <Volume2 className="w-3.5 h-3.5" />
                  <span>{isSpeaking ? 'Speaking...' : 'Listen'}</span>
                </button>
                <button
                  onClick={handleCopyReply}
                  className="p-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs flex items-center gap-1 transition-colors"
                  title="Copy to clipboard"
                >
                  {copiedReply ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedReply ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
            </div>

            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 text-sm leading-relaxed font-sans">
              "{assistData.recommended_reply}"
            </div>

            {assistData.suggested_outcome && (
              <div className="flex items-center gap-2 pt-2 text-xs">
                <span className="text-slate-400">Suggested Call Outcome:</span>
                <span className="capitalize px-2.5 py-0.5 rounded-full font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  {assistData.suggested_outcome.replace('_', ' ')}
                </span>
              </div>
            )}
          </div>

          {/* Extracted Needs & Recommended Action Items */}
          <div className="md:col-span-5 space-y-4">
            {/* Needs */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <HelpCircle className="w-3.5 h-3.5 text-indigo-400" />
                Detected Needs & Objections
              </h3>
              <div className="space-y-1.5">
                {assistData.extracted_needs.map((need, idx) => (
                  <div key={idx} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 text-xs text-slate-200 flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-1.5 shrink-0" />
                    <span>{need}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Action Items */}
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-400" />
                Recommended Next Actions
              </h3>
              <div className="space-y-2">
                {assistData.action_items.map((action, idx) => (
                  <div key={idx} className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 text-xs text-slate-200 flex items-center justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0" />
                      <span>{action}</span>
                    </div>
                    {onScheduleFollowUp && (
                      <button
                        onClick={() => onScheduleFollowUp(action)}
                        className="text-[10px] px-2 py-1 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-white rounded border border-amber-500/30 font-medium shrink-0"
                        title="Add to follow-up tasks"
                      >
                        + Task
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
