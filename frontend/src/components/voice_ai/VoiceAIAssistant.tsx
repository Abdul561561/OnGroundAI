import React, { useState, useEffect, useRef } from 'react';
import { api } from '../../services/api';
import { speechService, SpeechService } from '../../services/speech';
import { Message } from '../../types';
import {
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  Square,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Bot,
  User as UserIcon,
} from 'lucide-react';

export const VoiceAIAssistant: React.FC = () => {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isVoiceActive, setIsVoiceActive] = useState<boolean>(false);
  const [statusText, setStatusText] = useState<string>('Press Start to speak with OnGround AI');
  const [agentState, setAgentState] = useState<'idle' | 'listening' | 'processing' | 'speaking'>('idle');

  const [currentUtterance, setCurrentUtterance] = useState<string>('');
  const [dialogue, setDialogue] = useState<Message[]>([]);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  const recognitionSupported = SpeechService.isRecognitionSupported();
  const synthesisSupported = SpeechService.isSynthesisSupported();

  const conversationIdRef = useRef<string | null>(null);
  const isVoiceActiveRef = useRef<boolean>(false);
  const transcriptBottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    isVoiceActiveRef.current = isVoiceActive;
  }, [isVoiceActive]);

  useEffect(() => {
    return () => {
      speechService.stopListening();
      speechService.stopSpeaking();
    };
  }, []);

  useEffect(() => {
    transcriptBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [dialogue, currentUtterance]);

  const handleStartConversation = async () => {
    setErrorNotice(null);

    if (!recognitionSupported) {
      setErrorNotice(
        'Speech Recognition is not supported by your current browser. Speech recognition requires Google Chrome, Microsoft Edge, or a Chromium-based browser with the Web Speech API.'
      );
      return;
    }

    try {
      // 1. Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop the stream right away, speechRecognition handles its own audio capture
      stream.getTracks().forEach((track) => track.stop());

      setIsVoiceActive(true);
      startListeningCycle();
    } catch (err: any) {
      setErrorNotice(
        err.name === 'NotAllowedError'
          ? 'Microphone permission was denied. Please allow microphone access in your browser settings to speak.'
          : `Microphone access error: ${err.message}`
      );
      setIsVoiceActive(false);
      setAgentState('idle');
    }
  };

  const startListeningCycle = () => {
    setAgentState('listening');
    setStatusText('Listening to your voice... Speak naturally.');
    setCurrentUtterance('');

    speechService.startListening({
      onInterim: (interim) => {
        setCurrentUtterance(interim);
      },
      onResult: (finalText) => {
        setCurrentUtterance(finalText);
        speechService.stopListening();
        processVoiceInput(finalText);
      },
      onError: (errMsg) => {
        setErrorNotice(errMsg);
        if (isVoiceActiveRef.current) {
          // Retry listening if still active
          setTimeout(() => {
            if (isVoiceActiveRef.current) startListeningCycle();
          }, 1500);
        }
      },
      onEnd: () => {
        // If recognition stops but we're still listening without a final result, resume
        if (isVoiceActiveRef.current && agentState === 'listening') {
          startListeningCycle();
        }
      },
    });
  };

  const processVoiceInput = async (spokenText: string) => {
    if (!spokenText.trim()) {
      if (isVoiceActiveRef.current) startListeningCycle();
      return;
    }

    setAgentState('processing');
    setStatusText('OnGround AI is thinking...');

    // Optimistically show user speech in transcript
    const userMsg: Message = {
      _id: `temp-voice-${Date.now()}`,
      conversation_id: conversationIdRef.current || '',
      role: 'user',
      content: spokenText,
      created_at: new Date().toISOString(),
    };
    setDialogue((prev) => [...prev, userMsg]);
    setCurrentUtterance('');

    try {
      // Call backend AI
      const res = await api.sendMessage(
        spokenText,
        conversationIdRef.current || undefined,
        'voice_ai'
      );

      if (!conversationIdRef.current) {
        setConversationId(res.conversation_id);
      }

      setDialogue((prev) => [
        ...prev.filter((m) => m._id !== userMsg._id),
        res.user_message,
        res.ai_message,
      ]);

      // Speak AI response aloud
      speakResponse(res.ai_message.content);
    } catch (err: any) {
      setErrorNotice(`AI Error: ${err.message}`);
      setAgentState('idle');
      setStatusText('Failed to receive response from OpenRouter.');
      if (isVoiceActiveRef.current) {
        setTimeout(() => {
          if (isVoiceActiveRef.current) startListeningCycle();
        }, 2000);
      }
    }
  };

  const speakResponse = (text: string) => {
    setAgentState('speaking');
    setStatusText('OnGround AI is speaking...');

    speechService.speak(text, {
      onEnd: () => {
        if (isVoiceActiveRef.current) {
          // Seamlessly return to listening after speaking
          startListeningCycle();
        } else {
          setAgentState('idle');
          setStatusText('Conversation stopped.');
        }
      },
      onError: (e) => {
        console.warn('Speech synthesis error:', e);
        if (isVoiceActiveRef.current) {
          startListeningCycle();
        }
      },
    });
  };

  const handleInterrupt = () => {
    speechService.stopSpeaking();
    setStatusText('Interrupted. Listening again...');
    if (isVoiceActive) {
      startListeningCycle();
    }
  };

  const handleStopConversation = () => {
    speechService.stopListening();
    speechService.stopSpeaking();
    setIsVoiceActive(false);
    setAgentState('idle');
    setStatusText('Voice conversation ended.');
    setCurrentUtterance('');
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
              AI Voice Assistant
            </h1>
            <span className="px-2 py-0.5 text-[10px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> Live Audio Loop
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Real spoken input through your microphone, OpenRouter LLM intelligence, and live synthesized speech.
          </p>
        </div>

        {isVoiceActive && (
          <div className="flex items-center gap-2">
            {agentState === 'speaking' && (
              <button
                onClick={handleInterrupt}
                className="flex items-center gap-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-semibold px-3 py-2 rounded-xl transition-all"
              >
                <VolumeX className="w-3.5 h-3.5" />
                <span>Interrupt AI</span>
              </button>
            )}
            <button
              onClick={handleStopConversation}
              className="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition-all shadow-md shadow-rose-600/20"
            >
              <Square className="w-3.5 h-3.5" />
              <span>Stop Conversation</span>
            </button>
          </div>
        )}
      </div>

      {/* Browser Compatibility Notice */}
      {!recognitionSupported && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-xs text-amber-300 leading-relaxed">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-amber-200">Browser Speech API Limitation</p>
            <p className="mt-1">
              Your browser does not expose the native Web Speech API (<code>SpeechRecognition</code>).
              For live microphone voice recognition, please run this application on Google Chrome,
              Microsoft Edge, or Brave. In non-Chromium browsers (such as Firefox), speech recognition is
              not supported natively.
            </p>
          </div>
        </div>
      )}

      {errorNotice && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-between text-xs text-rose-300">
          <span>{errorNotice}</span>
          <button
            onClick={() => setErrorNotice(null)}
            className="text-rose-400 hover:underline font-semibold ml-2"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Visual Voice Center Card */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-8 sm:p-12 text-center relative overflow-hidden shadow-2xl flex flex-col items-center justify-center">
        {/* Animated Background Glow */}
        <div
          className={`absolute w-72 h-72 rounded-full blur-3xl transition-opacity duration-1000 ${
            agentState === 'listening'
              ? 'bg-blue-600/20 opacity-100 animate-pulse-slow'
              : agentState === 'speaking'
              ? 'bg-emerald-600/20 opacity-100 animate-pulse-slow'
              : agentState === 'processing'
              ? 'bg-indigo-600/20 opacity-100 animate-pulse-slow'
              : 'opacity-0'
          }`}
        />

        {/* Dynamic Voice Avatar Button */}
        <div className="relative mb-6">
          {/* Animated concentric rings */}
          {agentState === 'listening' && (
            <div className="absolute inset-0 rounded-full border-2 border-blue-500 animate-ping opacity-40 scale-150" />
          )}
          {agentState === 'speaking' && (
            <div className="absolute inset-0 rounded-full border-2 border-emerald-500 animate-ping opacity-40 scale-150" />
          )}

          <button
            onClick={isVoiceActive ? handleStopConversation : handleStartConversation}
            className={`w-24 h-24 sm:w-28 sm:h-28 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl relative z-10 ${
              agentState === 'listening'
                ? 'bg-gradient-to-tr from-blue-600 to-cyan-500 text-white shadow-blue-500/50 scale-105'
                : agentState === 'speaking'
                ? 'bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-emerald-500/50 scale-105'
                : agentState === 'processing'
                ? 'bg-gradient-to-tr from-indigo-600 to-purple-600 text-white shadow-indigo-500/50'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700'
            }`}
          >
            {agentState === 'speaking' ? (
              <Volume2 className="w-10 h-10 animate-pulse" />
            ) : agentState === 'listening' ? (
              <Mic className="w-10 h-10 animate-bounce" />
            ) : (
              <Mic className="w-10 h-10" />
            )}
          </button>
        </div>

        {/* State Label & Subtext */}
        <div className="relative z-10 space-y-2 max-w-md">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs font-semibold text-slate-300">
            <span
              className={`w-2 h-2 rounded-full ${
                agentState === 'listening'
                  ? 'bg-blue-400 animate-ping'
                  : agentState === 'speaking'
                  ? 'bg-emerald-400 animate-pulse'
                  : agentState === 'processing'
                  ? 'bg-indigo-400 animate-spin'
                  : 'bg-slate-500'
              }`}
            />
            <span className="capitalize">{agentState}</span>
          </div>

          <h3 className="text-lg font-bold text-white">{statusText}</h3>

          {/* Current Live Utterance Preview */}
          {currentUtterance && (
            <p className="text-sm text-cyan-300 italic bg-cyan-950/40 border border-cyan-800/40 px-4 py-2 rounded-xl mt-3">
              "{currentUtterance}"
            </p>
          )}

          {!isVoiceActive && (
            <div className="pt-4">
              <button
                onClick={handleStartConversation}
                className="bg-gradient-to-r from-blue-600 via-indigo-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white font-semibold text-sm px-6 py-3 rounded-2xl shadow-xl shadow-blue-600/30 transition-all"
              >
                Start Voice Conversation
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Spoken Dialogue Transcript Section */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-bold text-white">Live Conversation Transcript</h3>
          </div>
          <span className="text-[11px] text-slate-500">{dialogue.length} messages</span>
        </div>

        {dialogue.length === 0 ? (
          <div className="text-center py-8 text-xs text-slate-500">
            Transcripts of recognized speech and spoken AI responses will appear here.
          </div>
        ) : (
          <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
            {dialogue.map((m) => {
              const isUser = m.role === 'user';
              return (
                <div
                  key={m._id}
                  className={`p-3.5 rounded-xl border text-xs leading-relaxed flex items-start gap-3 ${
                    isUser
                      ? 'bg-blue-950/30 border-blue-900/40 text-blue-100'
                      : 'bg-slate-800/40 border-slate-700/60 text-slate-200'
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 font-bold text-[10px] ${
                      isUser ? 'bg-blue-600 text-white' : 'bg-slate-700 text-blue-400'
                    }`}
                  >
                    {isUser ? <UserIcon className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-[11px] text-slate-400">
                        {isUser ? 'You (Spoken Input)' : 'OnGround AI (Voice Output)'}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        {new Date(m.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>
                </div>
              );
            })}
            <div ref={transcriptBottomRef} />
          </div>
        )}
      </div>
    </div>
  );
};
