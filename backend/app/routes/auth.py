import uuid
from datetime import datetime, timezone
from typing import List, Dict, Any
from fastapi import APIRouter, HTTPException, status, Depends
from app.database import get_db
from app.models.schemas import (
    UserRegister,
    UserLogin,
    UserResponse,
    TokenResponse,
    UserStatusUpdate
)
from app.services.auth_service import (
    hash_password,
    verify_password,
    create_access_token,
    get_current_user
)
from app.services.signaling_service import manager

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

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

    user_id = str(uuid.uuid4())
    now_iso = datetime.now(timezone.utc).isoformat()
    pwd_hash = hash_password(req.password)

    user_doc = {
        "_id": user_id,
        "name": req.name.strip(),
        "email": normalized_email,
        "password_hash": pwd_hash,
        "created_at": now_iso,
        "status": "available",
    }

    try:
        await db.users.insert_one(user_doc)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to register user: {str(e)}")

    token = create_access_token(data={"sub": user_id, "email": normalized_email, "name": req.name.strip()})

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse(
            _id=user_id,
            name=user_doc["name"],
            email=user_doc["email"],
            created_at=user_doc["created_at"],
            status=user_doc["status"]
        )
    )

@router.post("/login", response_model=TokenResponse)
async def login(req: UserLogin):
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

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

    # Set user status to available
    await db.users.update_one({"_id": user["_id"]}, {"$set": {"status": "available"}})

    token = create_access_token(data={"sub": user["_id"], "email": user["email"], "name": user["name"]})

    return TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse(
            _id=user["_id"],
            name=user["name"],
            email=user["email"],
            created_at=user.get("created_at", datetime.now(timezone.utc).isoformat()),
            status="available"
        )
    )

@router.get("/me", response_model=UserResponse)
async def get_current_user_profile(current_user: Dict[str, Any] = Depends(get_current_user)):
    return UserResponse(
        _id=current_user["_id"],
        name=current_user["name"],
        email=current_user["email"],
        created_at=current_user.get("created_at", ""),
        status=current_user.get("status", "available")
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
        created_at=current_user.get("created_at", ""),
        status=status_update.status
    )

@router.get("/users", response_model=List[UserResponse])
async def list_directory_users(current_user: Dict[str, Any] = Depends(get_current_user)):
    """
    List other authenticated users with real-time online status
    verified against active WebSocket signaling connections.
    """
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database service unavailable.")

    cursor = db.users.find({"_id": {"$ne": current_user["_id"]}}).sort("name", 1).limit(100)
    users = await cursor.to_list(length=100)

    result = []
    online_uids = manager.get_online_user_ids()

    for u in users:
        is_socket_online = u["_id"] in online_uids
        live_status = u.get("status", "available")
        if not is_socket_online and live_status != "busy":
            live_status = "offline"

        result.append(UserResponse(
            _id=u["_id"],
            name=u["name"],
            email=u["email"],
            created_at=u.get("created_at", ""),
            status=live_status
        ))

    return result
