import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends, Query
from app.database import get_db
from app.models.schemas import (
    CallInitiateRequest,
    CallUpdateRequest,
    CallRecordResponse,
    TranscriptCreate,
    TranscriptResponse,
    SummaryRequest
)
from app.services.auth_service import get_current_user
from app.services.ai_service import AIService

router = APIRouter(prefix="/api/calls", tags=["Calls & WebRTC History"])

@router.post("", response_model=CallRecordResponse)
async def create_call_record(
    req: CallInitiateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    recipient_name = None
    if req.recipient_user_id:
        recipient = await db.users.find_one({"_id": req.recipient_user_id})
        if not recipient:
            raise HTTPException(status_code=404, detail="Recipient user not found.")
        recipient_name = recipient["name"]

    contact_name = None
    if req.contact_id:
        contact = await db.contacts.find_one({"_id": req.contact_id})
        if contact:
            contact_name = contact["name"]

    call_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    call_doc = {
        "_id": call_id,
        "provider": "webrtc",
        "caller_user_id": current_user["_id"],
        "caller_name": current_user["name"],
        "recipient_user_id": req.recipient_user_id,
        "recipient_name": recipient_name,
        "recipient_number": req.recipient_phone_number,
        "agent_id": current_user["_id"],
        "contact_id": req.contact_id,
        "contact_name": contact_name,
        "call_type": req.call_type,
        "direction": "outbound",
        "status": "ringing",
        "started_at": now_iso,
        "ended_at": None,
        "duration_seconds": 0,
        "outcome": None,
        "notes": "",
        "created_at": now_iso,
        "ai_summary": None,
    }

    await db.calls.insert_one(call_doc)

    return CallRecordResponse(
        _id=call_id,
        provider=call_doc["provider"],
        caller_user_id=current_user["_id"],
        caller_name=current_user["name"],
        recipient_user_id=req.recipient_user_id,
        recipient_name=recipient_name,
        recipient_number=req.recipient_phone_number,
        agent_id=call_doc["agent_id"],
        contact_id=call_doc["contact_id"],
        contact_name=call_doc["contact_name"],
        call_type=req.call_type,
        direction=call_doc["direction"],
        status="ringing",
        started_at=now_iso,
        ended_at=None,
        duration_seconds=0,
        outcome=None,
        notes="",
        created_at=now_iso,
        ai_summary=None
    )

@router.get("", response_model=List[CallRecordResponse])
async def list_calls(
    all_calls: bool = Query(False, description="Supervisors/admins can view all calls"),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    if all_calls and current_user.get("role") in ["supervisor", "admin"]:
        cursor = db.calls.find({}).sort("started_at", -1).limit(50)
    else:
        cursor = db.calls.find({
            "$or": [
                {"caller_user_id": current_user["_id"]},
                {"recipient_user_id": current_user["_id"]},
                {"agent_id": current_user["_id"]}
            ]
        }).sort("started_at", -1).limit(50)

    calls = await cursor.to_list(length=50)

    # Gather names for display
    user_ids = set()
    for c in calls:
        if c.get("caller_user_id"):
            user_ids.add(c["caller_user_id"])
        if c.get("recipient_user_id"):
            user_ids.add(c["recipient_user_id"])

    users_cursor = db.users.find({"_id": {"$in": list(user_ids)}})
    users_list = await users_cursor.to_list(length=len(user_ids))
    name_map = {u["_id"]: u["name"] for u in users_list}

    result = []
    for c in calls:
        result.append(CallRecordResponse(
            _id=c["_id"],
            provider=c.get("provider", "webrtc"),
            provider_call_id=c.get("provider_call_id"),
            caller_user_id=c.get("caller_user_id"),
            recipient_user_id=c.get("recipient_user_id"),
            caller_number=c.get("caller_number"),
            recipient_number=c.get("recipient_number"),
            agent_id=c.get("agent_id"),
            contact_id=c.get("contact_id"),
            contact_name=c.get("contact_name"),
            call_type=c.get("call_type", "audio"),
            direction=c.get("direction", "outbound"),
            status=c.get("status", "ended"),
            started_at=c.get("started_at", c.get("created_at", "")),
            answered_at=c.get("answered_at"),
            ended_at=c.get("ended_at"),
            duration_seconds=c.get("duration_seconds", 0),
            outcome=c.get("outcome"),
            notes=c.get("notes"),
            created_at=c.get("created_at", ""),
            caller_name=c.get("caller_name") or name_map.get(c.get("caller_user_id"), "Agent"),
            recipient_name=c.get("recipient_name") or (name_map.get(c.get("recipient_user_id")) if c.get("recipient_user_id") else (c.get("contact_name") or c.get("recipient_number") or "External")),
            ai_summary=c.get("ai_summary")
        ))

    return result

@router.patch("/{call_id}", response_model=CallRecordResponse)
async def update_call_record(
    call_id: str,
    req: CallUpdateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    call = await db.calls.find_one({"_id": call_id})
    if not call:
        raise HTTPException(status_code=404, detail="Call record not found.")

    is_supervisor_or_admin = current_user.get("role") in ["supervisor", "admin"]
    is_participant = current_user["_id"] in [
        call.get("caller_user_id"),
        call.get("recipient_user_id"),
        call.get("agent_id")
    ]

    if not is_supervisor_or_admin and not is_participant:
        raise HTTPException(status_code=403, detail="Unauthorized to modify this call.")

    updates: Dict[str, Any] = {}
    if req.status:
        updates["status"] = req.status
    if req.ended_at:
        updates["ended_at"] = req.ended_at
    elif req.status in ["ended", "completed", "rejected", "failed", "missed"] and not call.get("ended_at"):
        updates["ended_at"] = datetime.now(timezone.utc).isoformat()

    if req.duration_seconds is not None:
        updates["duration_seconds"] = req.duration_seconds

    if req.outcome:
        updates["outcome"] = req.outcome

    if req.notes is not None:
        updates["notes"] = req.notes

    if updates:
        await db.calls.update_one({"_id": call_id}, {"$set": updates})

    updated_call = await db.calls.find_one({"_id": call_id})

    caller = await db.users.find_one({"_id": updated_call.get("caller_user_id")})
    recipient = await db.users.find_one({"_id": updated_call.get("recipient_user_id")})

    return CallRecordResponse(
        _id=updated_call["_id"],
        provider=updated_call.get("provider", "webrtc"),
        provider_call_id=updated_call.get("provider_call_id"),
        caller_user_id=updated_call.get("caller_user_id"),
        recipient_user_id=updated_call.get("recipient_user_id"),
        caller_number=updated_call.get("caller_number"),
        recipient_number=updated_call.get("recipient_number"),
        agent_id=updated_call.get("agent_id"),
        contact_id=updated_call.get("contact_id"),
        contact_name=updated_call.get("contact_name"),
        call_type=updated_call.get("call_type", "audio"),
        direction=updated_call.get("direction", "outbound"),
        status=updated_call.get("status", "ended"),
        started_at=updated_call.get("started_at", ""),
        answered_at=updated_call.get("answered_at"),
        ended_at=updated_call.get("ended_at"),
        duration_seconds=updated_call.get("duration_seconds", 0),
        outcome=updated_call.get("outcome"),
        notes=updated_call.get("notes"),
        created_at=updated_call.get("created_at", ""),
        caller_name=caller["name"] if caller else updated_call.get("caller_name", "Agent"),
        recipient_name=recipient["name"] if recipient else updated_call.get("recipient_name", updated_call.get("recipient_number", "Customer")),
        ai_summary=updated_call.get("ai_summary")
    )

@router.post("/{call_id}/transcripts", response_model=TranscriptResponse)
async def add_call_transcript(
    call_id: str,
    req: TranscriptCreate,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    trans_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    trans_doc = {
        "_id": trans_id,
        "call_id": call_id,
        "speaker": req.speaker,
        "content": req.content.strip(),
        "timestamp": now_iso
    }

    await db.transcripts.insert_one(trans_doc)

    return TranscriptResponse(
        _id=trans_id,
        call_id=call_id,
        speaker=trans_doc["speaker"],
        content=trans_doc["content"],
        timestamp=trans_doc["timestamp"]
    )

@router.get("/{call_id}/transcripts", response_model=List[TranscriptResponse])
async def get_call_transcripts(
    call_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    cursor = db.transcripts.find({"call_id": call_id}).sort("timestamp", 1)
    transcripts = await cursor.to_list(length=200)

    return [
        TranscriptResponse(
            _id=t["_id"],
            call_id=t.get("call_id"),
            conversation_id=t.get("conversation_id"),
            speaker=t["speaker"],
            content=t["content"],
            timestamp=t["timestamp"]
        )
        for t in transcripts
    ]

@router.post("/{call_id}/summary")
async def generate_call_summary(
    call_id: str,
    req: Optional[SummaryRequest] = None,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Generate an AI-powered executive summary and follow-up points from actual call transcripts.
    """
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    call = await db.calls.find_one({"_id": call_id})
    if not call:
        raise HTTPException(status_code=404, detail="Call record not found.")

    # Fetch transcripts
    cursor = db.transcripts.find({"call_id": call_id}).sort("timestamp", 1)
    transcript_docs = await cursor.to_list(length=200)

    transcript_text = ""
    if req and req.transcript_text and req.transcript_text.strip():
        transcript_text = req.transcript_text.strip()
    elif transcript_docs:
        transcript_text = "\n".join([f"{t['speaker']}: {t['content']}" for t in transcript_docs if t.get('content')])

    if not transcript_text:
        return {
            "call_id": call_id,
            "ai_summary": "No transcript dialogue recorded for this session. Summary cannot be generated.",
            "transcript_segments_analyzed": 0
        }

    summary = await AIService.generate_call_summary(transcript_text)

    await db.calls.update_one(
        {"_id": call_id},
        {"$set": {"ai_summary": summary}}
    )

    return {
        "call_id": call_id,
        "ai_summary": summary,
        "transcript_segments_analyzed": len(transcript_docs)
    }
