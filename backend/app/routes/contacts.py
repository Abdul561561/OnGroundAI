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
    has_plus = cleaned.startswith("+")
    digits_only = "".join(filter(str.isdigit, cleaned))
    return f"+{digits_only}" if has_plus else digits_only

def deduplicate_contact_docs(raw_docs: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Deduplicate contact documents by normalized phone number while preserving non-default status/notes."""
    seen_keys: Dict[str, Dict[str, Any]] = {}
    for d in raw_docs:
        norm_phone = normalize_phone_number(d.get("phone_number", ""))
        dedup_key = norm_phone or f"id:{d.get('_id', '')}"
        if dedup_key not in seen_keys:
            seen_keys[dedup_key] = dict(d)
        else:
            curr = seen_keys[dedup_key]
            if curr.get("status") == "new" and d.get("status") and d.get("status") != "new":
                curr["status"] = d["status"]
            if not curr.get("notes") and d.get("notes"):
                curr["notes"] = d["notes"]
            if not curr.get("last_interaction_at") and d.get("last_interaction_at"):
                curr["last_interaction_at"] = d["last_interaction_at"]
    return list(seen_keys.values())

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

    assigned_agent = req.assigned_agent_id or current_user["_id"]
    agent_name = current_user["name"]
    if assigned_agent != current_user["_id"]:
        agent_doc = await db.users.find_one({"_id": assigned_agent})
        if agent_doc:
            agent_name = agent_doc["name"]

    # Prevent duplicate customer rows for the same normalized telephone number
    existing = await db.contacts.find_one(
        {"phone_number": clean_phone},
        sort=[("updated_at", -1)]
    )
    if existing:
        merged_tags = list(dict.fromkeys((existing.get("tags") or []) + (req.tags or [])))
        updates = {
            "name": req.name.strip(),
            "phone_number": clean_phone,
            "email": req.email.strip().lower() if req.email else existing.get("email"),
            "assigned_agent_id": assigned_agent,
            "assigned_agent_name": agent_name,
            "notes": req.notes if req.notes is not None else existing.get("notes", ""),
            "tags": merged_tags,
            "status": req.status or existing.get("status", "new"),
            "updated_at": now_iso,
        }
        await db.contacts.update_one({"_id": existing["_id"]}, {"$set": updates})
        updated_doc = await db.contacts.find_one({"_id": existing["_id"]})
        return ContactResponse(
            _id=updated_doc["_id"],
            name=updated_doc["name"],
            phone_number=updated_doc["phone_number"],
            email=updated_doc.get("email"),
            assigned_agent_id=updated_doc.get("assigned_agent_id"),
            assigned_agent_name=updated_doc.get("assigned_agent_name", agent_name),
            notes=updated_doc.get("notes", ""),
            tags=updated_doc.get("tags", []),
            status=updated_doc.get("status", "new"),
            last_interaction_at=updated_doc.get("last_interaction_at"),
            created_at=updated_doc.get("created_at", now_iso),
            updated_at=updated_doc.get("updated_at", now_iso)
        )

    contact_id = str(uuid.uuid4())
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
    include_duplicates: Optional[bool] = Query(False, description="Include raw historical duplicate records"),
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
        or_conditions = [
            {"name": {"$regex": term, "$options": "i"}},
            {"phone_number": {"$regex": term, "$options": "i"}},
            {"email": {"$regex": term, "$options": "i"}},
        ]
        digits_term = "".join(filter(str.isdigit, term))
        if digits_term and digits_term != term:
            or_conditions.append({"phone_number": {"$regex": digits_term, "$options": "i"}})
        query["$or"] = or_conditions

    cursor = db.contacts.find(query).sort("updated_at", -1).limit(200)
    raw_docs = await cursor.to_list(length=200)

    # Deduplicate displayed rows by normalized phone_number (preserving underlying DB records)
    docs: List[Dict[str, Any]] = []
    if include_duplicates:
        docs = raw_docs
    else:
        seen_keys: Dict[str, Dict[str, Any]] = {}
        for d in raw_docs:
            norm_phone = normalize_phone_number(d.get("phone_number", ""))
            dedup_key = norm_phone or f"id:{d['_id']}"
            if dedup_key not in seen_keys:
                seen_keys[dedup_key] = d
            else:
                # Prefer non-'new' status or non-empty notes if the latest copy had default values
                curr = seen_keys[dedup_key]
                if curr.get("status") == "new" and d.get("status") and d.get("status") != "new":
                    curr["status"] = d["status"]
                if not curr.get("notes") and d.get("notes"):
                    curr["notes"] = d["notes"]
                if not curr.get("last_interaction_at") and d.get("last_interaction_at"):
                    curr["last_interaction_at"] = d["last_interaction_at"]
        docs = list(seen_keys.values())

    # Resolve agent names
    agent_ids = list({d.get("assigned_agent_id") for d in docs if d.get("assigned_agent_id")})
    agents_cursor = db.users.find({"_id": {"$in": agent_ids}})
    agents_list = await agents_cursor.to_list(length=max(1, len(agent_ids)))
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
    """Retrieve complete interaction history: calls, notes, cases, and follow-ups across matching phone records."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    contact = await db.contacts.find_one({"_id": contact_id})
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found.")

    norm_phone = normalize_phone_number(contact.get("phone_number", ""))
    sibling_docs = await db.contacts.find({"phone_number": norm_phone}, {"_id": 1}).to_list(length=50)
    all_contact_ids = list({contact_id} | {s["_id"] for s in sibling_docs})

    # Get calls for this contact (by any matching contact_id or by phone_number)
    calls_cursor = db.calls.find({
        "$or": [
            {"contact_id": {"$in": all_contact_ids}},
            {"recipient_number": norm_phone},
            {"caller_number": norm_phone}
        ]
    }).sort("started_at", -1).limit(30)
    calls = await calls_cursor.to_list(length=30)

    # Get follow-ups across all matching contact IDs or phone
    follow_ups_cursor = db.follow_ups.find({
        "$or": [
            {"contact_id": {"$in": all_contact_ids}},
            {"contact_phone": norm_phone}
        ]
    }).sort("due_at", 1).limit(30)
    follow_ups = await follow_ups_cursor.to_list(length=30)

    # Get support cases linked to this customer
    cases_cursor = db.cases.find({
        "$or": [
            {"customer_id": {"$in": all_contact_ids}},
            {"customer_phone": norm_phone}
        ]
    }).sort("created_at", -1).limit(20)
    cases = await cases_cursor.to_list(length=20)

    return {
        "contact": {
            "id": contact["_id"],
            "name": contact["name"],
            "phone_number": contact["phone_number"],
            "status": contact["status"],
            "notes": contact.get("notes", "")
        },
        "calls": calls,
        "follow_ups": follow_ups,
        "cases": cases
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
