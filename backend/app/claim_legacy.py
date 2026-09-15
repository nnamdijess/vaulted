"""Explicit local-only ownership assignment; never run automatically on registration."""
import argparse
from sqlalchemy import select, update
from app.db.session import SessionLocal
from app.models.auth import User
from app.models.music import Project


def claim(db, email):
    user = db.scalar(select(User).where(User.email == email.strip().lower()))
    if user is None:
        raise ValueError('Register this account in the app first')
    result = db.execute(update(Project).where(Project.owner_id.is_(None)).values(owner_id=user.id))
    db.commit()
    return result.rowcount


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Assign all unowned legacy projects to an existing account. Owned projects are never changed.')
    parser.add_argument('--email', required=True)
    args = parser.parse_args()
    with SessionLocal() as db:
        print(f'Assigned {claim(db, args.email)} legacy projects.')
