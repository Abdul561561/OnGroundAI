import asyncio
import logging
import re
import time
from typing import Dict, Any, Optional, List, Callable, TypeVar
from urllib.parse import urlencode, urlparse
from app.telephony.base import TelephonyProvider

logger = logging.getLogger("onground_ai.telephony.twilio")
# Suppress verbose Twilio SDK HTTP header dumps in logs
logging.getLogger("twilio.http_client").setLevel(logging.WARNING)

E164_REGEX = re.compile(r"^\+[1-9]\d{6,14}$")
T = TypeVar("T")


def _is_placeholder(value: Optional[str]) -> bool:
    v = (value or "").strip()
    if not v:
        return True
    lower = v.lower()
    return (
        v.startswith("AC_YOUR_")
        or v.startswith("ACxxxx")
        or v.startswith("SKxxxx")
        or v.startswith("APxxxx")
        or lower.startswith("your_")
        or (v.startswith("<") and v.endswith(">"))
    )


def normalize_and_validate_e164(
    phone_number: str,
    field_label: str = "destination phone number",
) -> str:
    """
    Strip standard phone formatting (spaces, hyphens, parentheses, dots) and
    validate strict E.164 format (+ followed by country code 1-9 and 7..15 digits total).
    """
    raw = (phone_number or "").strip()
    cleaned = re.sub(r"[\s\-().]", "", raw)
    if not E164_REGEX.match(cleaned):
        raise ValueError(
            f"Invalid {field_label} '{raw}'. Please use E.164 format starting with '+' and country code (for example +15551234567 or +919876543210)."
        )
    return cleaned


class TelephonyCarrierError(RuntimeError):
    """Structured error surfaced for Twilio REST / validation / trial rejections."""

    def __init__(
        self,
        message: str,
        status_code: int = 400,
        error_code: str = "TWILIO_CARRIER_ERROR",
        twilio_code: Optional[int] = None,
    ):
        super().__init__(message)
        self.message = message
        self.status_code = status_code
        self.error_code = error_code
        self.twilio_code = twilio_code


class TwilioAdapter(TelephonyProvider):
    """
    Genuine Twilio Voice Telephony Adapter.
    Connects FastAPI REST call control and browser softphones (@twilio/voice-sdk)
    to Twilio PSTN carrier endpoints for real outbound and inbound telephone calls.
    """

    def __init__(
        self,
        account_sid: str = "",
        auth_token: str = "",
        phone_number: str = "",
        twiml_app_sid: Optional[str] = None,
        api_key_sid: Optional[str] = None,
        api_key_secret: Optional[str] = None,
        public_base_url: Optional[str] = "http://localhost:8000",
    ):
        self.account_sid = (account_sid or "").strip()
        self.auth_token = (auth_token or "").strip()
        self.phone_number = (phone_number or "").strip()
        self.twiml_app_sid = (twiml_app_sid or "").strip()
        self.api_key_sid = (api_key_sid or "").strip()
        self.api_key_secret = (api_key_secret or "").strip()
        self.public_base_url = (public_base_url or "http://localhost:8000").strip().rstrip("/")
        self._client = None
        self._api_key_client = None
        self._prefer_api_key_client = False
        self._auth_token_failed = False
        self._verified_account_cache: Optional[Dict[str, Any]] = None
        self._verified_cache_ts: float = 0.0

    def _sanitize_text(self, text: str) -> str:
        sanitized = str(text or "")
        for secret in (self.auth_token, self.api_key_secret):
            if secret and len(secret) >= 6:
                sanitized = sanitized.replace(secret, "***")
        return sanitized

    def _build_client(self, use_api_key: bool = False):
        from twilio.rest import Client
        from twilio.http.http_client import TwilioHttpClient

        http_client = TwilioHttpClient(timeout=8.0)
        if use_api_key:
            return Client(
                self.api_key_sid,
                self.api_key_secret,
                self.account_sid,
                http_client=http_client,
            )
        return Client(
            self.account_sid,
            self.auth_token,
            http_client=http_client,
        )

    def _get_client(self):
        if self._prefer_api_key_client and self.has_api_key:
            if self._api_key_client is None:
                self._api_key_client = self._build_client(use_api_key=True)
            return self._api_key_client

        if self.auth_token and not _is_placeholder(self.auth_token):
            if self._client is None:
                self._client = self._build_client(use_api_key=False)
            return self._client

        if self.has_api_key:
            if self._api_key_client is None:
                self._api_key_client = self._build_client(use_api_key=True)
            self._prefer_api_key_client = True
            return self._api_key_client

        if self._client is None:
            self._client = self._build_client(use_api_key=False)
        return self._client

    async def _run_twilio(self, operation: Callable[[Any], T]) -> T:
        """
        Execute a Twilio REST SDK operation off the event loop.
        If Auth Token fails with 401/20003 and an API Key is configured, transparently
        retries once using the API Key client so calls remain functional while warning.
        """
        client = self._get_client()
        try:
            return await asyncio.to_thread(lambda: operation(client))
        except Exception as exc:
            is_auth_err = (
                getattr(exc, "status", None) == 401
                or getattr(exc, "code", None) == 20003
            )
            if is_auth_err and not self._prefer_api_key_client and self.has_api_key:
                if self._api_key_client is None:
                    self._api_key_client = self._build_client(use_api_key=True)
                res = await asyncio.to_thread(lambda: operation(self._api_key_client))
                self._prefer_api_key_client = True
                self._auth_token_failed = True
                return res
            raise

    def _translate_twilio_exception(self, exc: Exception) -> TelephonyCarrierError:
        code = getattr(exc, "code", None)
        http_status = getattr(exc, "status", None)
        raw_msg = self._sanitize_text(getattr(exc, "msg", None) or str(exc))

        if code == 21219:
            return TelephonyCarrierError(
                "Twilio Trial Account Restriction (Code 21219): This destination phone number is unverified. "
                "Add and verify it under Twilio Console -> Phone Numbers -> Manage -> Verified Caller IDs, or upgrade your Twilio account.",
                status_code=400,
                error_code="TRIAL_UNVERIFIED_NUMBER",
                twilio_code=code,
            )
        if code == 21215:
            return TelephonyCarrierError(
                "Twilio Geo-Permissions Restriction (Code 21215): Your Twilio account is not enabled to call this country or region. "
                "Enable the destination country in Twilio Console -> Voice -> Settings -> Geo Permissions.",
                status_code=403,
                error_code="GEO_PERMISSION_RESTRICTED",
                twilio_code=code,
            )
        if code in (21211, 21217, 21612, 21614):
            return TelephonyCarrierError(
                f"Invalid destination telephone number (Twilio Code {code}): {raw_msg}. Verify the country code and E.164 digits.",
                status_code=400,
                error_code="INVALID_DESTINATION_NUMBER",
                twilio_code=code,
            )
        if code in (21210, 21212, 21606):
            return TelephonyCarrierError(
                f"Invalid Twilio caller ID (Twilio Code {code}): Check TWILIO_PHONE_NUMBER in backend/.env.",
                status_code=400,
                error_code="INVALID_CALLER_ID",
                twilio_code=code,
            )
        if code == 20003 or http_status == 401:
            return TelephonyCarrierError(
                "Twilio Authentication Failed (Code 20003): Check TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and API Key credentials in backend/.env.",
                status_code=401,
                error_code="TWILIO_AUTH_FAILED",
                twilio_code=code or 20003,
            )
        if code in (20005, 13227, 20008):
            return TelephonyCarrierError(
                f"Twilio Account or Trial Balance Restriction (Code {code}): {raw_msg}. Check your Twilio Console balance and account status.",
                status_code=402,
                error_code="TRIAL_BALANCE_OR_ACCOUNT_LIMIT",
                twilio_code=code,
            )
        if code in (21205, 13224):
            return TelephonyCarrierError(
                f"Invalid Twilio Webhook URL (Code {code}): Ensure PUBLIC_BASE_URL is a valid public HTTPS URL (e.g. ngrok).",
                status_code=400,
                error_code="INVALID_WEBHOOK_URL",
                twilio_code=code,
            )
        if code == 20429 or http_status == 429:
            return TelephonyCarrierError(
                "Twilio Rate Limit Exceeded (429): Please wait a moment and try again.",
                status_code=429,
                error_code="TWILIO_RATE_LIMIT",
                twilio_code=code,
            )

        if "limited parameter access" in raw_msg.lower() or "disallowed parameters" in raw_msg.lower():
            return TelephonyCarrierError(
                "Twilio Trial Sandbox Restriction: This Trial account has limited REST API parameter access "
                "(often because no dedicated Twilio phone number is purchased on the account, balance is $0.00, "
                "or trial restrictions block custom outbound webhooks/parameters). Claim/buy a Twilio phone number "
                "and verify your destination number or upgrade your Twilio account in the Twilio Console.",
                status_code=400,
                error_code="TRIAL_PARAMETER_RESTRICTED",
                twilio_code=code,
            )

        code_suffix = f" (Code {code})" if code else ""
        return TelephonyCarrierError(
            f"Twilio Carrier Error{code_suffix}: {raw_msg}",
            status_code=400,
            error_code="TWILIO_CARRIER_ERROR",
            twilio_code=code,
        )

    @property
    def provider_name(self) -> str:
        return "twilio"

    @property
    def has_api_key(self) -> bool:
        return bool(
            self.api_key_sid
            and self.api_key_secret
            and not _is_placeholder(self.api_key_sid)
            and not _is_placeholder(self.api_key_secret)
        )

    @property
    def has_twiml_app(self) -> bool:
        return bool(self.twiml_app_sid and not _is_placeholder(self.twiml_app_sid))

    @property
    def is_configured(self) -> bool:
        has_auth = bool(
            (self.auth_token and not _is_placeholder(self.auth_token))
            or self.has_api_key
        )
        return bool(
            self.account_sid
            and not _is_placeholder(self.account_sid)
            and self.phone_number
            and not _is_placeholder(self.phone_number)
            and has_auth
        )

    @property
    def is_browser_voice_ready(self) -> bool:
        """Whether Twilio Voice SDK direct browser-to-PSTN outbound dialing (TwiML App + API Key) is configured."""
        return bool(self.is_configured and self.has_twiml_app and self.has_api_key)

    @property
    def has_public_webhook_url(self) -> bool:
        """Twilio cloud requires a publicly reachable HTTPS URL (e.g. ngrok) to deliver webhooks."""
        raw = (self.public_base_url or "").strip()
        if not raw:
            return False
        try:
            parsed = urlparse(raw)
        except Exception:
            return False
        if parsed.scheme.lower() != "https" or not parsed.netloc:
            return False
        host = (parsed.hostname or "").lower()
        if not host or "." not in host:
            return False
        blocked_hosts = {"localhost", "127.0.0.1", "0.0.0.0", "::1"}
        if host in blocked_hosts or host.endswith(".local"):
            return False
        placeholder_tokens = ("your-ngrok-address", "your-tunnel", "your-public-domain", "<", ">")
        lower_raw = raw.lower()
        return not any(tok in lower_raw for tok in placeholder_tokens)

    @property
    def webhook_signature_ready(self) -> bool:
        """Whether Twilio X-Twilio-Signature HMAC validation has a valid Auth Token."""
        return bool(
            self.auth_token
            and not _is_placeholder(self.auth_token)
            and not self._auth_token_failed
        )

    def get_webhook_urls(self) -> Dict[str, str]:
        base = self.public_base_url
        return {
            "voice": f"{base}/api/telephony/webhook/voice",
            "dial_action": f"{base}/api/telephony/webhook/dial-action",
            "status": f"{base}/api/telephony/webhook/status",
        }

    async def get_status(self) -> Dict[str, Any]:
        masked_sid = (
            self.account_sid[:6] + "..." + self.account_sid[-4:]
            if len(self.account_sid) > 10
            else ("Not set" if not self.account_sid else "Configured")
        )
        masked_number = self.phone_number

        account_verified = False
        account_status = "unverified"
        account_name = None
        account_type = None
        balance_amount = None
        balance_currency = None
        verified_caller_ids_count: Optional[int] = None
        owned_numbers_count: Optional[int] = None
        verification_error = None
        auth_token_warning = None
        warnings: List[str] = []

        if self.is_configured:
            if (
                self._verified_account_cache is not None
                and (time.monotonic() - self._verified_cache_ts) < 30.0
            ):
                cached = self._verified_account_cache
                account_verified = cached["account_verified"]
                account_status = cached["account_status"]
                account_name = cached["account_name"]
                account_type = cached["account_type"]
                balance_amount = cached["balance_amount"]
                balance_currency = cached["balance_currency"]
                verified_caller_ids_count = cached["verified_caller_ids_count"]
                owned_numbers_count = cached.get("owned_numbers_count")
                auth_token_warning = cached["auth_token_warning"]
            else:
                try:
                    # Check primary Auth Token explicitly first if provided and not previously rejected
                    active_client = None
                    if (
                        self.auth_token
                        and not _is_placeholder(self.auth_token)
                        and not (self._auth_token_failed and self.has_api_key)
                    ):
                        try:
                            primary = self._build_client(use_api_key=False)
                            acct = await asyncio.to_thread(
                                lambda: primary.api.accounts(self.account_sid).fetch()
                            )
                            active_client = primary
                            self._client = primary
                            self._prefer_api_key_client = False
                        except Exception as auth_exc:
                            is_auth_fail = (
                                getattr(auth_exc, "status", None) == 401
                                or getattr(auth_exc, "code", None) == 20003
                            )
                            if is_auth_fail and self.has_api_key:
                                self._auth_token_failed = True
                                api_client = self._build_client(use_api_key=True)
                                acct = await asyncio.to_thread(
                                    lambda: api_client.api.accounts(self.account_sid).fetch()
                                )
                                active_client = api_client
                                self._api_key_client = api_client
                                self._prefer_api_key_client = True
                                auth_token_warning = (
                                    "TWILIO_AUTH_TOKEN failed verification (REST calls are authenticated via TWILIO_API_KEY_SID/SECRET). "
                                    "Update TWILIO_AUTH_TOKEN in backend/.env with your full 32-character Auth Token."
                                )
                            else:
                                raise
                    else:
                        api_client = self._build_client(use_api_key=True)
                        acct = await asyncio.to_thread(
                            lambda: api_client.api.accounts(self.account_sid).fetch()
                        )
                        active_client = api_client
                        self._api_key_client = api_client
                        self._prefer_api_key_client = True
                        if self._auth_token_failed:
                            auth_token_warning = (
                                "TWILIO_AUTH_TOKEN failed verification (REST calls are authenticated via TWILIO_API_KEY_SID/SECRET). "
                                "Update TWILIO_AUTH_TOKEN in backend/.env with your full 32-character Auth Token."
                            )

                    account_verified = True
                    account_status = getattr(acct, "status", "active")
                    account_name = getattr(acct, "friendly_name", None)
                    account_type = getattr(acct, "type", None)

                    # Fetch balance and trial verified caller ID count safely
                    if active_client is not None:
                        try:
                            bal = await asyncio.to_thread(
                                lambda: active_client.api.accounts(self.account_sid).balance.fetch()
                            )
                            balance_amount = getattr(bal, "balance", None)
                            balance_currency = getattr(bal, "currency", None)
                        except Exception:
                            pass

                        if str(account_type or "").lower() == "trial":
                            try:
                                caller_ids = await asyncio.to_thread(
                                    lambda: active_client.outgoing_caller_ids.list(limit=50)
                                )
                                verified_caller_ids_count = len(caller_ids)
                            except Exception:
                                pass

                        try:
                            owned_nums = await asyncio.to_thread(
                                lambda: active_client.incoming_phone_numbers.list(limit=10)
                            )
                            owned_numbers_count = len(owned_nums)
                        except Exception:
                            pass

                    self._verified_account_cache = {
                        "account_verified": account_verified,
                        "account_status": account_status,
                        "account_name": account_name,
                        "account_type": account_type,
                        "balance_amount": balance_amount,
                        "balance_currency": balance_currency,
                        "verified_caller_ids_count": verified_caller_ids_count,
                        "owned_numbers_count": owned_numbers_count,
                        "auth_token_warning": auth_token_warning,
                    }
                    self._verified_cache_ts = time.monotonic()
                except Exception as e:
                    self._verified_account_cache = None
                    verification_error = self._sanitize_text(str(e))
                    logger.warning("Twilio account verification failed: %s", verification_error)
        else:
            warnings.append(
                "Twilio credentials are incomplete in backend/.env. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER."
            )

        if auth_token_warning:
            warnings.append(auth_token_warning)

        is_trial = str(account_type or "").lower() == "trial"
        if is_trial:
            count_note = (
                f" ({verified_caller_ids_count} verified caller ID(s) on account)"
                if verified_caller_ids_count is not None
                else ""
            )
            warnings.append(
                f"Twilio Trial account active{count_note}: outbound calls only succeed to verified destination numbers and play Twilio's trial announcement when answered."
            )
        if owned_numbers_count == 0 and account_verified:
            warnings.append(
                f"No dedicated Twilio phone number is currently owned on this account (TWILIO_PHONE_NUMBER '{masked_number}' appears to be a shared Console sandbox number). Claim/buy a Twilio number in Console for unrestricted API outbound calls."
            )

        if not self.has_public_webhook_url:
            warnings.append(
                f"PUBLIC_BASE_URL is currently '{self.public_base_url}'. Twilio webhooks require a public HTTPS URL (e.g. via ngrok) to reach /api/telephony/webhook/voice and /api/telephony/webhook/status."
            )
        if not self.has_api_key:
            warnings.append(
                "TWILIO_API_KEY_SID and TWILIO_API_KEY_SECRET are not set. Browser microphone-to-PSTN audio bridging (@twilio/voice-sdk) requires an API Key."
            )
        if not self.has_twiml_app:
            warnings.append(
                "TWILIO_TWIML_APP_SID is not set. REST outbound calls work directly via FastAPI; add a TwiML App SID if you also want direct browser Device.connect() dialing."
            )

        if not self.is_configured:
            status_message = (
                "Twilio provider is selected, but required credentials (TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER) are missing in backend/.env."
            )
        elif verification_error:
            status_message = f"Twilio credentials configured, but verification failed: {verification_error}"
        elif account_verified and not self.has_public_webhook_url:
            trial_label = " (Trial Account)" if is_trial else ""
            status_message = (
                f"Twilio account verified{trial_label}, but PUBLIC_BASE_URL ('{self.public_base_url}') must be a publicly accessible HTTPS URL (e.g. ngrok) before calls can connect."
            )
        elif account_verified:
            trial_label = " (Trial Account)" if is_trial else ""
            status_message = f"Twilio PSTN carrier verified{trial_label} and operational via public HTTPS webhooks."
        else:
            status_message = "Twilio PSTN carrier configured."

        credentials_ready = bool(self.is_configured and (account_verified or verification_error is None))
        is_operational = bool(
            credentials_ready
            and account_verified
            and str(account_status or "").lower() == "active"
            and self.has_public_webhook_url
        )

        return {
            "is_configured": credentials_ready,
            "is_operational": is_operational,
            "account_verified": account_verified,
            "credentials_valid": account_verified,
            "account_name": account_name,
            "account_status": account_status,
            "account_type": account_type,
            "is_trial": is_trial,
            "balance": balance_amount,
            "currency": balance_currency,
            "verified_caller_ids_count": verified_caller_ids_count,
            "verification_error": verification_error,
            "provider": "twilio",
            "active_carrier": f"Twilio PSTN ({masked_number or 'No number'})",
            "phone_number": masked_number,
            "account_sid": masked_sid,
            "has_twiml_app": self.has_twiml_app,
            "has_api_key": self.has_api_key,
            "incoming_bridge_ready": self.is_configured and self.has_api_key,
            "browser_audio_ready": self.is_browser_voice_ready,
            "public_webhook_url": self.public_base_url,
            "has_public_webhook": self.has_public_webhook_url,
            "public_webhook_ready": self.has_public_webhook_url,
            "webhook_signature_ready": self.webhook_signature_ready,
            "webhook_urls": self.get_webhook_urls(),
            "warnings": warnings,
            "simulated_calling_disabled": True,
            "internal_webrtc_available": True,
            "message": status_message,
        }

    async def initiate_outbound_call(
        self,
        to_number: str,
        agent_id: str,
        agent_name: str,
        contact_id: Optional[str] = None,
        notes: Optional[str] = None,
        call_record_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        if not self.is_configured:
            raise TelephonyCarrierError(
                "Twilio PSTN carrier is not configured in backend/.env.",
                status_code=400,
                error_code="TELEPHONY_CARRIER_NOT_CONFIGURED",
            )

        try:
            clean_to = normalize_and_validate_e164(to_number, "destination phone number")
            clean_from = normalize_and_validate_e164(self.phone_number, "TWILIO_PHONE_NUMBER caller ID")
        except ValueError as ve:
            raise TelephonyCarrierError(
                str(ve),
                status_code=400,
                error_code="INVALID_PHONE_NUMBER",
            )

        if not self.has_public_webhook_url:
            raise TelephonyCarrierError(
                f"PUBLIC_BASE_URL ('{self.public_base_url}') must be a publicly accessible HTTPS URL (such as an ngrok URL) so Twilio can reach voice and status webhooks.",
                status_code=400,
                error_code="PUBLIC_WEBHOOK_URL_REQUIRED",
            )

        voice_params: Dict[str, str] = {"agent_id": agent_id}
        if contact_id:
            voice_params["contact_id"] = contact_id
        if call_record_id:
            voice_params["call_record_id"] = call_record_id
        voice_webhook_url = f"{self.public_base_url}/api/telephony/webhook/voice?{urlencode(voice_params)}"

        status_callback_url = f"{self.public_base_url}/api/telephony/webhook/status"
        if call_record_id:
            status_callback_url += f"?{urlencode({'call_record_id': call_record_id})}"

        try:
            try:
                call = await self._run_twilio(
                    lambda c: c.calls.create(
                        to=clean_to,
                        from_=clean_from,
                        url=voice_webhook_url,
                        method="POST",
                        status_callback=status_callback_url,
                        status_callback_event=["initiated", "ringing", "answered", "completed"],
                        status_callback_method="POST",
                    )
                )
            except Exception as first_exc:
                err_txt = str(getattr(first_exc, "msg", None) or first_exc).lower()
                if "limited parameter access" in err_txt or "disallowed parameters" in err_txt:
                    logger.info(
                        "Twilio Trial account rejected optional callback parameters; retrying with core (to, from_, url) params."
                    )
                    call = await self._run_twilio(
                        lambda c: c.calls.create(
                            to=clean_to,
                            from_=clean_from,
                            url=voice_webhook_url,
                        )
                    )
                else:
                    raise
            raw_status = (getattr(call, "status", None) or "queued").lower()
            logger.info("Twilio REST call created: SID=%s status=%s", call.sid, raw_status)
            return {
                "status": raw_status,
                "raw_status": raw_status,
                "call_sid": call.sid,
                "provider": "twilio",
                "to_number": clean_to,
                "from_number": clean_from,
                "direction": "outbound",
                "agent_id": agent_id,
                "contact_id": contact_id,
            }
        except TelephonyCarrierError:
            raise
        except Exception as e:
            translated = self._translate_twilio_exception(e)
            logger.error("Twilio outbound call failed (%s): %s", translated.error_code, translated.message)
            raise translated

    async def fetch_call_status(self, call_sid: str) -> Dict[str, Any]:
        if not self.is_configured or not call_sid:
            return {"call_sid": call_sid, "status": "unknown"}
        try:
            call = await self._run_twilio(lambda c: c.calls(call_sid).fetch())
            raw_status = (getattr(call, "status", None) or "unknown").lower()
            duration = getattr(call, "duration", None)
            return {
                "call_sid": call.sid,
                "status": raw_status,
                "raw_status": raw_status,
                "duration": duration,
            }
        except Exception as e:
            logger.warning("Failed to fetch Twilio call status for %s: %s", call_sid, self._sanitize_text(str(e)))
            return {"call_sid": call_sid, "status": "unknown"}

    async def terminate_call(self, call_id: str) -> Dict[str, Any]:
        if not self.is_configured:
            return {"status": "error", "message": "Twilio PSTN carrier is not configured."}
        try:
            try:
                call = await self._run_twilio(lambda c: c.calls(call_id).update(status="completed"))
            except Exception as update_exc:
                # If Twilio rejects 'completed' for a queued/ringing call, retry with 'canceled'
                if getattr(update_exc, "code", None) == 21220:
                    call = await self._run_twilio(lambda c: c.calls(call_id).update(status="canceled"))
                else:
                    raise

            raw_status = (getattr(call, "status", None) or "completed").lower()
            return {
                "status": raw_status,
                "call_sid": call.sid,
                "duration": getattr(call, "duration", None),
            }
        except Exception as e:
            msg = self._sanitize_text(str(e))
            logger.warning("Failed to terminate Twilio call %s: %s", call_id, msg)
            return {"status": "error", "message": msg}

    async def generate_client_token(self, identity: str) -> Dict[str, Any]:
        """Generate Twilio Voice Client Access Token for browser softphone (@twilio/voice-sdk)."""
        if not self.is_configured:
            return {
                "token": None,
                "carrier_configured": False,
                "browser_audio_ready": False,
                "incoming_bridge_ready": False,
                "has_twiml_app": False,
                "has_api_key": False,
                "identity": identity,
                "message": "Twilio carrier is not configured.",
            }

        if not self.has_api_key:
            return {
                "token": None,
                "carrier_configured": True,
                "browser_audio_ready": False,
                "incoming_bridge_ready": False,
                "has_twiml_app": self.has_twiml_app,
                "has_api_key": False,
                "identity": identity,
                "message": "TWILIO_API_KEY_SID and TWILIO_API_KEY_SECRET are required to sign Voice SDK Access Tokens.",
            }

        try:
            from twilio.jwt.access_token import AccessToken
            from twilio.jwt.access_token.grants import VoiceGrant

            token = AccessToken(
                self.account_sid,
                self.api_key_sid,
                self.api_key_secret,
                identity=identity,
                ttl=3600,
            )

            grant = VoiceGrant(
                outgoing_application_sid=self.twiml_app_sid if self.has_twiml_app else None,
                incoming_allow=True,
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
                "incoming_bridge_ready": True,
                "has_twiml_app": self.has_twiml_app,
                "has_api_key": True,
                "provider": "twilio",
            }
        except Exception as e:
            err_msg = self._sanitize_text(str(e))
            logger.error("Failed to generate Twilio Access Token: %s", err_msg)
            return {
                "token": None,
                "carrier_configured": True,
                "browser_audio_ready": False,
                "incoming_bridge_ready": False,
                "has_twiml_app": self.has_twiml_app,
                "has_api_key": self.has_api_key,
                "identity": identity,
                "error": err_msg,
            }

    def _build_callback_urls(self, call_record_id: Optional[str] = None, bridge_mode: Optional[str] = None) -> tuple[str, str]:
        dial_params: Dict[str, str] = {}
        status_params: Dict[str, str] = {}
        if call_record_id:
            dial_params["call_record_id"] = call_record_id
            status_params["call_record_id"] = call_record_id
        if bridge_mode:
            dial_params["bridge_mode"] = bridge_mode

        dial_qs = f"?{urlencode(dial_params)}" if dial_params else ""
        status_qs = f"?{urlencode(status_params)}" if status_params else ""
        return (
            f"{self.public_base_url}/api/telephony/webhook/dial-action{dial_qs}",
            f"{self.public_base_url}/api/telephony/webhook/status{status_qs}",
        )

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
            call_record_id = str(form_data.get("call_record_id", "")).strip() or None
            online_agent_ids: List[str] = form_data.get("online_agent_ids") or []

            # Case 1: Browser Softphone (@twilio/voice-sdk Device.connect) dialing an external PSTN phone number
            if from_caller.startswith("client:") and to_target and not to_target.startswith("client:"):
                dial_action_url, status_callback_url = self._build_callback_urls(call_record_id, "browser_sdk")
                dial = Dial(
                    caller_id=self.phone_number,
                    answer_on_bridge=True,
                    action=dial_action_url,
                    method="POST",
                )
                dial.number(
                    to_target,
                    status_callback=status_callback_url,
                    status_callback_event="initiated ringing answered completed",
                    status_callback_method="POST",
                )
                response.append(dial)
                return str(response)

            # Case 2: REST-initiated outbound call where Twilio called the customer first and now bridges to agent's browser
            if agent_id:
                dial_action_url, _ = self._build_callback_urls(call_record_id, "rest_bridge")
                dial = Dial(
                    caller_id=self.phone_number,
                    answer_on_bridge=True,
                    timeout=20,
                    action=dial_action_url,
                    method="POST",
                )
                dial.client(str(agent_id))
                response.append(dial)
                return str(response)

            # Case 3: Inbound PSTN call from an external customer dialing our Twilio number
            dial_action_url, _ = self._build_callback_urls(call_record_id, "inbound")
            if online_agent_ids:
                response.say("Thank you for calling OnGround AI. Connecting you to an available agent.")
                dial = Dial(
                    caller_id=from_caller or self.phone_number,
                    answer_on_bridge=True,
                    timeout=25,
                    action=dial_action_url,
                    method="POST",
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
            logger.error("Error generating TwiML: %s", self._sanitize_text(str(e)))
            return "<Response><Say>An unexpected carrier error occurred.</Say><Hangup/></Response>"

    async def handle_dial_action(self, form_data: Dict[str, Any]) -> str:
        """
        Return valid TwiML XML when a <Dial> verb finishes.
        Provides a polite fallback announcement if a REST bridge could not connect to an agent browser Client.
        """
        try:
            from twilio.twiml.voice_response import VoiceResponse

            dial_status = str(form_data.get("DialCallStatus") or "").strip().lower()
            bridge_mode = str(form_data.get("bridge_mode") or "").strip().lower()
            response = VoiceResponse()

            if dial_status in ("completed", "answered", ""):
                response.hangup()
                return str(response)

            if bridge_mode == "rest_bridge":
                response.say(
                    "Hello from OnGround AI Call Centre. Your call connected, "
                    "but no agent browser audio session answered the bridge. Goodbye."
                )
            elif dial_status == "busy":
                response.say("The number you dialed is currently busy. Goodbye.")
            elif dial_status in ("no-answer", "failed", "canceled"):
                response.say("The call could not be completed or was not answered. Goodbye.")

            response.hangup()
            return str(response)
        except Exception as e:
            logger.error("Error generating dial-action TwiML: %s", self._sanitize_text(str(e)))
            return "<Response><Hangup/></Response>"

    async def handle_status_callback(self, form_data: Dict[str, Any]) -> Dict[str, Any]:
        dial_call_status = form_data.get("DialCallStatus")
        call_status = dial_call_status if dial_call_status else form_data.get("CallStatus")
        call_duration = form_data.get("DialCallDuration") or form_data.get("CallDuration")
        call_sid = form_data.get("CallSid") or form_data.get("DialCallSid")
        error_code = form_data.get("ErrorCode") or form_data.get("SipResponseCode")

        logger.info(
            "Twilio status callback: CallSid=%s Status=%s Duration=%s ErrorCode=%s",
            call_sid,
            call_status,
            call_duration,
            error_code,
        )
        return {
            "call_sid": call_sid,
            "dial_call_sid": form_data.get("DialCallSid"),
            "status": call_status,
            "duration": call_duration,
            "error_code": error_code,
        }

    def validate_webhook_signature(
        self,
        url_candidates: List[str],
        post_params: Dict[str, Any],
        signature: Optional[str],
    ) -> bool:
        """
        Verify X-Twilio-Signature HMAC-SHA1 against candidate public URLs using Auth Token.
        Returns True if valid against at least one URL candidate.
        """
        if not signature or not self.auth_token or _is_placeholder(self.auth_token):
            return False
        try:
            from twilio.request_validator import RequestValidator

            validator = RequestValidator(self.auth_token)
            clean_params = {str(k): str(v) for k, v in (post_params or {}).items()}
            for candidate in url_candidates:
                if candidate and validator.validate(candidate, clean_params, signature):
                    return True
        except Exception as e:
            logger.warning("Twilio signature verification error: %s", self._sanitize_text(str(e)))
        return False
