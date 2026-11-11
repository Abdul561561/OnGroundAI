import React, { useState, useEffect, useRef } from 'react';
import { Device, Call } from '@twilio/voice-sdk';
import {
  Phone,
  PhoneOff,
  PhoneIncoming,
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
  Briefcase,
  Volume2
} from 'lucide-react';
import { api } from '../../services/api';
import { TelephonyStatus, Contact, CallRecord } from '../../types';
import { useAuth } from '../../context/AuthContext';

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
  const { user } = useAuth();
  const [phoneNumber, setPhoneNumber] = useState(initialPhoneNumber);
  const [activeContact, setActiveContact] = useState<Contact | null>(initialContact);
  const [contactsList, setContactsList] = useState<Contact[]>([]);
  const [carrierStatus, setCarrierStatus] = useState<TelephonyStatus | null>(null);
  const [sdkStatus, setSdkStatus] = useState<'uninitialized' | 'registering' | 'ready' | 'error'>('uninitialized');
  const [sdkStatusMsg, setSdkStatusMsg] = useState<string>('');
  const [callState, setCallState] = useState<'idle' | 'incoming' | 'calling' | 'connected' | 'ended'>('idle');
  const [liveCallStatus, setLiveCallStatus] = useState<string>('idle');
  const [callMode, setCallMode] = useState<'rest' | 'browser_sdk'>('rest');
  const [callDuration, setCallDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isOnHold, setIsOnHold] = useState(false);
  const [showKeypad, setShowKeypad] = useState(true);
  const [showCarrierModal, setShowCarrierModal] = useState(false);
  const [activeCallRecord, setActiveCallRecord] = useState<CallRecord | null>(null);
  const [incomingCallerNumber, setIncomingCallerNumber] = useState<string>('');

  // Wrap-up state
  const [callOutcome, setCallOutcome] = useState('resolved');
  const [callNotes, setCallNotes] = useState('');
  const [followUpDesc, setFollowUpDesc] = useState('');
  const [followUpDue, setFollowUpDue] = useState('');
  const [createCaseTitle, setCreateCaseTitle] = useState('');
  const [createCasePriority, setCreateCasePriority] = useState<'low' | 'medium' | 'high' | 'critical'>('medium');
  const [isSavingOutcome, setIsSavingOutcome] = useState(false);
  const [outcomeSaved, setOutcomeSaved] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const deviceRef = useRef<Device | null>(null);
  const activeSdkCallRef = useRef<Call | null>(null);
  const activeCallRecordRef = useRef<CallRecord | null>(null);
  const callStateRef = useRef(callState);

  useEffect(() => {
    activeCallRecordRef.current = activeCallRecord;
  }, [activeCallRecord]);

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

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
    loadContacts();
    return () => {
      if (deviceRef.current) {
        deviceRef.current.destroy();
        deviceRef.current = null;
      }
    };
  }, []);

  const loadContacts = async () => {
    try {
      const list = await api.getContacts();
      setContactsList(list);
    } catch (e) {
      console.warn('Could not load contacts for dialer lookup:', e);
    }
  };

  // Auto-match contact when phoneNumber changes
  useEffect(() => {
    if (!phoneNumber || contactsList.length === 0) return;
    const cleaned = phoneNumber.replace(/[^\d+]/g, '');
    if (cleaned.length >= 7) {
      const matched = contactsList.find(
        (c) => c.phone_number.replace(/[^\d+]/g, '') === cleaned
      );
      if (matched && (!activeContact || activeContact._id !== matched._id)) {
        setActiveContact(matched);
      }
    }
  }, [phoneNumber, contactsList]);

  const applyCarrierStatusUpdate = (
    statusVal: string,
    opts?: {
      callSid?: string | null;
      durationSeconds?: number | null;
      errorCode?: string | null;
      rawStatus?: string | null;
    }
  ) => {
    const normalized = (statusVal || '').toLowerCase();
    if (!normalized) return;

    setLiveCallStatus(normalized);
    setActiveCallRecord((prev) => {
      if (!prev) return prev;
      const shouldReplaceSid =
        Boolean(opts?.callSid) &&
        (!prev.provider_call_id || prev.provider_call_id.startsWith('sdk-pending-'));
      return {
        ...prev,
        provider_call_id: shouldReplaceSid ? (opts?.callSid || prev.provider_call_id) : prev.provider_call_id,
        status: normalized,
      };
    });

    if (normalized === 'connected' || normalized === 'in_progress' || normalized === 'in-progress') {
      setCallState('connected');
    } else if (normalized === 'queued' || normalized === 'initiated' || normalized === 'ringing') {
      setCallState((prev) => (prev === 'connected' ? 'connected' : 'calling'));
    } else if (['completed', 'busy', 'no_answer', 'no-answer', 'failed', 'canceled', 'missed'].includes(normalized)) {
      if (opts?.durationSeconds) {
        setCallDuration(opts.durationSeconds);
      }
      if (['busy', 'no_answer', 'no-answer', 'failed', 'canceled', 'missed'].includes(normalized)) {
        setCallOutcome(normalized === 'busy' ? 'busy' : 'no_answer');
        const codeText = opts?.errorCode ? ` (Twilio Error ${opts.errorCode})` : '';
        setErrorMsg(`Carrier reported call status: ${opts?.rawStatus || normalized}${codeText}`);
      }
      setCallState('ended');
    }
  };

  // Listen for real-time PSTN status webhooks forwarded from CallContext WebSocket
  useEffect(() => {
    const handlePstnEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail) return;

      if (detail.type === 'pstn_call_status') {
        const currentRec = activeCallRecordRef.current;
        if (
          currentRec &&
          (detail.call_id === currentRec._id || detail.call_sid === currentRec.provider_call_id)
        ) {
          applyCarrierStatusUpdate(detail.status || detail.raw_status, {
            callSid: detail.call_sid,
            durationSeconds: detail.duration_seconds,
            errorCode: detail.error_code,
            rawStatus: detail.raw_status,
          });
        }
      } else if (detail.type === 'incoming_pstn_call') {
        if (callStateRef.current === 'idle') {
          setIncomingCallerNumber(detail.caller_number || detail.caller_phone || 'Unknown Caller');
          setPhoneNumber(detail.caller_number || detail.caller_phone || '');
        }
      }
    };

    window.addEventListener('onground_pstn_event', handlePstnEvent);
    return () => window.removeEventListener('onground_pstn_event', handlePstnEvent);
  }, []);

  // Poll live call status from FastAPI/Twilio as a resilient fallback while call is active
  useEffect(() => {
    if ((callState !== 'calling' && callState !== 'connected') || !activeCallRecord?._id) {
      return;
    }
    const callId = activeCallRecord._id;
    const interval = setInterval(async () => {
      try {
        const latest = await api.getTelephonyCallStatus(callId, true);
        if (latest) {
          setActiveCallRecord(latest);
          applyCarrierStatusUpdate(latest.status, {
            callSid: latest.provider_call_id,
            durationSeconds: latest.duration_seconds,
          });
        }
      } catch {
        // Non-fatal fallback polling error
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [callState, activeCallRecord?._id]);

  const loadCarrierStatus = async () => {
    try {
      const status = await api.getTelephonyStatus();
      setCarrierStatus(status);
      if (status.is_configured && (status.browser_audio_ready || status.incoming_bridge_ready || status.has_api_key)) {
        await initTwilioVoiceDevice();
      }
    } catch (e: any) {
      console.error('Error fetching carrier status:', e);
    }
  };

  const initTwilioVoiceDevice = async () => {
    try {
      setSdkStatus('registering');
      const tokenData = await api.getSoftphoneToken();
      if (!tokenData.token) {
        setSdkStatus('uninitialized');
        setSdkStatusMsg(tokenData.message || tokenData.error || 'Browser Voice SDK token unavailable.');
        return;
      }

      if (deviceRef.current) {
        deviceRef.current.destroy();
      }

      const device = new Device(tokenData.token, {
        codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
      });

      device.on('registered', () => {
        setSdkStatus('ready');
        setSdkStatusMsg(
          tokenData.has_twiml_app
            ? 'Twilio Browser Voice SDK registered (Mic/Speaker ready)'
            : 'Twilio Browser Audio Bridge registered (ready for REST call audio)'
        );
      });

      device.on('error', (twilioError: any) => {
        console.error('Twilio Voice SDK error:', twilioError);
        setSdkStatus('error');
        setSdkStatusMsg(twilioError?.message || 'Voice SDK registration error');
      });

      device.on('incoming', (call: Call) => {
        activeSdkCallRef.current = call;

        const attachSdkCallListeners = (sdkCall: Call) => {
          sdkCall.on('accept', () => {
            setCallState('connected');
            setLiveCallStatus('connected');
            setCallDuration(0);
          });
          sdkCall.on('disconnect', () => {
            activeSdkCallRef.current = null;
            setCallState('ended');
            setLiveCallStatus('completed');
          });
          sdkCall.on('cancel', () => {
            activeSdkCallRef.current = null;
            if (callStateRef.current === 'incoming') {
              setCallState('idle');
            }
          });
          sdkCall.on('reject', () => {
            activeSdkCallRef.current = null;
            if (callStateRef.current === 'incoming') {
              setCallState('idle');
            }
          });
        };

        attachSdkCallListeners(call);

        // If this incoming Client leg is bridging a REST outbound call we just initiated, auto-accept browser audio
        if (callStateRef.current === 'calling' || callStateRef.current === 'connected') {
          try {
            call.accept();
            return;
          } catch (acceptErr) {
            console.warn('Auto-accepting REST audio bridge failed, showing manual Answer prompt:', acceptErr);
          }
        }

        const fromNumber = call.parameters?.From || 'Incoming Caller';
        setIncomingCallerNumber(fromNumber);
        setPhoneNumber(fromNumber);
        setCallState('incoming');
      });

      await device.register();
      deviceRef.current = device;
    } catch (err: any) {
      console.error('Failed to initialize Twilio Device:', err);
      setSdkStatus('error');
      setSdkStatusMsg(err.message || 'Failed to initialize browser voice device');
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
      osc.frequency.setValueAtTime(digit === '*' ? 941 : 697, audioCtx.currentTime);
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
    if (callState === 'connected' && activeSdkCallRef.current) {
      activeSdkCallRef.current.sendDigits(val);
    } else {
      setPhoneNumber((prev) => prev + val);
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleStartCall = async () => {
    setErrorMsg(null);
    const cleanPhone = phoneNumber.trim().replace(/[\s\-().]/g, '');
    if (!/^\+[1-9]\d{6,14}$/.test(cleanPhone)) {
      setErrorMsg('Please enter a valid E.164 telephone number with country code (e.g. +15551234567 or +919876543210).');
      return;
    }

    // Check if carrier is configured
    if (!carrierStatus?.is_configured) {
      setShowCarrierModal(true);
      return;
    }

    setPhoneNumber(cleanPhone);
    const useBrowserSdk = Boolean(
      callMode === 'browser_sdk'
      && carrierStatus?.browser_audio_ready
      && deviceRef.current
      && sdkStatus === 'ready'
    );

    try {
      setCallState('calling');
      setLiveCallStatus('initiating');
      setCallDuration(0);
      setIsMuted(false);

      // 1. Send call request to FastAPI (validates E.164 & calls Twilio REST API in REST mode)
      const callRecord = await api.initiateOutboundPhoneCall(
        cleanPhone,
        activeContact?._id,
        useBrowserSdk ? 'Softphone Browser Voice SDK outbound call' : 'Softphone REST outbound call',
        useBrowserSdk
      );
      setActiveCallRecord(callRecord);
      setLiveCallStatus(callRecord.status || 'queued');

      if (callRecord.status === 'connected' || callRecord.status === 'in_progress') {
        setCallState('connected');
      }

      // 2. If user explicitly selected Browser SDK mode (with TwiML App), connect browser mic to TwiML App
      if (useBrowserSdk && deviceRef.current) {
        const sdkCall = await deviceRef.current.connect({
          params: {
            To: cleanPhone,
            agent_id: user?._id || '',
            contact_id: activeContact?._id || '',
            call_record_id: callRecord._id,
          },
        });
        activeSdkCallRef.current = sdkCall;

        sdkCall.on('ringing', () => {
          setCallState('calling');
          setLiveCallStatus('ringing');
        });

        sdkCall.on('accept', () => {
          setCallState('connected');
          setLiveCallStatus('connected');
          setCallDuration(0);
        });

        sdkCall.on('disconnect', () => {
          activeSdkCallRef.current = null;
          setCallState('ended');
          setLiveCallStatus('completed');
        });

        sdkCall.on('cancel', () => {
          activeSdkCallRef.current = null;
          setCallState('ended');
          setLiveCallStatus('canceled');
        });

        sdkCall.on('reject', () => {
          activeSdkCallRef.current = null;
          setCallOutcome('no_answer');
          setCallState('ended');
          setLiveCallStatus('no_answer');
        });

        sdkCall.on('error', (err: any) => {
          setErrorMsg(err?.message || 'Twilio Voice SDK call error.');
          activeSdkCallRef.current = null;
          setCallState('ended');
          setLiveCallStatus('failed');
        });
      }
      // Note: In REST mode, callState reflects Twilio's real status ('queued' -> 'ringing' -> 'connected') via callbacks/polling
    } catch (err: any) {
      setCallState('idle');
      setLiveCallStatus('idle');
      setErrorMsg(err.message || 'Failed to initiate outbound carrier call.');
    }
  };

  const handleAcceptIncomingCall = () => {
    if (activeSdkCallRef.current) {
      activeSdkCallRef.current.accept();
    }
  };

  const handleRejectIncomingCall = () => {
    if (activeSdkCallRef.current) {
      activeSdkCallRef.current.reject();
      activeSdkCallRef.current = null;
    }
    setCallState('idle');
  };

  const handleToggleMute = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    if (activeSdkCallRef.current) {
      activeSdkCallRef.current.mute(nextMute);
    }
  };

  const handleEndCall = async () => {
    if (activeSdkCallRef.current) {
      try {
        activeSdkCallRef.current.disconnect();
      } catch (e) {
        console.warn('Error disconnecting SDK call:', e);
      }
      activeSdkCallRef.current = null;
    }

    if (activeCallRecord) {
      try {
        const hangupRes = await api.hangupPhoneCall(
          activeCallRecord.provider_call_id,
          activeCallRecord._id,
          callDuration
        );
        if (hangupRes?.status && hangupRes.status !== 'error') {
          setLiveCallStatus(hangupRes.status);
        } else {
          setLiveCallStatus(callState === 'connected' ? 'completed' : 'canceled');
        }
      } catch (e: any) {
        console.error('Hangup error:', e);
        setErrorMsg(e?.message || 'Error terminating call with carrier');
      }
    }
    setCallState('ended');
  };

  const handleSaveOutcome = async () => {
    setIsSavingOutcome(true);
    setErrorMsg(null);
    try {
      if (activeCallRecord) {
        await api.updateCall(activeCallRecord._id, {
          status: callDuration > 0 || callOutcome === 'resolved' || callOutcome === 'interested' ? 'completed' : 'missed',
          outcome: callOutcome,
          notes: callNotes,
          duration_seconds: callDuration,
        });
      }

      // If a contact is linked and notes were entered, append/update contact status & notes
      if (activeContact && callNotes.trim()) {
        const mappedContactStatus =
          callOutcome === 'resolved'
            ? 'closed'
            : callOutcome === 'do_not_call'
            ? 'do_not_call'
            : 'in_progress';
        await api.updateContact(activeContact._id, {
          status: mappedContactStatus,
          notes: activeContact.notes
            ? `${activeContact.notes}\n[Call ${new Date().toLocaleDateString()}]: ${callNotes.trim()}`
            : `[Call ${new Date().toLocaleDateString()}]: ${callNotes.trim()}`,
        });
      }

      // If follow-up description specified
      if (followUpDesc.trim() && activeContact) {
        const dueDate = followUpDue
          ? new Date(followUpDue).toISOString()
          : new Date(Date.now() + 86400000 * 2).toISOString();
        await api.createContactFollowUp(activeContact._id, {
          description: followUpDesc.trim(),
          due_at: dueDate,
        });
      }

      // If support case title specified, create a persistent Support Case in MongoDB
      if (createCaseTitle.trim()) {
        await api.createCase({
          title: createCaseTitle.trim(),
          description: callNotes.trim() || `Created from telephone call (${phoneNumber}) - Outcome: ${callOutcome}`,
          customer_id: activeContact?._id,
          customer_name: activeContact?.name || phoneNumber,
          customer_phone: activeContact?.phone_number || phoneNumber,
          priority: createCasePriority,
        });
      }

      setOutcomeSaved(true);
      setTimeout(() => {
        setCallState('idle');
        setLiveCallStatus('idle');
        setActiveCallRecord(null);
        setCallDuration(0);
        setOutcomeSaved(false);
        setCallNotes('');
        setFollowUpDesc('');
        setCreateCaseTitle('');
        if (onCallEnded) onCallEnded();
      }, 1200);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error saving call outcome');
    } finally {
      setIsSavingOutcome(false);
    }
  };

  const isCarrierOperational = Boolean(
    carrierStatus?.is_configured &&
      (carrierStatus?.is_operational ??
        (carrierStatus?.account_verified !== false && carrierStatus?.public_webhook_ready))
  );

  const needsPublicWebhook = Boolean(carrierStatus?.is_configured && !carrierStatus?.public_webhook_ready);

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-6">
      {/* Carrier Status Banner */}
      <div className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 ${
        isCarrierOperational
          ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-200'
          : 'bg-amber-950/25 border-amber-800/50 text-amber-200'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg ${isCarrierOperational ? 'bg-emerald-900/60' : 'bg-amber-900/60'}`}>
            {isCarrierOperational ? <ShieldCheck className="w-5 h-5 text-emerald-400" /> : <AlertTriangle className="w-5 h-5 text-amber-400" />}
          </div>
          <div>
            <div className="font-semibold text-sm flex items-center gap-2 flex-wrap">
              <span>
                Carrier Status:{' '}
                {isCarrierOperational
                  ? 'PSTN Carrier Active'
                  : needsPublicWebhook
                  ? 'PSTN Webhook Setup Needed'
                  : carrierStatus?.is_configured
                  ? 'PSTN Carrier Needs Verification'
                  : 'PSTN Carrier Unconfigured'}
              </span>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                isCarrierOperational ? 'bg-emerald-500/20 text-emerald-300' : 'bg-amber-500/20 text-amber-300'
              }`}>
                {carrierStatus?.provider || 'UNCONFIGURED'}
              </span>
              {carrierStatus?.is_trial && (
                <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-amber-500/20 text-amber-300">
                  Trial Account (Verified Numbers Only)
                </span>
              )}
              {needsPublicWebhook && (
                <span className="text-[11px] px-2 py-0.5 rounded-full font-medium bg-rose-500/20 text-rose-300">
                  Public HTTPS Webhook Needed (ngrok)
                </span>
              )}
              {isCarrierOperational && (
                <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium flex items-center gap-1 ${
                  sdkStatus === 'ready'
                    ? 'bg-indigo-500/20 text-indigo-300'
                    : 'bg-amber-500/20 text-amber-300'
                }`}>
                  <Volume2 className="w-3 h-3" />
                  {sdkStatus === 'ready' ? 'Browser Audio Bridge Ready' : 'REST Dialer Mode'}
                </span>
              )}
            </div>
            <p className="text-xs opacity-85 mt-0.5">
              {needsPublicWebhook
                ? `PUBLIC_BASE_URL ('${carrierStatus?.public_webhook_url || 'http://localhost:8000'}') must be a publicly accessible HTTPS URL (such as an ngrok URL) so Twilio can reach voice and status webhooks.`
                : carrierStatus?.is_configured
                ? `${carrierStatus.message || `Ready via ${carrierStatus.active_carrier}`} ${sdkStatusMsg ? `• ${sdkStatusMsg}` : ''}`
                : 'Twilio PSTN credentials are not configured in backend/.env. Simulated phone calls are strictly disabled.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={loadCarrierStatus}
            className="text-xs px-2.5 py-1.5 rounded-lg border border-current/60 hover:bg-white/10 transition-colors flex items-center gap-1.5 font-medium"
            title="Re-check backend carrier and PUBLIC_BASE_URL status"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
          <button
            onClick={() => setShowCarrierModal(true)}
            className="text-xs px-3 py-1.5 rounded-lg border border-current hover:bg-white/10 transition-colors flex items-center gap-1.5 font-medium"
          >
            <Info className="w-3.5 h-3.5" />
            <span>Carrier Setup & Diagnostics</span>
          </button>
        </div>
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
                  PSTN Softphone Dialer
                </h2>
                <p className="text-xs text-slate-400">External Customer Telephone Gateway (E.164)</p>
              </div>

              {activeContact && (
                <div className="text-right">
                  <div className="text-xs font-semibold text-indigo-300 flex items-center gap-1 justify-end">
                    <User className="w-3.5 h-3.5" />
                    {activeContact.name}
                  </div>
                  <div className="text-[11px] text-slate-400 capitalize">{activeContact.status.replace('_', ' ')} Customer</div>
                </div>
              )}
            </div>

            {carrierStatus?.browser_audio_ready && callState === 'idle' && (
              <div className="mb-4 flex items-center justify-between text-[11px] bg-slate-950/70 border border-slate-800 rounded-lg p-2">
                <span className="text-slate-400">Outbound Calling Mode:</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCallMode('rest')}
                    className={`px-2 py-1 rounded ${callMode === 'rest' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:text-white'}`}
                  >
                    Twilio REST API
                  </button>
                  <button
                    type="button"
                    onClick={() => setCallMode('browser_sdk')}
                    className={`px-2 py-1 rounded ${callMode === 'browser_sdk' ? 'bg-indigo-600 text-white font-semibold' : 'text-slate-400 hover:text-white'}`}
                  >
                    Direct Browser SDK
                  </button>
                </div>
              </div>
            )}

            {/* Display Screen */}
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 mb-6 text-center">
              {callState === 'idle' && (
                <div className="relative">
                  <input
                    type="text"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    placeholder="+15551234567"
                    className="w-full bg-transparent text-center text-2xl font-mono font-semibold tracking-wider text-white placeholder-slate-600 focus:outline-none"
                  />
                  {phoneNumber && (
                    <button
                      onClick={() => {
                        setPhoneNumber('');
                        setActiveContact(null);
                      }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-300 px-2 py-1"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}

              {callState === 'incoming' && (
                <div className="py-3 space-y-2">
                  <div className="text-emerald-400 text-sm font-semibold animate-bounce flex items-center justify-center gap-2">
                    <PhoneIncoming className="w-4 h-4" />
                    <span>Incoming Customer Telephone Call</span>
                  </div>
                  <div className="text-xl font-mono text-white">{incomingCallerNumber || phoneNumber}</div>
                </div>
              )}

              {callState === 'calling' && (
                <div className="py-3 space-y-1.5">
                  <div className="text-indigo-400 text-sm font-medium animate-pulse uppercase tracking-wider">
                    Twilio Status: {liveCallStatus.replace('_', ' ')}
                  </div>
                  <div className="text-xl font-mono text-white">{phoneNumber}</div>
                  {activeCallRecord?.provider_call_id && (
                    <div className="text-[11px] font-mono text-slate-400">
                      Call SID: {activeCallRecord.provider_call_id}
                    </div>
                  )}
                  <div className="text-[11px] text-slate-400">
                    Waiting for recipient phone to answer (call is not answered yet)
                  </div>
                </div>
              )}

              {callState === 'connected' && (
                <div className="py-2 space-y-1">
                  <div className="flex items-center justify-center gap-2 text-emerald-400 text-xs font-semibold uppercase tracking-wider">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                    Twilio Status: {liveCallStatus.replace('_', ' ')} — Live PSTN Audio
                  </div>
                  <div className="text-xl font-mono text-white">{phoneNumber}</div>
                  {activeCallRecord?.provider_call_id && (
                    <div className="text-[11px] font-mono text-slate-400">
                      Call SID: {activeCallRecord.provider_call_id}
                    </div>
                  )}
                  <div className="text-2xl font-mono font-bold text-emerald-300">{formatDuration(callDuration)}</div>
                </div>
              )}

              {callState === 'ended' && (
                <div className="py-2 space-y-1">
                  <div className="text-slate-300 text-xs font-medium uppercase tracking-wider">
                    Call Concluded ({liveCallStatus.replace('_', ' ')}) — Complete Wrap-Up
                  </div>
                  {activeCallRecord?.provider_call_id && (
                    <div className="text-[11px] font-mono text-slate-500">
                      Call SID: {activeCallRecord.provider_call_id}
                    </div>
                  )}
                  <div className="text-lg font-mono text-white">{formatDuration(callDuration)}</div>
                </div>
              )}
            </div>

            {/* DTMF Keypad */}
            {(callState === 'idle' || (callState === 'connected' && showKeypad)) && (
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
              <div className="flex items-center justify-center gap-4 py-3 mb-4">
                <button
                  onClick={handleToggleMute}
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
                  title="Toggle DTMF Keypad"
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

            {callState === 'incoming' && (
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={handleAcceptIncomingCall}
                  className="py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-emerald-950 transition-all"
                >
                  <Phone className="w-5 h-5" />
                  <span>Answer Call</span>
                </button>
                <button
                  onClick={handleRejectIncomingCall}
                  className="py-4 bg-red-600 hover:bg-red-500 text-white font-semibold rounded-xl flex items-center justify-center gap-2 shadow-lg shadow-red-950 transition-all"
                >
                  <PhoneOff className="w-5 h-5" />
                  <span>Decline</span>
                </button>
              </div>
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
                <span>Call Wrap-Up & CRM Resolution</span>
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
                <label className="block text-xs font-medium text-slate-300 mb-1.5">Call Notes (Saved to Call & CRM)</label>
                <textarea
                  rows={3}
                  value={callNotes}
                  onChange={(e) => setCallNotes(e.target.value)}
                  placeholder="Summary of conversation, customer issue, and agreed resolution..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div className="pt-2 border-t border-slate-800 space-y-2.5">
                <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-amber-400" />
                  <span>Open Support Case (Optional)</span>
                </div>
                <input
                  type="text"
                  value={createCaseTitle}
                  onChange={(e) => setCreateCaseTitle(e.target.value)}
                  placeholder="Case title if issue needs tracking..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                />
                {createCaseTitle.trim() && (
                  <select
                    value={createCasePriority}
                    onChange={(e) => setCreateCasePriority(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500"
                  >
                    <option value="low">Low Priority</option>
                    <option value="medium">Medium Priority</option>
                    <option value="high">High Priority</option>
                    <option value="critical">Critical Priority</option>
                  </select>
                )}
              </div>

              <div className="pt-2 border-t border-slate-800 space-y-2.5">
                <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Schedule Follow-Up Task (Optional)</span>
                </div>

                <input
                  type="text"
                  value={followUpDesc}
                  onChange={(e) => setFollowUpDesc(e.target.value)}
                  placeholder="e.g. Call back with engineering update"
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
                className="w-full mt-3 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-950"
              >
                {outcomeSaved ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Saved to MongoDB Atlas</span>
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
              <div className="flex items-center justify-between text-slate-400 font-semibold text-sm border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4 text-indigo-400" />
                  <span>Customer Profile Context</span>
                </div>
              </div>

              {/* Quick Customer Selector */}
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">Select CRM Customer</label>
                <select
                  value={activeContact?._id || ''}
                  onChange={(e) => {
                    const found = contactsList.find((c) => c._id === e.target.value) || null;
                    setActiveContact(found);
                    if (found && callState === 'idle') {
                      setPhoneNumber(found.phone_number);
                    }
                  }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="">-- Choose Customer or Dial Number --</option>
                  {contactsList.map((c) => (
                    <option key={c._id} value={c._id}>
                      {c.name} ({c.phone_number})
                    </option>
                  ))}
                </select>
              </div>

              {activeContact ? (
                <div className="space-y-3 text-xs pt-1">
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
                      {activeContact.status.replace('_', ' ')}
                    </span>
                  </div>

                  {activeContact.notes && (
                    <div>
                      <span className="text-slate-500 block mb-0.5">Account Notes</span>
                      <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 text-slate-300 text-xs whitespace-pre-wrap max-h-32 overflow-y-auto">
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
                <div className="py-8 text-center text-slate-500 text-xs space-y-2">
                  <User className="w-8 h-8 mx-auto opacity-30" />
                  <p>No customer record linked yet.</p>
                  <p className="text-[11px] text-slate-600">
                    Choose a customer above or enter an E.164 phone number to auto-match their CRM record.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Quick Telephony Policy note */}
          <div className="mt-6 pt-4 border-t border-slate-800/60 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Direct E.164 PSTN Calling</span>
            <span className="text-emerald-400 font-mono">Twilio Voice SDK + TwiML</span>
          </div>
        </div>
      </div>

      {/* Carrier Diagnostic Modal */}
      {showCarrierModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Twilio PSTN Carrier Diagnostics & Configuration</h3>
                  <p className="text-xs text-slate-400">Real External Telephone Calling Requirements</p>
                </div>
              </div>
              <button
                onClick={() => setShowCarrierModal(false)}
                className="text-slate-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800/80 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Active Provider:</span>
                <span className="text-amber-400 uppercase font-mono font-semibold">{carrierStatus?.provider || 'UNCONFIGURED'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">PSTN Credentials Validated:</span>
                <span className={carrierStatus?.credentials_valid ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
                  {carrierStatus?.credentials_valid
                    ? `Yes (${carrierStatus.account_name || 'Verified'}${carrierStatus.account_type ? ` • ${carrierStatus.account_type}` : ''})`
                    : (carrierStatus?.verification_error ? `Failed: ${carrierStatus.verification_error}` : 'No — Missing in backend/.env')}
                </span>
              </div>
              {carrierStatus?.balance && (
                <div className="flex items-center justify-between">
                  <span className="text-slate-400">Account Balance:</span>
                  <span className="text-slate-200 font-mono font-semibold">
                    {carrierStatus.balance} {carrierStatus.currency || 'USD'}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Browser Audio Bridge:</span>
                <span className={(carrierStatus?.browser_audio_ready || carrierStatus?.incoming_bridge_ready) ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
                  {carrierStatus?.browser_audio_ready
                    ? 'Full Voice SDK Ready (TwiML App + API Keys)'
                    : carrierStatus?.incoming_bridge_ready
                    ? 'REST Bridge Ready (API Keys set; TwiML App optional)'
                    : 'Requires TWILIO_API_KEY_SID & TWILIO_API_KEY_SECRET'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Public Webhook Tunnel:</span>
                <span className={carrierStatus?.public_webhook_ready ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
                  {carrierStatus?.public_webhook_ready ? (carrierStatus.public_webhook_url || 'Configured') : 'Localhost (Requires ngrok / public HTTPS URL)'}
                </span>
              </div>
              {carrierStatus?.webhook_urls?.voice && (
                <div className="flex flex-col gap-1 pt-1 border-t border-slate-800/60">
                  <span className="text-slate-400">Active Webhook Endpoints:</span>
                  <code className="text-[10px] text-indigo-300 break-all">Voice: {carrierStatus.webhook_urls.voice}</code>
                  <code className="text-[10px] text-indigo-300 break-all">Status: {carrierStatus.webhook_urls.status}</code>
                </div>
              )}
              <div className="flex items-center justify-between">
                <span className="text-slate-400">Internal Staff WebRTC Intercom:</span>
                <span className="text-indigo-400 font-semibold">Online & Ready (Zero External Cost)</span>
              </div>
            </div>

            {carrierStatus?.warnings && carrierStatus.warnings.length > 0 && (
              <div className="p-3 bg-amber-950/30 border border-amber-800/40 rounded-xl space-y-1">
                <div className="text-xs font-semibold text-amber-300">Detected Configuration Blockers:</div>
                <ul className="list-disc list-inside text-[11px] text-amber-200/90 space-y-1">
                  {carrierStatus.warnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="space-y-2 text-xs text-slate-300 leading-relaxed">
              <p className="font-semibold text-slate-200">Required Environment Variables in <code className="text-indigo-300">backend/.env</code> for Live PSTN Audio:</p>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-[11px] text-slate-300 space-y-1 overflow-x-auto">
                <div>TELEPHONY_PROVIDER=twilio</div>
                <div>TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx</div>
                <div>TWILIO_AUTH_TOKEN=your_auth_token</div>
                <div>TWILIO_PHONE_NUMBER=+1234567890</div>
                <div>TWILIO_API_KEY_SID=SKxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx</div>
                <div>TWILIO_API_KEY_SECRET=your_api_key_secret</div>
                <div>TWILIO_TWIML_APP_SID=APxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx</div>
                <div>PUBLIC_BASE_URL=https://your-tunnel.ngrok-free.app</div>
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <button
                onClick={() => {
                  loadCarrierStatus();
                  setShowCarrierModal(false);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium"
              >
                Re-check Status
              </button>
              <button
                onClick={() => setShowCarrierModal(false)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

