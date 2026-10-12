import pytest
from app.models.schemas import UserRegister, ConversationCreate, MessageCreate, CallInitiateRequest

def test_model_validations():
    # Valid user register
    user = UserRegister(name="Alice Doe", email="alice@example.com", password="SecurePassword123")
    assert user.name == "Alice Doe"
    assert user.email == "alice@example.com"

    # Invalid email triggers validation error
    with pytest.raises(Exception):
        UserRegister(name="Alice", email="not-an-email", password="123")

def test_conversation_and_message_schema():
    conv = ConversationCreate(type="text_ai", title="Support Call")
    assert conv.type == "text_ai"

    msg = MessageCreate(role="user", content="Hello, OnGround AI!")
    assert msg.role == "user"
    assert msg.content == "Hello, OnGround AI!"
