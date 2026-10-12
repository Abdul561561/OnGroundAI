import json
import logging
from contextlib import asynccontextmanager
from typing import Optional
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import connect_to_mongo, close_mongo_connection, get_db
from app.routes.auth import router as auth_router
from app.routes.ai import router as ai_router
from app.routes.calls import router as calls_router
from app.services.auth_service import decode_token
from app.services.signaling_service import manager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("onground_ai")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting OnGround AI Backend Service...")
    await connect_to_mongo()
    yield
    logger.info("Shutting down OnGround AI Backend Service...")
    await close_mongo_connection()

app = FastAPI(
    title="OnGround AI — Voice & Text Intelligence Platform",
    description="Full-stack AI platform providing Text AI, Voice AI, WebRTC calling, and AI conversation intelligence.",
    version="1.0.0",
    lifespan=lifespan
)

# CORS configuration
allowed_origins = [
    settings.FRONTEND_ORIGIN,
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(auth_router)
app.include_router(ai_router)
app.include_router(calls_router)

@app.get("/api/health")
async def health_check():
    db = get_db()
    db_status = "connected"
    if db is None:
        db_status = "disconnected"
    else:
        try:
            await db.command("ping")
        except Exception:
            db_status = "error"

    return {
        "status": "healthy",
        "service": "OnGround AI API",
        "database": {
            "name": settings.MONGODB_DATABASE,
            "status": db_status
        },
        "ai": {
            "provider": "OpenRouter",
            "model": settings.OPENROUTER_MODEL,
            "configured": bool(settings.OPENROUTER_API_KEY)
        },
        "realtime": {
            "signaling": "WebSocket",
            "active_users": len(manager.get_online_user_ids())
        }
    }

@app.get("/api/info/limitations")
async def platform_limitations():
    return {
        "platform": "OnGround AI — Voice & Text Intelligence",
        "telephony_notice": (
            "Transparent Telephony Limitation: WebRTC calls are browser-to-browser peer connections "
            "between authenticated users of this application. Calling standard PSTN telephone numbers "
            "(mobile/landlines) requires paid telephony trunking/carrier providers (such as Twilio/SIP trunk) "
            "and is not simulated or faked. All in-app calls use authentic live WebRTC audio streams."
        ),
        "speech_notice": (
            "Speech recognition and synthesis utilize native browser Web Speech APIs. "
            "Supported best on Chrome, Edge, and Chromium-based browsers. On unsupported browsers, "
            "speech recognition availability is clearly reported."
        ),
        "turn_notice": (
            "WebRTC uses Google STUN servers for NAT traversal. For restrictive symmetric NAT networks, "
            "a configured TURN server is recommended."
        )
    }

# ----------------- WebSocket Signaling Endpoint -----------------

@app.websocket("/ws/signaling")
async def websocket_signaling_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(None)
):
    """
    Secure WebSocket signaling endpoint for WebRTC peer-to-peer audio calls.
    Validates JWT token on connection to prevent user impersonation.
    """
    if not token:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Token required")
        return

    try:
        payload = decode_token(token)
        user_id = payload.get("sub")
        user_name = payload.get("name", "User")
        if not user_id:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid token payload")
            return
    except Exception as e:
        logger.warning("Signaling WebSocket rejected: invalid token: %s", e)
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Authentication failed")
        return

    # Accept connection and track presence
    await manager.connect(user_id, websocket)

    # Send initial connection acknowledgment with online users
    try:
        await websocket.send_text(json.dumps({
            "type": "signaling_ready",
            "user_id": user_id,
            "online_users": list(manager.get_online_user_ids())
        }))
    except Exception:
        pass

    try:
        while True:
            text_data = await websocket.receive_text()
            try:
                data = json.loads(text_data)
                # Dispatch message with verified identity
                await manager.handle_signaling_message(user_id, user_name, data)
            except json.JSONDecodeError:
                logger.warning("Received invalid JSON on signaling socket from %s", user_id)
            except Exception as ex:
                logger.error("Error processing signaling message: %s", ex)
    except WebSocketDisconnect:
        await manager.disconnect(user_id, websocket)
    except Exception as e:
        logger.warning("WebSocket exception for user %s: %s", user_id, e)
        await manager.disconnect(user_id, websocket)
