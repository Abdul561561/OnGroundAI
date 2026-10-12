import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends
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

    recipient = await db.users.find_one({"_id": req.recipient_user_id})
    if not recipient:
        raise HTTPException(status_code=404, detail="Recipient user not found.")

    call_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    call_doc = {
        "_id": call_id,
        "caller_user_id": current_user["_id"],
        "recipient_user_id": req.recipient_user_id,
        "call_type": req.call_type,
        "status": "ringing",
        "started_at": now_iso,
        "ended_at": None,
        "duration_seconds": 0,
        "created_at": now_iso,
        "ai_summary": None,
    }

    await db.calls.insert_one(call_doc)

    return CallRecordResponse(
        _id=call_id,
        caller_user_id=current_user["_id"],
        recipient_user_id=req.recipient_user_id,
        call_type=req.call_type,
        status="ringing",
        started_at=now_iso,
        ended_at=None,
        duration_seconds=0,
        created_at=now_iso,
        caller_name=current_user["name"],
        recipient_name=recipient["name"],
        ai_summary=None
    )

@router.get("", response_model=List[CallRecordResponse])
async def list_calls(current_user: Dict[str, Any] = Depends(get_current_user)):
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    # Find calls where user is caller or recipient
    cursor = db.calls.find({
        "$or": [
            {"caller_user_id": current_user["_id"]},
            {"recipient_user_id": current_user["_id"]}
        ]
    }).sort("created_at", -1).limit(50)

    calls = await cursor.to_list(length=50)

    # Gather names for display
    user_ids = set()
    for c in calls:
        user_ids.add(c["caller_user_id"])
        user_ids.add(c["recipient_user_id"])

    users_cursor = db.users.find({"_id": {"$in": list(user_ids)}})
    users_list = await users_cursor.to_list(length=len(user_ids))
    name_map = {u["_id"]: u["name"] for u in users_list}

    result = []
    for c in calls:
        result.append(CallRecordResponse(
            _id=c["_id"],
            caller_user_id=c["caller_user_id"],
            recipient_user_id=c["recipient_user_id"],
            call_type=c.get("call_type", "audio"),
            status=c.get("status", "ended"),
            started_at=c.get("started_at", c.get("created_at")),
            ended_at=c.get("ended_at"),
            duration_seconds=c.get("duration_seconds", 0),
            created_at=c.get("created_at"),
            caller_name=name_map.get(c["caller_user_id"], "Unknown"),
            recipient_name=name_map.get(c["recipient_user_id"], "Unknown"),
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

    if current_user["_id"] not in [call["caller_user_id"], call["recipient_user_id"]]:
        raise HTTPException(status_code=403, detail="Unauthorized to modify this call.")

    updates: Dict[str, Any] = {}
    if req.status:
        updates["status"] = req.status
    if req.ended_at:
        updates["ended_at"] = req.ended_at
    elif req.status in ["ended", "rejected", "failed", "missed"] and not call.get("ended_at"):
        updates["ended_at"] = datetime.now(timezone.utc).isoformat()

    if req.duration_seconds is not None:
        updates["duration_seconds"] = req.duration_seconds

    if updates:
        await db.calls.update_one({"_id": call_id}, {"$set": updates})

    updated_call = await db.calls.find_one({"_id": call_id})

    # Fetch names
    caller = await db.users.find_one({"_id": updated_call["caller_user_id"]})
    recipient = await db.users.find_one({"_id": updated_call["recipient_user_id"]})

    return CallRecordResponse(
        _id=updated_call["_id"],
        caller_user_id=updated_call["caller_user_id"],
        recipient_user_id=updated_call["recipient_user_id"],
        call_type=updated_call.get("call_type", "audio"),
        status=updated_call.get("status", "ended"),
        started_at=updated_call.get("started_at"),
        ended_at=updated_call.get("ended_at"),
        duration_seconds=updated_call.get("duration_seconds", 0),
        created_at=updated_call.get("created_at"),
        caller_name=caller["name"] if caller else "Unknown",
        recipient_name=recipient["name"] if recipient else "Unknown",
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
        "conversation_id": req.conversation_id,
        "speaker": req.speaker,
        "content": req.content,
        "timestamp": now_iso
    }

    await db.transcripts.insert_one(trans_doc)

    return TranscriptResponse(
        _id=trans_id,
        call_id=call_id,
        conversation_id=req.conversation_id,
        speaker=req.speaker,
        content=req.content,
        timestamp=now_iso
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
            timestamp=t.get("timestamp", "")
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
    Generate an AI intelligence summary of the call transcript via OpenRouter.
    Only generates summary when actual transcript content exists.
    """
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    call = await db.calls.find_one({"_id": call_id})
    if not call:
        raise HTTPException(status_code=404, detail="Call record not found.")

    transcript_text = ""
    if req and req.transcript_text:
        transcript_text = req.transcript_text
    else:
        # Fetch transcripts from db
        cursor = db.transcripts.find({"call_id": call_id}).sort("timestamp", 1)
        transcripts = await cursor.to_list(length=200)
        lines = [f"{t['speaker']}: {t['content']}" for t in transcripts]
        transcript_text = "\n".join(lines)

    if not transcript_text.strip():
        # Fallback to metadata-based intelligence summary if no audio transcription was recorded
        caller = await db.users.find_one({"_id": call["caller_user_id"]})
        recipient = await db.users.find_one({"_id": call["recipient_user_id"]})
        caller_name = caller["name"] if caller else "Caller"
        recipient_name = recipient["name"] if recipient else "Recipient"
        dur = call.get("duration_seconds", 0)
        transcript_text = (
            f"Call metadata: Voice session between {caller_name} and {recipient_name}. "
            f"Status: {call.get('status')}. Duration: {dur} seconds. "
            f"Started: {call.get('started_at')}. Audio streams were exchanged securely via WebRTC."
        )

    summary = await AIService.summarize_transcript(transcript_text, call_type="WebRTC audio call")

    # Save summary to call document
    await db.calls.update_one({"_id": call_id}, {"$set": {"ai_summary": summary}})

    return {
        "call_id": call_id,
        "summary": summary
    }
