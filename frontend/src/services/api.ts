import {
  User,
  AuthResponse,
  Conversation,
  Message,
  CallRecord,
  Transcript,
  AIModel,
} from '../types';

const API_BASE = '/api';

class ApiClient {
  private token: string | null = null;

  constructor() {
    this.token = localStorage.getItem('onground_token');
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('onground_token', token);
    } else {
      localStorage.removeItem('onground_token');
    }
  }

  getToken(): string | null {
    return this.token;
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorMessage = `Request failed (${response.status})`;
      try {
        const errorData = await response.json();
        errorMessage = errorData.detail || errorData.message || errorMessage;
      } catch {
        // use default
      }
      throw new Error(errorMessage);
    }

    return response.json();
  }

  // Auth Endpoints
  async register(name: string, email: string, password: string): Promise<AuthResponse> {
    return this.request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    });
  }

  async login(email: string, password: string): Promise<AuthResponse> {
    return this.request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async getMe(): Promise<User> {
    return this.request<User>('/auth/me');
  }

  async getUsers(): Promise<User[]> {
    return this.request<User[]>('/auth/users');
  }

  async updateStatus(status: 'available' | 'busy' | 'away' | 'offline'): Promise<User> {
    return this.request<User>('/auth/status', {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  }

  // AI Endpoints
  async sendMessage(
    message: string,
    conversationId?: string,
    type: 'text_ai' | 'voice_ai' = 'text_ai',
    model?: string
  ): Promise<{
    conversation_id: string;
    user_message: Message;
    ai_message: Message;
    model_used: string;
  }> {
    return this.request('/ai/chat', {
      method: 'POST',
      body: JSON.stringify({
        message,
        conversation_id: conversationId,
        type,
        model,
      }),
    });
  }

  async getConversations(type?: string): Promise<Conversation[]> {
    const query = type ? `?type=${type}` : '';
    return this.request<Conversation[]>(`/ai/conversations${query}`);
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    return this.request<Message[]>(`/ai/conversations/${conversationId}/messages`);
  }

  async deleteConversation(conversationId: string): Promise<void> {
    return this.request(`/ai/conversations/${conversationId}`, {
      method: 'DELETE',
    });
  }

  async getModels(): Promise<AIModel[]> {
    const res = await this.request<{ models: AIModel[] }>('/ai/models');
    return res.models || [];
  }

  // Call Endpoints
  async createCall(recipientUserId: string, callType: 'audio' | 'video' = 'audio'): Promise<CallRecord> {
    return this.request<CallRecord>('/calls', {
      method: 'POST',
      body: JSON.stringify({
        recipient_user_id: recipientUserId,
        call_type: callType,
      }),
    });
  }

  async updateCall(
    callId: string,
    data: {
      status?: CallRecord['status'];
      ended_at?: string;
      duration_seconds?: number;
    }
  ): Promise<CallRecord> {
    return this.request<CallRecord>(`/calls/${callId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async getCalls(): Promise<CallRecord[]> {
    return this.request<CallRecord[]>('/calls');
  }

  async getTranscripts(callId: string): Promise<Transcript[]> {
    return this.request<Transcript[]>(`/calls/${callId}/transcripts`);
  }

  async addTranscript(callId: string, speaker: string, content: string): Promise<Transcript> {
    return this.request<Transcript>(`/calls/${callId}/transcripts`, {
      method: 'POST',
      body: JSON.stringify({ speaker, content }),
    });
  }

  async generateCallSummary(callId: string, transcriptText?: string): Promise<{ call_id: string; summary: string }> {
    return this.request<{ call_id: string; summary: string }>(`/calls/${callId}/summary`, {
      method: 'POST',
      body: JSON.stringify({ transcript_text: transcriptText }),
    });
  }

  // Platform Info
  async getHealth(): Promise<any> {
    return this.request('/health');
  }

  async getLimitations(): Promise<any> {
    return this.request('/info/limitations');
  }
}

export const api = new ApiClient();
