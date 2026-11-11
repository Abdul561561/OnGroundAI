import html
import json
import logging
import re
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional, Tuple
from urllib.parse import parse_qs
from fastapi import APIRouter, HTTPException, Depends, Request, Query
from fastapi.responses import Response
from pydantic import BaseModel

from app.database import get_db
from app.models.schemas import TelephonyOutboundRequest, CallRecordResponse
from app.services.auth_service import get_current_user
from app.services.ai_service import AIService
from app.services.signaling_service import manager
from app.telephony.manager import get_telephony_provider
from app.telephony.twilio_adapter import (
    TelephonyCarrierError,
    normalize_and_validate_e164,
)

logger = logging.getLogger("onground_ai.routes.telephony")

router = APIRouter(prefix="/api/telephony", tags=["Telephony Carrier"])

TWILIO_STATUS_MAP = {
    "queued": "queued",
    "initiated": "ringing",
    "ringing": "ringing",
    "in-progress": "connected",
    "answered": "connected",
    "completed": "completed",
    "busy": "busy",
    "no-answer": "no_answer",
    "failed": "failed",
    "canceled": "canceled",
}

TERMINAL_CALL_STATUSES = {"completed", "busy", "no_answer", "failed", "canceled", "missed", "ended"}


def map_twilio_status(raw_status: Optional[str]) -> str:
    key = (raw_status or "").strip().lower()
    return TWILIO_STATUS_MAP.get(key, key or "completed")


async def _extract_twilio_params(request: Request) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """
    Parse Twilio webhook parameters cleanly from form-urlencoded bodies, multipart forms,
    JSON payloads, and URL query strings without requiring python-multipart.
    Returns (merged_params, post_only_params) so X-Twilio-Signature verifies POST body fields separately from URL query params.
    """
    post_params: Dict[str, Any] = {}
    content_type = (request.headers.get("content-type") or "").lower()

    try:
        raw_body = await request.body()
    except Exception:
        raw_body = b""

    if raw_body:
        if "application/json" in content_type:
            try:
                parsed = json.loads(raw_body.decode("utf-8"))
                if isinstance(parsed, dict):
                    post_params.update(parsed)
            except Exception:
                pass
        elif "multipart/form-data" in content_type:
            try:
                post_params.update(dict(await request.form()))
            except Exception as exc:
                logger.warning("Could not parse multipart Twilio webhook body: %s", exc)
        else:
            try:
                decoded = raw_body.decode("utf-8", errors="replace")
                parsed_qs = parse_qs(decoded, keep_blank_values=True)
                for k, values in parsed_qs.items():
                    if values:
                        post_params[k] = values[-1]
            except Exception as exc:
                logger.warning("Could not parse form-urlencoded webhook body: %s", exc)

    merged_params = dict(post_params)
    for k, v in request.query_params.items():
        merged_params[k] = v

    return merged_params, post_params


def _validate_twilio_webhook(request: Request, post_params: Dict[str, Any], provider: Any) -> None:
    """Validate X-Twilio-Signature using Auth Token across public HTTPS / ngrok forwarded URLs."""
    if getattr(provider, "provider_name", "") != "twilio" or not getattr(provider, "is_configured", False):
        return

    signature = (request.headers.get("x-twilio-signature") or request.headers.get("X-Twilio-Signature") or "").strip()
    is_forwarded = bool(
        request.headers.get("x-forwarded-host")
        or request.headers.get("x-forwarded-for")
        or request.headers.get("x-forwarded-proto")
    )
    can_validate = bool(
        hasattr(provider, "validate_webhook_signature")
        and getattr(provider, "auth_token", "")
        and not getattr(provider, "_auth_token_failed", False)
    )

    if not signature:
        if is_forwarded and can_validate:
            raise HTTPException(status_code=403, detail="Missing X-Twilio-Signature header on forwarded webhook.")
        return

    if not can_validate:
        logger.warning(
            "Received Twilio webhook with X-Twilio-Signature, but TWILIO_AUTH_TOKEN is missing or unverified; "
            "update TWILIO_AUTH_TOKEN in backend/.env to enforce webhook signature validation."
        )
        return

    path = request.url.path
    query = f"?{request.url.query}" if request.url.query else ""
    url_candidates = []
    public_base = (getattr(provider, "public_base_url", "") or "").rstrip("/")
    if public_base:
        url_candidates.append(f"{public_base}{path}{query}")

    fwd_proto = (request.headers.get("x-forwarded-proto") or request.url.scheme or "https").split(",")[0].strip()
    fwd_host = (
        request.headers.get("x-forwarded-host")
        or request.headers.get("host")
        or ""
    ).split(",")[0].strip()
    if fwd_host:
        url_candidates.append(f"{fwd_proto}://{fwd_host}{path}{query}")
    url_candidates.append(str(request.url))

    if not provider.validate_webhook_signature(url_candidates, post_params, signature):
        logger.warning("Rejected Twilio webhook on %s due to invalid X-Twilio-Signature.", path)
        raise HTTPException(status_code=403, detail="Invalid Twilio webhook signature.")


def _doc_to_call_response(doc: Dict[str, Any]) -> CallRecordResponse:
    return CallRecordResponse(
        _id=doc["_id"],
        provider=doc.get("provider", "twilio"),
        provider_call_id=doc.get("provider_call_id"),
        caller_user_id=doc.get("caller_user_id"),
        recipient_user_id=doc.get("recipient_user_id"),
        caller_name=doc.get("caller_name"),
        recipient_name=doc.get("recipient_name") or doc.get("contact_name") or doc.get("recipient_number"),
        caller_number=doc.get("caller_number"),
        recipient_number=doc.get("recipient_number"),
        agent_id=doc.get("agent_id"),
        contact_id=doc.get("contact_id"),
        contact_name=doc.get("contact_name"),
        call_type=doc.get("call_type", "telephony_pstn"),
        direction=doc.get("direction", "outbound"),
        status=doc.get("status", "queued"),
        started_at=doc.get("started_at", doc.get("created_at", "")),
        answered_at=doc.get("answered_at"),
        ended_at=doc.get("ended_at"),
        duration_seconds=doc.get("duration_seconds", 0),
        outcome=doc.get("outcome"),
        notes=doc.get("notes"),
        created_at=doc.get("created_at", ""),
        ai_summary=doc.get("ai_summary"),
    )


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
    return await provider.get_status()


@router.get("/token")
async def get_softphone_token(current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    Returns softphone access token for browser-to-PSTN audio bridging (@twilio/voice-sdk).
    """
    provider = get_telephony_provider()
    return await provider.generate_client_token(identity=current_user["_id"])


@router.post("/outbound", response_model=CallRecordResponse)
async def initiate_outbound_phone_call(
    req: TelephonyOutboundRequest,
    browser_sdk: bool = Query(False, description="True when browser @twilio/voice-sdk initiates the media leg directly"),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Initiate a genuine outbound telephone call to an ordinary phone number.
    Validates E.164 destination, calls Twilio REST API (or prepares Voice SDK leg),
    and returns the real Call SID and initial Twilio call status.
    """
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    try:
        clean_number = normalize_and_validate_e164(req.phone_number, "destination phone number")
    except ValueError as ve:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "INVALID_PHONE_NUMBER",
                "message": str(ve),
            },
        )

    provider = get_telephony_provider()

    if not provider.is_configured:
        if provider.provider_name == "unconfigured":
            await provider.initiate_outbound_call(
                to_number=clean_number,
                agent_id=current_user["_id"],
                agent_name=current_user["name"],
                contact_id=req.contact_id,
                notes=req.notes,
            )
        raise HTTPException(
            status_code=400,
            detail={
                "error": "TELEPHONY_CARRIER_NOT_CONFIGURED",
                "message": (
                    "Twilio carrier is selected, but required credentials "
                    "(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER) are missing in backend/.env."
                ),
            },
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
            contact_doc = await db.contacts.find_one({"phone_number": {"$regex": re.escape(digits)}})
            if contact_doc:
                contact_id = contact_doc["_id"]
                contact_name = contact_doc.get("name")

    call_id = str(uuid.uuid4())
    use_browser_sdk = browser_sdk or bool(req.browser_sdk)

    if use_browser_sdk:
        if not getattr(provider, "is_browser_voice_ready", False):
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "BROWSER_SDK_NOT_READY",
                    "message": (
                        "Direct browser Voice SDK calling requires TWILIO_TWIML_APP_SID, "
                        "TWILIO_API_KEY_SID, and TWILIO_API_KEY_SECRET in backend/.env."
                    ),
                },
            )
        if not getattr(provider, "has_public_webhook_url", False):
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "PUBLIC_WEBHOOK_URL_REQUIRED",
                    "message": (
                        "PUBLIC_BASE_URL must be a publicly reachable HTTPS URL (such as your ngrok URL) "
                        "before initiating calls."
                    ),
                },
            )
        carrier_result = {
            "call_sid": f"sdk-pending-{uuid.uuid4().hex[:10]}",
            "from_number": getattr(provider, "phone_number", None),
            "status": "queued",
        }
    else:
        try:
            carrier_result = await provider.initiate_outbound_call(
                to_number=clean_number,
                agent_id=current_user["_id"],
                agent_name=current_user["name"],
                contact_id=contact_id,
                notes=req.notes,
                call_record_id=call_id,
            )
        except TelephonyCarrierError as ce:
            raise HTTPException(
                status_code=ce.status_code,
                detail={
                    "error": ce.error_code,
                    "twilio_code": ce.twilio_code,
                    "message": ce.message,
                },
            )
        except RuntimeError as e:
            raise HTTPException(
                status_code=400,
                detail={
                    "error": "TELEPHONY_CALL_FAILED",
                    "message": str(e),
                },
            )

    now_iso = datetime.now(timezone.utc).isoformat()
    initial_status = map_twilio_status(carrier_result.get("status") or "queued")

    call_doc = {
        "_id": call_id,
        "provider": provider.provider_name,
        "provider_call_id": carrier_result.get("call_sid"),
        "caller_user_id": current_user["_id"],
        "caller_name": current_user["name"],
        "caller_number": carrier_result.get("from_number"),
        "recipient_number": clean_number,
        "recipient_name": contact_name or clean_number,
        "agent_id": current_user["_id"],
        "contact_id": contact_id,
        "contact_name": contact_name,
        "call_type": "telephony_pstn",
        "direction": "outbound",
        "status": initial_status,
        "started_at": now_iso,
        "answered_at": None,
        "ended_at": None,
        "duration_seconds": 0,
        "outcome": None,
        "notes": req.notes or "",
        "created_at": now_iso,
    }

    await db.calls.insert_one(call_doc)

    if contact_id:
        await db.contacts.update_one(
            {"_id": contact_id},
            {"$set": {"last_interaction_at": now_iso, "updated_at": now_iso}},
        )

    return _doc_to_call_response(call_doc)


@router.get("/calls/{call_id}", response_model=CallRecordResponse)
async def get_telephony_call_status(
    call_id: str,
    sync: bool = Query(True, description="Sync live call status from Twilio REST API when active"),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Fetch an individual telephony call record and optionally sync live status from Twilio.
    Provides a reliable fallback alongside real-time WebSocket status callbacks.
    """
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    call_doc = await db.calls.find_one({"_id": call_id})
    if not call_doc:
        raise HTTPException(status_code=404, detail="Call record not found.")

    is_supervisor_or_admin = current_user.get("role") in ("supervisor", "admin")
    is_participant = current_user["_id"] in (
        call_doc.get("caller_user_id"),
        call_doc.get("recipient_user_id"),
        call_doc.get("agent_id"),
    )
    if not is_supervisor_or_admin and not is_participant:
        raise HTTPException(status_code=403, detail="Unauthorized to view this call.")

    provider_call_id = call_doc.get("provider_call_id") or ""
    current_status = (call_doc.get("status") or "").lower()

    if (
        sync
        and call_doc.get("provider") == "twilio"
        and provider_call_id.startswith("CA")
        and current_status not in TERMINAL_CALL_STATUSES
    ):
        provider = get_telephony_provider()
        live = await provider.fetch_call_status(provider_call_id)
        live_raw = (live.get("status") or "").lower()
        if live_raw and live_raw != "unknown":
            mapped = map_twilio_status(live_raw)
            updates: Dict[str, Any] = {}
            if mapped != current_status:
                updates["status"] = mapped
                now_iso = datetime.now(timezone.utc).isoformat()
                if mapped == "connected" and not call_doc.get("answered_at"):
                    updates["answered_at"] = now_iso
                if mapped in TERMINAL_CALL_STATUSES and not call_doc.get("ended_at"):
                    updates["ended_at"] = now_iso
            if live.get("duration") is not None:
                try:
                    updates["duration_seconds"] = int(live["duration"])
                except (ValueError, TypeError):
                    pass
            if updates:
                await db.calls.update_one({"_id": call_id}, {"$set": updates})
                call_doc.update(updates)

    return _doc_to_call_response(call_doc)


@router.post("/hangup")
async def terminate_phone_call(
    body: Optional[TelephonyHangupBody] = None,
    call_sid: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """Hang up or cancel an active carrier call via either JSON body or query parameter."""
    effective_sid = call_sid or (body.call_sid if body else None)
    effective_call_id = body.call_id if body else None
    duration_sec = body.duration_seconds if body else None

    db = get_db()
    call_doc = None
    if db is not None:
        if effective_call_id:
            call_doc = await db.calls.find_one({"_id": effective_call_id})
        elif effective_sid:
            call_doc = await db.calls.find_one({"provider_call_id": effective_sid})

        if call_doc and (not effective_sid or effective_sid.startswith("sdk-pending-")):
            effective_sid = call_doc.get("provider_call_id")

    provider = get_telephony_provider()
    res: Dict[str, Any] = {"status": "completed"}
    if effective_sid and not effective_sid.startswith("sdk-pending-"):
        res = await provider.terminate_call(effective_sid)

    final_status = map_twilio_status(res.get("status")) if res.get("status") not in (None, "error") else "completed"

    if db is not None:
        now_iso = datetime.now(timezone.utc).isoformat()
        update_doc: Dict[str, Any] = {"status": final_status, "ended_at": now_iso}
        if duration_sec is not None:
            update_doc["duration_seconds"] = duration_sec
        elif res.get("duration") is not None:
            try:
                update_doc["duration_seconds"] = int(res["duration"])
            except (ValueError, TypeError):
                pass

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
    form_data, post_params = await _extract_twilio_params(request)
    provider = get_telephony_provider()
    _validate_twilio_webhook(request, post_params, provider)

    online_agent_ids = list(manager.get_online_user_ids())
    form_data["online_agent_ids"] = online_agent_ids

    db = get_db()
    from_caller = str(form_data.get("From", "")).strip()
    to_target = str(form_data.get("To", "")).strip()
    call_sid = str(form_data.get("CallSid", "")).strip()
    call_record_id = str(form_data.get("call_record_id", "")).strip()

    if db is not None and call_sid:
        now_iso = datetime.now(timezone.utc).isoformat()
        # Case A: Browser Voice SDK outbound leg -> attach real Twilio CallSid to call record & notify frontend
        if from_caller.startswith("client:") and call_record_id:
            updated_doc = await db.calls.find_one_and_update(
                {"_id": call_record_id},
                {"$set": {"provider_call_id": call_sid, "status": "ringing"}},
            )
            agent_target = (updated_doc or {}).get("agent_id") or from_caller.replace("client:", "", 1)
            if agent_target:
                await manager.send_personal_message(agent_target, {
                    "type": "pstn_call_status",
                    "call_sid": call_sid,
                    "call_id": call_record_id,
                    "status": "ringing",
                    "raw_status": "ringing",
                })
        # Case B: Inbound external telephone call arriving at our Twilio number
        elif not from_caller.startswith("client:") and not form_data.get("agent_id"):
            digits = "".join(filter(str.isdigit, from_caller))
            contact_doc = (
                await db.contacts.find_one({"phone_number": {"$regex": re.escape(digits)}})
                if digits
                else None
            )
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
                "created_at": now_iso,
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
                "updated_at": now_iso,
            }
            await db.call_queues.insert_one(ticket_doc)

            for uid in online_agent_ids:
                await manager.send_personal_message(uid, {
                    "type": "incoming_pstn_call",
                    "call_sid": call_sid,
                    "call_id": inbound_call_id,
                    "ticket": ticket_doc,
                    "caller_phone": from_caller,
                    "caller_number": from_caller,
                    "caller_name": customer_name,
                })

    xml_response = await provider.handle_voice_webhook(form_data)
    return Response(content=xml_response, media_type="application/xml")


async def _apply_status_update_and_broadcast(
    call_sid: Optional[str],
    call_record_id: Optional[str],
    raw_status: str,
    duration: Any = None,
    error_code: Any = None,
) -> None:
    mapped_status = map_twilio_status(raw_status)
    db = get_db()
    if db is None or (not call_sid and not call_record_id):
        return

    now_iso = datetime.now(timezone.utc).isoformat()
    update_fields: Dict[str, Any] = {"status": mapped_status}
    if mapped_status == "connected":
        update_fields["answered_at"] = now_iso
    if duration is not None:
        try:
            update_fields["duration_seconds"] = int(duration)
        except (ValueError, TypeError):
            pass
    if mapped_status in TERMINAL_CALL_STATUSES:
        update_fields["ended_at"] = now_iso

    call_doc = None
    if call_record_id:
        call_doc = await db.calls.find_one_and_update(
            {"_id": call_record_id},
            {"$set": update_fields},
        )
    if call_doc is None and call_sid:
        call_doc = await db.calls.find_one_and_update(
            {"provider_call_id": call_sid},
            {"$set": update_fields},
        )

    target_agents = set(manager.get_online_user_ids())
    if call_doc and call_doc.get("agent_id"):
        target_agents.add(call_doc["agent_id"])

    payload = {
        "type": "pstn_call_status",
        "call_sid": call_sid or (call_doc.get("provider_call_id") if call_doc else None),
        "call_id": call_doc["_id"] if call_doc else call_record_id,
        "status": mapped_status,
        "raw_status": raw_status,
        "duration_seconds": update_fields.get("duration_seconds"),
        "error_code": str(error_code) if error_code else None,
    }
    for uid in target_agents:
        await manager.send_personal_message(uid, payload)


@router.post("/webhook/dial-action")
async def dial_action_webhook(request: Request):
    """
    Twilio <Dial action="..."> callback.
    Updates call status when the dialed leg completes and ALWAYS returns valid TwiML XML.
    """
    form_data, post_params = await _extract_twilio_params(request)

    provider = get_telephony_provider()
    _validate_twilio_webhook(request, post_params, provider)
    bridge_mode = str(form_data.get("bridge_mode") or "").strip().lower()
    call_record_id = str(form_data.get("call_record_id") or "").strip() or None
    dial_status = str(form_data.get("DialCallStatus") or "").strip().lower()
    dial_duration = form_data.get("DialCallDuration")
    call_sid = form_data.get("CallSid") or form_data.get("DialCallSid")

    # For browser_sdk calls, <Dial> targets the external PSTN number so DialCallStatus is the real call outcome.
    # For rest_bridge calls, the customer already answered; parent CallStatus handles final completion.
    if dial_status and bridge_mode != "rest_bridge":
        await _apply_status_update_and_broadcast(
            call_sid=call_sid,
            call_record_id=call_record_id,
            raw_status=dial_status,
            duration=dial_duration,
            error_code=form_data.get("ErrorCode") or form_data.get("DialBridged"),
        )

    twiml = await provider.handle_dial_action(form_data)
    return Response(content=twiml, media_type="application/xml")


@router.post("/webhook/status")
async def status_webhook(request: Request):
    """
    Carrier webhook receiving status updates (queued, initiated, ringing, in-progress, completed, busy, no-answer, failed, canceled).
    Updates MongoDB call record and broadcasts live status over WebSocket to the agent.
    """
    form_data, post_params = await _extract_twilio_params(request)

    provider = get_telephony_provider()
    _validate_twilio_webhook(request, post_params, provider)
    result = await provider.handle_status_callback(form_data)

    call_sid = result.get("call_sid")
    call_record_id = str(form_data.get("call_record_id") or "").strip() or None
    raw_status = (result.get("status") or "").lower()
    duration = result.get("duration")
    error_code = result.get("error_code")

    if raw_status:
        await _apply_status_update_and_broadcast(
            call_sid=call_sid,
            call_record_id=call_record_id,
            raw_status=raw_status,
            duration=duration,
            error_code=error_code,
        )

    return {"received": True}


@router.post("/ai-phone-turn")
async def ai_phone_turn(request: Request):
    """
    Optional IVR endpoint for conversational Voice AI turn on a PSTN call if routed to AI IVR.
    """
    form_data, post_params = await _extract_twilio_params(request)
    provider = get_telephony_provider()
    _validate_twilio_webhook(request, post_params, provider)

    speech_result = str(form_data.get("SpeechResult", "")).strip()

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
        system_prompt=system_prompt,
    )
    ai_text = html.escape(ai_res.get("content", "Thank you for contacting us.").strip())

    twiml = (
        f"<Response>"
        f"<Say voice='Polly.Joanna'>{ai_text}</Say>"
        f"<Gather input='speech' timeout='3' action='/api/telephony/ai-phone-turn' method='POST'/>"
        f"</Response>"
    )
    return Response(content=twiml, media_type="application/xml")
