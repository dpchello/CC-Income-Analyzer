import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
import bcrypt as _bcrypt
from pydantic import BaseModel

import db
from rate_limit import limiter

load_dotenv(Path(__file__).parent / ".env")

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret-rotated-2026-04-24")
if SECRET_KEY.startswith("dev-secret"):
    import warnings
    warnings.warn("JWT_SECRET_KEY is not set — using insecure default. Set it before deploying.")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7

bearer_scheme = HTTPBearer(auto_error=False)
router = APIRouter(prefix="/api/auth", tags=["auth"])


# ── Lightweight user dict wrapper ─────────────────────────────────────────────
# auth.py previously used SQLModel User objects. The rest of the app accesses
# .id, .email, .tier, .is_active — this dict-backed class keeps that interface.

class User:
    def __init__(self, data: dict):
        self._d = data

    @property
    def id(self) -> str:
        return self._d["id"]

    @property
    def email(self) -> str:
        return self._d["email"]

    @property
    def tier(self) -> str:
        return self._d.get("tier", "free")

    @property
    def is_active(self) -> bool:
        return self._d.get("is_active", True)

    def get(self, key, default=None):
        return self._d.get(key, default)


# ── Password helpers ──────────────────────────────────────────────────────────

_BCRYPT_ROUNDS = 12  # OWASP 2023 minimum. Bump only with a deliberate plan to rehash on next login.

def hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode(), _bcrypt.gensalt(rounds=_BCRYPT_ROUNDS)).decode()

def verify_password(plain: str, hashed: str) -> bool:
    return _bcrypt.checkpw(plain.encode(), hashed.encode())


# ── JWT helpers ───────────────────────────────────────────────────────────────

def create_access_token(user_id: str) -> str:
    expire = datetime.utcnow() + timedelta(days=ACCESS_TOKEN_EXPIRE_DAYS)
    return jwt.encode({"sub": user_id, "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)

def decode_token(token: str) -> Optional[str]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None


# ── Dependencies ──────────────────────────────────────────────────────────────

def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    user_id = decode_token(credentials.credentials)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    data = db.get_user_by_id(user_id)
    if not data or not data.get("is_active"):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return User(data)

def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> Optional[User]:
    if not credentials:
        return None
    user_id = decode_token(credentials.credentials)
    if not user_id:
        return None
    data = db.get_user_by_id(user_id)
    if not data:
        return None
    return User(data)


# ── Request / response models ─────────────────────────────────────────────────

class SignupRequest(BaseModel):
    email: str
    password: str

class LoginRequest(BaseModel):
    email: str
    password: str

class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: str
    email: str
    tier: str


# ── Routes ────────────────────────────────────────────────────────────────────

@router.post("/signup", response_model=AuthResponse)
@limiter.limit("5/minute")
def signup(request: Request, body: SignupRequest):
    email = body.email.strip().lower()
    if db.get_user_by_email(email):
        raise HTTPException(status_code=400, detail="Email already registered")
    user_data = db.create_user(email=email, hashed_password=hash_password(body.password))
    user = User(user_data)
    db.ensure_default_portfolio(user.id)
    return AuthResponse(
        access_token=create_access_token(user.id),
        user_id=user.id,
        email=user.email,
        tier=user.tier,
    )


@router.post("/login", response_model=AuthResponse)
@limiter.limit("5/minute")
def login(request: Request, body: LoginRequest):
    email = body.email.strip().lower()
    user_data = db.get_user_by_email(email)
    if not user_data or not verify_password(body.password, user_data["hashed_password"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    user = User(user_data)
    return AuthResponse(
        access_token=create_access_token(user.id),
        user_id=user.id,
        email=user.email,
        tier=user.tier,
    )


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {"user_id": user.id, "email": user.email, "tier": user.tier}
