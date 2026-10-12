from typing import Dict, Any, Optional
from fastapi import HTTPException, status
from app.telephony.base import TelephonyProvider

class UnconfiguredAdapter(TelephonyProvider):
    """
    Adapter active when no paid carrier credentials are provided.
    Adheres strictly to the Zero-Payment constraint:
    Never simulates ringing, never invents fake phone numbers, and never fakes connection statuses.
    """

    @property
    def provider_name(self) -> str:
        return "unconfigured"

    @property
    def is_configured(self) -> bool:
        return False

    async def get_status(self) -> Dict[str, Any]:
        return {
            "is_configured": False,
            "provider": "unconfigured",
            "active_carrier": "None (Zero-Payment Mode Active)",
            "message": (
                "Real telephone network (PSTN) calls to ordinary mobile and landline numbers "
                "require an active carrier provider. To connect a live carrier without rebuilding "
                "the application, specify TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in backend/.env."
            ),
            "simulated_calling_disabled": True,
            "policy": (
                "Per non-negotiable guidelines, simulated calls, fake dial tones, and mock connection "
                "states are strictly disabled. Only genuine calls to ordinary phones are supported when configured."
            ),
            "configuration_guide": {
                "step_1": "Create a Twilio account or obtain SIP trunk credentials (no payment required for free trial credits where offered).",
                "step_2": "Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in backend/.env.",
                "step_3": "Optional: Set TWILIO_TWIML_APP_SID for two-way browser softphone WebRTC-to-PSTN audio bridging.",
                "step_4": "Restart the backend server. The TwilioAdapter will automatically activate."
            },
            "internal_webrtc_available": True
        }

    async def initiate_outbound_call(
        self,
        to_number: str,
        agent_id: str,
        agent_name: str,
        contact_id: Optional[str] = None,
        notes: Optional[str] = None
    ) -> Dict[str, Any]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "error": "TELEPHONY_CARRIER_NOT_CONFIGURED",
                "message": (
                    f"Cannot dial {to_number}. No PSTN telephony carrier (e.g. Twilio) is configured in backend/.env. "
                    "In adherence to platform integrity, simulated calls and fake dial tones are strictly forbidden. "
                    "Configure carrier credentials to place genuine calls to mobile or landline numbers."
                ),
                "carrier_status": "unconfigured"
            }
        )

    async def terminate_call(self, call_id: str) -> Dict[str, Any]:
        return {
            "status": "not_active",
            "message": "No active telephony carrier call to terminate."
        }

    async def generate_client_token(self, identity: str) -> Dict[str, Any]:
        return {
            "token": None,
            "carrier_configured": False,
            "identity": identity,
            "message": "Carrier softphone gateway not configured. Please supply Twilio Voice App credentials in backend/.env to connect browser microphone to PSTN."
        }

    async def handle_voice_webhook(self, form_data: Dict[str, Any]) -> str:
        return "<Response><Say>No telephony carrier is configured on this server.</Say><Hangup/></Response>"

    async def handle_status_callback(self, form_data: Dict[str, Any]) -> Dict[str, Any]:
        return {"status": "ignored"}
