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
}

const CallContext = createContext<CallContextType | undefined>(undefined);

export const CallProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, token, isAuthenticated } = useAuth();
  const [signalingStatus, setSignalingStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [onlineUserIds, setOnlineUserIds] = useState<Set<string>>(new Set());
  const [activeCall, setActiveCall] = useState<ActiveCallSession | null>(null);
  const [callError, setCallError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const webrtcRef = useRef<WebRTCManager | null>(null);
  const timerRef = useRef<any>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const pendingOfferRef = useRef<any>(null);

  const clearCallError = () => setCallError(null);

  // Initialize Remote Audio Element
  useEffect(() => {
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audio.setAttribute('playsinline', 'true');
    remoteAudioRef.current = audio;

    return () => {
      audio.srcObject = null;
      audio.remove();
    };
  }, []);

  // WebSocket Signaling Connection
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

    setSignalingStatus('connecting');
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/signaling?token=${encodeURIComponent(token)}`;
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
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
      setSignalingStatus('disconnected');
    };

    ws.onclose = () => {
      setSignalingStatus('disconnected');
    };

    return () => {
      ws.close();
      socketRef.current = null;
    };
  }, [isAuthenticated, token]);

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
        setActiveCall({
          callId: msg.call_id,
          peerId: msg.caller_id,
          peerName: msg.caller_name || 'Caller',
          isCaller: false,
          state: 'incoming',
          durationSeconds: 0,
          isMuted: false,
          localStream: null,
          remoteStream: null,
        });
        break;

      case 'call_accepted':
        if (webrtcRef.current && msg.sdp) {
          try {
            await webrtcRef.current.handleAnswer(msg.sdp);
            setActiveCall((prev) => (prev ? { ...prev, state: 'connected' } : null));
            startDurationTimer();
          } catch (e: any) {
            setCallError(`Failed to establish connection: ${e.message}`);
          }
        }
        break;

      case 'ice_candidate':
        if (webrtcRef.current && msg.candidate) {
          await webrtcRef.current.addIceCandidate(msg.candidate);
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
    }
  }, []);

  const startDurationTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setActiveCall((prev) => {
        if (!prev || prev.state !== 'connected') return prev;
        return { ...prev, durationSeconds: prev.durationSeconds + 1 };
      });
    }, 1000);
  };

  const stopDurationTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const cleanUpCallState = (finalState: CallState = 'ended') => {
    stopDurationTimer();
    if (webrtcRef.current) {
      webrtcRef.current.close();
      webrtcRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }
    pendingOfferRef.current = null;
    setActiveCall((prev) => (prev ? { ...prev, state: finalState } : null));
    setTimeout(() => {
      setActiveCall(null);
    }, 2500);
  };

  const initWebRTC = (peerId: string, callId: string): WebRTCManager => {
    const rtc = new WebRTCManager({
      onRemoteStream: (stream) => {
        if (remoteAudioRef.current) {
          remoteAudioRef.current.srcObject = stream;
          remoteAudioRef.current.play().catch((e) => console.warn('Audio play auto-policy:', e));
        }
        setActiveCall((prev) => (prev ? { ...prev, remoteStream: stream } : null));
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
          setActiveCall((prev) => (prev ? { ...prev, state: 'connected' } : null));
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
      // 1. Create Call record in DB
      const record = await api.createCall(recipientId, 'audio');

      // 2. Initialize WebRTC
      const rtc = initWebRTC(recipientId, record._id);
      const localStream = await rtc.initializeLocalMedia();
      rtc.createPeerConnection();

      // 3. Create offer
      const offer = await rtc.createOffer();

      // 4. Set active call state
      setActiveCall({
        callId: record._id,
        peerId: recipientId,
        peerName: recipientName,
        isCaller: true,
        state: 'calling',
        durationSeconds: 0,
        isMuted: false,
        localStream,
        remoteStream: null,
      });

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
      setActiveCall((prev) => (prev ? { ...prev, state: 'connecting' } : null));

      // 1. Initialize WebRTC
      const rtc = initWebRTC(msg.caller_id, msg.call_id);
      const localStream = await rtc.initializeLocalMedia();
      rtc.createPeerConnection();

      // 2. Create answer from incoming offer
      const answer = await rtc.handleOffer(msg.sdp);

      // 3. Update call record in backend
      await api.updateCall(msg.call_id, { status: 'connected' });

      // 4. Send answer via WebSocket
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

      setActiveCall((prev) =>
        prev
          ? {
              ...prev,
              state: 'connected',
              localStream,
            }
          : null
      );
      startDurationTimer();
    } catch (err: any) {
      setCallError(err.message || 'Failed to accept call.');
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

  const endCall = async () => {
    if (!activeCall) return;

    const currentDuration = activeCall.durationSeconds;
    const callId = activeCall.callId;
    const peerId = activeCall.peerId;

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

    try {
      await api.updateCall(callId, {
        status: 'ended',
        duration_seconds: currentDuration,
      });
    } catch (e) {
      console.warn('Error updating call end status:', e);
    }

    cleanUpCallState('ended');
  };

  const toggleMute = () => {
    if (webrtcRef.current) {
      const isMuted = webrtcRef.current.toggleMute();
      setActiveCall((prev) => (prev ? { ...prev, isMuted } : null));
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
