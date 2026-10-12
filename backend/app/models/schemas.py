from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Literal
from pydantic import BaseModel, EmailStr, Field, ConfigDict

# ----------------- User Models -----------------

class UserRegister(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserStatusUpdate(BaseModel):
    status: Literal["available", "busy", "away", "offline"]

class UserResponse(BaseModel):
    id: str = Field(..., alias="_id")
    name: str
    email: str
    created_at: str
    status: str

    model_config = ConfigDict(populate_by_name=True)

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse

# ----------------- AI & Conversation Models -----------------

class ConversationCreate(BaseModel):
    type: Literal["text_ai", "voice_ai"] = "text_ai"
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
    type: Literal["text_ai", "voice_ai"] = "text_ai"
    model: Optional[str] = None

class ChatResponse(BaseModel):
    conversation_id: str
    user_message: MessageResponse
    ai_message: MessageResponse
    model_used: str

# ----------------- Call & WebRTC Models -----------------

class CallInitiateRequest(BaseModel):
    recipient_user_id: str
    call_type: Literal["audio", "video"] = "audio"

class CallUpdateRequest(BaseModel):
    status: Optional[Literal["ringing", "connecting", "connected", "rejected", "ended", "missed", "failed"]] = None
    ended_at: Optional[str] = None
    duration_seconds: Optional[int] = None

class CallRecordResponse(BaseModel):
    id: str = Field(..., alias="_id")
    caller_user_id: str
    recipient_user_id: str
    call_type: str
    status: str
    started_at: str
    ended_at: Optional[str] = None
    duration_seconds: Optional[int] = 0
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
