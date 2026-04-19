import os
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
import bcrypt as _bcrypt
from pydantic import BaseModel
from sqlmodel import Session, select

from database import User, get_session

load_dotenv(Path(__file__).parent / ".env")

SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_DAYS = 7

bearer_scheme = HTTPBearer(auto_error=False)

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ── Password helpers ──────────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return _bcrypt.hashpw(password.encode(), _bcrypt.gensalt()).decode()

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
    session: Session = Depends(get_session),
) -> User:
    if not credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")
    user_id = decode_token(credentials.credentials)
    if not user_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")
    user = session.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user

def get_optional_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    session: Session = Depends(get_session),
) -> Optional[User]:
    if not credentials:
        return None
    user_id = decode_token(credentials.credentials)
    if not user_id:
        return None
    return session.get(User, user_id)


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
def signup(body: SignupRequest, session: Session = Depends(get_session)):
    email = body.email.strip().lower()
    if session.exec(select(User).where(User.email == email)).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(email=email, hashed_password=hash_password(body.password))
    session.add(user)
    session.commit()
    session.refresh(user)
    return AuthResponse(
        access_token=create_access_token(user.id),
        user_id=user.id,
        email=user.email,
        tier=user.tier,
    )


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest, session: Session = Depends(get_session)):
    email = body.email.strip().lower()
    user = session.exec(select(User).where(User.email == email)).first()
    if not user or not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return AuthResponse(
        access_token=create_access_token(user.id),
        user_id=user.id,
        email=user.email,
        tier=user.tier,
    )


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return {"user_id": user.id, "email": user.email, "tier": user.tier}
