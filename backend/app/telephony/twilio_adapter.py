import logging
from typing import Dict, Any, Optional
from app.telephony.base import TelephonyProvider

logger = logging.getLogger("onground_ai.telephony.twilio")

class TwilioAdapter(TelephonyProvider):
    """
    Genuine Twilio Voice Telephony Adapter.
    Connects browser softphones to PSTN carrier endpoints for calls to mobile/landlines.
    """

    def __init__(
        self,
        account_sid: str,
        auth_token: str,
        phone_number: str,
        twiml_app_sid: Optional[str] = None,
        api_key_sid: Optional[str] = None,
        api_key_secret: Optional[str] = None,
        public_base_url: Optional[str] = "http://localhost:8000"
    ):
        self.account_sid = account_sid.strip()
        self.auth_token = auth_token.strip()
        self.phone_number = phone_number.strip()
        self.twiml_app_sid = (twiml_app_sid or "").strip()
        self.api_key_sid = (api_key_sid or "").strip()
        self.api_key_secret = (api_key_secret or "").strip()
        self.public_base_url = (public_base_url or "http://localhost:8000").rstrip("/")
        self._client = None

    def _get_client(self):
        if self._client is None:
            try:
                from twilio.rest import Client
                self._client = Client(self.account_sid, self.auth_token)
            except Exception as e:
                logger.error("Failed to initialize Twilio client: %s", e)
                raise
        return self._client

    @property
    def provider_name(self) -> str:
        return "twilio"

    @property
    def is_configured(self) -> bool:
        return bool(self.account_sid and self.auth_token and self.phone_number)

    async def get_status(self) -> Dict[str, Any]:
        masked_sid = self.account_sid[:4] + "..." + self.account_sid[-4:] if len(self.account_sid) > 8 else "Configured"
        masked_number = self.phone_number[:4] + "..." + self.phone_number[-4:] if len(self.phone_number) > 6 else self.phone_number
        return {
            "is_configured": True,
            "provider": "twilio",
            "active_carrier": f"Twilio Telecom ({masked_number})",
            "phone_number": masked_number,
            "account_sid": masked_sid,
            "has_twiml_app": bool(self.twiml_app_sid),
            "simulated_calling_disabled": True,
            "message": "Twilio PSTN carrier connected. Real telephone calls to ordinary phones enabled."
        }

    async def initiate_outbound_call(
        self,
        to_number: str,
        agent_id: str,
        agent_name: str,
        contact_id: Optional[str] = None,
        notes: Optional[str] = None
    ) -> Dict[str, Any]:
        client = self._get_client()

        voice_webhook_url = f"{self.public_base_url}/api/telephony/webhook/voice?agent_id={agent_id}"
        if contact_id:
            voice_webhook_url += f"&contact_id={contact_id}"
        status_callback_url = f"{self.public_base_url}/api/telephony/webhook/status"

        try:
            call = client.calls.create(
                to=to_number,
                from_=self.phone_number,
                url=voice_webhook_url,
                status_callback=status_callback_url,
                status_callback_event=["initiated", "ringing", "answered", "completed"]
            )
            logger.info("Twilio call initiated: SID=%s to %s", call.sid, to_number)
            return {
                "status": "initiated",
                "call_sid": call.sid,
                "provider": "twilio",
                "to_number": to_number,
                "from_number": self.phone_number,
                "direction": "outbound",
                "agent_id": agent_id,
                "contact_id": contact_id
            }
        except Exception as e:
            logger.error("Twilio call initiation failed: %s", e)
            raise RuntimeError(f"Twilio Carrier Error: {str(e)}")

    async def terminate_call(self, call_id: str) -> Dict[str, Any]:
        client = self._get_client()
        try:
            call = client.calls(call_id).update(status="completed")
            return {
                "status": "completed",
                "call_sid": call.sid,
                "duration": getattr(call, "duration", None)
            }
        except Exception as e:
            logger.warning("Failed to terminate Twilio call %s: %s", call_id, e)
            return {"status": "error", "message": str(e)}

    async def generate_client_token(self, identity: str) -> Dict[str, Any]:
        """Generate Twilio Voice Client Access Token for browser softphone."""
        try:
            from twilio.jwt.access_token import AccessToken
            from twilio.jwt.access_token.grants import VoiceGrant

            key_sid = self.api_key_sid or self.account_sid
            key_secret = self.api_key_secret or self.auth_token

            token = AccessToken(
                self.account_sid,
                key_sid,
                key_secret,
                identity=identity,
                ttl=3600
            )

            grant = VoiceGrant(
                outgoing_application_sid=self.twiml_app_sid if self.twiml_app_sid else None,
                incoming_allow=True
            )
            token.add_grant(grant)

            return {
                "token": token.to_jwt(),
                "identity": identity,
                "carrier_configured": True,
                "provider": "twilio"
            }
        except Exception as e:
            logger.error("Failed to generate Twilio Access Token: %s", e)
            return {
                "token": None,
                "carrier_configured": False,
                "identity": identity,
                "error": str(e)
            }

    async def handle_voice_webhook(self, form_data: Dict[str, Any]) -> str:
        """Generate TwiML XML response when call answers."""
        try:
            from twilio.twiml.voice_response import VoiceResponse, Dial

            response = VoiceResponse()
            agent_id = form_data.get("agent_id")

            if agent_id:
                # Bridge call to agent browser softphone client
                dial = Dial(caller_id=self.phone_number)
                dial.client(agent_id)
                response.append(dial)
            else:
                response.say("Thank you for calling OnGround AI Call Centre. Please hold for the next available agent.")
                dial = Dial(caller_id=self.phone_number)
                dial.client("support_queue")
                response.append(dial)

            return str(response)
        except Exception as e:
            logger.error("Error generating TwiML: %s", e)
            return "<Response><Say>An unexpected carrier error occurred.</Say><Hangup/></Response>"

    async def handle_status_callback(self, form_data: Dict[str, Any]) -> Dict[str, Any]:
        call_sid = form_data.get("CallSid")
        call_status = form_data.get("CallStatus")
        call_duration = form_data.get("CallDuration")
        logger.info("Twilio status callback: CallSid=%s Status=%s Duration=%s", call_sid, call_status, call_duration)
        return {
            "call_sid": call_sid,
            "status": call_status,
            "duration": call_duration
        }
