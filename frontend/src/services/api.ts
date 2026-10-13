import {
  User,
  AuthResponse,
  Conversation,
  Message,
  CallRecord,
  Transcript,
  AIModel,
  Contact,
  FollowUp,
  TelephonyStatus,
  AgentAssistResponse,
  SupervisorAgent,
  SupervisorMetrics,
  KnowledgeBaseArticle,
  QueueTicket,
  SupportCase,
  AnalyticsOverview,
} from '../types';

const rawApiUrl = (import.meta.env.VITE_API_URL || '').trim().replace(/\/+$/, '');
export const API_BASE = rawApiUrl
  ? (rawApiUrl.endsWith('/api') ? rawApiUrl : `${rawApiUrl}/api`)
  : '/api';

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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    const signal = options.signal || controller.signal;

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, {
        ...options,
        headers,
        signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 401 && endpoint !== '/auth/login' && endpoint !== '/auth/register') {
          this.setToken(null);
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('onground_unauthorized'));
          }
        }

        let errorMessage = `Request failed (${response.status})`;
        try {
          const errorData = await response.json();
          if (errorData.detail) {
            if (typeof errorData.detail === 'string') {
              errorMessage = errorData.detail;
            } else if (typeof errorData.detail === 'object' && errorData.detail.message) {
              errorMessage = errorData.detail.message;
            } else {
              errorMessage = JSON.stringify(errorData.detail);
            }
          } else if (errorData.message) {
            errorMessage = errorData.message;
          }
        } catch {
          // fallback
        }
        throw new Error(errorMessage);
      }

      return response.json();
    } catch (err: any) {
      clearTimeout(timeoutId);
      if (err.name === 'AbortError') {
        throw new Error('Request timed out. The server or database took too long to respond.');
      }
      throw err;
    }
  }

  // Auth Endpoints
  async register(name: string, email: string, password: string, role: string = 'agent'): Promise<AuthResponse> {
    return this.request<AuthResponse>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, role }),
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

  // Customer CRM Endpoints
  async getContacts(search?: string, status?: string, assignedToMe?: boolean): Promise<Contact[]> {
    const params = new URLSearchParams();
    if (search) params.append('search', search);
    if (status) params.append('status', status);
    if (assignedToMe) params.append('assigned_to_me', 'true');
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<Contact[]>(`/contacts${qs}`);
  }

  async getContact(contactId: string): Promise<Contact> {
    return this.request<Contact>(`/contacts/${contactId}`);
  }

  async createContact(data: Partial<Contact>): Promise<Contact> {
    return this.request<Contact>('/contacts', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateContact(contactId: string, data: Partial<Contact>): Promise<Contact> {
    return this.request<Contact>(`/contacts/${contactId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteContact(contactId: string): Promise<void> {
    return this.request(`/contacts/${contactId}`, {
      method: 'DELETE',
    });
  }

  async getContactHistory(contactId: string): Promise<{
    contact: any;
    calls: CallRecord[];
    follow_ups: FollowUp[];
    cases?: SupportCase[];
  }> {
    return this.request(`/contacts/${contactId}/history`);
  }

  async createContactFollowUp(contactId: string, data: { description: string; due_at: string; assigned_agent_id?: string }): Promise<FollowUp> {
    return this.request<FollowUp>(`/contacts/${contactId}/follow-ups`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // Follow-ups Endpoints
  async getFollowUps(status?: string): Promise<FollowUp[]> {
    const qs = status ? `?status=${status}` : '';
    return this.request<FollowUp[]>(`/follow-ups${qs}`);
  }

  async updateFollowUp(taskId: string, data: Partial<FollowUp>): Promise<FollowUp> {
    return this.request<FollowUp>(`/follow-ups/${taskId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  // Telephony Carrier Endpoints
  async getTelephonyStatus(): Promise<TelephonyStatus> {
    return this.request<TelephonyStatus>('/telephony/status');
  }

  async getSoftphoneToken(): Promise<{
    token: string | null;
    carrier_configured: boolean;
    browser_audio_ready?: boolean;
    identity?: string;
    phone_number?: string;
    message?: string;
  }> {
    return this.request('/telephony/token');
  }

  async initiateOutboundPhoneCall(
    phoneNumber: string,
    contactId?: string,
    notes?: string,
    browserSdk: boolean = false
  ): Promise<CallRecord> {
    return this.request<CallRecord>('/telephony/outbound', {
      method: 'POST',
      body: JSON.stringify({
        phone_number: phoneNumber,
        contact_id: contactId,
        notes,
        browser_sdk: browserSdk,
      }),
    });
  }

  async hangupPhoneCall(callSid?: string, callId?: string, durationSeconds?: number): Promise<any> {
    return this.request('/telephony/hangup', {
      method: 'POST',
      body: JSON.stringify({
        call_sid: callSid,
        call_id: callId,
        duration_seconds: durationSeconds,
      }),
    });
  }

  // AI & Agent Assist Endpoints
  async sendMessage(
    message: string,
    conversationId?: string,
    type: 'text_ai' | 'voice_ai' | 'agent_assist' = 'text_ai',
    model?: string,
    contactId?: string
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
        contact_id: contactId,
      }),
    });
  }

  async getAgentAssist(customerQuery: string, contactId?: string, context?: string): Promise<AgentAssistResponse> {
    return this.request<AgentAssistResponse>('/ai/agent-assist', {
      method: 'POST',
      body: JSON.stringify({
        customer_query: customerQuery,
        contact_id: contactId,
        context,
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

  // Supervisor Operations
  async getSupervisorAgents(): Promise<SupervisorAgent[]> {
    return this.request<SupervisorAgent[]>('/supervisor/agents');
  }

  async getSupervisorQueues(): Promise<{
    unassigned_contacts_count: number;
    unassigned_contacts: Contact[];
    pending_follow_ups_count: number;
    pending_follow_ups: FollowUp[];
    active_calls_count: number;
    active_calls: CallRecord[];
  }> {
    return this.request('/supervisor/queues');
  }

  async reassignItem(itemType: 'contact' | 'follow_up', itemId: string, targetAgentId: string): Promise<any> {
    return this.request('/supervisor/assign', {
      method: 'POST',
      body: JSON.stringify({
        item_type: itemType,
        item_id: itemId,
        target_agent_id: targetAgentId,
      }),
    });
  }

  async getSupervisorMetrics(): Promise<SupervisorMetrics> {
    return this.request<SupervisorMetrics>('/supervisor/metrics');
  }

  // Call Endpoints
  async createCall(recipientUserId: string, callType: string = 'audio'): Promise<CallRecord> {
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
      status?: string;
      ended_at?: string;
      duration_seconds?: number;
      outcome?: string;
      notes?: string;
    }
  ): Promise<CallRecord> {
    return this.request<CallRecord>(`/calls/${callId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async getCalls(allCalls: boolean = false): Promise<CallRecord[]> {
    const qs = allCalls ? '?all_calls=true' : '';
    return this.request<CallRecord[]>(`/calls${qs}`);
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

  async generateCallSummary(callId: string, transcriptText?: string): Promise<{ call_id: string; ai_summary: string; summary: string }> {
    const res = await this.request<{ call_id: string; ai_summary: string }>(`/calls/${callId}/summary`, {
      method: 'POST',
      body: JSON.stringify({ transcript_text: transcriptText }),
    });
    return {
      call_id: res.call_id,
      ai_summary: res.ai_summary,
      summary: res.ai_summary,
    };
  }

  // Knowledge Base Endpoints
  async getKnowledgeBase(category?: string, search?: string): Promise<KnowledgeBaseArticle[]> {
    const params = new URLSearchParams();
    if (category) params.append('category', category);
    if (search) params.append('search', search);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<KnowledgeBaseArticle[]>(`/knowledge-base${qs}`);
  }

  async createKnowledgeBaseArticle(article: {
    title: string;
    category: string;
    content: string;
    tags?: string[];
  }): Promise<KnowledgeBaseArticle> {
    return this.request<KnowledgeBaseArticle>('/knowledge-base', {
      method: 'POST',
      body: JSON.stringify(article),
    });
  }

  async deleteKnowledgeBaseArticle(articleId: string): Promise<void> {
    return this.request(`/knowledge-base/${articleId}`, { method: 'DELETE' });
  }

  // Incoming Call Queues & AI Escalations Endpoints
  async getQueues(status?: string, queueType?: string): Promise<QueueTicket[]> {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (queueType) params.append('queue_type', queueType);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<QueueTicket[]>(`/queues${qs}`);
  }

  async escalateAiCallToHuman(data: {
    customer_name: string;
    customer_phone?: string;
    contact_id?: string;
    reason: string;
    transcript_summary?: string;
    full_transcript?: string;
    priority?: string;
  }): Promise<QueueTicket> {
    return this.request<QueueTicket>('/queues/escalate', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async claimQueueTicket(ticketId: string): Promise<QueueTicket> {
    return this.request<QueueTicket>(`/queues/${ticketId}/claim`, { method: 'POST' });
  }

  async updateQueueTicket(ticketId: string, updates: Partial<QueueTicket>): Promise<QueueTicket> {
    return this.request<QueueTicket>(`/queues/${ticketId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  // Support Cases Endpoints
  async getCases(status?: string, priority?: string, search?: string): Promise<SupportCase[]> {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (priority) params.append('priority', priority);
    if (search) params.append('search', search);
    const qs = params.toString() ? `?${params.toString()}` : '';
    return this.request<SupportCase[]>(`/cases${qs}`);
  }

  async createCase(data: {
    title: string;
    description: string;
    customer_id?: string;
    customer_name?: string;
    customer_phone?: string;
    priority?: string;
    assigned_agent_id?: string;
  }): Promise<SupportCase> {
    return this.request<SupportCase>('/cases', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateCase(caseId: string, updates: Partial<SupportCase>): Promise<SupportCase> {
    return this.request<SupportCase>(`/cases/${caseId}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  }

  // Analytics & Operational Reports Endpoints
  async getAnalyticsOverview(): Promise<AnalyticsOverview> {
    return this.request<AnalyticsOverview>('/analytics/overview');
  }

  // Health & Limitations
  async getHealth(): Promise<any> {
    return this.request('/health');
  }

  async getLimitations(): Promise<any> {
    return this.request('/info/limitations');
  }
}

export const api = new ApiClient();

