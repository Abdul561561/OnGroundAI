import json
import logging
from typing import Dict, Set, Any, Optional
from fastapi import WebSocket

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        # Maps user_id -> set of active WebSocket instances
        self.active_connections: Dict[str, Set[WebSocket]] = {}
        # Maps user_id -> current active call_id
        self.user_active_calls: Dict[str, str] = {}
        # Maps call_id -> dict of call participants {caller_id, recipient_id}
        self.active_call_sessions: Dict[str, Dict[str, str]] = {}

    async def connect(self, user_id: str, websocket: WebSocket):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = set()
        self.active_connections[user_id].add(websocket)
        logger.info("User %s connected to signaling. Total active devices: %d", user_id, len(self.active_connections[user_id]))
        # Broadcast presence change to other users
        await self.broadcast_presence(user_id, is_online=True)

    async def disconnect(self, user_id: str, websocket: WebSocket):
        if user_id in self.active_connections:
            self.active_connections[user_id].discard(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]
                logger.info("User %s disconnected entirely.", user_id)
                await self.broadcast_presence(user_id, is_online=False)

        # If user was in an active call, notify peer and update DB
        active_call_id = self.user_active_calls.pop(user_id, None)
        if active_call_id and active_call_id in self.active_call_sessions:
            session = self.active_call_sessions[active_call_id]
            peer_id = session["recipient_id"] if session["caller_id"] == user_id else session["caller_id"]
            if peer_id in self.user_active_calls:
                del self.user_active_calls[peer_id]
            del self.active_call_sessions[active_call_id]

            await self.send_personal_message(
                peer_id,
                {
                    "type": "call_ended",
                    "call_id": active_call_id,
                    "reason": "Peer disconnected unexpectedly",
                }
            )

            # Finalize call record in MongoDB to avoid orphaned status
            try:
                from app.database import get_db
                from datetime import datetime, timezone
                db = get_db()
                if db is not None:
                    now_iso = datetime.now(timezone.utc).isoformat()
                    await db.calls.update_one(
                        {"_id": active_call_id, "ended_at": None},
                        {"$set": {"status": "ended", "ended_at": now_iso}}
                    )
            except Exception as e:
                logger.warning("Error finalizing call on disconnect: %s", e)

    def is_user_online(self, user_id: str) -> bool:
        return user_id in self.active_connections and len(self.active_connections[user_id]) > 0

    def get_online_user_ids(self) -> Set[str]:
        return set(self.active_connections.keys())

    async def send_personal_message(self, user_id: str, message: Dict[str, Any]):
        """Send message to all sockets for a given user."""
        if user_id in self.active_connections:
            dead_sockets = set()
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_text(json.dumps(message))
                except Exception as e:
                    logger.warning("Error sending message to user %s: %s", user_id, e)
                    dead_sockets.add(connection)
            for dead in dead_sockets:
                self.active_connections[user_id].discard(dead)

    async def broadcast_presence(self, user_id: str, is_online: bool):
        """Notify all connected clients about user presence."""
        msg = {
            "type": "presence_update",
            "user_id": user_id,
            "is_online": is_online
        }
        for uid in list(self.active_connections.keys()):
            if uid != user_id:
                await self.send_personal_message(uid, msg)

    async def handle_signaling_message(self, sender_id: str, sender_name: str, data: Dict[str, Any]):
        """
        Validate message authenticity and route signaling messages:
        - call_offer: caller -> recipient with SDP offer
        - call_answer: recipient -> caller with SDP answer
        - ice_candidate: peer -> peer with ICE candidate
        - call_reject: recipient -> caller
        - call_end: participant -> peer
        """
        msg_type = data.get("type")
        target_id = data.get("target_id")
        call_id = data.get("call_id")

        if not msg_type:
            return

        if msg_type == "call_offer":
            if not target_id:
                return

            if not self.is_user_online(target_id):
                await self.send_personal_message(
                    sender_id,
                    {
                        "type": "call_failed",
                        "call_id": call_id,
                        "reason": "Recipient is currently offline",
                    }
                )
                return

            # Check if recipient is already in another call
            if target_id in self.user_active_calls:
                await self.send_personal_message(
                    sender_id,
                    {
                        "type": "call_busy",
                        "call_id": call_id,
                        "reason": "Recipient is currently on another call",
                    }
                )
                return

            # Register call session
            self.user_active_calls[sender_id] = call_id
            self.user_active_calls[target_id] = call_id
            self.active_call_sessions[call_id] = {
                "caller_id": sender_id,
                "recipient_id": target_id,
            }

            # Forward offer to recipient with verified sender identity
            await self.send_personal_message(
                target_id,
                {
                    "type": "incoming_call",
                    "call_id": call_id,
                    "caller_id": sender_id,
                    "caller_name": sender_name,
                    "sdp": data.get("sdp"),
                    "call_type": data.get("call_type", "audio")
                }
            )

        elif msg_type in ("call_answer", "call_accepted"):
            if not target_id:
                return
            # Forward answer to caller
            await self.send_personal_message(
                target_id,
                {
                    "type": "call_accepted",
                    "call_id": call_id,
                    "recipient_id": sender_id,
                    "sdp": data.get("sdp")
                }
            )

        elif msg_type == "ice_candidate":
            if not target_id:
                return
            # Forward ICE candidate to peer
            await self.send_personal_message(
                target_id,
                {
                    "type": "ice_candidate",
                    "call_id": call_id,
                    "candidate": data.get("candidate"),
                    "sender_id": sender_id
                }
            )

        elif msg_type == "call_reject":
            if call_id in self.active_call_sessions:
                session = self.active_call_sessions.pop(call_id)
                self.user_active_calls.pop(session["caller_id"], None)
                self.user_active_calls.pop(session["recipient_id"], None)

            if target_id:
                await self.send_personal_message(
                    target_id,
                    {
                        "type": "call_rejected",
                        "call_id": call_id,
                        "recipient_id": sender_id,
                        "reason": data.get("reason", "Call declined by recipient")
                    }
                )

        elif msg_type == "call_end":
            if call_id in self.active_call_sessions:
                session = self.active_call_sessions.pop(call_id)
                self.user_active_calls.pop(session["caller_id"], None)
                self.user_active_calls.pop(session["recipient_id"], None)
                peer_id = session["recipient_id"] if session["caller_id"] == sender_id else session["caller_id"]
                await self.send_personal_message(
                    peer_id,
                    {
                        "type": "call_ended",
                        "call_id": call_id,
                        "sender_id": sender_id,
                        "reason": data.get("reason", "Call ended by peer")
                    }
                )
            elif target_id:
                await self.send_personal_message(
                    target_id,
                    {
                        "type": "call_ended",
                        "call_id": call_id,
                        "sender_id": sender_id,
                        "reason": data.get("reason", "Call ended")
                    }
                )

manager = ConnectionManager()
