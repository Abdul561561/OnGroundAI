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
