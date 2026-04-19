import uuid
from datetime import datetime
from typing import Optional

from sqlmodel import Field, SQLModel, create_engine, Session, select

DATABASE_URL = "sqlite:///./harvest.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})


class User(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    email: str = Field(unique=True, index=True)
    hashed_password: str
    tier: str = Field(default="free")          # "free" | "pro"
    created_at: datetime = Field(default_factory=datetime.utcnow)
    is_active: bool = Field(default=True)


class Subscription(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str = Field(foreign_key="user.id", index=True)
    stripe_customer_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None
    status: str = Field(default="active")
    current_period_end: Optional[datetime] = None


class UsageLog(SQLModel, table=True):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), primary_key=True)
    user_id: str = Field(index=True)
    action: str          # e.g. "screener"
    log_date: str        # ISO date string YYYY-MM-DD
    count: int = Field(default=0)


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session
