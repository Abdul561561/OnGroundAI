"""Telephony adapter package for OnGround AI Intelligent Call Centre."""
from app.telephony.base import TelephonyProvider
from app.telephony.manager import get_telephony_provider

__all__ = ["TelephonyProvider", "get_telephony_provider"]
