import logging
import certifi
import dns.resolver
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from app.config import settings

logger = logging.getLogger(__name__)

# Configure DNS resolver with reliable nameservers to guarantee fast SRV resolution across all networks
try:
    resolver = dns.resolver.get_default_resolver()
    resolver.nameservers = ['8.8.8.8', '1.1.1.1', '8.8.4.4'] + resolver.nameservers
    resolver.lifetime = 10.0
except Exception as e:
    logger.warning("Could not set custom DNS resolver nameservers: %s", e)

import os

# Fallback URI to ensure high-availability if the primary cluster has IP Whitelist restrictions
BACKUP_MONGO_URI = os.getenv("BACKUP_MONGODB_URI", "")

class DatabaseManager:
    client: AsyncIOMotorClient = None
    db: AsyncIOMotorDatabase = None

db_manager = DatabaseManager()

import asyncio

async def connect_to_mongo():
    primary_uri = settings.MONGODB_URI
    logger.info("Connecting to MongoDB Atlas (database: '%s')...", settings.MONGODB_DATABASE)

    connected = False
    clusters = [
        (BACKUP_MONGO_URI, "Atlas Cluster (Verified)", 25.0),
        (primary_uri, "Primary Cluster", 5.0)
    ]
    for uri, label, to_sec in clusters:
        if not uri:
            continue
        try:
            client = AsyncIOMotorClient(
                uri,
                tlsCAFile=certifi.where(),
                serverSelectionTimeoutMS=int(to_sec * 1000),
                connectTimeoutMS=int(to_sec * 1000)
            )
            await asyncio.wait_for(client.admin.command("ping"), timeout=to_sec)
            db_manager.client = client
            db_manager.db = client[settings.MONGODB_DATABASE]
            logger.info("Successfully connected to MongoDB Atlas (%s) on database '%s'.", label, settings.MONGODB_DATABASE)
            connected = True
            break
        except Exception as e:
            logger.warning(
                "Could not connect to MongoDB Atlas (%s): %s. "
                "Note: If SSL TLS alert occurs, please ensure 0.0.0.0/0 is enabled in MongoDB Atlas Network Access.",
                label,
                e
            )

    if not connected:
        raise RuntimeError("Failed to connect to both primary and backup MongoDB Atlas clusters.")

    # Ensure required indexes
    await _create_indexes()

async def _create_indexes():
    """Create database indexes for performance, search and unique constraints."""
    db = db_manager.db
    if db is None:
        return

    try:
        # Unique email constraint on users
        await db.users.create_index("email", unique=True)
        await db.users.create_index("status")
        await db.users.create_index("role")

        # Contacts (Customer CRM) indexes
        await db.contacts.create_index("phone_number")
        await db.contacts.create_index("name")
        await db.contacts.create_index("assigned_agent_id")
        await db.contacts.create_index("status")
        await db.contacts.create_index("tags")

        # Follow-ups indexes
        await db.follow_ups.create_index("contact_id")
        await db.follow_ups.create_index("assigned_agent_id")
        await db.follow_ups.create_index("status")
        await db.follow_ups.create_index("due_at")

        # Conversations indexes
        await db.conversations.create_index([("user_id", 1), ("updated_at", -1)])
        await db.conversations.create_index("type")

        # Messages indexes
        await db.messages.create_index([("conversation_id", 1), ("created_at", 1)])

        # Calls indexes
        await db.calls.create_index([("caller_user_id", 1), ("created_at", -1)])
        await db.calls.create_index([("recipient_user_id", 1), ("created_at", -1)])
        await db.calls.create_index("contact_id")
        await db.calls.create_index("agent_id")
        await db.calls.create_index("provider_call_id")
        await db.calls.create_index("status")

        # Transcripts indexes
        await db.transcripts.create_index("call_id")
        await db.transcripts.create_index("conversation_id")

        # Knowledge Base indexes
        await db.knowledge_base.create_index("category")
        await db.knowledge_base.create_index("title")

        # Queues indexes
        await db.call_queues.create_index([("status", 1), ("created_at", -1)])
        await db.call_queues.create_index("queue_type")

        # Cases indexes
        await db.cases.create_index([("status", 1), ("created_at", -1)])
        await db.cases.create_index("priority")

        logger.info("MongoDB indexes verified successfully.")
    except Exception as e:
        logger.warning("Error creating MongoDB indexes: %s", e)

async def close_mongo_connection():
    if db_manager.client:
        db_manager.client.close()
        logger.info("MongoDB connection closed.")

def get_db() -> AsyncIOMotorDatabase:
    return db_manager.db
