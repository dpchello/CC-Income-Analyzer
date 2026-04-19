"""Create two test users: one Pro, one Free.

Run once:  python3 seed_test_users.py
"""
from database import create_db_and_tables, engine, User
from auth import hash_password, create_access_token
from sqlmodel import Session, select

PRO_EMAIL    = "pro@harvest.test"
PRO_PASSWORD = "harvest-pro-123"

FREE_EMAIL    = "free@harvest.test"
FREE_PASSWORD = "harvest-free-123"


def seed():
    create_db_and_tables()

    with Session(engine) as session:
        for email, password, tier in [
            (PRO_EMAIL,  PRO_PASSWORD,  "pro"),
            (FREE_EMAIL, FREE_PASSWORD, "free"),
        ]:
            existing = session.exec(select(User).where(User.email == email)).first()
            if existing:
                # Ensure tier is correct if user already exists
                existing.tier = tier
                session.add(existing)
                session.commit()
                session.refresh(existing)
                user = existing
                print(f"Updated existing user: {email} (tier={tier})")
            else:
                user = User(email=email, hashed_password=hash_password(password), tier=tier)
                session.add(user)
                session.commit()
                session.refresh(user)
                print(f"Created user: {email} (tier={tier})")

            token = create_access_token(user.id)
            print(f"  JWT: {token}\n")

    print("Done. Test credentials:")
    print(f"  Pro  → email: {PRO_EMAIL}  password: {PRO_PASSWORD}")
    print(f"  Free → email: {FREE_EMAIL}  password: {FREE_PASSWORD}")


if __name__ == "__main__":
    seed()
