import pytest
import uuid
from datetime import datetime, timezone

def test_call_lifecycle_data_structure():
    call_id = str(uuid.uuid4())
    caller_id = str(uuid.uuid4())
    recipient_id = str(uuid.uuid4())
    start_time = datetime.now(timezone.utc).isoformat()

    call_record = {
        "_id": call_id,
        "caller_user_id": caller_id,
        "recipient_user_id": recipient_id,
        "call_type": "audio",
        "status": "ringing",
        "started_at": start_time,
        "ended_at": None,
        "duration_seconds": 0,
        "created_at": start_time,
    }

    assert call_record["status"] == "ringing"

    # Simulate answering call
    call_record["status"] = "connected"
    assert call_record["status"] == "connected"

    # Simulate ending call
    end_time = datetime.now(timezone.utc).isoformat()
    call_record["status"] = "ended"
    call_record["ended_at"] = end_time
    call_record["duration_seconds"] = 45

    assert call_record["status"] == "ended"
    assert call_record["duration_seconds"] == 45
