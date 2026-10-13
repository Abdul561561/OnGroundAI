import asyncio
import logging
from typing import Dict, Any, Optional, List
from app.telephony.base import TelephonyProvider

logger = logging.getLogger("onground_ai.telephony.twilio")

class TwilioAdapter(TelephonyProvider):
    """
    Genuine Twilio Voice Telephony Adapter.
    Connects browser softphones (@twilio/voice-sdk) and REST call control to PSTN carrier endpoints
    for real outbound and inbound calls to mobile/landline numbers.
    """

    def __init__(
        self,
        account_sid: str = "",
        auth_token: str = "",
        phone_number: str = "",
        twiml_app_sid: Optional[str] = None,
        api_key_sid: Optional[str] = None,
        api_key_secret: Optional[str] = None,
        public_base_url: Optional[str] = "http://localhost:8000"
    ):
        self.account_sid = (account_sid or "").strip()
        self.auth_token = (auth_token or "").strip()
        self.phone_number = (phone_number or "").strip()
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
        return bool(
            self.account_sid
            and self.auth_token
            and self.phone_number
            and not self.account_sid.startswith("AC_YOUR_")
            and not self.auth_token.startswith("your_")
        )

    @property
    def is_browser_voice_ready(self) -> bool:
        """Whether Twilio Voice SDK browser-to-PSTN audio bridging credentials are set."""
        return bool(
            self.is_configured
            and self.twiml_app_sid
            and (self.api_key_sid and self.api_key_secret)
        )

    @property
    def has_public_webhook_url(self) -> bool:
        """Twilio cloud requires a publicly reachable URL (e.g. ngrok/Cloudflare tunnel or public domain) to deliver webhooks."""
        url_lower = self.public_base_url.lower()
        return bool(
            url_lower.startswith("https://")
            and "localhost" not in url_lower
            and "127.0.0.1" not in url_lower
        )

    async def get_status(self) -> Dict[str, Any]:
        masked_sid = (
            self.account_sid[:6] + "..." + self.account_sid[-4:]
            if len(self.account_sid) > 10
            else "Configured"
        )
        masked_number = self.phone_number

        # Verify account credentials with Twilio REST API if configured
        account_verified = False
        account_status = "unverified"
        account_name = None
        verification_error = None

        if self.is_configured:
            try:
                client = self._get_client()
                acct = await asyncio.to_thread(
                    lambda: client.api.accounts(self.account_sid).fetch()
                )
                account_verified = True
                account_status = getattr(acct, "status", "active")
                account_name = getattr(acct, "friendly_name", None)
            except Exception as e:
                verification_error = str(e)
                logger.warning("Twilio account verification failed: %s", e)

        warnings: List[str] = []
        if not self.has_public_webhook_url:
            warnings.append(
                f"PUBLIC_BASE_URL is currently '{self.public_base_url}'. Twilio cloud webhooks require a public HTTPS URL (e.g. via ngrok or Cloudflare Tunnel) to reach /api/telephony/webhook/voice and /api/telephony/webhook/status."
            )
        if not self.twiml_app_sid:
            warnings.append(
                "TWILIO_TWIML_APP_SID is not set. Browser microphone-to-PSTN WebRTC bridging (@twilio/voice-sdk) requires a TwiML App SID."
            )
        if not (self.api_key_sid and self.api_key_secret):
            warnings.append(
                "TWILIO_API_KEY_SID and TWILIO_API_KEY_SECRET are not set. Twilio Voice JS SDK 2.x requires an API Key (SK...) to sign browser AccessTokens."
            )

        return {
            "is_configured": self.is_configured and (account_verified or verification_error is None),
            "account_verified": account_verified,
            "credentials_valid": account_verified,
            "account_name": account_name,
            "account_status": account_status,
            "verification_error": verification_error,
            "provider": "twilio",
            "active_carrier": f"Twilio PSTN ({masked_number})",
            "phone_number": masked_number,
            "account_sid": masked_sid,
            "has_twiml_app": bool(self.twiml_app_sid),
            "has_api_key": bool(self.api_key_sid and self.api_key_secret),
            "browser_audio_ready": self.is_browser_voice_ready,
            "public_webhook_url": self.public_base_url,
            "has_public_webhook": self.has_public_webhook_url,
            "public_webhook_ready": self.has_public_webhook_url,
            "warnings": warnings,
            "simulated_calling_disabled": True,
            "internal_webrtc_available": True,
            "message": (
                "Twilio PSTN carrier verified and ready for telephone calls."
                if account_verified
                else f"Twilio credentials configured but verification failed: {verification_error}"
                if verification_error
                else "Twilio PSTN carrier configured."
            ),
        }

    async def initiate_outbound_call(
        self,
        to_number: str,
        agent_id: str,
        agent_name: str,
        contact_id: Optional[str] = None,
        notes: Optional[str] = None
    ) -> Dict[str, Any]:
        if not self.is_configured:
            raise RuntimeError("Twilio PSTN carrier is not configured.")

        client = self._get_client()

        voice_webhook_url = f"{self.public_base_url}/api/telephony/webhook/voice?agent_id={agent_id}"
        if contact_id:
            voice_webhook_url += f"&contact_id={contact_id}"
        status_callback_url = f"{self.public_base_url}/api/telephony/webhook/status"

        try:
            call = await asyncio.to_thread(
                lambda: client.calls.create(
                    to=to_number,
                    from_=self.phone_number,
                    url=voice_webhook_url,
                    status_callback=status_callback_url,
                    status_callback_event=["initiated", "ringing", "answered", "completed"],
                    status_callback_method="POST"
                )
            )
            logger.info("Twilio call initiated: SID=%s to %s", call.sid, to_number)
            return {
                "status": "ringing",
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
            call = await asyncio.to_thread(
                lambda: client.calls(call_id).update(status="completed")
            )
            return {
                "status": "completed",
                "call_sid": call.sid,
                "duration": getattr(call, "duration", None)
            }
        except Exception as e:
            logger.warning("Failed to terminate Twilio call %s: %s", call_id, e)
            return {"status": "error", "message": str(e)}

    async def generate_client_token(self, identity: str) -> Dict[str, Any]:
        """Generate Twilio Voice Client Access Token for browser softphone (@twilio/voice-sdk)."""
        if not self.is_configured:
            return {
                "token": None,
                "carrier_configured": False,
                "browser_audio_ready": False,
                "identity": identity,
                "message": "Twilio carrier is not configured."
            }

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

            jwt_val = token.to_jwt()
            if isinstance(jwt_val, bytes):
                jwt_val = jwt_val.decode("utf-8")

            return {
                "token": jwt_val,
                "identity": identity,
                "carrier_configured": True,
                "browser_audio_ready": self.is_browser_voice_ready,
                "has_twiml_app": bool(self.twiml_app_sid),
                "has_api_key": bool(self.api_key_sid and self.api_key_secret),
                "provider": "twilio"
            }
        except Exception as e:
            logger.error("Failed to generate Twilio Access Token: %s", e)
            return {
                "token": None,
                "carrier_configured": False,
                "browser_audio_ready": False,
                "identity": identity,
                "error": str(e)
            }

    async def handle_voice_webhook(self, form_data: Dict[str, Any]) -> str:
        """
        Generate TwiML XML response for:
        1. Browser-initiated outbound PSTN calls (From='client:...', To='+1555...')
        2. REST-initiated outbound calls bridging to agent browser Client (agent_id in params)
        3. Inbound PSTN customer calls dialing our Twilio number (From='+1555...', To=self.phone_number)
        """
        try:
            from twilio.twiml.voice_response import VoiceResponse, Dial

            response = VoiceResponse()
            from_caller = str(form_data.get("From", "")).strip()
            to_target = str(form_data.get("To", "") or form_data.get("phone_number", "")).strip()
            agent_id = form_data.get("agent_id")
            online_agent_ids: List[str] = form_data.get("online_agent_ids") or []
            status_callback_url = f"{self.public_base_url}/api/telephony/webhook/status"

            # Case 1: Browser Softphone (@twilio/voice-sdk Device.connect) dialing an external PSTN phone number
            if from_caller.startswith("client:") and to_target and not to_target.startswith("client:"):
                dial = Dial(
                    caller_id=self.phone_number,
                    answer_on_bridge=True,
                    action=status_callback_url,
                    method="POST"
                )
                dial.number(
                    to_target,
                    status_callback=status_callback_url,
                    status_callback_event="initiated ringing answered completed",
                    status_callback_method="POST"
                )
                response.append(dial)
                return str(response)

            # Case 2: REST-initiated outbound call where Twilio called the customer first and now bridges to agent's browser
            if agent_id:
                dial = Dial(
                    caller_id=self.phone_number,
                    answer_on_bridge=True,
                    action=status_callback_url,
                    method="POST"
                )
                dial.client(str(agent_id))
                response.append(dial)
                return str(response)

            # Case 3: Inbound PSTN call from an external customer dialing our Twilio number
            if online_agent_ids:
                response.say("Thank you for calling OnGround AI. Connecting you to an available agent.")
                dial = Dial(
                    caller_id=from_caller or self.phone_number,
                    answer_on_bridge=True,
                    timeout=25,
                    action=status_callback_url,
                    method="POST"
                )
                for aid in online_agent_ids[:5]:
                    dial.client(str(aid))
                response.append(dial)
            else:
                response.say(
                    "Thank you for calling OnGround AI Call Centre. All agents are currently assisting other callers. "
                    "Your call has been logged in our priority queue for immediate callback."
                )
                response.hangup()

            return str(response)
        except Exception as e:
            logger.error("Error generating TwiML: %s", e)
            return "<Response><Say>An unexpected carrier error occurred.</Say><Hangup/></Response>"

    async def handle_status_callback(self, form_data: Dict[str, Any]) -> Dict[str, Any]:
        call_sid = form_data.get("CallSid") or form_data.get("DialCallSid")
        call_status = form_data.get("CallStatus") or form_data.get("DialCallStatus")
        call_duration = form_data.get("CallDuration") or form_data.get("DialCallDuration")
        logger.info("Twilio status callback: CallSid=%s Status=%s Duration=%s", call_sid, call_status, call_duration)
        return {
            "call_sid": call_sid,
            "status": call_status,
            "duration": call_duration
        }
