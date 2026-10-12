from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, EmailStr, Field, ConfigDict

# ----------------- User & RBAC Models -----------------

UserRole = Literal["agent", "supervisor", "admin"]
UserStatus = Literal["available", "busy", "away", "offline"]

class UserRegister(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)
    role: UserRole = "agent"

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserStatusUpdate(BaseModel):
    status: UserStatus

class UserRoleUpdate(BaseModel):
    role: UserRole

class UserResponse(BaseModel):
    id: str = Field(..., alias="_id")
    name: str
    email: str
    role: UserRole = "agent"
    status: str = "available"
    created_at: str

    model_config = ConfigDict(populate_by_name=True)

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

# ----------------- Customer CRM Models -----------------

ContactStatus = Literal["new", "contacted", "in_progress", "closed", "do_not_call"]

class ContactCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    phone_number: str = Field(..., min_length=6, max_length=30)
    email: Optional[EmailStr] = None
    assigned_agent_id: Optional[str] = None
    notes: Optional[str] = ""
    tags: List[str] = Field(default_factory=list)
    status: ContactStatus = "new"

class ContactUpdate(BaseModel):
    name: Optional[str] = None
    phone_number: Optional[str] = None
    email: Optional[EmailStr] = None
    assigned_agent_id: Optional[str] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None
    status: Optional[ContactStatus] = None

class ContactResponse(BaseModel):
    id: str = Field(..., alias="_id")
    name: str
    phone_number: str
    email: Optional[str] = None
    assigned_agent_id: Optional[str] = None
    assigned_agent_name: Optional[str] = None
    notes: Optional[str] = ""
    tags: List[str] = Field(default_factory=list)
    status: str = "new"
    last_interaction_at: Optional[str] = None
    created_at: str
    updated_at: str

    model_config = ConfigDict(populate_by_name=True)

# ----------------- Follow-Up Tasks Models -----------------

FollowUpStatus = Literal["pending", "completed", "cancelled", "overdue"]

class FollowUpCreate(BaseModel):
    contact_id: Optional[str] = None
    assigned_agent_id: Optional[str] = None
    description: str = Field(..., min_length=3)
    due_at: str  # ISO timestamp

class FollowUpUpdate(BaseModel):
    description: Optional[str] = None
    due_at: Optional[str] = None
    status: Optional[FollowUpStatus] = None

class FollowUpResponse(BaseModel):
    id: str = Field(..., alias="_id")
    contact_id: str
    contact_name: Optional[str] = None
    contact_phone: Optional[str] = None
    assigned_agent_id: Optional[str] = None
    assigned_agent_name: Optional[str] = None
    description: str
    due_at: str
    status: str = "pending"
    created_at: str

    model_config = ConfigDict(populate_by_name=True)

# ----------------- Call & Telephony Models -----------------

CallDirection = Literal["inbound", "outbound"]
CallType = Literal["telephony_pstn", "voice_ai_outbound", "audio", "video", "internal_intercom"]
CallOutcome = Literal[
    "interested",
    "callback_requested",
    "voicemail",
    "resolved",
    "escalated",
    "no_answer",
    "busy",
    "rejected",
    "wrong_number",
    "completed"
]
CallStatus = Literal[
    "queued",
    "ringing",
    "connecting",
    "connected",
    "in_progress",
    "completed",
    "ended",
    "rejected",
    "busy",
    "no_answer",
    "failed",
    "canceled",
    "missed"
]

class CallInitiateRequest(BaseModel):
    recipient_user_id: Optional[str] = None
    recipient_phone_number: Optional[str] = None
    contact_id: Optional[str] = None
    call_type: CallType = "telephony_pstn"

class TelephonyOutboundRequest(BaseModel):
    phone_number: str = Field(..., min_length=6, max_length=30)
    contact_id: Optional[str] = None
    notes: Optional[str] = None

class CallUpdateRequest(BaseModel):
    status: Optional[CallStatus] = None
    ended_at: Optional[str] = None
    duration_seconds: Optional[int] = None
    outcome: Optional[CallOutcome] = None
    notes: Optional[str] = None

class CallRecordResponse(BaseModel):
    id: str = Field(..., alias="_id")
    provider: Optional[str] = "webrtc"
    provider_call_id: Optional[str] = None
    caller_user_id: Optional[str] = None
    recipient_user_id: Optional[str] = None
    caller_number: Optional[str] = None
    recipient_number: Optional[str] = None
    agent_id: Optional[str] = None
    contact_id: Optional[str] = None
    contact_name: Optional[str] = None
    call_type: str = "audio"
    direction: Optional[str] = "outbound"
    status: str
    started_at: str
    answered_at: Optional[str] = None
    ended_at: Optional[str] = None
    duration_seconds: Optional[int] = 0
    outcome: Optional[str] = None
    notes: Optional[str] = None
    created_at: str
    caller_name: Optional[str] = None
    recipient_name: Optional[str] = None
    ai_summary: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)

# ----------------- Transcript Models -----------------

class TranscriptCreate(BaseModel):
    call_id: Optional[str] = None
    conversation_id: Optional[str] = None
    speaker: str
    content: str

class TranscriptResponse(BaseModel):
    id: str = Field(..., alias="_id")
    call_id: Optional[str] = None
    conversation_id: Optional[str] = None
    speaker: str
    content: str
    timestamp: str

    model_config = ConfigDict(populate_by_name=True)

class SummaryRequest(BaseModel):
    call_id: Optional[str] = None
    conversation_id: Optional[str] = None
    transcript_text: Optional[str] = None

# ----------------- AI & Conversation Models -----------------

class ConversationCreate(BaseModel):
    type: Literal["text_ai", "voice_ai", "agent_assist"] = "text_ai"
    title: Optional[str] = "New Conversation"

class ConversationResponse(BaseModel):
    id: str = Field(..., alias="_id")
    user_id: str
    type: str
    title: str
    created_at: str
    updated_at: str
    message_count: Optional[int] = 0

    model_config = ConfigDict(populate_by_name=True)

class MessageCreate(BaseModel):
    role: Literal["user", "assistant", "system"]
    content: str

class MessageResponse(BaseModel):
    id: str = Field(..., alias="_id")
    conversation_id: str
    role: str
    content: str
    created_at: str

    model_config = ConfigDict(populate_by_name=True)

class ChatRequest(BaseModel):
    conversation_id: Optional[str] = None
    message: str = Field(..., min_length=1)
    type: Literal["text_ai", "voice_ai", "agent_assist"] = "text_ai"
    model: Optional[str] = None
    contact_id: Optional[str] = None  # Optional customer CRM context!

class ChatResponse(BaseModel):
    conversation_id: str
    user_message: MessageResponse
    ai_message: MessageResponse
    model_used: str

class AgentAssistRequest(BaseModel):
    call_id: Optional[str] = None
    contact_id: Optional[str] = None
    customer_query: str
    context: Optional[str] = None

class AgentAssistResponse(BaseModel):
    recommended_reply: str
    extracted_needs: List[str]
    action_items: List[str]
    suggested_outcome: Optional[str] = None
