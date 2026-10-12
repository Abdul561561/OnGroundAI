from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, status, Depends, Query
from pydantic import BaseModel

from app.database import get_db
from app.models.schemas import FollowUpResponse, FollowUpUpdate
from app.services.auth_service import (
    get_current_user,
    require_supervisor_or_admin
)
from app.services.signaling_service import manager

router = APIRouter(tags=["Supervisor & Operations"])

class AssignRequest(BaseModel):
    item_type: str  # "contact" or "follow_up"
    item_id: str
    target_agent_id: str

@router.get("/api/supervisor/agents")
async def list_agent_workforce(
    current_user: Dict[str, Any] = Depends(require_supervisor_or_admin)
):
    """List all agents with live presence, assigned workload, and call counts."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    agents_cursor = db.users.find({}, {"password_hash": 0}).sort("name", 1)
    agents = await agents_cursor.to_list(length=100)

    online_user_ids = set(manager.get_online_user_ids())

    workforce = []
    for a in agents:
        agent_id = a["_id"]
        # Count assigned contacts
        assigned_contacts = await db.contacts.count_documents({"assigned_agent_id": agent_id})
        # Count pending follow-ups
        pending_follow_ups = await db.follow_ups.count_documents({
            "assigned_agent_id": agent_id,
            "status": "pending"
        })
        # Count calls handled
        calls_handled = await db.calls.count_documents({
            "$or": [{"caller_user_id": agent_id}, {"agent_id": agent_id}]
        })

        # Presence check: if connected via WebSocket, consider 'available' unless set otherwise
        is_online = agent_id in online_user_ids
        presence = a.get("presence", "available" if is_online else "offline")

        workforce.append({
            "id": agent_id,
            "name": a["name"],
            "email": a["email"],
            "role": a.get("role", "agent"),
            "is_online": is_online,
            "presence": presence,
            "assigned_contacts": assigned_contacts,
            "pending_follow_ups": pending_follow_ups,
            "calls_handled": calls_handled
        })

    return workforce

@router.get("/api/supervisor/queues")
async def get_supervisor_queues(
    current_user: Dict[str, Any] = Depends(require_supervisor_or_admin)
):
    """View active queues: unassigned contacts, pending follow-ups, and recent calls."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    # Unassigned contacts
    unassigned_contacts_cursor = db.contacts.find({
        "$or": [{"assigned_agent_id": None}, {"assigned_agent_id": ""}]
    }).sort("created_at", -1).limit(50)
    unassigned_contacts = await unassigned_contacts_cursor.to_list(length=50)

    # Pending follow-ups
    pending_follow_ups_cursor = db.follow_ups.find({"status": "pending"}).sort("due_at", 1).limit(50)
    pending_follow_ups = await pending_follow_ups_cursor.to_list(length=50)

    # Active or ringing calls
    active_calls_cursor = db.calls.find({
        "status": {"$in": ["ringing", "connecting", "connected", "in_progress"]}
    }).sort("started_at", -1).limit(20)
    active_calls = await active_calls_cursor.to_list(length=20)

    return {
        "unassigned_contacts_count": len(unassigned_contacts),
        "unassigned_contacts": unassigned_contacts,
        "pending_follow_ups_count": len(pending_follow_ups),
        "pending_follow_ups": pending_follow_ups,
        "active_calls_count": len(active_calls),
        "active_calls": active_calls
    }

@router.post("/api/supervisor/assign")
async def reassign_item(
    req: AssignRequest,
    current_user: Dict[str, Any] = Depends(require_supervisor_or_admin)
):
    """Reassign a contact or follow-up task to another agent."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    agent = await db.users.find_one({"_id": req.target_agent_id})
    if not agent:
        raise HTTPException(status_code=404, detail="Target agent not found.")

    if req.item_type == "contact":
        res = await db.contacts.update_one(
            {"_id": req.item_id},
            {"$set": {
                "assigned_agent_id": req.target_agent_id,
                "assigned_agent_name": agent["name"],
                "updated_at": datetime.now(timezone.utc).isoformat()
            }}
        )
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Contact not found.")
        return {"status": "success", "message": f"Contact assigned to {agent['name']}."}

    elif req.item_type == "follow_up":
        res = await db.follow_ups.update_one(
            {"_id": req.item_id},
            {"$set": {
                "assigned_agent_id": req.target_agent_id,
                "assigned_agent_name": agent["name"]
            }}
        )
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Follow-up task not found.")
        return {"status": "success", "message": f"Follow-up task assigned to {agent['name']}."}

    raise HTTPException(status_code=400, detail="Invalid item_type. Must be 'contact' or 'follow_up'.")

@router.get("/api/supervisor/metrics")
async def get_call_centre_metrics(
    current_user: Dict[str, Any] = Depends(require_supervisor_or_admin)
):
    """Aggregate analytics on call volume, durations, and outcomes."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    total_calls = await db.calls.count_documents({})
    completed_calls = await db.calls.count_documents({"status": "completed"})
    missed_calls = await db.calls.count_documents({"status": {"$in": ["missed", "rejected", "no_answer", "failed"]}})

    # Calculate average duration of completed calls
    pipeline = [
        {"$match": {"status": "completed", "duration_seconds": {"$gt": 0}}},
        {"$group": {"_id": None, "avg_duration": {"$avg": "$duration_seconds"}}}
    ]
    avg_duration_res = await db.calls.aggregate(pipeline).to_list(length=1)
    avg_duration = round(avg_duration_res[0]["avg_duration"], 1) if avg_duration_res else 0

    # Outcomes breakdown
    outcomes_pipeline = [
        {"$match": {"outcome": {"$ne": None}}},
        {"$group": {"_id": "$outcome", "count": {"$sum": 1}}}
    ]
    outcomes_res = await db.calls.aggregate(outcomes_pipeline).to_list(length=20)
    outcomes_breakdown = {o["_id"]: o["count"] for o in outcomes_res}

    return {
        "total_calls": total_calls,
        "completed_calls": completed_calls,
        "missed_calls": missed_calls,
        "average_handle_seconds": avg_duration,
        "answer_rate_pct": round((completed_calls / total_calls * 100), 1) if total_calls > 0 else 100.0,
        "outcomes": outcomes_breakdown
    }

# ----------------- Global Follow-Ups Endpoints -----------------

@router.get("/api/follow-ups", response_model=List[FollowUpResponse])
async def list_follow_ups(
    status: Optional[str] = Query(None),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """List follow-ups. Agents see their assigned tasks; supervisors and admins see all."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    query: Dict[str, Any] = {}
    if current_user.get("role") == "agent":
        query["assigned_agent_id"] = current_user["_id"]

    if status:
        query["status"] = status

    cursor = db.follow_ups.find(query).sort("due_at", 1).limit(100)
    docs = await cursor.to_list(length=100)

    return [
        FollowUpResponse(
            _id=d["_id"],
            contact_id=d.get("contact_id"),
            contact_name=d.get("contact_name"),
            contact_phone=d.get("contact_phone"),
            assigned_agent_id=d.get("assigned_agent_id"),
            assigned_agent_name=d.get("assigned_agent_name", "Unassigned"),
            description=d.get("description", ""),
            due_at=d.get("due_at", ""),
            status=d.get("status", "pending"),
            created_at=d.get("created_at", "")
        )
        for d in docs
    ]

@router.patch("/api/follow-ups/{task_id}", response_model=FollowUpResponse)
async def update_follow_up_task(
    task_id: str,
    req: FollowUpUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Update follow-up status (e.g. mark completed) or reassign notes."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    task = await db.follow_ups.find_one({"_id": task_id})
    if not task:
        raise HTTPException(status_code=404, detail="Follow-up task not found.")

    # Agents can only update their own tasks unless supervisor/admin
    if current_user.get("role") == "agent" and task.get("assigned_agent_id") != current_user["_id"]:
        raise HTTPException(status_code=403, detail="Not authorized to edit this follow-up.")

    updates: Dict[str, Any] = {}
    if req.status is not None:
        updates["status"] = req.status
    if req.description is not None:
        updates["description"] = req.description
    if req.due_at is not None:
        updates["due_at"] = req.due_at
    if req.assigned_agent_id is not None:
        agent = await db.users.find_one({"_id": req.assigned_agent_id})
        updates["assigned_agent_id"] = req.assigned_agent_id
        updates["assigned_agent_name"] = agent["name"] if agent else "Unassigned"

    if updates:
        await db.follow_ups.update_one({"_id": task_id}, {"$set": updates})

    updated = await db.follow_ups.find_one({"_id": task_id})
    return FollowUpResponse(
        _id=updated["_id"],
        contact_id=updated.get("contact_id"),
        contact_name=updated.get("contact_name"),
        contact_phone=updated.get("contact_phone"),
        assigned_agent_id=updated.get("assigned_agent_id"),
        assigned_agent_name=updated.get("assigned_agent_name", "Unassigned"),
        description=updated.get("description", ""),
        due_at=updated.get("due_at", ""),
        status=updated.get("status", "pending"),
        created_at=updated.get("created_at", "")
    )
