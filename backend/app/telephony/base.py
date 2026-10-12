from abc import ABC, abstractmethod
from typing import Dict, Any, Optional

class TelephonyProvider(ABC):
    """
    Abstract interface for Telephony Carriers (e.g., Twilio, Telnyx, SIP trunk, Unconfigured).
    Ensures modularity and strict honesty about carrier capabilities.
    """

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """Name of the telephony provider (e.g. 'twilio', 'unconfigured')."""
        pass

    @property
    @abstractmethod
    def is_configured(self) -> bool:
        """Whether a genuine external carrier is fully configured with credentials."""
        pass

    @abstractmethod
    async def get_status(self) -> Dict[str, Any]:
        """Return provider configuration status and diagnostics."""
        pass

    @abstractmethod
    async def initiate_outbound_call(
        self,
        to_number: str,
        agent_id: str,
        agent_name: str,
        contact_id: Optional[str] = None,
        notes: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Place a genuine outbound telephone call to an ordinary phone number.
        Returns call session details or raises an informative error if unconfigured.
        """
        pass

    @abstractmethod
    async def terminate_call(self, call_id: str) -> Dict[str, Any]:
        """Hang up an active telephone call."""
        pass

    @abstractmethod
    async def generate_client_token(self, identity: str) -> Dict[str, Any]:
        """
        Generate browser softphone authorization token (e.g., Twilio Voice Access Token).
        """
        pass

    @abstractmethod
    async def handle_voice_webhook(self, form_data: Dict[str, Any]) -> str:
        """
        Return instructions (TwiML / XML) when an inbound or outbound call connects.
        """
        pass

    @abstractmethod
    async def handle_status_callback(self, form_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process carrier call status webhooks (ringing, answered, completed, busy, etc.).
        """
        pass
