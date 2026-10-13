import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, status, Depends, Query
from app.database import get_db
from app.models.schemas import (
    QueueTicketCreate,
    QueueEscalateRequest,
    QueueTicketUpdate,
    QueueTicketResponse
)
from app.services.auth_service import get_current_user
from app.services.signaling_service import manager

router = APIRouter(prefix="/api/queues", tags=["Incoming Call Queues & Escalations"])

DEFAULT_QUEUES = [
    {
        "_id": "queue-ticket-01",
        "customer_name": "Jordan Hayes (Global Logistics)",
        "customer_phone": "+1 (555) 329-8472",
        "queue_type": "ai_escalation",
        "priority": "high",
        "status": "waiting",
        "reason": "Customer requested human supervisor regarding SLA dispute on bulk shipment.",
        "transcript_summary": "Customer inquiry regarding delayed logistics container #8841. AI provided initial tracking, but customer asked to speak with human support for expedited refund.",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    },
    {
        "_id": "queue-ticket-02",
        "customer_name": "Elena Rostova (Apex Dynamics)",
        "customer_phone": "+1 (555) 782-9011",
        "queue_type": "inbound_call",
        "priority": "normal",
        "status": "waiting",
        "reason": "Inbound softphone call waiting in General Support queue.",
        "transcript_summary": "Inbound queue call. Customer seeking onboarding technical assistance with WebRTC agent workspace.",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
]

async def ensure_sample_queues():
    db = get_db()
    if db is None:
        return
    count = await db.call_queues.count_documents({})
    if count == 0:
        for q in DEFAULT_QUEUES:
            await db.call_queues.insert_one(q)

@router.get("", response_model=List[QueueTicketResponse])
async def list_queue_tickets(
    status: Optional[str] = Query(None, description="Filter by status (waiting, in_progress, claimed, resolved)"),
    queue_type: Optional[str] = Query(None, description="Filter by queue_type"),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """List active queue tickets in incoming contact centre queue."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    await ensure_sample_queues()

    query: Dict[str, Any] = {}
    if status and status != "All":
        query["status"] = status
    if queue_type and queue_type != "All":
        query["queue_type"] = queue_type

    cursor = db.call_queues.find(query).sort("created_at", -1)
    docs = await cursor.to_list(length=100)

    now = datetime.now(timezone.utc)
    results = []
    for d in docs:
        created_dt = datetime.fromisoformat(d.get("created_at", now.isoformat()).replace("Z", "+00:00"))
        wait_seconds = int((now - created_dt).total_seconds()) if d.get("status") == "waiting" else 0

        results.append(QueueTicketResponse(
            _id=d["_id"],
            customer_name=d.get("customer_name", "Anonymous Caller"),
            customer_phone=d.get("customer_phone"),
            contact_id=d.get("contact_id"),
            queue_type=d.get("queue_type", "inbound_call"),
            priority=d.get("priority", "normal"),
            status=d.get("status", "waiting"),
            reason=d.get("reason"),
            transcript_summary=d.get("transcript_summary"),
            assigned_agent_id=d.get("assigned_agent_id"),
            assigned_agent_name=d.get("assigned_agent_name"),
            wait_time_seconds=max(0, wait_seconds),
            created_at=d.get("created_at", now.isoformat()),
            updated_at=d.get("updated_at", now.isoformat())
        ))

    return results

@router.post("/escalate", response_model=QueueTicketResponse)
async def escalate_ai_call_to_human(
    req: QueueEscalateRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Mode C: AI-to-Human Handoff.
    Triggered when AI detects customer request for a human or cannot resolve the issue.
    Preserves customer name, phone, dialogue transcript, and summary, and alerts available agents.
    """
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    ticket_id = f"esc-{uuid.uuid4().hex[:12]}"
    now_iso = datetime.now(timezone.utc).isoformat()

    doc = {
        "_id": ticket_id,
        "customer_name": req.customer_name.strip(),
        "customer_phone": req.customer_phone,
        "contact_id": req.contact_id,
        "queue_type": "ai_escalation",
        "priority": req.priority,
        "status": "waiting",
        "reason": req.reason,
        "transcript_summary": req.transcript_summary or "Customer escalated to human agent during Voice AI session.",
        "full_transcript": req.full_transcript,
        "created_at": now_iso,
        "updated_at": now_iso
    }

    await db.call_queues.insert_one(doc)

    # Broadcast real-time queue notification to all connected staff via signaling
    alert_msg = {
        "type": "queue_alert",
        "ticket": {
            "id": ticket_id,
            "customer_name": doc["customer_name"],
            "reason": doc["reason"],
            "priority": doc["priority"],
            "queue_type": doc["queue_type"]
        }
    }
    for uid in list(manager.get_online_user_ids()):
        await manager.send_personal_message(uid, alert_msg)

    return QueueTicketResponse(
        _id=ticket_id,
        customer_name=doc["customer_name"],
        customer_phone=doc["customer_phone"],
        contact_id=doc["contact_id"],
        queue_type=doc["queue_type"],
        priority=doc["priority"],
        status=doc["status"],
        reason=doc["reason"],
        transcript_summary=doc["transcript_summary"],
        wait_time_seconds=0,
        created_at=now_iso,
        updated_at=now_iso
    )

@router.post("/{ticket_id}/claim", response_model=QueueTicketResponse)
async def claim_queue_ticket(
    ticket_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Agent claims a waiting queue ticket to take over the call/conversation."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    now_iso = datetime.now(timezone.utc).isoformat()
    ticket = await db.call_queues.find_one({"_id": ticket_id})
    if not ticket:
        raise HTTPException(status_code=404, detail="Queue ticket not found.")

    await db.call_queues.update_one(
        {"_id": ticket_id},
        {"$set": {
            "status": "claimed",
            "assigned_agent_id": current_user["_id"],
            "assigned_agent_name": current_user["name"],
            "updated_at": now_iso
        }}
    )

    ticket["status"] = "claimed"
    ticket["assigned_agent_id"] = current_user["_id"]
    ticket["assigned_agent_name"] = current_user["name"]
    ticket["updated_at"] = now_iso

    return QueueTicketResponse(
        _id=ticket["_id"],
        customer_name=ticket.get("customer_name", "Caller"),
        customer_phone=ticket.get("customer_phone"),
        contact_id=ticket.get("contact_id"),
        queue_type=ticket.get("queue_type", "inbound_call"),
        priority=ticket.get("priority", "normal"),
        status=ticket["status"],
        reason=ticket.get("reason"),
        transcript_summary=ticket.get("transcript_summary"),
        assigned_agent_id=ticket.get("assigned_agent_id"),
        assigned_agent_name=ticket.get("assigned_agent_name"),
        wait_time_seconds=0,
        created_at=ticket.get("created_at", now_iso),
        updated_at=now_iso
    )

@router.patch("/{ticket_id}", response_model=QueueTicketResponse)
async def update_queue_ticket(
    ticket_id: str,
    req: QueueTicketUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Update status or resolution of a queue ticket."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    now_iso = datetime.now(timezone.utc).isoformat()
    updates: Dict[str, Any] = {"updated_at": now_iso}

    if req.status is not None:
        updates["status"] = req.status
    if req.assigned_agent_id is not None:
        updates["assigned_agent_id"] = req.assigned_agent_id
    if req.assigned_agent_name is not None:
        updates["assigned_agent_name"] = req.assigned_agent_name
    if req.resolution_notes is not None:
        updates["resolution_notes"] = req.resolution_notes

    res = await db.call_queues.update_one({"_id": ticket_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Queue ticket not found.")

    updated = await db.call_queues.find_one({"_id": ticket_id})
    return QueueTicketResponse(
        _id=updated["_id"],
        customer_name=updated.get("customer_name", "Caller"),
        customer_phone=updated.get("customer_phone"),
        contact_id=updated.get("contact_id"),
        queue_type=updated.get("queue_type", "inbound_call"),
        priority=updated.get("priority", "normal"),
        status=updated.get("status", "resolved"),
        reason=updated.get("reason"),
        transcript_summary=updated.get("transcript_summary"),
        assigned_agent_id=updated.get("assigned_agent_id"),
        assigned_agent_name=updated.get("assigned_agent_name"),
        wait_time_seconds=0,
        created_at=updated.get("created_at", now_iso),
        updated_at=now_iso
    )
