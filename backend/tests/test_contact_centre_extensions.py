import pytest
from app.models.schemas import (
    KnowledgeBaseCreate,
    QueueTicketCreate,
    QueueEscalateRequest,
    CaseCreate,
)
from app.services.ai_service import AIService

def test_knowledge_base_article_create():
    article = KnowledgeBaseCreate(
        title="Refund Policy & SLA",
        category="Policies",
        content="Full refunds are provided within 30 days of purchase for unused licenses.",
        tags=["refund", "billing", "policy"]
    )
    assert article.title == "Refund Policy & SLA"
    assert article.category == "Policies"
    assert len(article.tags) == 3
    assert "refund" in article.tags

def test_queue_ticket_create():
    ticket = QueueTicketCreate(
        customer_name="John Enterprise",
        customer_phone="+15552345678",
        queue_type="ai_escalation",
        priority="urgent",
        notes="Customer requested supervisor transfer."
    )
    assert ticket.customer_name == "John Enterprise"
    assert ticket.priority == "urgent"
    assert ticket.queue_type == "ai_escalation"
    assert "supervisor" in ticket.notes

def test_queue_escalate_request():
    req = QueueEscalateRequest(
        customer_name="Sarah Customer",
        customer_phone="+15559871122",
        reason="Caller needs tier 2 technical specialist for SIP trunk configuration.",
        transcript_summary="Caller unable to connect SIP endpoint.",
        priority="high"
    )
    assert req.customer_name == "Sarah Customer"
    assert req.priority == "high"
    assert "SIP" in req.reason

def test_support_case_create():
    case = CaseCreate(
        title="WebRTC ICE Candidate Failure on Firewalled NAT",
        description="Customer unable to connect behind symmetric NAT without TURN relay.",
        customer_name="Alex Network Admin",
        customer_phone="+15558765432",
        priority="high"
    )
    assert case.title == "WebRTC ICE Candidate Failure on Firewalled NAT"
    assert case.priority == "high"
    assert case.customer_name == "Alex Network Admin"

def test_ai_service_headers():
    headers = AIService.get_headers()
    assert "Authorization" in headers
    assert "Bearer" in headers["Authorization"]
    assert "X-Title" in headers
