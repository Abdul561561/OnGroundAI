from types import SimpleNamespace
import pytest
from httpx import AsyncClient, ASGITransport
from twilio.base.exceptions import TwilioRestException

from app.main import app
from app.database import get_db
from app.services.auth_service import create_access_token
from app.telephony.unconfigured_adapter import UnconfiguredAdapter
from app.telephony.twilio_adapter import (
    TwilioAdapter,
    TelephonyCarrierError,
    normalize_and_validate_e164,
)
from app.telephony.manager import get_telephony_provider
import app.routes.telephony as telephony_routes


@pytest.mark.asyncio
async def test_unconfigured_adapter_honest_diagnostics():
    adapter = UnconfiguredAdapter()
    assert adapter.provider_name == "unconfigured"
    assert adapter.is_configured is False

    status = await adapter.get_status()
    assert status["is_configured"] is False
    assert status["simulated_calling_disabled"] is True
    assert "Zero-Payment Mode Active" in status["active_carrier"]
    assert "configuration_guide" in status


@pytest.mark.asyncio
async def test_unconfigured_adapter_rejects_fake_dialing():
    adapter = UnconfiguredAdapter()
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as excinfo:
        await adapter.initiate_outbound_call(
            to_number="+15551234567",
            agent_id="test_agent",
            agent_name="Agent Smith",
        )
    assert excinfo.value.status_code == 400
    assert excinfo.value.detail["error"] == "TELEPHONY_CARRIER_NOT_CONFIGURED"
    assert "simulated calls and fake dial tones are strictly forbidden" in excinfo.value.detail["message"]


@pytest.mark.asyncio
async def test_unconfigured_adapter_token_generation():
    adapter = UnconfiguredAdapter()
    token_res = await adapter.generate_client_token("test_user_id")
    assert token_res["carrier_configured"] is False
    assert token_res["token"] is None


def test_telephony_manager_returns_provider():
    provider = get_telephony_provider()
    assert provider is not None
    assert provider.provider_name in ["unconfigured", "twilio"]


def test_e164_validation():
    assert normalize_and_validate_e164("+15551234567") == "+15551234567"
    assert normalize_and_validate_e164(" +1 (555) 234-5678 ") == "+15552345678"
    assert normalize_and_validate_e164("+91 98765-43210") == "+919876543210"

    for invalid in ("", "12345", "5551234567", "+0123456789", "+1555abc1234", "+123"):
        with pytest.raises(ValueError):
            normalize_and_validate_e164(invalid)


@pytest.mark.asyncio
async def test_twilio_adapter_browser_sdk_outbound_twiml():
    adapter = TwilioAdapter(public_base_url="https://demo.ngrok-free.app")
    adapter.phone_number = "+15550001111"
    twiml = await adapter.handle_voice_webhook({
        "From": "client:agent-123",
        "To": "+15559482819",
        "agent_id": "agent-123",
        "call_record_id": "call-rec-999",
    })
    assert "<Dial" in twiml
    assert 'callerId="+15550001111"' in twiml
    assert "/api/telephony/webhook/dial-action" in twiml
    assert "<Number" in twiml
    assert "call_record_id=call-rec-999" in twiml
    assert "+15559482819" in twiml


@pytest.mark.asyncio
async def test_twilio_adapter_rest_bridge_twiml():
    adapter = TwilioAdapter(public_base_url="https://demo.ngrok-free.app")
    adapter.phone_number = "+15550001111"
    adapter.twiml_app_sid = "AP1234567890"
    adapter.api_key_sid = "SK1234567890"
    adapter.api_key_secret = "secret123"
    twiml = await adapter.handle_voice_webhook({
        "From": "+15550001111",
        "To": "+15559482819",
        "direction": "outbound",
        "agent_id": "agent-123",
        "call_record_id": "call-rec-555",
    })
    assert "<Dial" in twiml
    assert "bridge_mode=rest_bridge" in twiml
    assert "<Client>agent-123</Client>" in twiml


@pytest.mark.asyncio
async def test_twilio_adapter_dial_action_and_status_callback():
    adapter = TwilioAdapter()
    dial_twiml = await adapter.handle_dial_action({
        "DialCallStatus": "no-answer",
        "bridge_mode": "rest_bridge",
    })
    assert "<Response>" in dial_twiml
    assert "<Say" in dial_twiml
    assert "<Hangup" in dial_twiml

    completed_twiml = await adapter.handle_dial_action({
        "DialCallStatus": "completed",
        "bridge_mode": "browser_sdk",
    })
    assert completed_twiml == "<Response><Hangup /></Response>" or "<Hangup" in completed_twiml

    cb = await adapter.handle_status_callback({
        "CallSid": "CA123",
        "CallStatus": "in-progress",
        "DialCallStatus": "busy",
        "DialCallDuration": "0",
    })
    assert cb["status"] == "busy"
    assert cb["duration"] == "0"


@pytest.mark.asyncio
async def test_twilio_adapter_missing_credentials_honest_status():
    adapter = TwilioAdapter()
    status = await adapter.get_status()
    assert status["is_configured"] is False
    assert "missing in backend/.env" in status["message"]


@pytest.mark.asyncio
async def test_twilio_adapter_token_requires_api_key():
    adapter = TwilioAdapter(
        account_sid="AC" + "1" * 32,
        auth_token="a" * 32,
        phone_number="+15550001111",
    )
    res = await adapter.generate_client_token("agent-1")
    assert res["token"] is None
    assert res["has_api_key"] is False

    adapter_with_key = TwilioAdapter(
        account_sid="AC" + "1" * 32,
        auth_token="a" * 32,
        phone_number="+15550001111",
        api_key_sid="SK" + "2" * 32,
        api_key_secret="secret_key_value_123456",
    )
    res2 = await adapter_with_key.generate_client_token("agent-1")
    assert res2["token"] is not None
    assert res2["incoming_bridge_ready"] is True
    assert res2["browser_audio_ready"] is False


@pytest.mark.asyncio
async def test_twilio_adapter_outbound_validation_and_trial_errors():
    adapter = TwilioAdapter(
        account_sid="AC" + "1" * 32,
        auth_token="a" * 32,
        phone_number="+15550001111",
        public_base_url="http://localhost:8000",
    )
    with pytest.raises(TelephonyCarrierError) as invalid_num:
        await adapter.initiate_outbound_call("5551234", "agent-1", "Agent")
    assert invalid_num.value.error_code == "INVALID_PHONE_NUMBER"

    with pytest.raises(TelephonyCarrierError) as no_https:
        await adapter.initiate_outbound_call("+15559876543", "agent-1", "Agent")
    assert no_https.value.error_code == "PUBLIC_WEBHOOK_URL_REQUIRED"

    # Mock Twilio REST client success and Trial 21219 rejection
    adapter.public_base_url = "https://example.ngrok-free.app"
    captured_kwargs = {}

    class FakeCalls:
        def create(self, **kwargs):
            captured_kwargs.update(kwargs)
            return SimpleNamespace(sid="CA" + "9" * 32, status="queued")

    adapter._client = SimpleNamespace(calls=FakeCalls())

    result = await adapter.initiate_outbound_call(
        to_number="+1 (555) 987-6543",
        agent_id="agent-1",
        agent_name="Agent",
        call_record_id="rec-1",
    )
    assert result["call_sid"] == "CA" + "9" * 32
    assert result["status"] == "queued"
    assert result["from_number"] == "+15550001111"
    assert result["to_number"] == "+15559876543"
    assert captured_kwargs["url"].startswith("https://example.ngrok-free.app/api/telephony/webhook/voice?")
    assert "call_record_id=rec-1" in captured_kwargs["status_callback"]

    class UnverifiedTrialCalls:
        def create(self, **kwargs):
            raise TwilioRestException(
                status=400,
                uri="/Calls",
                msg="The number +15559876543 is unverified",
                code=21219,
            )

    adapter._client = SimpleNamespace(calls=UnverifiedTrialCalls())
    with pytest.raises(TelephonyCarrierError) as trial_err:
        await adapter.initiate_outbound_call("+15559876543", "agent-1", "Agent")
    assert trial_err.value.error_code == "TRIAL_UNVERIFIED_NUMBER"
    assert trial_err.value.twilio_code == 21219


class _MockCollection:
    def __init__(self, initial=None):
        self.docs = list(initial or [])

    async def find_one(self, query, **kwargs):
        for d in self.docs:
            match = True
            for k, v in query.items():
                if isinstance(v, dict) and "$regex" in v:
                    if v["$regex"] not in str(d.get(k, "")):
                        match = False
                elif d.get(k) != v:
                    match = False
            if match:
                return d
        return None

    async def insert_one(self, doc):
        self.docs.append(dict(doc))

    async def update_one(self, query, update):
        doc = await self.find_one(query)
        if doc and "$set" in update:
            doc.update(update["$set"])

    async def find_one_and_update(self, query, update):
        doc = await self.find_one(query)
        if doc and "$set" in update:
            doc.update(update["$set"])
        return doc


class _MockTelephonyDB:
    def __init__(self):
        self.users = _MockCollection([
            {
                "_id": "agent_1",
                "name": "Agent Alice",
                "email": "alice@onground.ai",
                "role": "agent",
                "status": "available",
            }
        ])
        self.contacts = _MockCollection([])
        self.calls = _MockCollection([])
        self.call_queues = _MockCollection([])


@pytest.mark.asyncio
async def test_telephony_routes_outbound_status_sync_and_hangup(monkeypatch):
    mock_db = _MockTelephonyDB()
    app.dependency_overrides[get_db] = lambda: mock_db

    fake_adapter = TwilioAdapter(
        account_sid="AC" + "1" * 32,
        auth_token="a" * 32,
        phone_number="+15552345678",
        public_base_url="https://example.ngrok-free.app",
    )
    call_state_box = {"status": "queued", "duration": None}

    class FakeCallResource:
        def __init__(self, sid):
            self.sid = sid

        def fetch(self):
            return SimpleNamespace(
                sid=self.sid,
                status=call_state_box["status"],
                duration=call_state_box["duration"],
            )

        def update(self, status):
            call_state_box["status"] = status
            return SimpleNamespace(sid=self.sid, status=status, duration="5")

    class FakeCallsApi:
        def create(self, **kwargs):
            return SimpleNamespace(sid="CA" + "7" * 32, status="queued")

        def __call__(self, sid):
            return FakeCallResource(sid)

    fake_adapter._client = SimpleNamespace(calls=FakeCallsApi())
    monkeypatch.setattr(telephony_routes, "get_telephony_provider", lambda: fake_adapter)
    monkeypatch.setattr(telephony_routes, "get_db", lambda: mock_db)

    token = create_access_token({"sub": "agent_1", "email": "alice@onground.ai", "role": "agent", "name": "Agent Alice"})
    headers = {"Authorization": f"Bearer {token}"}

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Invalid E.164 fails cleanly
            bad_resp = await client.post("/api/telephony/outbound", json={"phone_number": "98765"}, headers=headers)
            assert bad_resp.status_code == 400
            assert bad_resp.json()["detail"]["error"] == "INVALID_PHONE_NUMBER"

            # 2. Valid E.164 returns real Call SID and queued status (not answered)
            ok_resp = await client.post("/api/telephony/outbound", json={"phone_number": "+15559876543"}, headers=headers)
            assert ok_resp.status_code == 200
            data = ok_resp.json()
            assert data["provider_call_id"] == "CA" + "7" * 32
            assert data["status"] == "queued"
            assert data["caller_number"] == "+15552345678"
            call_id = data["_id"]

            # 3. Webhook status updates status to connected
            st_resp = await client.post(
                f"/api/telephony/webhook/status?call_record_id={call_id}",
                data={"CallSid": data["provider_call_id"], "CallStatus": "in-progress"},
            )
            assert st_resp.status_code == 200
            assert mock_db.calls.docs[0]["status"] == "connected"

            # 4. Dial action returns XML TwiML
            da_resp = await client.post(
                f"/api/telephony/webhook/dial-action?call_record_id={call_id}&bridge_mode=rest_bridge",
                data={"DialCallStatus": "no-answer"},
            )
            assert da_resp.status_code == 200
            assert "application/xml" in da_resp.headers["content-type"]
            assert "<Response>" in da_resp.text

            # 5. Live call status sync endpoint reflects Twilio state
            call_state_box["status"] = "completed"
            call_state_box["duration"] = "12"
            sync_resp = await client.get(f"/api/telephony/calls/{call_id}", headers=headers)
            assert sync_resp.status_code == 200
            assert sync_resp.json()["status"] == "completed"
            assert sync_resp.json()["duration_seconds"] == 12

            # 6. Hangup endpoint terminates call cleanly
            hang_resp = await client.post(
                "/api/telephony/hangup",
                json={"call_id": call_id, "duration_seconds": 12},
                headers=headers,
            )
            assert hang_resp.status_code == 200
    finally:
        app.dependency_overrides.clear()


def test_public_webhook_url_validation():
    assert TwilioAdapter(public_base_url="http://localhost:8000").has_public_webhook_url is False
    assert TwilioAdapter(public_base_url="http://demo.ngrok-free.app").has_public_webhook_url is False
    assert TwilioAdapter(public_base_url="https://your-ngrok-address.ngrok-free.app").has_public_webhook_url is False
    assert TwilioAdapter(public_base_url="https://127.0.0.1:8000").has_public_webhook_url is False
    assert TwilioAdapter(public_base_url="https://a1b2-3c4d.ngrok-free.app").has_public_webhook_url is True


@pytest.mark.asyncio
async def test_webhook_signature_validation_enforced(monkeypatch):
    from twilio.request_validator import RequestValidator

    mock_db = _MockTelephonyDB()
    app.dependency_overrides[get_db] = lambda: mock_db

    auth_token = "1234567890abcdef1234567890abcdef"
    public_base = "https://abcd-9999.ngrok-free.app"
    fake_adapter = TwilioAdapter(
        account_sid="AC" + "1" * 32,
        auth_token=auth_token,
        phone_number="+15552345678",
        public_base_url=public_base,
    )
    monkeypatch.setattr(telephony_routes, "get_telephony_provider", lambda: fake_adapter)
    monkeypatch.setattr(telephony_routes, "get_db", lambda: mock_db)

    validator = RequestValidator(auth_token)
    post_fields = {"CallSid": "CA" + "5" * 32, "CallStatus": "ringing"}
    query = "call_record_id=call-rec-sig-1"
    signed_url = f"{public_base}/api/telephony/webhook/status?{query}"
    valid_sig = validator.compute_signature(signed_url, post_fields)

    try:
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 1. Valid Twilio signature passes cleanly
            ok_resp = await client.post(
                f"/api/telephony/webhook/status?{query}",
                data=post_fields,
                headers={"X-Twilio-Signature": valid_sig},
            )
            assert ok_resp.status_code == 200

            # 2. Tampered signature rejected with 403
            bad_resp = await client.post(
                f"/api/telephony/webhook/status?{query}",
                data=post_fields,
                headers={"X-Twilio-Signature": "invalid-signature=="},
            )
            assert bad_resp.status_code == 403

            # 3. Missing signature on forwarded ngrok proxy request rejected with 403
            unauthenticated_proxy_resp = await client.post(
                f"/api/telephony/webhook/status?{query}",
                data=post_fields,
                headers={
                    "X-Forwarded-Proto": "https",
                    "X-Forwarded-Host": "abcd-9999.ngrok-free.app",
                },
            )
            assert unauthenticated_proxy_resp.status_code == 403
    finally:
        app.dependency_overrides.clear()
