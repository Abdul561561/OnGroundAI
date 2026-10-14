import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
} from 'react';
import { useAuth } from './AuthContext';
import { ActiveCallSession, CallState } from '../types';
import { WebRTCManager } from '../services/webrtc';
import { api } from '../services/api';

interface CallContextType {
  signalingStatus: 'disconnected' | 'connecting' | 'connected';
  onlineUserIds: Set<string>;
  activeCall: ActiveCallSession | null;
  startCall: (recipientId: string, recipientName: string) => Promise<void>;
  acceptCall: () => Promise<void>;
  rejectCall: () => Promise<void>;
  endCall: () => Promise<void>;
  toggleMute: () => void;
  callError: string | null;
  clearCallError: () => void;
  audioLevel: number;
  isAudioPlaybackBlocked: boolean;
  unlockAudioPlayback: () => void;
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, token, isAuthenticated } = useAuth();
  const [signalingStatus, setSignalingStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [activeCall, setActiveCall] = useState<ActiveCallSession | null>(null);
  const [callError, setCallError] = useState<string | null>(null);
  const [isAudioPlaybackBlocked, setIsAudioPlaybackBlocked] = useState<boolean>(false);
  const [audioLevel, setAudioLevel] = useState<number>(0);

  const socketRef = useRef<WebSocket | null>(null);
  const webrtcRef = useRef<WebRTCManager | null>(null);
  const timerRef = useRef<any>(null);
  const audioMeterIntervalRef = useRef<any>(null);
  const ringTimeoutRef = useRef<any>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingOfferRef = useRef<any>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const activeCallRef = useRef<ActiveCallSession | null>(null);

  useEffect(() => {
    activeCallRef.current = activeCall;
  }, [activeCall]);

  const clearCallError = () => setCallError(null);

  // Initialize Remote Audio Element with off-screen positioning (avoiding display:none background throttling)
  useEffect(() => {
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.setAttribute('playsinline', 'true');
    audio.style.position = 'fixed';
    audio.style.left = '-9999px';
    audio.style.top = '-9999px';
    audio.style.width = '1px';
    audio.style.height = '1px';
    audio.style.opacity = '0';
    document.body.appendChild(audio);
    remoteAudioRef.current = audio;

    return () => {
      audio.srcObject = null;
      audio.remove();
    };
  }, []);

  // Poll genuine audio level from WebRTC AnalyserNode while call is connected
  useEffect(() => {
    if (activeCall?.state === 'connected') {
      audioMeterIntervalRef.current = setInterval(() => {
        if (webrtcRef.current) {
          setAudioLevel(webrtcRef.current.getAudioLevel());
        }
      }, 100);
    } else {
      if (audioMeterIntervalRef.current) {
        clearInterval(audioMeterIntervalRef.current);
        audioMeterIntervalRef.current = null;
      }
      setAudioLevel(0);
    }

    return () => {
      if (audioMeterIntervalRef.current) {
        clearInterval(audioMeterIntervalRef.current);
        audioMeterIntervalRef.current = null;
      }
    };
  }, [activeCall?.state]);

  const unlockAudioPlayback = useCallback(() => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.play().then(() => {
        setIsAudioPlaybackBlocked(false);
      }).catch((e) => {
        console.warn('Manual audio play retry failed:', e);
      });
    }
  }, []);

  const startDurationTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setActiveCall((prev) => {
        if (!prev || prev.state !== 'connected') return prev;
        const updated = { ...prev, durationSeconds: prev.durationSeconds + 1 };
        activeCallRef.current = updated;
        return updated;
      });
    }, 1000);
  }, []);

  const stopDurationTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cleanUpCallState = useCallback((finalState: CallState = 'ended') => {
    stopDurationTimer();
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = null;
    }
    if (audioMeterIntervalRef.current) {
      clearInterval(audioMeterIntervalRef.current);
      audioMeterIntervalRef.current = null;
    }
    setAudioLevel(0);
    setIsAudioPlaybackBlocked(false);

    if (webrtcRef.current) {
      webrtcRef.current.close();
      webrtcRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    pendingOfferRef.current = null;
    pendingCandidatesRef.current = [];
    setActiveCall((prev) => {
      const next = prev ? { ...prev, state: finalState } : null;
      activeCallRef.current = next;
      return next;
    });
    setTimeout(() => {
      setActiveCall((prev) => {
        if (prev && (prev.state === 'ended' || prev.state === 'rejected' || prev.state === 'failed')) {
          activeCallRef.current = null;
          return null;
        }
        return prev;
      });
    }, 2500);
  }, [stopDurationTimer]);

  // Handle incoming WebSocket messages
  const handleIncomingSignalingMessage = useCallback(async (msg: any) => {
    switch (msg.type) {
      case 'signaling_ready':
        if (Array.isArray(msg.online_users)) {
          setOnlineUserIds(new Set(msg.online_users));
        }
        break;

      case 'presence_update':
        setOnlineUserIds((prev) => {
          const next = new Set(prev);
          if (msg.is_online) {
            next.add(msg.user_id);
          } else {
            next.delete(msg.user_id);
          }
          return next;
        });
        break;

      case 'incoming_call':
        pendingOfferRef.current = msg;
        pendingCandidatesRef.current = [];
        {
          const incomingSession: ActiveCallSession = {
            callId: msg.call_id,
            peerId: msg.caller_id,
            peerName: msg.caller_name || 'Caller',
            isCaller: false,
            state: 'incoming',
            durationSeconds: 0,
            isMuted: false,
            localStream: null,
            remoteStream: null,
          };
          activeCallRef.current = incomingSession;
          setActiveCall(incomingSession);
        }
        break;

      case 'call_accepted':
        if (ringTimeoutRef.current) {
          clearTimeout(ringTimeoutRef.current);
          ringTimeoutRef.current = null;
        }
        if (webrtcRef.current && msg.sdp) {
          try {
            await webrtcRef.current.handleAnswer(msg.sdp);
            setActiveCall((prev) => {
              const next = prev ? { ...prev, state: 'connected' as CallState } : null;
              activeCallRef.current = next;
              return next;
            });
            startDurationTimer();
          } catch (e: any) {
            setCallError(`Failed to establish connection: ${e.message}`);
          }
        }
        break;

      case 'ice_candidate':
        if (msg.candidate) {
          if (webrtcRef.current) {
            await webrtcRef.current.addIceCandidate(msg.candidate);
          } else {
            // Buffer ICE candidates that arrive while the callee's IncomingCallModal is still ringing
            pendingCandidatesRef.current.push(msg.candidate);
          }
        }
        break;

      case 'call_rejected':
        setCallError(msg.reason || 'Call was declined by recipient.');
        cleanUpCallState('rejected');
        break;

      case 'call_busy':
        setCallError(msg.reason || 'Recipient is currently on another call.');
        cleanUpCallState('failed');
        break;

      case 'call_failed':
        setCallError(msg.reason || 'Call failed to connect.');
        cleanUpCallState('failed');
        break;

      case 'call_ended':
        cleanUpCallState('ended');
        break;

      case 'pstn_call_status':
      case 'incoming_pstn_call':
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('onground_pstn_event', { detail: msg }));
        }
        break;
    }
  }, [cleanUpCallState, startDurationTimer]);

  // WebSocket Signaling Connection with automatic reconnect
  useEffect(() => {
    if (!isAuthenticated || !token) {
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
      setSignalingStatus('disconnected');
      setOnlineUserIds(new Set());
      return;
    }

    let isMounted = true;
    let reconnectTimeout: any = null;

    const connectWs = () => {
      if (!isMounted) return;
      setSignalingStatus('connecting');
      let wsUrl: string;
      const customApi = (import.meta.env.VITE_API_URL || '').trim();

      if (customApi) {
        // Derive WebSocket URL directly from VITE_API_URL to eliminate separate stale WS URLs
        const cleanApi = customApi.split('?')[0].split('#')[0].replace(/\/api\/?$/, '').replace(/\/+$/, '');
        let wsScheme = 'wss://';
        if (cleanApi.startsWith('http://')) {
          wsScheme = 'ws://';
        } else if (cleanApi.startsWith('https://')) {
          wsScheme = 'wss://';
        } else if (cleanApi.startsWith('ws://')) {
          wsScheme = 'ws://';
        } else if (cleanApi.startsWith('wss://')) {
          wsScheme = 'wss://';
        }
        const hostPath = cleanApi.replace(/^(?:https?|wss?):\/\//, '');
        wsUrl = `${wsScheme}${hostPath}/ws/signaling?token=${encodeURIComponent(token)}`;
      } else {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//${window.location.host}/ws/signaling?token=${encodeURIComponent(token)}`;
      }

      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        if (!isMounted) return;
        setSignalingStatus('connected');
      };

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          handleIncomingSignalingMessage(msg);
        } catch (e) {
          console.error('Error parsing signaling message:', e);
        }
      };

      ws.onerror = () => {
        if (!isMounted) return;
        setSignalingStatus('disconnected');
      };

      ws.onclose = () => {
        if (!isMounted) return;
        setSignalingStatus('disconnected');
        reconnectTimeout = setTimeout(connectWs, 3000);
      };
    };

    connectWs();

    return () => {
      isMounted = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [isAuthenticated, token, handleIncomingSignalingMessage]);

  const endCall = useCallback(async () => {
    const current = activeCallRef.current;
    if (!current) return;

    const currentDuration = current.durationSeconds;
    const callId = current.callId;
    const peerId = current.peerId;
    const wasConnected = current.state === 'connected' || currentDuration > 0;

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: 'call_end',
          target_id: peerId,
          call_id: callId,
          reason: 'Call ended by participant',
        })
      );
    }

    cleanUpCallState('ended');

    try {
      await api.updateCall(callId, {
        status: wasConnected ? 'completed' : 'missed',
        duration_seconds: currentDuration,
      });
    } catch (e) {
      console.warn('Error updating call end status:', e);
    }
  }, [cleanUpCallState]);

  const initWebRTC = (peerId: string, callId: string): WebRTCManager => {
    const rtc = new WebRTCManager({
      onRemoteStream: (stream) => {
        if (remoteAudioRef.current) {
          if (remoteAudioRef.current.srcObject !== stream) {
            remoteAudioRef.current.srcObject = stream;
          }
          remoteAudioRef.current.play().then(() => {
            setIsAudioPlaybackBlocked(false);
          }).catch((e) => {
            console.warn('Audio play auto-policy:', e);
            setIsAudioPlaybackBlocked(true);
          });
        }
        setActiveCall((prev) => {
          const next = prev ? { ...prev, remoteStream: stream } : null;
          activeCallRef.current = next;
          return next;
        });
      },
      onIceCandidate: (candidate) => {
        if (socketRef.current?.readyState === WebSocket.OPEN) {
          socketRef.current.send(
            JSON.stringify({
              type: 'ice_candidate',
              target_id: peerId,
              call_id: callId,
              candidate,
            })
          );
        }
      },
      onConnectionStateChange: (state) => {
        if (state === 'connected') {
          setActiveCall((prev) => {
            const next = prev ? { ...prev, state: 'connected' as CallState } : null;
            activeCallRef.current = next;
            return next;
          });
        } else if (state === 'disconnected' || state === 'failed') {
          setCallError('WebRTC connection disconnected or failed.');
          endCall();
        }
      },
      onError: (err) => {
        setCallError(err.message);
      },
    });

    webrtcRef.current = rtc;
    return rtc;
  };

  const startCall = async (recipientId: string, recipientName: string) => {
    try {
      setCallError(null);
      pendingCandidatesRef.current = [];

      // Pre-unlock remote audio playback inside user click gesture
      if (remoteAudioRef.current) {
        remoteAudioRef.current.play().catch(() => {});
      }

      // 1. Create Call record in DB
      const record = await api.createCall(recipientId, 'audio');

      // 2. Initialize WebRTC
      const rtc = initWebRTC(recipientId, record._id);
      const localStream = await rtc.initializeLocalMedia();
      rtc.createPeerConnection();

      // 3. Create offer
      const offer = await rtc.createOffer();

      // 4. Set active call state
      const newCall: ActiveCallSession = {
        callId: record._id,
        peerId: recipientId,
        peerName: recipientName,
        isCaller: true,
        state: 'calling',
        durationSeconds: 0,
        isMuted: false,
        localStream,
        remoteStream: null,
      };
      activeCallRef.current = newCall;
      setActiveCall(newCall);

      // Start ringing timeout (45 seconds)
      if (ringTimeoutRef.current) clearTimeout(ringTimeoutRef.current);
      ringTimeoutRef.current = setTimeout(() => {
        if (activeCallRef.current?.state === 'calling') {
          setCallError('Recipient did not answer the call within 45 seconds.');
          endCall();
        }
      }, 45000);

      // 5. Send offer via WebSocket
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(
          JSON.stringify({
            type: 'call_offer',
            target_id: recipientId,
            call_id: record._id,
            sdp: offer,
            call_type: 'audio',
          })
        );
      } else {
        throw new Error('Signaling server is not connected.');
      }
    } catch (err: any) {
      setCallError(err.message || 'Failed to initiate call.');
      cleanUpCallState('failed');
    }
  };

  const acceptCall = async () => {
    if (!pendingOfferRef.current) return;
    const msg = pendingOfferRef.current;

    try {
      setCallError(null);

      // Pre-unlock remote audio playback inside user click gesture
      if (remoteAudioRef.current) {
        remoteAudioRef.current.play().catch(() => {});
      }

      setActiveCall((prev) => {
        const next = prev ? { ...prev, state: 'connecting' as CallState } : null;
        activeCallRef.current = next;
        return next;
      });

      // 1. Initialize WebRTC
      const rtc = initWebRTC(msg.caller_id, msg.call_id);
      const localStream = await rtc.initializeLocalMedia();
      rtc.createPeerConnection();

      // 2. Create answer from incoming offer
      const answer = await rtc.handleOffer(msg.sdp);

      // 3. Drain any ICE candidates that arrived while the incoming call modal was ringing
      while (pendingCandidatesRef.current.length > 0) {
        const cand = pendingCandidatesRef.current.shift();
        if (cand) {
          await rtc.addIceCandidate(cand);
        }
      }

      // 4. Update call record in backend
      await api.updateCall(msg.call_id, { status: 'connected' });

      // 5. Send answer via WebSocket
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(
          JSON.stringify({
            type: 'call_answer',
            target_id: msg.caller_id,
            call_id: msg.call_id,
            sdp: answer,
          })
        );
      }

      setActiveCall((prev) => {
        const next = prev
          ? {
              ...prev,
              state: 'connected' as CallState,
              localStream,
            }
          : null;
        activeCallRef.current = next;
        return next;
      });
      startDurationTimer();
    } catch (err: any) {
      setCallError(err.message || 'Failed to accept call.');
      // Notify caller so caller's session does not stay ringing indefinitely
      if (socketRef.current?.readyState === WebSocket.OPEN && msg?.caller_id) {
        socketRef.current.send(
          JSON.stringify({
            type: 'call_reject',
            target_id: msg.caller_id,
            call_id: msg.call_id,
            reason: err.message || 'Recipient could not access microphone or media device.',
          })
        );
      }
      try {
        await api.updateCall(msg.call_id, { status: 'failed', notes: err.message });
      } catch {}
      cleanUpCallState('failed');
    }
  };

  const rejectCall = async () => {
    if (!pendingOfferRef.current) return;
    const msg = pendingOfferRef.current;

    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: 'call_reject',
          target_id: msg.caller_id,
          call_id: msg.call_id,
          reason: 'Call declined by recipient',
        })
      );
    }

    try {
      await api.updateCall(msg.call_id, { status: 'rejected' });
    } catch {
      // ignore
    }

    cleanUpCallState('rejected');
  };

  const toggleMute = () => {
    if (webrtcRef.current) {
      const isMuted = webrtcRef.current.toggleMute();
      setActiveCall((prev) => {
        const next = prev ? { ...prev, isMuted } : null;
        activeCallRef.current = next;
        return next;
      });
    }
  };

  return (
    <CallContext.Provider
      value={{
        signalingStatus,
        onlineUserIds,
        activeCall,
        startCall,
        acceptCall,
        rejectCall,
        endCall,
        toggleMute,
        callError,
        clearCallError,
        audioLevel,
        isAudioPlaybackBlocked,
        unlockAudioPlayback,
      }}
    >
      {children}
    </CallContext.Provider>
  );
};

export const useCall = () => {
  const context = useContext(CallContext);
  if (!context) {
    throw new Error('useCall must be used within a CallProvider');
  }
  return context;
};
