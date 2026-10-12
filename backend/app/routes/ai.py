import json
import uuid
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends
from app.database import get_db
from app.models.schemas import (
    ChatRequest,
    ChatResponse,
    ConversationCreate,
    ConversationResponse,
    MessageResponse,
    AgentAssistRequest,
    AgentAssistResponse
)
from app.services.auth_service import get_current_user
from app.services.ai_service import AIService

logger = logging.getLogger("onground_ai.ai")

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
            conversation_id = None

    if not conversation_id:
        conversation_id = str(uuid.uuid4())
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

    # Grounding system prompt
    sys_prompt = "You are OnGround AI, an intelligent call centre intelligence assistant."
    if req.type == "voice_ai":
        sys_prompt = (
            "You are OnGround Voice AI, a real-time conversational spoken assistant. "
            "Keep your responses direct, natural, and concise (1 to 3 spoken sentences). "
            "Avoid formatting, markdown tables, or bullet lists so your response sounds fluid when spoken."
        )

    # Ground in CRM Customer context if contact_id is provided
    if req.contact_id:
        contact = await db.contacts.find_one({"_id": req.contact_id})
        if contact:
            recent_calls_cursor = db.calls.find({
                "$or": [{"contact_id": req.contact_id}, {"recipient_number": contact["phone_number"]}]
            }).sort("started_at", -1).limit(3)
            recent_calls = await recent_calls_cursor.to_list(length=3)
            call_notes = "; ".join([
                f"{c.get('started_at', '')[:10]}: outcome={c.get('outcome', 'none')}, notes={c.get('notes', 'none')}"
                for c in recent_calls
            ])
            sys_prompt += (
                f"\n\nCUSTOMER CONTEXT:\nName: {contact['name']}\nPhone: {contact['phone_number']}\n"
                f"Status: {contact.get('status')}\nAccount Notes: {contact.get('notes')}\n"
                f"Recent Interaction History: {call_notes or 'No previous recorded calls'}"
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

@router.post("/agent-assist", response_model=AgentAssistResponse)
async def generate_agent_assist(
    req: AgentAssistRequest,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Real-time Copilot for Call Centre Agents.
    Analyzes live customer statement/transcript, extracts key needs, suggests immediate reply and follow-ups.
    """
    db = get_db()

    crm_info = ""
    if req.contact_id and db is not None:
        contact = await db.contacts.find_one({"_id": req.contact_id})
        if contact:
            crm_info = f"Customer Profile: {contact['name']} ({contact['phone_number']}), Status: {contact.get('status')}, History: {contact.get('notes', '')}."

    system_instruction = (
        "You are an expert real-time Call Centre Copilot for front-line support and sales agents. "
        "Analyze the customer's statement and return a strict JSON object with these exact keys:\n"
        "- recommended_reply: concise, professional, empathetic spoken answer for the agent to say immediately (max 2 sentences)\n"
        "- extracted_needs: array of 1-3 concise strings identifying the core customer need or objection\n"
        "- action_items: array of 1-3 actionable follow-up items for the agent\n"
        "- suggested_outcome: one of ['interested', 'callback_requested', 'voicemail', 'resolved', 'escalated', 'completed']\n\n"
        "Return ONLY the JSON object, with no markdown code blocks or additional text."
    )

    user_prompt = f"Customer Query: \"{req.customer_query}\"\n"
    if req.context:
        user_prompt += f"Recent Dialogue Context: {req.context}\n"
    if crm_info:
        user_prompt += f"CRM Context: {crm_info}\n"

    ai_res = await AIService.generate_response(
        messages=[{"role": "user", "content": user_prompt}],
        system_prompt=system_instruction
    )

    raw_text = ai_res.get("content", "").strip()

    # Parse JSON
    try:
        # Strip potential markdown code fences ```json ... ```
        cleaned = raw_text
        if cleaned.startswith("```"):
            lines = cleaned.split("\n")
            if lines[0].startswith("```"):
                lines = lines[1:]
            if lines and lines[-1].startswith("```"):
                lines = lines[:-1]
            cleaned = "\n".join(lines).strip()

        data = json.loads(cleaned)
        return AgentAssistResponse(
            recommended_reply=data.get("recommended_reply", "I understand your concern and am looking into that right away."),
            extracted_needs=data.get("extracted_needs", ["Assistance needed"]),
            action_items=data.get("action_items", ["Verify account details", "Follow up with customer"]),
            suggested_outcome=data.get("suggested_outcome", "resolved")
        )
    except Exception as e:
        logger.warning("Failed to parse agent assist JSON: %s. Raw text: %s", e, raw_text)
        return AgentAssistResponse(
            recommended_reply=raw_text[:200] if raw_text else "I understand your request. Let me help you with that right away.",
            extracted_needs=["Customer support inquiry"],
            action_items=["Document inquiry details", "Review customer requirements"],
            suggested_outcome="completed"
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
