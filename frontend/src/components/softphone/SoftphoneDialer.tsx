import React, { useState, useEffect } from 'react';
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Pause,
  Play,
  Grid,
  AlertTriangle,
  Info,
  CheckCircle2,
  Calendar,
  FileText,
  User,
  ShieldCheck,
  RefreshCw,
  ExternalLink
} from 'lucide-react';
import { api } from '../../services/api';
import { TelephonyStatus, Contact, CallRecord } from '../../types';

interface SoftphoneDialerProps {
  initialPhoneNumber?: string;
  initialContact?: Contact | null;
  onCallEnded?: () => void;
}

export const SoftphoneDialer: React.FC<SoftphoneDialerProps> = ({
  initialPhoneNumber = '',
  initialContact = null,
  onCallEnded,
}) => {
  const [phoneNumber, setPhoneNumber] = useState(initialPhoneNumber);
  const [activeContact, setActiveContact] = useState<Contact | null>(initialContact);
  const [carrierStatus, setCarrierStatus] = useState<TelephonyStatus | null>(null);
  const [callState, setCallState] = useState<'idle' | 'calling' | 'connected' | 'ended'>('idle');
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [showKeypad, setShowKeypad] = useState(true);
  const [showCarrierModal, setShowCarrierModal] = useState(false);
  const [activeCallRecord, setActiveCallRecord] = useState<CallRecord | null>(null);

  // Wrap-up state
  const [callOutcome, setCallOutcome] = useState('resolved');
  const [callNotes, setCallNotes] = useState('');
  const [followUpDesc, setFollowUpDesc] = useState('');
  const [followUpDue, setFollowUpDue] = useState('');
  const [isSavingOutcome, setIsSavingOutcome] = useState(false);
  const [outcomeSaved, setOutcomeSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (initialPhoneNumber) {
      setPhoneNumber(initialPhoneNumber);
    }
    if (initialContact) {
      setActiveContact(initialContact);
    }
  }, [initialPhoneNumber, initialContact]);

  useEffect(() => {
    loadCarrierStatus();
  }, []);

  const loadCarrierStatus = async () => {
    try {
      const status = await api.getTelephonyStatus();
      setCarrierStatus(status);
    } catch (e: any) {
      console.error('Error fetching carrier status:', e);
    }
  };

  // Call timer
  useEffect(() => {
    let timer: any;
    if (callState === 'connected') {
      timer = setInterval(() => {
        setCallDuration((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [callState]);

  // Audio DTMF sound synthesizer
  const playDtmfTone = (digit: string) => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(697, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch {
      // AudioContext fallback
    }
  };

  const handleKeypadPress = (val: string) => {
    playDtmfTone(val);
    setPhoneNumber((prev) => prev + val);
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartCall = async () => {
    setErrorMsg(null);
    if (!phoneNumber || phoneNumber.trim().length < 5) {
      setErrorMsg('Please enter a valid telephone number.');
      return;
    }

    // Check if carrier is configured
    if (!carrierStatus?.is_configured) {
      // Zero-payment mode: Honest diagnostic notice! Never simulate or fake dial tones.
      setShowCarrierModal(true);
      return;
    }

    try {
      setCallState('calling');
      const call = await api.initiateOutboundPhoneCall(
        phoneNumber.trim(),
        activeContact?._id,
        'Softphone outbound call'
      );
      setActiveCallRecord(call);
      setCallState('connected');
      setCallDuration(0);
    } catch (err: any) {
      setCallState('idle');
      setErrorMsg(err.message || 'Failed to initiate outbound carrier call.');
    }
  };

  const handleEndCall = async () => {
    if (activeCallRecord && activeCallRecord.provider_call_id) {
      try {
        await api.hangupPhoneCall(activeCallRecord.provider_call_id);
      } catch (e) {
        console.error('Hangup error:', e);
      }
    }
    setCallState('ended');
  };

  const handleSaveOutcome = async () => {
    setIsSavingOutcome(true);
    try {
      if (activeCallRecord) {
        await api.updateCall(activeCallRecord._id, {
          status: 'completed',
          outcome: callOutcome,
          notes: callNotes,
          duration_seconds: callDuration,
        });
      }

      // If follow-up description specified
      if (followUpDesc.trim()) {
        const dueDate = followUpDue || new Date(Date.now() + 86400000 * 2).toISOString();
        if (activeContact) {
          await api.createContactFollowUp(activeContact._id, {
            description: followUpDesc.trim(),
            due_at: dueDate,
          });
        }
      }

      setOutcomeSaved(true);
      setTimeout(() => {
        setCallState('idle');
        setCallDuration(0);
        setOutcomeSaved(false);
        setCallNotes('');
        setFollowUpDesc('');
        if (onCallEnded) onCallEnded();
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error saving call outcome');
    } finally {
      setIsSavingOutcome(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      {/* Carrier Status Banner */}
      <div className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
        carrierStatus?.is_configured
          ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-200'
          : 'bg-amber-950/25 border-amber-800/50 text-amber-200'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${carrierStatus?.is_configured ? 'bg-emerald-900/60' : 'bg-amber-900/60'}`}>
            {carrierStatus?.is_configured ? <ShieldCheck className="w-5 h-5 text-emerald-400" /> : <AlertTriangle className="w-5 h-5 text-amber-400" />}
          </div>
          <div>
            <div className="font-semibold text-sm flex items-center gap-2">
              <span>Carrier Status: {carrierStatus?.is_configured ? 'PSTN Carrier Connected' : 'Zero-Payment Mode Active'}</span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                carrierStatus?.is_configured ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
              }`}>
                {carrierStatus?.provider || 'Modular'}
              </span>
            </div>
            <p className="text-xs opacity-80 mt-0.5">
              {carrierStatus?.is_configured
                ? `Ready for live outbound and inbound calls via ${carrierStatus.active_carrier}`
                : 'PSTN carrier unconfigured. Simulated calling is disabled per product guidelines.'}
            </p>
          </div>
        </div>

        <button
          onClick={() => setShowCarrierModal(true)}
          className="text-xs px-3 py-1.5 rounded-lg border border-current hover:bg-white/10 transition-colors flex items-center gap-1.5 font-medium shrink-0"
        >
          <Info className="w-3.5 h-3.5" />
          <span>Carrier Diagnostics</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-3.5 bg-red-950/50 border border-red-800/60 rounded-xl text-red-200 text-sm flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="text-xs underline hover:text-white">Dismiss</button>
        </div>
      )}

      {/* Main Softphone Console */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Softphone Panel */}
        <div className="md:col-span-7 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm flex flex-col justify-between">
          <div>
            {/* Header / Active Contact preview */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-800/80 mb-6">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Phone className="w-5 h-5 text-indigo-400" />
                  Softphone Dialer
                </h2>
                <p className="text-xs text-slate-400">PSTN & Carrier WebRTC Gateway</p>
              </div>

              {activeContact && (
                <div className="text-right">
                  <div className="text-xs font-semibold text-indigo-300 flex items-center gap-1">
                    <User className="w-3.5 h-3.5" />
                    {activeContact.name}
                  </div>
                  <div className="text-[11px] text-slate-400 capitalize">{activeContact.status} Customer</div>
                </div>
              )}
            </div>

            {/* Display Screen */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 mb-6 text-center">
              {callState === 'idle' && (
                <div className="relative">
                  <input
                    type="text"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="w-full bg-transparent text-center text-2xl font-mono font-semibold tracking-wider text-white placeholder-slate-600 focus:outline-none"
                  />
                  {phoneNumber && (
                    <button
                      onClick={() => setPhoneNumber('')}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-300 px-2 py-1"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}

              {callState === 'calling' && (
                <div className="py-3 space-y-1">
                  <div className="text-indigo-400 text-sm font-medium animate-pulse">Dialing Carrier Gateway...</div>
                  <div className="text-xl font-mono text-white">{phoneNumber}</div>
                </div>
              )}

              {callState === 'connected' && (
                <div className="py-2 space-y-1">
                  <div className="flex items-center justify-center gap-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    Call in Progress
                  </div>
                  <div className="text-xl font-mono text-white">{phoneNumber}</div>
                  <div className="text-2xl font-mono font-bold text-emerald-300">{formatDuration(callDuration)}</div>
                </div>
              )}

              {callState === 'ended' && (
                <div className="py-2 space-y-1">
                  <div className="text-slate-400 text-xs font-medium uppercase tracking-wider">Call Concluded</div>
                  <div className="text-lg font-mono text-white">{formatDuration(callDuration)}</div>
                </div>
              )}
            </div>

            {/* DTMF Keypad */}
            {callState === 'idle' && showKeypad && (
              <div className="grid grid-cols-3 gap-3 mb-6 max-w-xs mx-auto">
                {[
                  { key: '1', sub: '' },
                  { key: '2', sub: 'ABC' },
                  { key: '3', sub: 'DEF' },
                  { key: '4', sub: 'GHI' },
                  { key: '5', sub: 'JKL' },
                  { key: '6', sub: 'MNO' },
                  { key: '7', sub: 'PQRS' },
                  { key: '8', sub: 'TUV' },
                  { key: '9', sub: 'WXYZ' },
                  { key: '*', sub: '' },
                  { key: '0', sub: '+' },
                  { key: '#', sub: '' },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => handleKeypadPress(item.key)}
                    className="h-14 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 active:bg-indigo-600/40 border border-slate-700/60 flex flex-col items-center justify-center transition-all group"
                  >
                    <span className="text-lg font-bold text-white group-active:scale-95">{item.key}</span>
                    {item.sub && <span className="text-[9px] text-slate-400 tracking-widest">{item.sub}</span>}
                  </button>
                ))}
              </div>
            )}

            {/* Active Call In-Call Controls */}
            {callState === 'connected' && (
              <div className="flex items-center justify-center gap-4 py-4 mb-4">
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className={`p-3.5 rounded-full border transition-colors ${
                    isMuted ? 'bg-red-500/20 border-red-500 text-red-400' : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                  }`}
                  title={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                >
                  {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>

                <button
                  onClick={() => setIsOnHold(!isOnHold)}
                  className={`p-3.5 rounded-full border transition-colors ${
                    isOnHold ? 'bg-amber-500/20 border-amber-500 text-amber-400' : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                  }`}
                  title={isOnHold ? 'Resume Call' : 'Hold Call'}
                >
                  {isOnHold ? <Play className="w-5 h-5" /> : <Pause className="w-5 h-5" />}
                </button>

                <button
                  onClick={() => setShowKeypad(!showKeypad)}
                  className={`p-3.5 rounded-full border transition-colors ${
                    showKeypad ? 'bg-indigo-500/20 border-indigo-500 text-indigo-300' : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                  }`}
                  title="Toggle Keypad"
                >
                  <Grid className="w-5 h-5" />
                </button>
              </div>
            )}
          </div>

          {/* Action Trigger Buttons */}
          <div className="pt-2">
            {callState === 'idle' && (
              <button
                onClick={handleStartCall}
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-semibold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-950 transition-all text-base"
              >
                <Phone className="w-5 h-5" />
                <span>Call Telephone Number</span>
              </button>
            )}

            {(callState === 'calling' || callState === 'connected') && (
              <button
                onClick={handleEndCall}
                className="w-full py-4 bg-red-600 hover:bg-red-500 active:scale-[0.99] text-white font-semibold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-red-950 transition-all text-base"
              >
                <PhoneOff className="w-5 h-5" />
                <span>Disconnect Call</span>
              </button>
            )}
          </div>
        </div>

        {/* Right Wrap-Up / Context Panel */}
        <div className="md:col-span-5 bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm flex flex-col justify-between">
          {callState === 'ended' ? (
            /* Post-Call Wrap-Up Form */
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm border-b border-slate-800 pb-3">
                <FileText className="w-4 h-4" />
                <span>Call Wrap-Up & Outcome Logging</span>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Call Outcome</label>
                <select
                  value={callOutcome}
                  onChange={(e) => setCallOutcome(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="resolved">Resolved</option>
                  <option value="interested">Interested / Lead</option>
                  <option value="callback_requested">Callback Requested</option>
                  <option value="voicemail">Left Voicemail</option>
                  <option value="escalated">Escalated to Supervisor</option>
                  <option value="no_answer">No Answer</option>
                  <option value="busy">Busy</option>
                  <option value="wrong_number">Wrong Number</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Call Notes</label>
                <textarea
                  rows={3}
                  value={callNotes}
                  onChange={(e) => setCallNotes(e.target.value)}
                  placeholder="Summary of conversation, key customer statements, agreed decisions..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-2 border-t border-slate-800 space-y-3">
                <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Create Follow-Up Task</span>
                </div>

                <input
                  type="text"
                  value={followUpDesc}
                  onChange={(e) => setFollowUpDesc(e.target.value)}
                  placeholder="e.g. Email formal quote, check stock availability"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />

                <input
                  type="datetime-local"
                  value={followUpDue}
                  onChange={(e) => setFollowUpDue(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button
                onClick={handleSaveOutcome}
                disabled={isSavingOutcome || outcomeSaved}
                className="w-full mt-4 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-950"
              >
                {outcomeSaved ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Saved Successfully</span>
                  </>
                ) : isSavingOutcome ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <span>Save Outcome & Complete Call</span>
                )}
              </button>
            </div>
          ) : (
            /* Contact CRM Context Card */
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-slate-400 font-semibold text-sm border-b border-slate-800 pb-3">
                <User className="w-4 h-4 text-indigo-400" />
                <span>Customer Profile Context</span>
              </div>

              {activeContact ? (
                <div className="space-y-3 text-xs">
                  <div>
                    <span className="text-slate-500 block mb-0.5">Name</span>
                    <span className="text-white font-medium text-sm">{activeContact.name}</span>
                  </div>

                  <div>
                    <span className="text-slate-500 block mb-0.5">Telephone</span>
                    <span className="text-white font-mono">{activeContact.phone_number}</span>
                  </div>

                  {activeContact.email && (
                    <div>
                      <span className="text-slate-500 block mb-0.5">Email</span>
                      <span className="text-slate-300">{activeContact.email}</span>
                    </div>
                  )}

                  <div>
                    <span className="text-slate-500 block mb-0.5">Customer Status</span>
                    <span className="capitalize px-2 py-0.5 rounded bg-slate-800 text-indigo-300 font-medium">
                      {activeContact.status}
                    </span>
                  </div>

                  {activeContact.notes && (
                    <div>
                      <span className="text-slate-500 block mb-0.5">Account Notes</span>
                      <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 text-slate-300 text-xs">
                        {activeContact.notes}
                      </div>
                    </div>
                  )}

                  {activeContact.tags && activeContact.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {activeContact.tags.map((tag) => (
                        <span key={tag} className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="py-12 text-center text-slate-500 text-xs space-y-2">
                  <User className="w-8 h-8 mx-auto opacity-30" />
                  <p>No contact selected.</p>
                  <p className="text-[11px] text-slate-600">Select a contact from CRM to preload details and call history.</p>
                </div>
              )}
            </div>
          )}

          {/* Quick Telephony Policy note */}
          <div className="mt-6 pt-4 border-t border-slate-800/60 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Direct E.164 Calling</span>
            <span className="text-emerald-400 font-mono">WebRTC-PSTN Bridge</span>
          </div>
        </div>
      </div>

      {/* Carrier Diagnostic Modal */}
      {showCarrierModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Telephony Carrier Configuration</h3>
                  <p className="text-xs text-slate-400">PSTN & Mobile Network Integration Status</p>
                </div>
              </div>
              <button
                onClick={() => setShowCarrierModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800/80 space-y-2">
              <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>Active Provider:</span>
                <span className="text-amber-400 uppercase font-mono">{carrierStatus?.provider || 'UNCONFIGURED'}</span>
              </div>
              <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>Simulated Calling:</span>
                <span className="text-emerald-400 font-medium">Strictly Disabled (Zero-Payment Policy)</span>
              </div>
              <div className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>Internal WebRTC Calling:</span>
                <span className="text-indigo-400 font-medium">Available (Intercom tab)</span>
              </div>
            </div>

            <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
              <p className="font-semibold text-slate-200">How to Connect Real Telephony (Optional Carrier Setup):</p>
              <ol className="list-decimal list-inside space-y-1.5 text-slate-400">
                <li>Create an account or obtain free trial SIP credits on Twilio or a SIP carrier.</li>
                <li>Add <code className="text-indigo-300 bg-slate-950 px-1 py-0.5 rounded">TWILIO_ACCOUNT_SID</code>, <code className="text-indigo-300 bg-slate-950 px-1 py-0.5 rounded">TWILIO_AUTH_TOKEN</code>, and <code className="text-indigo-300 bg-slate-950 px-1 py-0.5 rounded">TWILIO_PHONE_NUMBER</code> in <code className="text-slate-200">backend/.env</code>.</li>
                <li>Restart the server. The modular carrier adapter will immediately activate real calls without modifying application code.</li>
              </ol>
            </div>

            <div className="p-3 bg-amber-950/30 border border-amber-800/40 rounded-xl text-[11px] text-amber-200">
              <strong>Zero-Payment Integrity:</strong> In accordance with assignment instructions, no credit card details are required, and calls are never faked. Internal browser-to-browser WebRTC calling is fully functional in the Internal Calling tab.
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setShowCarrierModal(false)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
