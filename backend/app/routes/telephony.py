import uuid
import logging
from datetime import datetime, timezone
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, status, Depends, Request, Response, Query
from fastapi.responses import Response
from pydantic import BaseModel

from app.database import get_db
from app.models.schemas import TelephonyOutboundRequest, CallRecordResponse
from app.services.auth_service import get_current_user
from app.services.ai_service import AIService
from app.services.signaling_service import manager
from app.telephony.manager import get_telephony_provider

logger = logging.getLogger("onground_ai.routes.telephony")

router = APIRouter(prefix="/api/telephony", tags=["Telephony Carrier"])

class TelephonyHangupBody(BaseModel):
    call_sid: Optional[str] = None
    call_id: Optional[str] = None
    duration_seconds: Optional[int] = None

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
    Returns softphone access token for browser-to-PSTN audio bridging (@twilio/voice-sdk).
    """
    provider = get_telephony_provider()
    token_info = await provider.generate_client_token(identity=current_user["_id"])
    return token_info

@router.post("/outbound", response_model=CallRecordResponse)
async def initiate_outbound_phone_call(
    req: TelephonyOutboundRequest,
    browser_sdk: bool = Query(False, description="True when browser @twilio/voice-sdk initiates the media leg directly"),
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

    if not provider.is_configured:
        # Delegate to UnconfiguredAdapter so it raises the standard 400 diagnostic error
        await provider.initiate_outbound_call(
            to_number=clean_number,
            agent_id=current_user["_id"],
            agent_name=current_user["name"],
            contact_id=req.contact_id,
            notes=req.notes
        )

    contact_id = req.contact_id
    contact_name = None
    if contact_id:
        contact_doc = await db.contacts.find_one({"_id": contact_id})
        if contact_doc:
            contact_name = contact_doc.get("name")
    else:
        digits = "".join(filter(str.isdigit, clean_number))
        if digits:
            contact_doc = await db.contacts.find_one({"phone_number": {"$regex": digits}})
            if contact_doc:
                contact_id = contact_doc["_id"]
                contact_name = contact_doc.get("name")

    use_browser_sdk = browser_sdk or bool(req.browser_sdk)
    if use_browser_sdk:
        # Browser @twilio/voice-sdk Device.connect() places the call directly through TwiML App
        carrier_result = {
            "call_sid": f"sdk-pending-{uuid.uuid4().hex[:10]}",
            "from_number": getattr(provider, "phone_number", None),
            "status": "ringing"
        }
    else:
        try:
            carrier_result = await provider.initiate_outbound_call(
                to_number=clean_number,
                agent_id=current_user["_id"],
                agent_name=current_user["name"],
                contact_id=contact_id,
                notes=req.notes
            )
        except RuntimeError as e:
            raise HTTPException(status_code=400, detail=str(e))

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
        "contact_id": contact_id,
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

    if contact_id:
        await db.contacts.update_one(
            {"_id": contact_id},
            {"$set": {"last_interaction_at": now_iso, "updated_at": now_iso}}
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
    body: Optional[TelephonyHangupBody] = None,
    call_sid: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Hang up an active carrier call via either JSON body or query parameter."""
    effective_sid = call_sid or (body.call_sid if body else None)
    effective_call_id = body.call_id if body else None
    duration_sec = body.duration_seconds if body else None

    provider = get_telephony_provider()
    res = {"status": "completed"}
    if effective_sid and not effective_sid.startswith("sdk-pending-"):
        res = await provider.terminate_call(effective_sid)

    db = get_db()
    if db is not None:
        now_iso = datetime.now(timezone.utc).isoformat()
        update_doc: Dict[str, Any] = {"status": "completed", "ended_at": now_iso}
        if duration_sec is not None:
            update_doc["duration_seconds"] = duration_sec

        if effective_call_id:
            await db.calls.update_one({"_id": effective_call_id}, {"$set": update_doc})
        elif effective_sid:
            await db.calls.update_one({"provider_call_id": effective_sid}, {"$set": update_doc})

    return res

@router.post("/webhook/voice")
async def voice_webhook(request: Request):
    """
    Carrier webhook returning TwiML instructions when an outbound or inbound PSTN call connects.
    Also records inbound calls in MongoDB and notifies online agents via WebSocket.
    """
    form_data: Dict[str, Any] = {}
    try:
        form_data = dict(await request.form())
    except Exception:
        pass

    for k, v in request.query_params.items():
        form_data[k] = v

    online_agent_ids = list(manager.get_online_user_ids())
    form_data["online_agent_ids"] = online_agent_ids

    db = get_db()
    from_caller = str(form_data.get("From", "")).strip()
    to_target = str(form_data.get("To", "")).strip()
    call_sid = str(form_data.get("CallSid", "")).strip()
    call_record_id = str(form_data.get("call_record_id", "")).strip()

    if db is not None and call_sid:
        now_iso = datetime.now(timezone.utc).isoformat()
        # Case A: Browser Voice SDK outbound leg -> attach real Twilio CallSid to call record
        if from_caller.startswith("client:") and call_record_id:
            await db.calls.update_one(
                {"_id": call_record_id},
                {"$set": {"provider_call_id": call_sid, "status": "ringing"}}
            )
        # Case B: Inbound external telephone call arriving at our Twilio number
        elif not from_caller.startswith("client:") and not form_data.get("agent_id"):
            digits = "".join(filter(str.isdigit, from_caller))
            contact_doc = await db.contacts.find_one({"phone_number": {"$regex": digits}}) if digits else None
            customer_name = contact_doc["name"] if contact_doc else f"Inbound Caller ({from_caller})"
            contact_id = contact_doc["_id"] if contact_doc else None

            inbound_call_id = f"inb-{uuid.uuid4().hex[:12]}"
            await db.calls.insert_one({
                "_id": inbound_call_id,
                "provider": "twilio",
                "provider_call_id": call_sid,
                "caller_number": from_caller,
                "caller_name": customer_name,
                "recipient_number": to_target,
                "contact_id": contact_id,
                "contact_name": customer_name,
                "call_type": "telephony_pstn",
                "direction": "inbound",
                "status": "ringing",
                "started_at": now_iso,
                "duration_seconds": 0,
                "created_at": now_iso
            })

            ticket_id = f"q-inb-{uuid.uuid4().hex[:10]}"
            ticket_doc = {
                "_id": ticket_id,
                "customer_name": customer_name,
                "customer_phone": from_caller,
                "contact_id": contact_id,
                "queue_type": "inbound_call",
                "priority": "high",
                "status": "waiting",
                "reason": f"Inbound PSTN telephone call from {from_caller}",
                "wait_time_seconds": 0,
                "created_at": now_iso,
                "updated_at": now_iso
            }
            await db.call_queues.insert_one(ticket_doc)

            for uid in online_agent_ids:
                await manager.send_personal_message(uid, {
                    "type": "incoming_pstn_call",
                    "call_sid": call_sid,
                    "call_id": inbound_call_id,
                    "ticket": ticket_doc,
                    "caller_phone": from_caller,
                    "caller_name": customer_name
                })

    provider = get_telephony_provider()
    xml_response = await provider.handle_voice_webhook(form_data)
    return Response(content=xml_response, media_type="application/xml")

@router.post("/webhook/status")
async def status_webhook(request: Request):
    """
    Carrier webhook receiving status updates (initiated, ringing, in-progress, completed, busy, no-answer, failed).
    Updates MongoDB call record and broadcasts live status over WebSocket to the agent.
    """
    form_data: Dict[str, Any] = {}
    try:
        form_data = dict(await request.form())
    except Exception:
        pass

    provider = get_telephony_provider()
    result = await provider.handle_status_callback(form_data)

    call_sid = result.get("call_sid")
    raw_status = (result.get("status") or "").lower()
    duration = result.get("duration")

    status_map = {
        "queued": "ringing",
        "initiated": "ringing",
        "ringing": "ringing",
        "in-progress": "connected",
        "answered": "connected",
        "completed": "completed",
        "busy": "busy",
        "no-answer": "no_answer",
        "failed": "failed",
        "canceled": "missed",
    }
    mapped_status = status_map.get(raw_status, raw_status or "completed")

    db = get_db()
    if db is not None and call_sid:
        now_iso = datetime.now(timezone.utc).isoformat()
        update_fields: Dict[str, Any] = {"status": mapped_status}
        if mapped_status == "connected":
            update_fields["answered_at"] = now_iso
        if duration is not None:
            try:
                update_fields["duration_seconds"] = int(duration)
            except ValueError:
                pass
        if mapped_status in ("completed", "busy", "no_answer", "failed", "missed"):
            update_fields["ended_at"] = now_iso

        call_doc = await db.calls.find_one_and_update(
            {"provider_call_id": call_sid},
            {"$set": update_fields}
        )

        # Broadcast real-time status to the agent's browser
        target_agents = set(manager.get_online_user_ids())
        if call_doc and call_doc.get("agent_id"):
            target_agents.add(call_doc["agent_id"])

        for uid in target_agents:
            await manager.send_personal_message(uid, {
                "type": "pstn_call_status",
                "call_sid": call_sid,
                "call_id": call_doc["_id"] if call_doc else None,
                "status": mapped_status,
                "raw_status": raw_status,
                "duration_seconds": update_fields.get("duration_seconds")
            })

    return {"received": True}

@router.post("/ai-phone-turn")
async def ai_phone_turn(request: Request):
    """
    Optional IVR endpoint for conversational Voice AI turn on a PSTN call if routed to AI IVR.
    """
    form_data = {}
    try:
        form_data = dict(await request.form())
    except Exception:
        pass

    speech_result = form_data.get("SpeechResult", "").strip()

    if not speech_result:
        twiml = (
            "<Response>"
            "<Say>I didn't catch that. Could you please repeat your request?</Say>"
            "<Gather input='speech' timeout='3' action='/api/telephony/ai-phone-turn' method='POST'/>"
            "</Response>"
        )
        return Response(content=twiml, media_type="application/xml")

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
