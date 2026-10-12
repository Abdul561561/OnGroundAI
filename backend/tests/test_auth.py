import pytest
from app.services.auth_service import hash_password, verify_password, create_access_token, decode_token

def test_password_hashing():
    raw_pwd = "SecureTestPassword123!"
    hashed = hash_password(raw_pwd)
    assert hashed != raw_pwd
    assert verify_password(raw_pwd, hashed) is True
    assert verify_password("WrongPassword!", hashed) is False

def test_jwt_token_lifecycle():
    data = {"sub": "user-12345", "email": "agent@onground.ai", "name": "Agent Smith"}
    token = create_access_token(data)
    assert isinstance(token, str)
    assert len(token) > 20

    payload = decode_token(token)
    assert payload["sub"] == "user-12345"
    assert payload["email"] == "agent@onground.ai"
    assert payload["name"] == "Agent Smith"
    assert "exp" in payload

def test_jwt_invalid_token():
    with pytest.raises(Exception):
        decode_token("invalid.token.signature")
