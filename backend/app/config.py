import os
from pathlib import Path
from dotenv import load_dotenv

# Try loading .env from current directory, backend directory, or project root
current_file = Path(__file__).resolve()
backend_dir = current_file.parent.parent
root_dir = backend_dir.parent

env_paths = [
    backend_dir / ".env",
    root_dir / ".env",
    Path(".env"),
]

ACTIVE_ENV_PATH: Path | None = None
for p in env_paths:
    if p.exists():
        load_dotenv(p)
        ACTIVE_ENV_PATH = p
        break


def get_active_env_mtime() -> float | None:
    if ACTIVE_ENV_PATH and ACTIVE_ENV_PATH.exists():
        try:
            return ACTIVE_ENV_PATH.stat().st_mtime
        except OSError:
            return None
    return None


class Settings:
    MONGODB_URI: str = os.getenv("MONGODB_URI", "")
    MONGODB_DATABASE: str = os.getenv("MONGODB_DATABASE", "onground_ai")
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
    OPENROUTER_MODEL: str = os.getenv("OPENROUTER_MODEL", "openrouter/auto")
    FRONTEND_ORIGIN: str = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "onground_ai_jwt_secret_key_prod_2026_secure")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

    # Carrier & Telephony Configuration
    TELEPHONY_PROVIDER: str = (os.getenv("TELEPHONY_PROVIDER") or "auto").strip().lower()
    TWILIO_ACCOUNT_SID: str = (os.getenv("TWILIO_ACCOUNT_SID") or "").strip()
    TWILIO_AUTH_TOKEN: str = (os.getenv("TWILIO_AUTH_TOKEN") or "").strip()
    TWILIO_PHONE_NUMBER: str = (os.getenv("TWILIO_PHONE_NUMBER") or "").strip()
    TWILIO_TWIML_APP_SID: str = (os.getenv("TWILIO_TWIML_APP_SID") or "").strip()
    TWILIO_API_KEY_SID: str = (os.getenv("TWILIO_API_KEY_SID") or "").strip()
    TWILIO_API_KEY_SECRET: str = (os.getenv("TWILIO_API_KEY_SECRET") or "").strip()
    PUBLIC_BASE_URL: str = (os.getenv("PUBLIC_BASE_URL") or os.getenv("RENDER_EXTERNAL_URL") or "http://localhost:8000").strip().rstrip("/")

    def reload_from_env(self) -> None:
        """Reload configuration from the active .env file when updated on disk."""
        if ACTIVE_ENV_PATH and ACTIVE_ENV_PATH.exists():
            load_dotenv(ACTIVE_ENV_PATH, override=True)
        self.FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
        self.TELEPHONY_PROVIDER = (os.getenv("TELEPHONY_PROVIDER") or "auto").strip().lower()
        self.TWILIO_ACCOUNT_SID = (os.getenv("TWILIO_ACCOUNT_SID") or "").strip()
        self.TWILIO_AUTH_TOKEN = (os.getenv("TWILIO_AUTH_TOKEN") or "").strip()
        self.TWILIO_PHONE_NUMBER = (os.getenv("TWILIO_PHONE_NUMBER") or "").strip()
        self.TWILIO_TWIML_APP_SID = (os.getenv("TWILIO_TWIML_APP_SID") or "").strip()
        self.TWILIO_API_KEY_SID = (os.getenv("TWILIO_API_KEY_SID") or "").strip()
        self.TWILIO_API_KEY_SECRET = (os.getenv("TWILIO_API_KEY_SECRET") or "").strip()
        self.PUBLIC_BASE_URL = (os.getenv("PUBLIC_BASE_URL") or os.getenv("RENDER_EXTERNAL_URL") or "http://localhost:8000").strip().rstrip("/")


settings = Settings()

