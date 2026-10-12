import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from app.services.ai_service import AIService
from fastapi import HTTPException

@pytest.mark.asyncio
async def test_ai_generate_response_mocked():
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "choices": [
            {"message": {"content": "This is a real-time response from OpenRouter."}}
        ],
        "usage": {"total_tokens": 42}
    }

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_response
        messages = [{"role": "user", "content": "Hello AI!"}]
        result = await AIService.generate_response(messages=messages, model="openrouter/auto")
        assert result["content"] == "This is a real-time response from OpenRouter."
        assert result["model_used"] == "openrouter/auto"

@pytest.mark.asyncio
async def test_ai_rate_limit_handling():
    mock_response = MagicMock()
    mock_response.status_code = 429
    mock_response.text = "Rate limit exceeded"
    mock_response.json.return_value = {"error": {"message": "Rate limit exceeded"}}

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_response
        messages = [{"role": "user", "content": "Hello AI!"}]
        with pytest.raises(HTTPException) as exc_info:
            await AIService.generate_response(messages=messages, model="openrouter/auto")
        assert exc_info.value.status_code == 429

@pytest.mark.asyncio
async def test_ai_summarize_transcript():
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "choices": [
            {"message": {"content": "### Executive Summary\nCall was successful."}}
        ]
    }

    with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
        mock_post.return_value = mock_response
        summary = await AIService.summarize_transcript(
            "Agent: Hello, how can I help?\nUser: I need to test WebRTC.",
            call_type="Voice session"
        )
        assert "Executive Summary" in summary
