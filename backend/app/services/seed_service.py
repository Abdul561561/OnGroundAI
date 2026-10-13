import uuid
import logging
from datetime import datetime, timezone
from typing import Dict, Any, List
from motor.motor_asyncio import AsyncIOMotorDatabase
from app.services.auth_service import hash_password

logger = logging.getLogger(__name__)

DEFAULT_DEMO_USERS = [
    {
        "email": "alice@onground.ai",
        "name": "Agent Alice",
        "role": "agent",
        "default_password": "Password123!"
    },
    {
        "email": "bob@onground.ai",
        "name": "Agent Bob",
        "role": "agent",
        "default_password": "Password123!"
    },
    {
        "email": "agent@onground.ai",
        "name": "Sarah Jenkins (Agent)",
        "role": "agent",
        "default_password": "Password123!"
    },
    {
        "email": "supervisor.hq@onground.ai",
        "name": "Sarah Connor (Supervisor)",
        "role": "supervisor",
        "default_password": "Password123!"
    }
]

async def seed_demo_users(db: AsyncIOMotorDatabase) -> Dict[str, Any]:
    """
    Safely and idempotently initializes demo staff accounts in the target MongoDB database.
    - If a user already exists: SKIPS them and NEVER overwrites or resets their existing password.
    - If a user is missing: creates their record with proper bcrypt password hash and role.
    """
    results: List[Dict[str, str]] = []
    created_count = 0
    skipped_count = 0

    now_iso = datetime.now(timezone.utc).isoformat()

    for demo in DEFAULT_DEMO_USERS:
        normalized_email = demo["email"].strip().lower()
        existing = await db.users.find_one({"email": normalized_email})

        if existing:
            skipped_count += 1
            # If the user exists but lacks a role attribute, safely patch only the role without touching password
            if not existing.get("role"):
                await db.users.update_one(
                    {"_id": existing["_id"]},
                    {"$set": {"role": demo["role"]}}
                )
            results.append({
                "email": normalized_email,
                "name": demo["name"],
                "role": existing.get("role") or demo["role"],
                "status": "skipped",
                "reason": "Account already exists; preserved existing credentials."
            })
            logger.info("Demo user seed: %s already exists, preserved credentials.", normalized_email)
        else:
            created_count += 1
            user_id = str(uuid.uuid4())
            pwd_hash = hash_password(demo["default_password"])
            doc = {
                "_id": user_id,
                "name": demo["name"],
                "email": normalized_email,
                "password_hash": pwd_hash,
                "role": demo["role"],
                "created_at": now_iso,
                "status": "available",
            }
            await db.users.insert_one(doc)
            results.append({
                "email": normalized_email,
                "name": demo["name"],
                "role": demo["role"],
                "status": "created",
                "reason": "Created standard demo account."
            })
            logger.info("Demo user seed: %s created successfully.", normalized_email)

    return {
        "total_checked": len(DEFAULT_DEMO_USERS),
        "created_count": created_count,
        "skipped_count": skipped_count,
        "details": results
    }
