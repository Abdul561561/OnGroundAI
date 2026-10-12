import React from 'react';
import { useCall } from '../../context/CallContext';
import {
  PhoneOff,
  Mic,
  MicOff,
  Radio,
  Clock,
  Shield,
  Volume2,
  AlertCircle,
} from 'lucide-react';

export const ActiveCallModal: React.FC = () => {
  const { activeCall, endCall, toggleMute, callError, clearCallError } = useCall();

  if (!activeCall || activeCall.state === 'incoming') return null;

  const formatTimer = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (state: string) => {
    switch (state) {
      case 'connected':
        return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30';
      case 'calling':
      case 'connecting':
        return 'text-amber-400 bg-amber-500/10 border-amber-500/30';
      case 'rejected':
      case 'failed':
        return 'text-rose-400 bg-rose-500/10 border-rose-500/30';
      default:
        return 'text-slate-400 bg-slate-800 border-slate-700';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700 rounded-3xl w-full max-w-md p-6 sm:p-8 text-center shadow-2xl relative space-y-6">
        {/* Error Notification */}
        {callError && (
          <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl flex items-center justify-between text-xs text-rose-300 text-left">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{callError}</span>
            </div>
            <button onClick={clearCallError} className="text-rose-400 hover:underline ml-2">
              Dismiss
            </button>
          </div>
        )}

        {/* Peer Profile Avatar & Pulsing Waveform */}
        <div className="relative mx-auto w-28 h-28 flex items-center justify-center">
          {activeCall.state === 'connected' && (
            <div className="absolute inset-0 rounded-full border-2 border-emerald-400/40 animate-ping opacity-60" />
          )}
          {activeCall.state === 'calling' && (
            <div className="absolute inset-0 rounded-full border-2 border-amber-400/40 animate-ping opacity-60" />
          )}
          <div className="w-24 h-24 rounded-full bg-gradient-to-tr from-cyan-600 to-blue-700 text-white font-bold text-2xl flex items-center justify-center shadow-2xl border-2 border-slate-700 relative z-10">
            {activeCall.peerName.charAt(0).toUpperCase()}
          </div>
        </div>

        {/* Peer Info & Real Duration */}
        <div className="space-y-2">
          <h2 className="text-xl font-bold text-white tracking-tight">{activeCall.peerName}</h2>

          <div className="flex items-center justify-center gap-2">
            <span
              className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${getStatusColor(
                activeCall.state
              )}`}
            >
              {activeCall.state === 'connected'
                ? 'Connected (Live WebRTC Audio)'
                : activeCall.state === 'calling'
                ? 'Ringing...'
                : activeCall.state === 'connecting'
                ? 'Establishing P2P Media...'
                : activeCall.state === 'ended'
                ? 'Call Ended'
                : activeCall.state}
            </span>
          </div>

          {activeCall.state === 'connected' && (
            <div className="flex items-center justify-center gap-1.5 text-slate-300 font-mono text-sm pt-1">
              <Clock className="w-4 h-4 text-emerald-400" />
              <span className="font-bold">{formatTimer(activeCall.durationSeconds)}</span>
            </div>
          )}
        </div>

        {/* Live Audio Waves Simulation */}
        {activeCall.state === 'connected' && (
          <div className="flex items-center justify-center gap-1.5 py-2">
            {[40, 75, 55, 90, 60, 80, 45, 95, 50, 70].map((h, i) => (
              <span
                key={i}
                className="w-1 bg-cyan-400 rounded-full animate-pulse"
                style={{
                  height: `${activeCall.isMuted ? 8 : (h * 0.35)}px`,
                  animationDuration: `${0.4 + (i % 3) * 0.2}s`,
                }}
              />
            ))}
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center justify-center gap-5 pt-4">
          {/* Mute Button */}
          {activeCall.state === 'connected' && (
            <button
              onClick={toggleMute}
              className={`p-3.5 rounded-2xl border transition-all ${
                activeCall.isMuted
                  ? 'bg-rose-500/20 border-rose-500/50 text-rose-400'
                  : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700'
              }`}
              title={activeCall.isMuted ? 'Unmute microphone' : 'Mute microphone'}
            >
              {activeCall.isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
          )}

          {/* End Call Button */}
          <button
            onClick={endCall}
            className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs px-6 py-3.5 rounded-2xl transition-all shadow-lg shadow-rose-600/30"
          >
            <PhoneOff className="w-5 h-5" />
            <span>End Call</span>
          </button>
        </div>

        <div className="pt-2">
          <p className="text-[11px] text-slate-500 flex items-center justify-center gap-1.5">
            <Shield className="w-3 h-3 text-cyan-400" />
            <span>Encrypted WebRTC P2P stream via Google STUN</span>
          </p>
        </div>
      </div>
    </div>
  );
};
