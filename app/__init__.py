from pathlib import Path
import sys

backend_dir = Path(__file__).resolve().parent.parent / "backend"
backend_app_dir = backend_dir / "app"

if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

# Extend package search path to include backend/app
__path__.append(str(backend_app_dir))

# Import everything from backend/app/__init__.py if any
