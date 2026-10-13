import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, status, Depends, Query
from app.database import get_db
from app.models.schemas import (
    CaseCreate,
    CaseUpdate,
    CaseResponse
)
from app.services.auth_service import get_current_user

router = APIRouter(prefix="/api/cases", tags=["Support Cases & Follow-ups"])

DEFAULT_CASES = [
    {
        "_id": "case-1001",
        "title": "Enterprise Softphone Firewall Audio Cutout",
        "description": "Customer reported intermittent 1-way audio when calling external office branches behind symmetric NAT.",
        "customer_id": None,
        "customer_name": "Acme Corp (Alex Rivera)",
        "customer_phone": "+1 555-432-8899",
        "priority": "high",
        "status": "in_progress",
        "assigned_agent_id": None,
        "assigned_agent_name": "Dan Agent",
        "resolution_notes": "Configured STUN server fallback. Providing TURN traversal documentation.",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    },
    {
        "_id": "case-1002",
        "title": "Billing Clarification on Annual Free Tier Quota",
        "description": "Client requested confirmation regarding zero-payment guarantee and subscription upgrade terms.",
        "customer_id": None,
        "customer_name": "Apex Dynamics (Elena Rostova)",
        "customer_phone": "+1 (555) 782-9011",
        "priority": "medium",
        "status": "resolved",
        "assigned_agent_id": None,
        "assigned_agent_name": "Sarah Supervisor",
        "resolution_notes": "Confirmed zero-payment policy applies indefinitely to WebRTC intercom and browser Voice AI.",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
]

async def ensure_sample_cases():
    db = get_db()
    if db is None:
        return
    count = await db.cases.count_documents({})
    if count == 0:
        for c in DEFAULT_CASES:
            await db.cases.insert_one(c)

@router.get("", response_model=List[CaseResponse])
async def list_cases(
    status: Optional[str] = Query(None, description="Filter by status (open, in_progress, resolved, closed)"),
    priority: Optional[str] = Query(None, description="Filter by priority"),
    search: Optional[str] = Query(None, description="Search in title or customer name"),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Retrieve customer support cases."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    await ensure_sample_cases()

    query: Dict[str, Any] = {}
    if status and status != "All":
        query["status"] = status
    if priority and priority != "All":
        query["priority"] = priority

    if search and search.strip():
        term = search.strip()
        query["$or"] = [
            {"title": {"$regex": term, "$options": "i"}},
            {"customer_name": {"$regex": term, "$options": "i"}},
            {"description": {"$regex": term, "$options": "i"}}
        ]

    cursor = db.cases.find(query).sort("updated_at", -1)
    docs = await cursor.to_list(length=100)

    now_iso = datetime.now(timezone.utc).isoformat()
    return [
        CaseResponse(
            _id=d["_id"],
            title=d["title"],
            description=d["description"],
            customer_id=d.get("customer_id"),
            customer_name=d.get("customer_name", "External Customer"),
            customer_phone=d.get("customer_phone"),
            priority=d.get("priority", "medium"),
            status=d.get("status", "open"),
            assigned_agent_id=d.get("assigned_agent_id"),
            assigned_agent_name=d.get("assigned_agent_name", "Unassigned"),
            resolution_notes=d.get("resolution_notes"),
            created_at=d.get("created_at", now_iso),
            updated_at=d.get("updated_at", now_iso)
        )
        for d in docs
    ]

@router.post("", response_model=CaseResponse)
async def create_case(
    req: CaseCreate,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Create a new customer support case."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    now_iso = datetime.now(timezone.utc).isoformat()
    case_id = f"case-{uuid.uuid4().hex[:8]}"

    doc = {
        "_id": case_id,
        "title": req.title.strip(),
        "description": req.description.strip(),
        "customer_id": req.customer_id,
        "customer_name": req.customer_name or "External Customer",
        "customer_phone": req.customer_phone,
        "priority": req.priority,
        "status": "open",
        "assigned_agent_id": req.assigned_agent_id or current_user["_id"],
        "assigned_agent_name": current_user["name"],
        "resolution_notes": None,
        "created_at": now_iso,
        "updated_at": now_iso
    }

    await db.cases.insert_one(doc)

    return CaseResponse(
        _id=case_id,
        title=doc["title"],
        description=doc["description"],
        customer_id=doc["customer_id"],
        customer_name=doc["customer_name"],
        customer_phone=doc["customer_phone"],
        priority=doc["priority"],
        status=doc["status"],
        assigned_agent_id=doc["assigned_agent_id"],
        assigned_agent_name=doc["assigned_agent_name"],
        resolution_notes=None,
        created_at=now_iso,
        updated_at=now_iso
    )

@router.patch("/{case_id}", response_model=CaseResponse)
async def update_case(
    case_id: str,
    req: CaseUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Update case status, priority, or add resolution notes."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    now_iso = datetime.now(timezone.utc).isoformat()
    updates: Dict[str, Any] = {"updated_at": now_iso}

    if req.title is not None:
        updates["title"] = req.title.strip()
    if req.description is not None:
        updates["description"] = req.description.strip()
    if req.status is not None:
        updates["status"] = req.status
    if req.priority is not None:
        updates["priority"] = req.priority
    if req.assigned_agent_id is not None:
        updates["assigned_agent_id"] = req.assigned_agent_id
    if req.resolution_notes is not None:
        updates["resolution_notes"] = req.resolution_notes.strip()

    res = await db.cases.update_one({"_id": case_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(status_code=404, detail="Case not found.")

    updated = await db.cases.find_one({"_id": case_id})
    return CaseResponse(
        _id=updated["_id"],
        title=updated["title"],
        description=updated["description"],
        customer_id=updated.get("customer_id"),
        customer_name=updated.get("customer_name", "External Customer"),
        customer_phone=updated.get("customer_phone"),
        priority=updated.get("priority", "medium"),
        status=updated.get("status", "open"),
        assigned_agent_id=updated.get("assigned_agent_id"),
        assigned_agent_name=updated.get("assigned_agent_name", "Unassigned"),
        resolution_notes=updated.get("resolution_notes"),
        created_at=updated.get("created_at", now_iso),
        updated_at=now_iso
    )
