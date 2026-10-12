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

for p in env_paths:
    if p.exists():
        load_dotenv(p)
        break

class Settings:
    MONGODB_URI: str = os.getenv("MONGODB_URI", "")
    MONGODB_DATABASE: str = os.getenv("MONGODB_DATABASE", "onground_ai")
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
    OPENROUTER_MODEL: str = os.getenv("OPENROUTER_MODEL", "openrouter/auto")
    FRONTEND_ORIGIN: str = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
    JWT_SECRET: str = os.getenv("JWT_SECRET", "onground_ai_jwt_secret_key_prod_2026_secure")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

settings = Settings()
