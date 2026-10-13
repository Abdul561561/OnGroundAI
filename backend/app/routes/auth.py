import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException, status, Depends, Query
from app.database import get_db
from app.models.schemas import (
    UserRegister,
    UserLogin,
    UserResponse,
    TokenResponse,
    UserStatusUpdate,
    UserRoleUpdate
)
from app.services.auth_service import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user,
    require_admin
)
from app.services.signaling_service import manager

router = APIRouter(prefix="/api/auth", tags=["Authentication & Staff Directory"])

@router.post("/register", response_model=TokenResponse)
async def register(req: UserRegister):
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    # Check existing user
    normalized_email = req.email.strip().lower()
    existing = await db.users.find_one({"email": normalized_email})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists."
        )

    # First user registered automatically becomes admin, or use provided role
    user_count = await db.users.count_documents({})
    assigned_role = "admin" if user_count == 0 else (req.role or "agent")

    user_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    pwd_hash = hash_password(req.password)

    user_doc = {
        "_id": user_id,
        "name": req.name.strip(),
        "email": normalized_email,
        "password_hash": pwd_hash,
        "role": assigned_role,
        "created_at": now_iso,
        "status": "available",
    }

    try:
        await db.users.insert_one(user_doc)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to register user: {str(e)}")

    token = create_access_token(data={
        "sub": user_id,
        "email": normalized_email,
        "name": req.name.strip(),
        "role": assigned_role
    })

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse(
            _id=user_id,
            name=user_doc["name"],
            email=user_doc["email"],
            role=user_doc["role"],
            created_at=user_doc["created_at"],
            status=user_doc["status"]
        )
    )

@router.post("/login", response_model=TokenResponse)
async def login(req: UserLogin, db: Any = Depends(get_db)):
    if db is None:
        from app.database import ensure_db_connected
        db = await ensure_db_connected()

    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable. Please ensure MONGODB_URI is configured on Render and 0.0.0.0/0 is allowed in Atlas Network Access."
        )

    normalized_email = req.email.strip().lower()
    user = await db.users.find_one({"email": normalized_email})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )

    if not verify_password(req.password, user.get("password_hash", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password."
        )

    raw_role = user.get("role") or "agent"
    user_role = raw_role if raw_role in ("agent", "supervisor", "admin") else "agent"

    # Set user status to available
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"status": "available", "role": user_role}})

    token = create_access_token(data={
        "sub": user["_id"],
        "email": user["email"],
        "name": user["name"],
        "role": user_role
    })

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse(
            _id=user["_id"],
            name=user["name"],
            email=user["email"],
            role=user_role,
            created_at=user.get("created_at") or datetime.now(timezone.utc).isoformat(),
            status="available"
        )
    )

@router.post("/init-demo-users")
async def initialize_demo_users_endpoint(admin_key: str = Query(None), db: Any = Depends(get_db)):
    """
    Controlled demo user initialization endpoint.
    - Idempotent: Skips any existing users and never overwrites existing passwords.
    - Authorized if ALLOW_DEMO_SEED=true, or database currently has 0 users, or admin_key matches JWT_SECRET.
    """
    import os
    from app.config import settings
    from app.services.seed_service import seed_demo_users

    if db is None:
        from app.database import ensure_db_connected
        db = await ensure_db_connected()

    if db is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database service unavailable."
        )

    user_count = await db.users.count_documents({})
    allow_seed_env = os.getenv("ALLOW_DEMO_SEED", "false").lower() in ("true", "1")
    is_key_valid = admin_key and (admin_key == settings.JWT_SECRET)

    if not allow_seed_env and not is_key_valid and user_count > 0:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Demo user initialization is restricted when accounts exist. Provide valid admin_key or set ALLOW_DEMO_SEED=true."
        )

    summary = await seed_demo_users(db)
    return {
        "status": "success",
        "summary": summary
    }

@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(current_user: Dict[str, Any] = Depends(get_current_user)):
    raw_role = current_user.get("role") or "agent"
    user_role = raw_role if raw_role in ("agent", "supervisor", "admin") else "agent"
    return UserResponse(
        _id=current_user["_id"],
        name=current_user["name"],
        email=current_user["email"],
        role=user_role,
        created_at=current_user.get("created_at") or "",
        status=current_user.get("status") or "available"
    )

@router.put("/status", response_model=UserResponse)
async def update_status(
    status_update: UserStatusUpdate,
    current_user: Dict[str, Any] = Depends(get_current_user)
):
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    await db.users.update_one(
        {"_id": current_user["_id"]},
        {"$set": {"status": status_update.status}}
    )
    current_user["status"] = status_update.status
    return UserResponse(
        _id=current_user["_id"],
        name=current_user["name"],
        email=current_user["email"],
        role=current_user.get("role", "agent"),
        created_at=current_user.get("created_at", ""),
        status=status_update.status
    )

@router.put("/users/{user_id}/role", response_model=UserResponse)
async def update_user_role(
    user_id: str,
    role_update: UserRoleUpdate,
    admin_user: Dict[str, Any] = Depends(require_admin)
):
    """Admin-only endpoint to update a staff member's role."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    target = await db.users.find_one({"_id": user_id})
    if not target:
        raise HTTPException(status_code=404, detail="User not found.")

    await db.users.update_one({"_id": user_id}, {"$set": {"role": role_update.role}})
    target["role"] = role_update.role

    return UserResponse(
        _id=target["_id"],
        name=target["name"],
        email=target["email"],
        role=target["role"],
        created_at=target.get("created_at", ""),
        status=target.get("status", "available")
    )

import re

STAFF_EXCLUDE_TEST_PATTERN = re.compile(r"^(test\.(agent|sup)\.|staff\.(verifier|demo)\.)", re.IGNORECASE)

@router.get("/users", response_model=List[UserResponse])
async def list_directory_users(current_user: Dict[str, Any] = Depends(get_current_user)):
    """List colleagues with verified real-time presence and roles."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    cursor = db.users.find({}, {"password_hash": 0}).sort("name", 1).limit(100)
    users = await cursor.to_list(length=100)

    result = []
    online_uids = set(manager.get_online_user_ids())

    for u in users:
        uid = u["_id"]
        if uid == current_user["_id"]:
            continue
        is_socket_online = uid in online_uids
        # Hide offline ephemeral pytest accounts while keeping online test peers visible during E2E tests
        if not is_socket_online and STAFF_EXCLUDE_TEST_PATTERN.match(u.get("email", "")):
            continue

        live_status = u.get("status", "available")
        if not is_socket_online:
            live_status = "offline"

        result.append(UserResponse(
            _id=uid,
            name=u["name"],
            email=u["email"],
            role=u.get("role", "agent"),
            created_at=u.get("created_at", ""),
            status=live_status
        ))

    # Sort online colleagues first, then alphabetically
    result.sort(key=lambda x: (0 if x.status != "offline" else 1, x.name.lower()))
    return result

@router.get("/agents", response_model=List[UserResponse])
async def list_assignable_agents(current_user: Dict[str, Any] = Depends(get_current_user)):
    """List staff agents available for contact assignment."""
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    cursor = db.users.find({}, {"password_hash": 0}).sort("name", 1).limit(100)
    users = await cursor.to_list(length=100)
    online_uids = set(manager.get_online_user_ids())

    result = []
    for u in users:
        uid = u["_id"]
        is_socket_online = uid in online_uids
        if not is_socket_online and uid != current_user["_id"] and STAFF_EXCLUDE_TEST_PATTERN.match(u.get("email", "")):
            continue
        live_status = u.get("status", "available") if is_socket_online else "offline"
        result.append(UserResponse(
            _id=uid,
            name=u["name"],
            email=u["email"],
            role=u.get("role", "agent"),
            created_at=u.get("created_at", ""),
            status=live_status
        ))
    return result
