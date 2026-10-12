import React, { useEffect, useRef } from 'react';
import { useCall } from '../../context/CallContext';
import { Phone, PhoneOff, Radio } from 'lucide-react';

export const IncomingCallModal: React.FC = () => {
  const { activeCall, acceptCall, rejectCall } = useCall();
  const ringtoneAudioRef = useRef<HTMLAudioElement | null>(null);

  const isIncoming = activeCall && activeCall.state === 'incoming';

  useEffect(() => {
    // Play subtle synthetic ringtone using Web Audio API
    if (isIncoming) {
      try {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        let interval: any;

        const playChime = () => {
          if (audioCtx.state === 'suspended') audioCtx.resume();
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(440, audioCtx.currentTime); // A4
          osc.frequency.setValueAtTime(480, audioCtx.currentTime + 0.1); // B4
          gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.8);
          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start();
          osc.stop(audioCtx.currentTime + 0.8);
        };

        playChime();
        interval = setInterval(playChime, 2500);

        return () => {
          clearInterval(interval);
          audioCtx.close().catch(() => {});
        };
      } catch (e) {
        console.warn('Ringtone AudioContext:', e);
      }
    }
  }, [isIncoming]);

  if (!isIncoming) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-slate-700/80 rounded-3xl w-full max-w-sm p-6 text-center shadow-2xl relative space-y-6">
        {/* Pulsing Ringing Icon */}
        <div className="relative mx-auto w-24 h-24 flex items-center justify-center">
          <div className="absolute inset-0 rounded-full border-2 border-emerald-400 animate-ping opacity-75" />
          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-emerald-600 to-teal-400 text-white flex items-center justify-center shadow-lg shadow-emerald-500/40 relative z-10">
            <Radio className="w-10 h-10 animate-bounce" />
          </div>
        </div>

        <div className="space-y-1">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/30">
            Incoming WebRTC Audio Call
          </span>
          <h3 className="text-xl font-bold text-white mt-2">{activeCall.peerName}</h3>
          <p className="text-xs text-slate-400">is calling your browser session...</p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-center gap-6 pt-2">
          {/* Decline Button */}
          <button
            onClick={rejectCall}
            className="flex flex-col items-center gap-1.5 text-xs text-slate-400 hover:text-rose-400 group transition-colors"
          >
            <div className="w-14 h-14 rounded-full bg-rose-600/20 group-hover:bg-rose-600 text-rose-400 group-hover:text-white border border-rose-500/40 flex items-center justify-center transition-all shadow-md group-hover:shadow-rose-600/30">
              <PhoneOff className="w-6 h-6" />
            </div>
            <span>Decline</span>
          </button>

          {/* Accept Button */}
          <button
            onClick={acceptCall}
            className="flex flex-col items-center gap-1.5 text-xs text-slate-400 hover:text-emerald-400 group transition-colors"
          >
            <div className="w-14 h-14 rounded-full bg-emerald-600 group-hover:bg-emerald-500 text-white flex items-center justify-center transition-all shadow-lg shadow-emerald-600/40 scale-110">
              <Phone className="w-6 h-6 animate-pulse" />
            </div>
            <span className="font-semibold text-emerald-400">Accept Call</span>
          </button>
        </div>
      </div>
    </div>
  );
};
