#!/usr/bin/env python3
"""
OnGround AI - Safe Demo User Initialization Script
Run this script locally or in your deployment environment to ensure the standard
demo accounts exist in MongoDB without overwriting existing accounts or passwords.

Usage:
  python scripts/seed_demo_users.py
"""

import sys
import asyncio
from pathlib import Path

# Add backend directory to path
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.config import settings
from app.database import connect_to_mongo, db_manager
from app.services.seed_service import seed_demo_users

async def main():
    print("=================================================================")
    print("   OnGround AI — Demo User Initialization")
    print("=================================================================")
    print(f"Target Database: {settings.MONGODB_DATABASE}")
    
    connected = await connect_to_mongo()
    if not connected or db_manager.db is None:
        print("[ERROR] Could not connect to MongoDB Atlas.")
        print("Please verify MONGODB_URI in .env and verify MongoDB Atlas Network Access permits your IP or 0.0.0.0/0.")
        sys.exit(1)

    print("[INFO] Connected to MongoDB Atlas. Checking demo staff accounts...")
    res = await seed_demo_users(db_manager.db)

    print("\nInitialization Results:")
    print(f" - Accounts checked: {res['total_checked']}")
    print(f" - Newly created:    {res['created_count']}")
    print(f" - Already existed:  {res['skipped_count']} (credentials preserved intact)")

    print("\nAccount Details:")
    for detail in res["details"]:
        status_tag = "[CREATED]" if detail["status"] == "created" else "[PRESERVED]"
        print(f" {status_tag} {detail['email']} ({detail['name']} - Role: {detail['role']})")

    print("\nStandard Demo Passwords (if created):")
    print(" - alice@onground.ai     -> Password123!")
    print(" - bob@onground.ai       -> Password123!")
    print(" - agent@onground.ai     -> Password123!")
    print(" - supervisor.hq@onground.ai -> Password123!")
    print("\n[SUCCESS] Initialization finished cleanly.")

if __name__ == "__main__":
    asyncio.run(main())
