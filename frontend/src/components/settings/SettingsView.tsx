import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { speechService, SpeechService } from '../../services/speech';
import {
  User,
  ShieldAlert,
  Mic,
  Server,
  Cpu,
  Database,
  Radio,
  CheckCircle2,
  AlertTriangle,
  Info,
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const { user } = useAuth();
  const [micTesting, setMicTesting] = useState(false);
  const [micVolume, setMicVolume] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);

  const recognitionSupported = SpeechService.isRecognitionSupported();
  const synthesisSupported = SpeechService.isSynthesisSupported();

  useEffect(() => {
    let audioContext: AudioContext | null = null;
    let micStream: MediaStream | null = null;
    let animId: number;

    if (micTesting) {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          micStream = stream;
          audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 256;
          const source = audioContext.createMediaStreamSource(stream);
          source.connect(analyser);

          const dataArray = new Uint8Array(analyser.frequencyBinCount);
          const updateMeter = () => {
            analyser.getByteFrequencyData(dataArray);
            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
              sum += dataArray[i];
            }
            const average = sum / dataArray.length;
            setMicVolume(Math.min(100, Math.round(average * 2)));
            animId = requestAnimationFrame(updateMeter);
          };
          updateMeter();
        })
        .catch((err) => {
          setMicError(`Microphone access error: ${err.message}`);
          setMicTesting(false);
        });
    }

    return () => {
      cancelAnimationFrame(animId);
      if (micStream) micStream.getTracks().forEach((t) => t.stop());
      if (audioContext) audioContext.close().catch(() => {});
    };
  }, [micTesting]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
          System Settings & Platform Architecture
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Audio device permissions, technical disclosures, and real-time connectivity status.
        </p>
      </div>

      {/* Prominent Transparent Telephony Notice */}
      <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2">
        <div className="flex items-center gap-2 text-amber-300 font-bold text-sm">
          <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
          <span>Transparent Limitation: Browser-to-Browser WebRTC vs. PSTN Calling</span>
        </div>
        <p className="text-xs text-amber-200/90 leading-relaxed">
          OnGround AI implements <strong>authentic browser-to-browser WebRTC audio calling</strong> between
          authenticated platform users. In strict adherence to our no-payment and honest engineering principles,
          we <strong>never simulate, fake, or invent</strong> phone numbers, telephone dial tones, or PSTN carrier connections.
          Placing phone calls to ordinary cellphones or landline numbers requires paid telephony carrier integration
          (such as Twilio Voice trunking or SIP gateways), which requires paid subscriptions.
          All voice calls inside OnGround AI use genuine WebRTC peer-to-peer audio tracks.
        </p>
      </div>

      {/* Audio Hardware & Speech API Diagnostics */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <Mic className="w-4 h-4 text-blue-400" />
          <span>Microphone & Speech Diagnostics</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-3.5 bg-slate-800/50 rounded-xl border border-slate-700/60 flex items-center justify-between">
            <span className="text-slate-300">Speech Recognition (SpeechRecognition):</span>
            {recognitionSupported ? (
              <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" /> Supported
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-400 font-semibold">
                <AlertTriangle className="w-3.5 h-3.5" /> Non-Chromium Browser
              </span>
            )}
          </div>

          <div className="p-3.5 bg-slate-800/50 rounded-xl border border-slate-700/60 flex items-center justify-between">
            <span className="text-slate-300">Speech Synthesis (SpeechSynthesis):</span>
            {synthesisSupported ? (
              <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" /> Supported
              </span>
            ) : (
              <span className="flex items-center gap-1 text-rose-400 font-semibold">
                <AlertTriangle className="w-3.5 h-3.5" /> Unsupported
              </span>
            )}
          </div>
        </div>

        {/* Live Mic Test */}
        <div className="p-4 bg-slate-950/70 rounded-xl border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold text-white">Live Microphone Hardware Test</p>
              <p className="text-[11px] text-slate-400">
                Verify that your browser can access your microphone and capture input.
              </p>
            </div>
            <button
              onClick={() => {
                setMicError(null);
                setMicTesting(!micTesting);
              }}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${
                micTesting
                  ? 'bg-rose-600 hover:bg-rose-500 text-white'
                  : 'bg-blue-600 hover:bg-blue-500 text-white'
              }`}
            >
              {micTesting ? 'Stop Test' : 'Test Microphone'}
            </button>
          </div>

          {micError && <p className="text-xs text-rose-400">{micError}</p>}

          {micTesting && (
            <div className="space-y-1">
              <div className="flex justify-between text-[11px] text-slate-400">
                <span>Microphone Input Level</span>
                <span className="font-mono">{micVolume}%</span>
              </div>
              <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 via-yellow-500 to-rose-500 transition-all duration-75"
                  style={{ width: `${micVolume}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Network & STUN/TURN Architecture */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-4">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <Radio className="w-4 h-4 text-cyan-400" />
          <span>WebRTC STUN / TURN Architecture</span>
        </h2>

        <div className="text-xs text-slate-300 space-y-3 leading-relaxed">
          <p>
            WebRTC uses <strong>Interactive Connectivity Establishment (ICE)</strong> to discover the best
            path between two browser endpoints:
          </p>

          <ul className="list-disc pl-5 space-y-1.5 text-slate-400">
            <li>
              <strong className="text-slate-200">Google STUN Servers:</strong> The application uses free public
              STUN servers (<code>stun:stun.l.google.com:19302</code>) to determine each browser's public IP address
              and port for direct peer-to-peer media transmission.
            </li>
            <li>
              <strong className="text-slate-200">Signaling Server:</strong> FastAPI WebSocket connection provides
              instantaneous exchange of SDP session offers, answers, and ICE candidate packets.
            </li>
            <li>
              <strong className="text-slate-200">TURN Relay Requirement:</strong> On restrictive enterprise networks
              (symmetric NATs or restrictive corporate firewalls) where direct UDP peer-to-peer traffic is blocked,
              a configured TURN relay server (such as Coturn) is technically required to relay media packets.
            </li>
          </ul>
        </div>
      </div>

      {/* Account Info */}
      {user && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 space-y-3">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <User className="w-4 h-4 text-indigo-400" />
            <span>Authenticated Agent Profile</span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-800">
              <span className="text-slate-500 block">Agent Name</span>
              <span className="font-semibold text-white">{user.name}</span>
            </div>
            <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-800">
              <span className="text-slate-500 block">Email Address</span>
              <span className="font-semibold text-white">{user.email}</span>
            </div>
            <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-800">
              <span className="text-slate-500 block">User Identifier</span>
              <code className="text-blue-400 text-[11px]">{user._id}</code>
            </div>
            <div className="p-3 bg-slate-800/40 rounded-xl border border-slate-800">
              <span className="text-slate-500 block">Availability</span>
              <span className="font-semibold text-emerald-400 capitalize">{user.status}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
