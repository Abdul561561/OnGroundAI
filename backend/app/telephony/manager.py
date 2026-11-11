import logging
from typing import Optional
from app.config import settings, get_active_env_mtime
from app.telephony.base import TelephonyProvider
from app.telephony.unconfigured_adapter import UnconfiguredAdapter

logger = logging.getLogger("onground_ai.telephony")

_current_provider: Optional[TelephonyProvider] = None
_loaded_env_mtime: Optional[float] = None


def get_telephony_provider() -> TelephonyProvider:
    """
    Factory function providing the active Telephony Provider instance.
    Automatically detects changes to backend/.env (such as updated PUBLIC_BASE_URL)
    and reloads the provider without hardcoding URLs in code.
    """
    global _current_provider, _loaded_env_mtime

    current_mtime = get_active_env_mtime()
    if (
        _current_provider is not None
        and _loaded_env_mtime is not None
        and current_mtime is not None
        and current_mtime != _loaded_env_mtime
    ):
        logger.info("Detected change in .env; reloading telephony settings and provider.")
        settings.reload_from_env()
        _current_provider = None

    if _current_provider is not None:
        return _current_provider

    _loaded_env_mtime = current_mtime

    provider_setting = (settings.TELEPHONY_PROVIDER or "auto").strip().lower()

    # Check if Twilio carrier credentials exist
    has_twilio_creds = bool(
        settings.TWILIO_ACCOUNT_SID
        and settings.TWILIO_PHONE_NUMBER
        and (
            settings.TWILIO_AUTH_TOKEN
            or (settings.TWILIO_API_KEY_SID and settings.TWILIO_API_KEY_SECRET)
        )
    )

    if provider_setting == "twilio" or (provider_setting == "auto" and has_twilio_creds):
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
    global _current_provider, _loaded_env_mtime
    _current_provider = None
    _loaded_env_mtime = None
