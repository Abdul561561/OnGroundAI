import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, status, Depends, Query
from app.database import get_db
from app.models.schemas import (
    KnowledgeBaseCreate,
    KnowledgeBaseUpdate,
    KnowledgeBaseResponse
)
from app.services.auth_service import get_current_user, require_supervisor_or_admin

router = APIRouter(prefix="/api/knowledge-base", tags=["Knowledge Base"])

DEFAULT_ARTICLES = [
    {
        "_id": "kb-policy-returns-01",
        "title": "Customer Refund and Cancellation Policy",
        "category": "Policies",
        "tags": ["refund", "billing", "cancellation", "policy"],
        "content": (
            "Customers are eligible for a 100% full refund within 30 days of initial purchase if not satisfied. "
            "Cancellations requested after 30 days will stop future renewals without penalties. "
            "For billing disputes or duplicate charges, issue immediate credit back to the original payment method "
            "within 3 business days."
        )
    },
    {
        "_id": "kb-pricing-tier-02",
        "title": "OnGround AI Subscription Tiers and Free Access",
        "category": "Pricing",
        "tags": ["pricing", "plans", "free-tier", "cost"],
        "content": (
            "OnGround AI provides a 100% Zero-Payment Free Tier featuring browser-to-browser WebRTC intercom calling, "
            "hands-free Voice AI, Customer CRM directory, and real-time Agent Assist AI. "
            "Enterprise tier adds custom private telephony trunking (Twilio/SIP) and dedicated high-volume LLM quotas."
        )
    },
    {
        "_id": "kb-tech-webrtc-03",
        "title": "Browser Softphone Audio & Microphone Troubleshooting",
        "category": "Technical",
        "tags": ["webrtc", "audio", "microphone", "troubleshooting", "error"],
        "content": (
            "If an agent or customer experiences one-way audio or microphone permission denial: "
            "1. Ensure Chrome or Edge has microphone permissions set to 'Allow' (Lock icon in URL bar). "
            "2. Verify hardware microphone is not held exclusively by Zoom, Teams, or another app. "
            "3. If corporate firewall blocks direct P2P audio, check STUN/TURN traversal status in System Settings."
        )
    },
    {
        "_id": "kb-ops-escalation-04",
        "title": "AI-to-Human Call Escalation Standard Operating Procedure",
        "category": "Operations",
        "tags": ["escalation", "handoff", "queue", "sop"],
        "content": (
            "When a customer interacting with Voice AI expresses frustration, explicitly asks for a human agent, "
            "or presents a complex custom legal/billing dispute, the AI automatically transfers the call to the Incoming Queue. "
            "Human agents must accept escalations within 30 seconds. The handoff preserves customer profile, full transcript, "
            "and AI executive summary so the customer does not have to repeat themselves."
        )
    },
    {
        "_id": "kb-security-privacy-05",
        "title": "Data Privacy, Call Recording Consent & HIPAA Compliance",
        "category": "Compliance",
        "tags": ["compliance", "privacy", "gdpr", "consent", "security"],
        "content": (
            "All call recordings and transcripts require transparent participant awareness. "
            "Customer credentials, passwords, and payment card numbers must never be spoken or transcribed into notes. "
            "Transcripts are stored with field-level encryption in MongoDB Atlas and accessible only by authorized agents and supervisors."
        )
    }
]

async def ensure_default_knowledge_base():
    """Seed initial default articles if collection is empty."""
    db = get_db()
    if db is None:
        return
    count = await db.knowledge_base.count_documents({})
    if count == 0:
        now_iso = datetime.now(timezone.utc).isoformat()
        for art in DEFAULT_ARTICLES:
            art["created_at"] = now_iso
            art["updated_at"] = now_iso
            await db.knowledge_base.insert_one(art)

@router.get("", response_model=List[KnowledgeBaseResponse])
async def list_knowledge_base_articles(
    category: Optional[str] = Query(None, description="Filter by category"),
    search: Optional[str] = Query(None, description="Search keyword in title, content, or tags"),
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """Retrieve knowledge base articles, seeded with default policies if empty."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    await ensure_default_knowledge_base()

    query: Dict[str, Any] = {}
    if category and category != "All":
        query["category"] = category

    if search and search.strip():
        term = search.strip()
        query["$or"] = [
            {"title": {"$regex": term, "$options": "i"}},
            {"content": {"$regex": term, "$options": "i"}},
            {"tags": {"$in": [term.lower()]}}
        ]

    cursor = db.knowledge_base.find(query).sort("updated_at", -1)
    docs = await cursor.to_list(length=100)

    return [
        KnowledgeBaseResponse(
            _id=d["_id"],
            title=d["title"],
            category=d["category"],
            content=d["content"],
            tags=d.get("tags", []),
            created_at=d.get("created_at", ""),
            updated_at=d.get("updated_at", "")
        )
        for d in docs
    ]

@router.post("", response_model=KnowledgeBaseResponse)
async def create_knowledge_base_article(
    req: KnowledgeBaseCreate,
    current_user: Dict[str, Any] = Depends(require_supervisor_or_admin)
):
    """Create a new company knowledge base article."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    now_iso = datetime.now(timezone.utc).isoformat()
    article_id = f"kb-{uuid.uuid4().hex[:12]}"

    doc = {
        "_id": article_id,
        "title": req.title.strip(),
        "category": req.category.strip(),
        "content": req.content.strip(),
        "tags": [t.strip().lower() for t in req.tags if t.strip()],
        "created_at": now_iso,
        "updated_at": now_iso
    }

    await db.knowledge_base.insert_one(doc)

    return KnowledgeBaseResponse(
        _id=article_id,
        title=doc["title"],
        category=doc["category"],
        content=doc["content"],
        tags=doc["tags"],
        created_at=doc["created_at"],
        updated_at=doc["updated_at"]
    )

@router.delete("/{article_id}")
async def delete_knowledge_base_article(
    article_id: str,
    current_user: Dict[str, Any] = Depends(require_supervisor_or_admin)
):
    """Delete a knowledge base article."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    res = await db.knowledge_base.delete_one({"_id": article_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Article not found.")

    return {"status": "success", "message": "Knowledge base article deleted."}
