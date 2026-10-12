import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, status, Depends, Query
from app.database import get_db
from app.models.schemas import (
    ContactCreate,
    ContactUpdate,
    ContactResponse,
    FollowUpCreate,
    FollowUpUpdate,
    FollowUpResponse,
    CallRecordResponse
)
from app.services.auth_service import (
    get_current_user,
    require_supervisor_or_admin
)

router = APIRouter(prefix="/api/contacts", tags=["Customer CRM"])

def normalize_phone_number(raw: str) -> str:
    """Normalize phone number to international E.164-like clean format."""
    cleaned = raw.strip()
    # Keep leading + if present, remove dashes, spaces, parentheses
    has_plus = cleaned.startswith("+")
    digits_only = "".join(filter(str.isdigit, cleaned))
    return f"+{digits_only}" if has_plus else digits_only

@router.post("", response_model=ContactResponse)
async def create_contact(
    req: ContactCreate,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    clean_phone = normalize_phone_number(req.phone_number)
    now_iso = datetime.now(timezone.utc).isoformat()
    contact_id = str(uuid.uuid4())

    assigned_agent = req.assigned_agent_id or current_user["_id"]

    # Look up agent name if assigned
    agent_name = current_user["name"]
    if assigned_agent != current_user["_id"]:
        agent_doc = await db.users.find_one({"_id": assigned_agent})
        if agent_doc:
            agent_name = agent_doc["name"]

    contact_doc = {
        "_id": contact_id,
        "name": req.name.strip(),
        "phone_number": clean_phone,
        "email": req.email.strip().lower() if req.email else None,
        "assigned_agent_id": assigned_agent,
        "assigned_agent_name": agent_name,
        "notes": req.notes or "",
        "tags": req.tags or [],
        "status": req.status or "new",
        "last_interaction_at": None,
        "created_at": now_iso,
        "updated_at": now_iso,
    }

    await db.contacts.insert_one(contact_doc)

    return ContactResponse(
        _id=contact_id,
        name=contact_doc["name"],
        phone_number=contact_doc["phone_number"],
        email=contact_doc["email"],
        assigned_agent_id=contact_doc["assigned_agent_id"],
        assigned_agent_name=contact_doc["assigned_agent_name"],
        notes=contact_doc["notes"],
        tags=contact_doc["tags"],
        status=contact_doc["status"],
        last_interaction_at=contact_doc["last_interaction_at"],
        created_at=contact_doc["created_at"],
        updated_at=contact_doc["updated_at"]
    )

@router.get("", response_model=List[ContactResponse])
async def list_contacts(
    search: Optional[str] = Query(None, description="Search by name or telephone number"),
    status: Optional[str] = Query(None, description="Filter by status"),
    assigned_to_me: Optional[bool] = Query(False, description="Filter contacts assigned to current user"),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    query: Dict[str, Any] = {}

    if assigned_to_me and current_user.get("role") == "agent":
        query["assigned_agent_id"] = current_user["_id"]

    if status:
        query["status"] = status

    if search and search.strip():
        term = search.strip()
        query["$or"] = [
            {"name": {"$regex": term, "$options": "i"}},
            {"phone_number": {"$regex": term, "$options": "i"}},
            {"email": {"$regex": term, "$options": "i"}},
        ]

    cursor = db.contacts.find(query).sort("updated_at", -1).limit(100)
    docs = await cursor.to_list(length=100)

    # Resolve agent names
    agent_ids = list({d.get("assigned_agent_id") for d in docs if d.get("assigned_agent_id")})
    agents_cursor = db.users.find({"_id": {"$in": agent_ids}})
    agents_list = await agents_cursor.to_list(length=len(agent_ids))
    agent_map = {a["_id"]: a["name"] for a in agents_list}

    return [
        ContactResponse(
            _id=d["_id"],
            name=d["name"],
            phone_number=d["phone_number"],
            email=d.get("email"),
            assigned_agent_id=d.get("assigned_agent_id"),
            assigned_agent_name=agent_map.get(d.get("assigned_agent_id"), d.get("assigned_agent_name", "Unassigned")),
            notes=d.get("notes", ""),
            tags=d.get("tags", []),
            status=d.get("status", "new"),
            last_interaction_at=d.get("last_interaction_at"),
            created_at=d.get("created_at", ""),
            updated_at=d.get("updated_at", "")
        )
        for d in docs
    ]

@router.get("/{contact_id}", response_model=ContactResponse)
async def get_contact(
    contact_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    d = await db.contacts.find_one({"_id": contact_id})
    if not d:
        raise HTTPException(status_code=404, detail="Customer contact not found.")

    agent_name = "Unassigned"
    if d.get("assigned_agent_id"):
        agent = await db.users.find_one({"_id": d["assigned_agent_id"]})
        if agent:
            agent_name = agent["name"]

    return ContactResponse(
        _id=d["_id"],
        name=d["name"],
        phone_number=d["phone_number"],
        email=d.get("email"),
        assigned_agent_id=d.get("assigned_agent_id"),
        assigned_agent_name=agent_name,
        notes=d.get("notes", ""),
        tags=d.get("tags", []),
        status=d.get("status", "new"),
        last_interaction_at=d.get("last_interaction_at"),
        created_at=d.get("created_at", ""),
        updated_at=d.get("updated_at", "")
    )

@router.put("/{contact_id}", response_model=ContactResponse)
async def update_contact(
    contact_id: str,
    req: ContactUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    contact = await db.contacts.find_one({"_id": contact_id})
    if not contact:
        raise HTTPException(status_code=404, detail="Customer contact not found.")

    updates: Dict[str, Any] = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if req.name is not None:
        updates["name"] = req.name.strip()
    if req.phone_number is not None:
        updates["phone_number"] = normalize_phone_number(req.phone_number)
    if req.email is not None:
        updates["email"] = req.email.strip().lower() if req.email else None
    if req.assigned_agent_id is not None:
        updates["assigned_agent_id"] = req.assigned_agent_id
        agent = await db.users.find_one({"_id": req.assigned_agent_id})
        updates["assigned_agent_name"] = agent["name"] if agent else "Unassigned"
    if req.notes is not None:
        updates["notes"] = req.notes
    if req.tags is not None:
        updates["tags"] = req.tags
    if req.status is not None:
        updates["status"] = req.status

    await db.contacts.update_one({"_id": contact_id}, {"$set": updates})
    updated = await db.contacts.find_one({"_id": contact_id})

    return ContactResponse(
        _id=updated["_id"],
        name=updated["name"],
        phone_number=updated["phone_number"],
        email=updated.get("email"),
        assigned_agent_id=updated.get("assigned_agent_id"),
        assigned_agent_name=updated.get("assigned_agent_name", "Unassigned"),
        notes=updated.get("notes", ""),
        tags=updated.get("tags", []),
        status=updated.get("status", "new"),
        last_interaction_at=updated.get("last_interaction_at"),
        created_at=updated.get("created_at", ""),
        updated_at=updated.get("updated_at", "")
    )

@router.delete("/{contact_id}")
async def delete_contact(
    contact_id: str,
    current_user: Dict[str, Any] = Depends(require_supervisor_or_admin)
):
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    res = await db.contacts.delete_one({"_id": contact_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Contact not found.")

    await db.follow_ups.delete_many({"contact_id": contact_id})
    return {"status": "success", "message": "Contact and associated follow-ups removed."}

# ----------------- Contact Interaction History -----------------

@router.get("/{contact_id}/history")
async def get_contact_interaction_history(
    contact_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Retrieve complete interaction history: calls, notes, transcripts, and follow-ups."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    contact = await db.contacts.find_one({"_id": contact_id})
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found.")

    # Get calls for this contact (by contact_id or by phone_number)
    calls_cursor = db.calls.find({
        "$or": [
            {"contact_id": contact_id},
            {"recipient_number": contact["phone_number"]},
            {"caller_number": contact["phone_number"]}
        ]
    }).sort("started_at", -1).limit(20)
    calls = await calls_cursor.to_list(length=20)

    # Get follow-ups
    follow_ups_cursor = db.follow_ups.find({"contact_id": contact_id}).sort("due_at", 1).limit(20)
    follow_ups = await follow_ups_cursor.to_list(length=20)

    return {
        "contact": {
            "id": contact["_id"],
            "name": contact["name"],
            "phone_number": contact["phone_number"],
            "status": contact["status"],
            "notes": contact.get("notes", "")
        },
        "calls": calls,
        "follow_ups": follow_ups
    }

# ----------------- Follow-Ups Sub-Endpoints -----------------

@router.post("/{contact_id}/follow-ups", response_model=FollowUpResponse)
async def create_contact_follow_up(
    contact_id: str,
    req: FollowUpCreate,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    contact = await db.contacts.find_one({"_id": contact_id})
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found.")

    assigned_id = req.assigned_agent_id or current_user["_id"]
    agent = await db.users.find_one({"_id": assigned_id})
    agent_name = agent["name"] if agent else "Staff Agent"

    follow_up_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()

    doc = {
        "_id": follow_up_id,
        "contact_id": contact_id,
        "contact_name": contact["name"],
        "contact_phone": contact["phone_number"],
        "assigned_agent_id": assigned_id,
        "assigned_agent_name": agent_name,
        "description": req.description.strip(),
        "due_at": req.due_at,
        "status": "pending",
        "created_at": now_iso
    }

    await db.follow_ups.insert_one(doc)

    return FollowUpResponse(
        _id=follow_up_id,
        contact_id=doc["contact_id"],
        contact_name=doc["contact_name"],
        contact_phone=doc["contact_phone"],
        assigned_agent_id=doc["assigned_agent_id"],
        assigned_agent_name=doc["assigned_agent_name"],
        description=doc["description"],
        due_at=doc["due_at"],
        status=doc["status"],
        created_at=doc["created_at"]
    )
