export interface User {
  _id: string;
  name: string;
  email: string;
  created_at: string;
  status: 'available' | 'busy' | 'away' | 'offline';
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Conversation {
  _id: string;
  user_id: string;
  type: 'text_ai' | 'voice_ai';
  title: string;
  created_at: string;
  updated_at: string;
  message_count?: number;
}

export interface Message {
  _id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  created_at: string;
}

export interface CallRecord {
  _id: string;
  caller_user_id: string;
  recipient_user_id: string;
  call_type: 'audio' | 'video';
  status: 'ringing' | 'connecting' | 'connected' | 'rejected' | 'ended' | 'missed' | 'failed';
  started_at: string;
  ended_at?: string;
  duration_seconds: number;
  created_at: string;
  caller_name?: string;
  recipient_name?: string;
  ai_summary?: string;
}

export interface Transcript {
  _id: string;
  call_id?: string;
  conversation_id?: string;
  speaker: string;
  content: string;
  timestamp: string;
}

export interface AIModel {
  id: string;
  name: string;
  context_length?: number;
}

export type CallState =
  | 'idle'
  | 'calling'
  | 'incoming'
  | 'connecting'
  | 'connected'
  | 'ended'
  | 'rejected'
  | 'failed';

export interface ActiveCallSession {
  callId: string;
  peerId: string;
  peerName: string;
  isCaller: boolean;
  state: CallState;
  durationSeconds: number;
  isMuted: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
}
