import uuid
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, status, Depends, Request, Response
from fastapi.responses import Response

from app.database import get_db
from app.models.schemas import TelephonyOutboundRequest, CallRecordResponse
from app.services.auth_service import get_current_user
from app.services.ai_service import AIService
from app.telephony.manager import get_telephony_provider

logger = logging.getLogger("onground_ai.routes.telephony")

router = APIRouter(prefix="/api/telephony", tags=["Telephony Carrier"])

@router.get("/status")
async def get_telephony_status():
    """
    Returns live carrier integration status, active provider, and diagnostics.
    Never reports a fake connected carrier when none exists.
    """
    provider = get_telephony_provider()
    status_info = await provider.get_status()
    return status_info

@router.get("/token")
async def get_softphone_token(current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Returns softphone access token for browser-to-PSTN audio bridging.
    """
    provider = get_telephony_provider()
    token_info = await provider.generate_client_token(identity=current_user["_id"])
    return token_info

@router.post("/outbound", response_model=CallRecordResponse)
async def initiate_outbound_phone_call(
    req: TelephonyOutboundRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Initiate a genuine outbound telephone call to an ordinary phone number.
    If carrier is unconfigured, returns an honest diagnostic rejection (no faked calls).
    """
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    clean_number = req.phone_number.strip()
    provider = get_telephony_provider()

    contact_name = None
    if req.contact_id:
        contact_doc = await db.contacts.find_one({"_id": req.contact_id})
        if contact_doc:
            contact_name = contact_doc.get("name")

    # If carrier is not configured, this raises HTTPException 400 with honest explanation
    carrier_result = await provider.initiate_outbound_call(
        to_number=clean_number,
        agent_id=current_user["_id"],
        agent_name=current_user["name"],
        contact_id=req.contact_id,
        notes=req.notes
    )

    now_iso = datetime.now(timezone.utc).isoformat()
    call_id = str(uuid.uuid4())

    call_doc = {
        "_id": call_id,
        "provider": provider.provider_name,
        "provider_call_id": carrier_result.get("call_sid"),
        "caller_user_id": current_user["_id"],
        "caller_name": current_user["name"],
        "caller_number": carrier_result.get("from_number"),
        "recipient_number": clean_number,
        "agent_id": current_user["_id"],
        "contact_id": req.contact_id,
        "contact_name": contact_name,
        "call_type": "telephony_pstn",
        "direction": "outbound",
        "status": "ringing",
        "started_at": now_iso,
        "answered_at": None,
        "ended_at": None,
        "duration_seconds": 0,
        "outcome": None,
        "notes": req.notes or "",
        "created_at": now_iso
    }

    await db.calls.insert_one(call_doc)

    if req.contact_id:
        await db.contacts.update_one(
            {"_id": req.contact_id},
            {"$set": {"last_interaction_at": now_iso}}
        )

    return CallRecordResponse(
        _id=call_doc["_id"],
        provider=call_doc["provider"],
        provider_call_id=call_doc["provider_call_id"],
        caller_user_id=call_doc["caller_user_id"],
        caller_name=call_doc["caller_name"],
        caller_number=call_doc["caller_number"],
        recipient_number=call_doc["recipient_number"],
        agent_id=call_doc["agent_id"],
        contact_id=call_doc["contact_id"],
        contact_name=call_doc["contact_name"],
        call_type=call_doc["call_type"],
        direction=call_doc["direction"],
        status=call_doc["status"],
        started_at=call_doc["started_at"],
        answered_at=call_doc["answered_at"],
        ended_at=call_doc["ended_at"],
        duration_seconds=call_doc["duration_seconds"],
        outcome=call_doc["outcome"],
        notes=call_doc["notes"],
        created_at=call_doc["created_at"]
    )

@router.post("/hangup")
async def terminate_phone_call(
    call_sid: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Hang up an active carrier call."""
    provider = get_telephony_provider()
    res = await provider.terminate_call(call_sid)

    db = get_db()
    if db is not None:
        now_iso = datetime.now(timezone.utc).isoformat()
        await db.calls.update_one(
            {"provider_call_id": call_sid},
            {"$set": {"status": "completed", "ended_at": now_iso}}
        )

    return res

@router.post("/webhook/voice")
async def voice_webhook(request: Request):
    """
    Carrier webhook returning TwiML instructions when a call answers or arrives.
    """
    form_data = {}
    try:
        form_data = dict(await request.form())
    except Exception:
        pass

    # Merge query params (e.g. agent_id)
    for k, v in request.query_params.items():
        form_data[k] = v

    provider = get_telephony_provider()
    xml_response = await provider.handle_voice_webhook(form_data)
    return Response(content=xml_response, media_type="application/xml")

@router.post("/webhook/status")
async def status_webhook(request: Request):
    """
    Carrier webhook receiving status updates (ringing, in-progress, completed).
    """
    form_data = {}
    try:
        form_data = dict(await request.form())
    except Exception:
        pass

    provider = get_telephony_provider()
    result = await provider.handle_status_callback(form_data)

    call_sid = result.get("call_sid")
    status_val = result.get("status")
    duration = result.get("duration")

    db = get_db()
    if db is not None and call_sid:
        update_fields: Dict[str, Any] = {}
        if status_val:
            update_fields["status"] = status_val
        if duration:
            try:
                update_fields["duration_seconds"] = int(duration)
            except ValueError:
                pass
        if status_val == "completed":
            update_fields["ended_at"] = datetime.now(timezone.utc).isoformat()

        if update_fields:
            await db.calls.update_one(
                {"provider_call_id": call_sid},
                {"$set": update_fields}
            )

    return {"received": True}

@router.post("/ai-phone-turn")
async def ai_phone_turn(request: Request):
    """
    Handles conversational Voice AI turn on live PSTN call.
    Receives speech recognized by carrier, sends to OpenRouter, returns spoken response.
    """
    form_data = {}
    try:
        form_data = dict(await request.form())
    except Exception:
        pass

    speech_result = form_data.get("SpeechResult", "").strip()
    call_sid = form_data.get("CallSid", "")

    if not speech_result:
        twiml = (
            "<Response>"
            "<Say>I didn't catch that. Could you please repeat your request?</Say>"
            "<Gather input='speech' timeout='3' action='/api/telephony/ai-phone-turn' method='POST'/>"
            "</Response>"
        )
        return Response(content=twiml, media_type="application/xml")

    # Send user utterance to OpenRouter
    system_prompt = (
        "You are an intelligent AI customer service representative at OnGround AI Call Centre. "
        "Keep your response concise, polite, natural, and conversational for telephone speech. Max 2-3 sentences."
    )
    ai_res = await AIService.generate_response(
        messages=[{"role": "user", "content": speech_result}],
        system_prompt=system_prompt
    )
    ai_text = ai_res.get("content", "Thank you for contacting us.").strip()

    twiml = (
        f"<Response>"
        f"<Say voice='Polly.Joanna'>{ai_text}</Say>"
        f"<Gather input='speech' timeout='3' action='/api/telephony/ai-phone-turn' method='POST'/>"
        f"</Response>"
    )
    return Response(content=twiml, media_type="application/xml")
