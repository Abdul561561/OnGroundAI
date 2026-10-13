from typing import Dict, Any
from fastapi import APIRouter, HTTPException, Depends
from app.database import get_db
from app.services.auth_service import get_current_user
from app.services.signaling_service import manager

router = APIRouter(prefix="/api/analytics", tags=["Analytics & Operational Reports"])

STAFF_EXCLUDE_TEST_REGEX = "^(test\\.(agent|sup)\\.|staff\\.(verifier|demo)\\.)"

@router.get("/overview")
async def get_analytics_overview(
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Aggregate contact-centre operational intelligence strictly from real MongoDB data
    and live WebSocket presence. Zero fabricated fallback metrics.
    """
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    # 1. Total Calls & Outcomes (real database records)
    total_calls = await db.calls.count_documents({})
    completed_calls = await db.calls.count_documents({
        "$or": [
            {"status": "completed"},
            {"status": "ended", "duration_seconds": {"$gt": 0}}
        ]
    })
    missed_calls = await db.calls.count_documents({
        "status": {"$in": ["missed", "rejected", "no_answer", "failed", "busy"]}
    })

    # Average handle duration across answered calls
    avg_pipeline = [
        {"$match": {"duration_seconds": {"$gt": 0}}},
        {"$group": {"_id": None, "avg_dur": {"$avg": "$duration_seconds"}}}
    ]
    avg_res = await db.calls.aggregate(avg_pipeline).to_list(1)
    avg_handle_seconds = round(avg_res[0]["avg_dur"], 1) if avg_res else 0.0

    # 2. Communication Modes Breakdown
    webrtc_calls = await db.calls.count_documents({
        "$and": [
            {"call_type": {"$in": ["audio", "webrtc"]}},
            {"provider": {"$nin": ["twilio"]}}
        ]
    })
    telephony_calls = await db.calls.count_documents({
        "$or": [
            {"call_type": {"$in": ["telephony_pstn", "pstn"]}},
            {"provider": "twilio"}
        ]
    })
    ai_voice_convos = await db.conversations.count_documents({"type": "voice_ai"})
    ai_escalations = await db.call_queues.count_documents({"queue_type": "ai_escalation"})

    # AI Containment Rate: percentage of AI voice sessions not requiring escalation (no fake fallback)
    total_ai_sessions = max(ai_voice_convos, ai_escalations)
    if total_ai_sessions > 0:
        contained = max(0, total_ai_sessions - ai_escalations)
        ai_containment_rate = round((contained / total_ai_sessions) * 100, 1)
    else:
        ai_containment_rate = 0.0

    # 3. Support Cases & Resolution (no fake fallback)
    total_cases = await db.cases.count_documents({})
    resolved_cases = await db.cases.count_documents({"status": {"$in": ["resolved", "closed"]}})
    open_cases = await db.cases.count_documents({"status": {"$in": ["open", "in_progress", "pending_customer"]}})
    fcr_rate = round((resolved_cases / total_cases * 100), 1) if total_cases > 0 else 0.0

    # 4. Agent Workforce Occupancy (aligned 100% with Supervisor & LiveCallCentre roster)
    staff_query = {
        "$or": [
            {"email": {"$not": {"$regex": STAFF_EXCLUDE_TEST_REGEX}}},
            {"_id": current_user["_id"]}
        ]
    }
    staff_docs = await db.users.find(staff_query, {"_id": 1, "status": 1, "presence": 1}).to_list(100)
    total_agents = len(staff_docs)
    online_user_ids = manager.get_online_user_ids()
    active_agents = sum(1 for a in staff_docs if a["_id"] in online_user_ids)
    occupancy_pct = round((active_agents / total_agents * 100), 1) if total_agents > 0 else 0.0

    # 5. Outcome Breakdown
    outcomes_pipeline = [
        {"$match": {"outcome": {"$ne": None}}},
        {"$group": {"_id": "$outcome", "count": {"$sum": 1}}}
    ]
    outcomes_res = await db.calls.aggregate(outcomes_pipeline).to_list(20)
    outcomes = {o["_id"]: o["count"] for o in outcomes_res if o.get("_id")}

    return {
        "calls": {
            "total_calls": total_calls,
            "completed_calls": completed_calls,
            "missed_calls": missed_calls,
            "average_handle_duration_seconds": avg_handle_seconds,
            "answer_rate_pct": round((completed_calls / total_calls * 100), 1) if total_calls > 0 else 0.0
        },
        "modes": {
            "human_to_human_webrtc": webrtc_calls,
            "human_to_ai_voice": ai_voice_convos,
            "ai_to_human_escalations": ai_escalations,
            "outbound_telephony": telephony_calls,
            "ai_containment_rate_pct": ai_containment_rate
        },
        "cases": {
            "total_cases": total_cases,
            "resolved_cases": resolved_cases,
            "open_cases": open_cases,
            "first_contact_resolution_pct": fcr_rate
        },
        "workforce": {
            "total_staff": total_agents,
            "active_on_shift": active_agents,
            "occupancy_rate_pct": occupancy_pct
        },
        "call_outcomes": outcomes
    }
