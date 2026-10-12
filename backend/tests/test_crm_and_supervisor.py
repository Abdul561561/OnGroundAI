import pytest
from app.routes.contacts import normalize_phone_number
from app.models.schemas import ContactCreate, FollowUpCreate, CallOutcome

def test_normalize_phone_number():
    assert normalize_phone_number("+1 (555) 123-4567") == "+15551234567"
    assert normalize_phone_number("+91 98765 43210") == "+919876543210"
    assert normalize_phone_number("  555-0199  ") == "5550199"
    assert normalize_phone_number("+44 20 7946 0991") == "+442079460991"

def test_contact_create_validation():
    contact = ContactCreate(
        name="Alice Corp Director",
        phone_number="+15559876543",
        email="alice@corp.com",
        notes="Interested in enterprise plan",
        tags=["vip", "enterprise"]
    )
    assert contact.name == "Alice Corp Director"
    assert contact.phone_number == "+15559876543"
    assert contact.tags == ["vip", "enterprise"]

def test_follow_up_create_validation():
    follow_up = FollowUpCreate(
        description="Call back regarding SLA agreement",
        due_at="2026-10-15T10:00:00Z"
    )
    assert follow_up.description == "Call back regarding SLA agreement"
    assert "2026-10-15" in follow_up.due_at

def test_call_outcome_enums():
    valid_outcomes = [
        "interested", "callback_requested", "voicemail",
        "resolved", "escalated", "no_answer", "busy", "rejected",
        "wrong_number", "completed"
    ]
    for outcome in valid_outcomes:
        assert outcome in valid_outcomes
