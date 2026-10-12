import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends
from app.database import get_db
from app.models.schemas import (
    ChatRequest,
    ChatResponse,
    ConversationCreate,
    ConversationResponse,
    MessageResponse
)
from app.services.auth_service import get_current_user
from app.services.ai_service import AIService

router = APIRouter(prefix="/api/ai", tags=["AI Intelligence"])

@router.post("/chat", response_model=ChatResponse)
async def chat_completion(
    req: ChatRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    now_iso = datetime.now(timezone.utc).isoformat()
    conversation_id = req.conversation_id

    # 1. Ensure conversation exists or create new
    if conversation_id:
        conversation = await db.conversations.find_one({
            "_id": conversation_id,
            "user_id": current_user["_id"]
        })
        if not conversation:
            # If invalid ID provided, start a new one
            conversation_id = None

    is_new_conversation = False
    if not conversation_id:
        is_new_conversation = True
        conversation_id = str(uuid.uuid4())
        # Use first 35 chars of user message as initial title
        preview_title = req.message.strip()[:35] + ("..." if len(req.message.strip()) > 35 else "")
        conv_doc = {
            "_id": conversation_id,
            "user_id": current_user["_id"],
            "type": req.type,
            "title": preview_title or "New Conversation",
            "created_at": now_iso,
            "updated_at": now_iso,
        }
        await db.conversations.insert_one(conv_doc)

    # 2. Save user message to database
    user_msg_id = str(uuid.uuid4())
    user_msg_doc = {
        "_id": user_msg_id,
        "conversation_id": conversation_id,
        "role": "user",
        "content": req.message.strip(),
        "created_at": now_iso,
    }
    await db.messages.insert_one(user_msg_doc)

    # 3. Retrieve conversation history for context (up to last 15 messages)
    history_cursor = db.messages.find(
        {"conversation_id": conversation_id}
    ).sort("created_at", 1).limit(15)
    history_docs = await history_cursor.to_list(length=15)

    context_messages = [
        {"role": m["role"], "content": m["content"]}
        for m in history_docs
    ]

    # Special prompt tuning for Voice AI
    sys_prompt = None
    if req.type == "voice_ai":
        sys_prompt = (
            "You are OnGround Voice AI, a real-time spoken intelligence assistant. "
            "Keep your responses direct, natural, and concise (1 to 3 spoken sentences). "
            "Avoid formatting, markdown tables, or bullet lists so your response sounds fluid when spoken."
        )

    # 4. Generate AI response via OpenRouter
    ai_result = await AIService.generate_response(
        messages=context_messages,
        model=req.model,
        system_prompt=sys_prompt
    )

    ai_content = ai_result.get("content", "").strip()
    model_used = ai_result.get("model_used", "openrouter/auto")

    # 5. Save AI response to database
    ai_now_iso = datetime.now(timezone.utc).isoformat()
    ai_msg_id = str(uuid.uuid4())
    ai_msg_doc = {
        "_id": ai_msg_id,
        "conversation_id": conversation_id,
        "role": "assistant",
        "content": ai_content,
        "created_at": ai_now_iso,
    }
    await db.messages.insert_one(ai_msg_doc)

    # 6. Update conversation timestamp
    await db.conversations.update_one(
        {"_id": conversation_id},
        {"$set": {"updated_at": ai_now_iso}}
    )

    return ChatResponse(
        conversation_id=conversation_id,
        user_message=MessageResponse(
            _id=user_msg_id,
            conversation_id=conversation_id,
            role="user",
            content=user_msg_doc["content"],
            created_at=user_msg_doc["created_at"]
        ),
        ai_message=MessageResponse(
            _id=ai_msg_id,
            conversation_id=conversation_id,
            role="assistant",
            content=ai_msg_doc["content"],
            created_at=ai_msg_doc["created_at"]
        ),
        model_used=model_used
    )

@router.get("/conversations", response_model=List[ConversationResponse])
async def get_conversations(
    type: Optional[str] = None,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    query: Dict[str, Any] = {"user_id": current_user["_id"]}
    if type:
        query["type"] = type

    cursor = db.conversations.find(query).sort("updated_at", -1).limit(50)
    conv_list = await cursor.to_list(length=50)

    result = []
    for c in conv_list:
        msg_count = await db.messages.count_documents({"conversation_id": c["_id"]})
        result.append(ConversationResponse(
            _id=c["_id"],
            user_id=c["user_id"],
            type=c.get("type", "text_ai"),
            title=c.get("title", "Conversation"),
            created_at=c.get("created_at", ""),
            updated_at=c.get("updated_at", ""),
            message_count=msg_count
        ))

    return result

@router.get("/conversations/{conversation_id}/messages", response_model=List[MessageResponse])
async def get_conversation_messages(
    conversation_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    conv = await db.conversations.find_one({
        "_id": conversation_id,
        "user_id": current_user["_id"]
    })
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    cursor = db.messages.find({"conversation_id": conversation_id}).sort("created_at", 1)
    msgs = await cursor.to_list(length=200)

    return [
        MessageResponse(
            _id=m["_id"],
            conversation_id=m["conversation_id"],
            role=m["role"],
            content=m["content"],
            created_at=m["created_at"]
        )
        for m in msgs
    ]

@router.delete("/conversations/{conversation_id}")
async def delete_conversation(
    conversation_id: str,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    conv = await db.conversations.find_one({
        "_id": conversation_id,
        "user_id": current_user["_id"]
    })
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    await db.conversations.delete_one({"_id": conversation_id})
    await db.messages.delete_many({"conversation_id": conversation_id})
    await db.transcripts.delete_many({"conversation_id": conversation_id})

    return {"status": "success", "message": "Conversation deleted."}

@router.get("/models")
async def get_models(current_user: Dict[str, Any] = Depends(get_current_user)):
    models = await AIService.fetch_available_models()
    return {"models": models}
