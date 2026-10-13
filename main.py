"""
Root entrypoint for Render and cloud web services.
Exposes the FastAPI application 'app' when Root Directory is set to repo root.
"""
import sys
from pathlib import Path

# Add backend directory to sys.path so 'app' and its modules resolve
backend_dir = Path(__file__).resolve().parent / "backend"
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.main import app  # noqa: F401
