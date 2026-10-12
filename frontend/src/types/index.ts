export type UserRole = 'agent' | 'supervisor' | 'admin';
export type UserPresence = 'available' | 'busy' | 'away' | 'offline';

export interface User {
  _id: string;
  name: string;
  email: string;
  role?: UserRole;
  created_at: string;
  status: UserPresence;
  presence?: UserPresence;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Contact {
  _id: string;
  name: string;
  phone_number: string;
  email?: string;
  assigned_agent_id?: string;
  assigned_agent_name?: string;
  notes?: string;
  tags?: string[];
  status: 'new' | 'contacted' | 'in_progress' | 'closed' | 'do_not_call';
  last_interaction_at?: string;
  created_at: string;
  updated_at: string;
}

export interface FollowUp {
  _id: string;
  contact_id?: string;
  contact_name?: string;
  contact_phone?: string;
  assigned_agent_id?: string;
  assigned_agent_name?: string;
  description: string;
  due_at: string;
  status: 'pending' | 'completed' | 'cancelled' | 'overdue';
  created_at: string;
}

export interface Conversation {
  _id: string;
  user_id: string;
  type: 'text_ai' | 'voice_ai' | 'agent_assist';
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
  provider?: string;
  provider_call_id?: string;
  caller_user_id?: string;
  recipient_user_id?: string;
  caller_number?: string;
  recipient_number?: string;
  agent_id?: string;
  contact_id?: string;
  contact_name?: string;
  call_type: string;
  direction?: 'inbound' | 'outbound';
  status: string;
  started_at: string;
  answered_at?: string;
  ended_at?: string;
  duration_seconds: number;
  outcome?: string;
  notes?: string;
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

export interface TelephonyStatus {
  is_configured: boolean;
  provider: string;
  active_carrier: string;
  phone_number?: string;
  message?: string;
  simulated_calling_disabled: boolean;
  configuration_guide?: Record<string, string>;
  internal_webrtc_available?: boolean;
}

export interface AgentAssistResponse {
  recommended_reply: string;
  extracted_needs: string[];
  action_items: string[];
  suggested_outcome?: string;
}

export interface SupervisorAgent {
  id: string;
  name: string;
  email: string;
  role: string;
  is_online: boolean;
  presence: string;
  assigned_contacts: number;
  pending_follow_ups: number;
  calls_handled: number;
}

export interface SupervisorMetrics {
  total_calls: number;
  completed_calls: number;
  missed_calls: number;
  average_handle_seconds: number;
  answer_rate_pct: number;
  outcomes: Record<string, number>;
}
