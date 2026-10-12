import logging
from typing import Optional
from app.config import settings
from app.telephony.base import TelephonyProvider
from app.telephony.unconfigured_adapter import UnconfiguredAdapter

logger = logging.getLogger("onground_ai.telephony")

_current_provider: Optional[TelephonyProvider] = None

def get_telephony_provider() -> TelephonyProvider:
    """
    Factory function providing the active Telephony Provider instance.
    Checks environment configurations and returns the appropriate adapter.
    """
    global _current_provider

    if _current_provider is not None:
        return _current_provider

    # Check if Twilio carrier credentials exist
    has_twilio_creds = bool(
        settings.TWILIO_ACCOUNT_SID and
        settings.TWILIO_AUTH_TOKEN and
        settings.TWILIO_PHONE_NUMBER
    )

    if settings.TELEPHONY_PROVIDER == "twilio" or (settings.TELEPHONY_PROVIDER == "auto" and has_twilio_creds):
        try:
            from app.telephony.twilio_adapter import TwilioAdapter
            _current_provider = TwilioAdapter(
                account_sid=settings.TWILIO_ACCOUNT_SID,
                auth_token=settings.TWILIO_AUTH_TOKEN,
                phone_number=settings.TWILIO_PHONE_NUMBER,
                twiml_app_sid=settings.TWILIO_TWIML_APP_SID,
                api_key_sid=settings.TWILIO_API_KEY_SID,
                api_key_secret=settings.TWILIO_API_KEY_SECRET,
                public_base_url=settings.PUBLIC_BASE_URL
            )
            logger.info("Telephony initialized: TwilioAdapter (Active PSTN Carrier)")
            return _current_provider
        except Exception as e:
            logger.warning("Could not initialize TwilioAdapter (%s). Falling back to UnconfiguredAdapter.", e)

    # Default fallback: UnconfiguredAdapter for honest zero-payment handling
    _current_provider = UnconfiguredAdapter()
    logger.info("Telephony initialized: UnconfiguredAdapter (Zero-Payment Mode)")
    return _current_provider

def reset_telephony_provider():
    """Allow reloading provider if settings change during runtime."""
    global _current_provider
    _current_provider = None
