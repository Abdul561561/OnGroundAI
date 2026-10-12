import pytest
from unittest.mock import AsyncMock
from app.services.signaling_service import ConnectionManager

@pytest.mark.asyncio
async def test_connection_manager_presence():
    manager = ConnectionManager()
    ws_mock = AsyncMock()

    user_id = "user-abc"
    await manager.connect(user_id, ws_mock)
    assert manager.is_user_online(user_id) is True
    assert user_id in manager.get_online_user_ids()

    await manager.disconnect(user_id, ws_mock)
    assert manager.is_user_online(user_id) is False

@pytest.mark.asyncio
async def test_signaling_offer_routing():
    manager = ConnectionManager()
    caller_ws = AsyncMock()
    recipient_ws = AsyncMock()

    caller_id = "user-1"
    recipient_id = "user-2"

    await manager.connect(caller_id, caller_ws)
    await manager.connect(recipient_id, recipient_ws)

    # Caller sends offer
    offer_data = {
        "type": "call_offer",
        "target_id": recipient_id,
        "call_id": "call-100",
        "sdp": {"type": "offer", "sdp": "v=0..."},
        "call_type": "audio"
    }

    await manager.handle_signaling_message(caller_id, "Caller User", offer_data)

    # Recipient should receive incoming_call
    recipient_ws.send_text.assert_called()
    last_call_args = recipient_ws.send_text.call_args[0][0]
    assert "incoming_call" in last_call_args
    assert "Caller User" in last_call_args
