import logging
from typing import List, Dict, Any, Optional
import httpx
from fastapi import HTTPException
from app.config import settings

logger = logging.getLogger(__name__)

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODELS_URL = "https://openrouter.ai/api/v1/models"

class AIService:
    @staticmethod
    def get_headers() -> Dict[str, str]:
        return {
            "Authorization": f"Bearer {settings.OPENROUTER_API_KEY}",
            "Content-Type": "application/json",
            "HTTP-Referer": settings.FRONTEND_ORIGIN,
            "X-Title": "OnGround AI - Voice and Text Intelligence",
        }

    @classmethod
    async def get_grounding_context(cls) -> str:
        """Fetch knowledge base articles to ground AI answers in company policy."""
        try:
            from app.database import get_db
            db = get_db()
            if db is not None:
                docs = await db.knowledge_base.find({}).to_list(5)
                if docs:
                    snippets = [f"- {d['title']} ({d['category']}): {d['content']}" for d in docs]
                    return "\n\n### Company Knowledge Base & Policies:\n" + "\n".join(snippets)
        except Exception as e:
            logger.warning("Could not fetch knowledge base grounding: %s", e)
        return ""

    @classmethod
    async def generate_response(
        cls,
        messages: List[Dict[str, str]],
        model: Optional[str] = None,
        max_tokens: int = 800,
        temperature: float = 0.7,
        system_prompt: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Send conversational messages to OpenRouter and return generated text.
        Includes error handling, timeouts, and fallback to openrouter/auto.
        """
        selected_model = model or settings.OPENROUTER_MODEL or "openrouter/auto"

        grounding = await cls.get_grounding_context()
        formatted_messages = []
        if system_prompt:
            formatted_messages.append({"role": "system", "content": system_prompt + grounding})
        else:
            default_sys = (
                "You are OnGround AI, an intelligent, empathetic, and professional voice and text "
                "contact centre assistant. Provide clear, direct, and helpful responses grounded in company knowledge. "
                "For voice interactions, keep responses conversational and concise (2-4 sentences) so they "
                "sound natural when spoken. If the customer asks to speak with a human agent or supervisor, acknowledge "
                "their request warmly and let them know you are transferring them to a live specialist."
            )
            formatted_messages.append({"role": "system", "content": default_sys + grounding})

        formatted_messages.extend(messages)

        headers = cls.get_headers()
        payload = {
            "model": selected_model,
            "messages": formatted_messages,
            "max_tokens": max_tokens,
            "temperature": temperature,
        }

        async with httpx.AsyncClient(timeout=45.0) as client:
            try:
                response = await client.post(OPENROUTER_URL, json=payload, headers=headers)
                
                # If specific model fails (e.g. 404/429), attempt fallback to openrouter/auto
                if response.status_code != 200 and selected_model != "openrouter/auto":
                    logger.warning(
                        "Model '%s' returned status %d. Falling back to 'openrouter/auto'...",
                        selected_model,
                        response.status_code
                    )
                    payload["model"] = "openrouter/auto"
                    response = await client.post(OPENROUTER_URL, json=payload, headers=headers)
                    selected_model = "openrouter/auto"

                if response.status_code == 200:
                    data = response.json()
                    choices = data.get("choices", [])
                    if choices and len(choices) > 0:
                        content = choices[0].get("message", {}).get("content", "")
                        return {
                            "content": content,
                            "model_used": selected_model,
                            "usage": data.get("usage", {}),
                        }
                    raise HTTPException(
                        status_code=502,
                        detail="OpenRouter returned an empty response choices list."
                    )
                elif response.status_code == 429:
                    raise HTTPException(
                        status_code=429,
                        detail="OpenRouter rate limit reached. Please wait a few seconds and retry."
                    )
                elif response.status_code == 401:
                    raise HTTPException(
                        status_code=500,
                        detail="OpenRouter authentication failed. Please verify API key."
                    )
                else:
                    err_msg = response.text
                    try:
                        err_json = response.json()
                        err_msg = err_json.get("error", {}).get("message", err_msg)
                    except Exception:
                        pass
                    raise HTTPException(
                        status_code=response.status_code,
                        detail=f"OpenRouter API error ({response.status_code}): {err_msg}"
                    )

            except httpx.TimeoutException:
                logger.error("OpenRouter request timed out.")
                raise HTTPException(
                    status_code=504,
                    detail="OpenRouter request timed out. Please try again."
                )
            except httpx.RequestError as exc:
                logger.error("Network error communicating with OpenRouter: %s", exc)
                raise HTTPException(
                    status_code=503,
                    detail=f"Network error connecting to OpenRouter: {str(exc)}"
                )

    @classmethod
    async def generate_call_summary(
        cls,
        transcript_text: str,
        call_type: str = "call"
    ) -> str:
        """Alias for summarize_transcript."""
        return await cls.summarize_transcript(transcript_text, call_type)

    @classmethod
    async def summarize_transcript(
        cls,
        transcript_text: str,
        call_type: str = "call"
    ) -> str:
        """Generate an AI summary of a call or conversation transcript."""
        if not transcript_text.strip():
            return "No transcript content available for summarization."

        prompt = (
            f"Please generate a concise, professional call summary and key action items "
            f"for the following {call_type} transcript:\n\n"
            f"{transcript_text}\n\n"
            f"Format as:\n"
            f"### Executive Summary\n<brief overview>\n\n"
            f"### Key Topics Discussed\n<bullet points>\n\n"
            f"### Action Items\n<bullet points>"
        )

        messages = [{"role": "user", "content": prompt}]
        try:
            result = await cls.generate_response(
                messages=messages,
                max_tokens=600,
                temperature=0.3,
                system_prompt="You are a professional call intelligence analyzer. Summarize dialogue accurately."
            )
            return result.get("content", "Unable to generate summary.")
        except Exception as e:
            logger.error("Failed to generate summary: %s", e)
            return f"Summary generation failed: {str(e)}"

    @classmethod
    async def fetch_available_models(cls) -> List[Dict[str, Any]]:
        """Fetch free models available on OpenRouter."""
        headers = cls.get_headers()
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                resp = await client.get(MODELS_URL, headers=headers)
                if resp.status_code == 200:
                    data = resp.json().get("data", [])
                    free_models = []
                    # Always include auto
                    free_models.append({
                        "id": "openrouter/auto",
                        "name": "Auto Free Routing (Recommended)",
                        "context_length": 8192
                    })
                    for m in data:
                        pricing = m.get("pricing", {})
                        if pricing.get("prompt") == "0" and pricing.get("completion") == "0":
                            free_models.append({
                                "id": m["id"],
                                "name": m.get("name", m["id"]),
                                "context_length": m.get("context_length", 4096)
                            })
                    return free_models
        except Exception as e:
            logger.warning("Could not fetch models dynamically: %s", e)

        # Fallback default list
        return [
            {"id": "openrouter/auto", "name": "Auto Free Routing (Recommended)", "context_length": 8192},
            {"id": "nvidia/nemotron-3.5-lightning:free", "name": "Nemotron 3.5 Lightning Free", "context_length": 4096},
            {"id": "liquid/lfm-2.5-2.6b:free", "name": "Liquid LFM 2.5 Free", "context_length": 4096},
        ]
