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
  const {
    activeCall,
    endCall,
    toggleMute,
    callError,
    clearCallError,
    audioLevel,
    isAudioPlaybackBlocked,
    unlockAudioPlayback,
  } = useCall();

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
          <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl space-y-1 text-xs text-rose-300 text-left">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                <span className="font-semibold">{callError}</span>
              </div>
              <button onClick={clearCallError} className="text-rose-400 hover:underline ml-2 text-[11px]">
                Dismiss
              </button>
            </div>
            {callError.toLowerCase().includes('microphone') && (
              <p className="text-[11px] text-rose-200/80 pl-6">
                Please click the tune / lock icon next to the URL in your browser bar and set Microphone to <strong>Allow</strong>.
              </p>
            )}
          </div>
        )}

        {/* Autoplay Policy Unblock Banner */}
        {isAudioPlaybackBlocked && (
          <div className="p-3 bg-amber-500/20 border border-amber-500/40 rounded-2xl flex items-center justify-between text-xs text-amber-200 animate-pulse">
            <div className="flex items-center gap-2">
              <Volume2 className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Browser paused remote audio output.</span>
            </div>
            <button
              onClick={unlockAudioPlayback}
              className="bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold px-3 py-1 rounded-xl text-[11px] transition-all cursor-pointer shadow-md"
            >
              Enable Audio
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

        {/* Real-Time Audio Level Meter (Driven by Web Audio API AnalyserNode) */}
        {activeCall.state === 'connected' && (
          <div className="space-y-1.5 py-1">
            <div className="flex items-center justify-center gap-1.5 h-8">
              {[0.4, 0.7, 1.0, 1.3, 1.1, 0.8, 0.5, 0.3].map((mult, idx) => {
                const height = activeCall.isMuted
                  ? 4
                  : Math.max(4, Math.min(30, Math.round((audioLevel * mult * 0.4))));
                return (
                  <span
                    key={idx}
                    className={`w-1.5 rounded-full transition-all duration-75 ${
                      activeCall.isMuted
                        ? 'bg-slate-600'
                        : audioLevel > 15
                        ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50'
                        : 'bg-cyan-500/60'
                    }`}
                    style={{ height: `${height}px` }}
                  />
                );
              })}
            </div>
            <p className="text-[10px] text-slate-400 flex items-center justify-center gap-1 font-mono">
              <Radio className={`w-3 h-3 ${audioLevel > 10 ? 'text-emerald-400 animate-pulse' : 'text-slate-500'}`} />
              <span>
                {activeCall.isMuted
                  ? 'Microphone Muted'
                  : audioLevel > 10
                  ? `Live Audio Level: ${audioLevel}%`
                  : 'Microphone Active (Encrypted Stream)'}
              </span>
            </p>
          </div>
        )}

        {/* Controls */}
        <div className="flex items-center justify-center gap-5 pt-2">
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
            className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs px-6 py-3.5 rounded-2xl transition-all shadow-lg shadow-rose-600/30 cursor-pointer"
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
