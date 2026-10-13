import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.database import get_db
from app.services.auth_service import hash_password, create_access_token

class MockUsersCollection:
    def __init__(self):
        self.docs = {
            "alice@onground.ai": {
                "_id": "user_alice_1",
                "name": "Agent Alice",
                "email": "alice@onground.ai",
                "password_hash": hash_password("Password123!"),
                "role": "agent",
                "status": "available",
                "created_at": "2026-01-01T00:00:00Z"
            },
            "bob@onground.ai": {
                "_id": "user_bob_1",
                "name": "Agent Bob",
                "email": "bob@onground.ai",
                "password_hash": hash_password("Password123!"),
                "role": "agent",
                "status": "available",
                "created_at": "2026-01-01T00:00:00Z"
            },
            "supervisor.hq@onground.ai": {
                "_id": "user_sup_1",
                "name": "Sarah Connor (Supervisor)",
                "email": "supervisor.hq@onground.ai",
                "password_hash": hash_password("Password123!"),
                "role": "supervisor",
                "status": "available",
                "created_at": "2026-01-01T00:00:00Z"
            }
        }

    async def find_one(self, query):
        if "email" in query:
            return self.docs.get(query["email"])
        if "_id" in query:
            for d in self.docs.values():
                if d["_id"] == query["_id"]:
                    return d
        return None

    async def update_one(self, query, update):
        user = await self.find_one(query)
        if user and "$set" in update:
            user.update(update["$set"])
        return None

    async def insert_one(self, doc):
        self.docs[doc["email"]] = doc
        return None

    async def count_documents(self, query):
        return len(self.docs)

class MockDB:
    def __init__(self):
        self.users = MockUsersCollection()

    async def command(self, cmd):
        return {"ok": 1}

@pytest.fixture(autouse=True)
def override_db():
    mock_db = MockDB()
    app.dependency_overrides[get_db] = lambda: mock_db
    yield
    app.dependency_overrides.clear()

@pytest.mark.asyncio
async def test_root_endpoint_healthy():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "healthy"
        assert "OnGround AI" in data["service"]

@pytest.mark.asyncio
async def test_api_health_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "healthy"

@pytest.mark.asyncio
async def test_demo_user_alice_login_success():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/auth/login", json={
            "email": "alice@onground.ai",
            "password": "Password123!"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["user"]["email"] == "alice@onground.ai"
        assert data["user"]["role"] == "agent"

@pytest.mark.asyncio
async def test_demo_user_bob_login_success():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/auth/login", json={
            "email": "bob@onground.ai",
            "password": "Password123!"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "access_token" in data
        assert data["user"]["email"] == "bob@onground.ai"

@pytest.mark.asyncio
async def test_demo_user_supervisor_login_success():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/auth/login", json={
            "email": "supervisor.hq@onground.ai",
            "password": "Password123!"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["user"]["role"] == "supervisor"

@pytest.mark.asyncio
async def test_login_invalid_password_rejected():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/auth/login", json={
            "email": "alice@onground.ai",
            "password": "WrongPassword999!"
        })
        assert resp.status_code == 401
        assert "Invalid email or password" in resp.json()["detail"]

@pytest.mark.asyncio
async def test_login_nonexistent_user_rejected():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/auth/login", json={
            "email": "ghost.user@onground.ai",
            "password": "Password123!"
        })
        assert resp.status_code == 401

@pytest.mark.asyncio
async def test_get_me_authenticated():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        login_resp = await client.post("/api/auth/login", json={
            "email": "alice@onground.ai",
            "password": "Password123!"
        })
        assert login_resp.status_code == 200
        token = login_resp.json()["access_token"]

        resp = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        user = resp.json()
        assert user["email"] == "alice@onground.ai"
        assert user["role"] == "agent"

@pytest.mark.asyncio
async def test_init_demo_users_endpoint_idempotent():
    from app.config import settings
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post(f"/api/auth/init-demo-users?admin_key={settings.JWT_SECRET}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        summary = data["summary"]
        assert summary["total_checked"] >= 4
        assert summary["skipped_count"] >= 3

@pytest.mark.asyncio
async def test_cors_preflight_login():
    transport = ASGITransport(app=app)
    headers = {
        "Origin": "https://on-ground-ai.vercel.app",
        "Access-Control-Request-Method": "POST",
        "Access-Control-Request-Headers": "content-type,authorization"
    }
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.options("/api/auth/login", headers=headers)
        assert resp.status_code == 200
        assert resp.headers.get("access-control-allow-origin") == "https://on-ground-ai.vercel.app"
        assert "POST" in resp.headers.get("access-control-allow-methods", "")
        assert "content-type" in resp.headers.get("access-control-allow-headers", "").lower()
        assert resp.headers.get("access-control-allow-credentials") == "true"

@pytest.mark.asyncio
async def test_cors_preflight_telephony_status():
    transport = ASGITransport(app=app)
    headers = {
        "Origin": "https://on-ground-ai.vercel.app",
        "Access-Control-Request-Method": "GET",
        "Access-Control-Request-Headers": "content-type,authorization"
    }
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.options("/api/telephony/status", headers=headers)
        assert resp.status_code == 200
        assert resp.headers.get("access-control-allow-origin") == "https://on-ground-ai.vercel.app"
        assert "GET" in resp.headers.get("access-control-allow-methods", "")

@pytest.mark.asyncio
async def test_cors_actual_login_includes_allow_origin():
    transport = ASGITransport(app=app)
    headers = {
        "Origin": "https://on-ground-ai.vercel.app",
        "Content-Type": "application/json"
    }
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.post("/api/auth/login", json={
            "email": "alice@onground.ai",
            "password": "Password123!"
        }, headers=headers)
        assert resp.status_code == 200
        assert resp.headers.get("access-control-allow-origin") == "https://on-ground-ai.vercel.app"
        assert resp.headers.get("access-control-allow-credentials") == "true"
        data = resp.json()
        assert "access_token" in data

@pytest.mark.asyncio
async def test_cors_actual_telephony_status_includes_allow_origin():
    transport = ASGITransport(app=app)
    headers = {
        "Origin": "https://on-ground-ai.vercel.app"
    }
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        resp = await client.get("/api/telephony/status", headers=headers)
        assert resp.status_code == 200
        assert resp.headers.get("access-control-allow-origin") == "https://on-ground-ai.vercel.app"
        assert resp.headers.get("access-control-allow-credentials") == "true"

