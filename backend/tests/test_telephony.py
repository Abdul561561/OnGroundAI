import pytest
from app.telephony.unconfigured_adapter import UnconfiguredAdapter
from app.telephony.manager import get_telephony_provider
from app.config import settings

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
            agent_name="Agent Smith"
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
    # Since no Twilio creds in test environment, defaults to unconfigured
    assert provider.provider_name in ["unconfigured", "twilio"]

@pytest.mark.asyncio
async def test_twilio_adapter_browser_sdk_outbound_twiml():
    from app.telephony.twilio_adapter import TwilioAdapter
    adapter = TwilioAdapter()
    adapter.phone_number = "+15550001111"
    twiml = await adapter.handle_voice_webhook({
        "From": "client:agent-123",
        "To": "+15559482819",
        "agent_id": "agent-123",
        "call_record_id": "call-rec-999"
    })
    assert "<Dial" in twiml
    assert 'callerId="+15550001111"' in twiml
    assert "<Number" in twiml
    assert "+15559482819" in twiml

@pytest.mark.asyncio
async def test_twilio_adapter_rest_bridge_twiml():
    from app.telephony.twilio_adapter import TwilioAdapter
    adapter = TwilioAdapter()
    adapter.phone_number = "+15550001111"
    adapter.twiml_app_sid = "AP1234567890"
    adapter.api_key_sid = "SK1234567890"
    adapter.api_key_secret = "secret123"
    twiml = await adapter.handle_voice_webhook({
        "From": "+15550001111",
        "To": "+15559482819",
        "direction": "outbound",
        "agent_id": "agent-123"
    })
    assert "<Dial" in twiml
    assert "<Client>agent-123</Client>" in twiml

