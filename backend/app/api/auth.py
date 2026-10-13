import hashlib
import secrets
from datetime import timedelta
from typing import Annotated, Literal

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError, InvalidHashError
from fastapi import APIRouter, Depends, HTTPException, Request, Response, UploadFile, File
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError

from app.core.config import settings
from app.db.session import SessionLocal, get_session
from app.models.auth import Session, User
from app.models.music import utc_now

router = APIRouter(prefix='/auth', tags=['authentication'])
hasher = PasswordHasher()
# Unknown accounts perform the same password verification work.
dummy_hash = hasher.hash(secrets.token_urlsafe(32))
COOKIE = 'unreleased_session'


class Credentials(BaseModel):
    model_config = ConfigDict(extra='forbid')
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)

    @field_validator('email', mode='before')
    @classmethod
    def normalize_email(cls, value):
        return value.strip().lower() if isinstance(value, str) else value


class Registration(Credentials):
    display_name: str = Field(min_length=1, max_length=200)

    @field_validator('display_name')
    @classmethod
    def clean_name(cls, value):
        if not value.strip():
            raise ValueError('Display name is required')
        return value.strip()


def token_hash(token):
    return hashlib.sha256(token.encode()).hexdigest()


def account(user):
    return {'id': user.id, 'email': user.email, 'display_name': user.display_name, 'avatar_path': user.avatar_path, 'library_name': user.library_name, 'accent_color': user.accent_color}


def current_user(request: Request):
    token = request.cookies.get(COOKIE, '')
    if len(token) != 43:
        raise HTTPException(401, 'Please log in to continue')
    # Separate authentication transaction keeps ordering locks in resource sessions safe.
    with SessionLocal() as db:
        session = db.scalar(select(Session).where(Session.token_hash == token_hash(token), Session.expires_at > utc_now()))
        user = db.get(User, session.user_id) if session else None
        if user is None:
            raise HTTPException(401, 'Please log in to continue')
        return user


def owned_session(user: Annotated[User, Depends(current_user)]):
    with SessionLocal() as db:
        db.info['owner_id'] = user.id
        yield db


def start_session(db, user, request, response):
    old = request.cookies.get(COOKIE)
    if old:
        db.execute(delete(Session).where(Session.token_hash == token_hash(old)))
    db.execute(delete(Session).where(Session.expires_at <= utc_now()))
    token = secrets.token_urlsafe(32)
    lifetime = settings.session_days * 86400
    db.add(Session(user_id=user.id, token_hash=token_hash(token), expires_at=utc_now() + timedelta(seconds=lifetime)))
    db.commit()
    response.set_cookie(COOKIE, token, max_age=lifetime, httponly=True,
                        secure=settings.cookie_secure, samesite='lax', path='/')


@router.post('/register', status_code=201)
def register(data: Registration, request: Request, response: Response):
    if not settings.registration_enabled:
        raise HTTPException(403, 'Registration is disabled')
    with SessionLocal() as db:
        user = User(email=str(data.email).lower(), display_name=data.display_name, password_hash=hasher.hash(data.password))
        db.add(user)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            raise HTTPException(409, 'An account with this email already exists') from None
        start_session(db, user, request, response)
        return account(user)


@router.post('/login')
def login(data: Credentials, request: Request, response: Response):
    with SessionLocal() as db:
        user = db.scalar(select(User).where(User.email == str(data.email).lower()))
        try:
            hasher.verify(user.password_hash if user else dummy_hash, data.password)
        except (VerificationError, InvalidHashError):
            raise HTTPException(401, 'Email or password is incorrect') from None
        if user is None:
            raise HTTPException(401, 'Email or password is incorrect')
        if hasher.check_needs_rehash(user.password_hash):
            user.password_hash = hasher.hash(data.password)
        start_session(db, user, request, response)
        return account(user)


@router.post('/logout', status_code=204)
def logout(request: Request, response: Response):
    with SessionLocal() as db:
        db.execute(delete(Session).where(Session.token_hash == token_hash(request.cookies.get(COOKIE, ''))))
        db.commit()
    response.delete_cookie(COOKIE, path='/', httponly=True, secure=settings.cookie_secure, samesite='lax')


@router.get('/me')
def me(user: Annotated[User, Depends(current_user)]):
    return account(user)


@router.get('/avatar')
def avatar(user: Annotated[User, Depends(current_user)]):
    from app.services.artwork import image_response
    return image_response(user.avatar_path)


@router.post('/avatar')
def upload_avatar(file: Annotated[UploadFile, File()], db=Depends(owned_session)):
    from app.services.artwork import save_cover
    from app.api.project_features import remove_files
    user = db.get(User, db.info['owner_id'])
    key = save_cover(file, 'avatars')
    old = user.avatar_path
    try:
        user.avatar_path = key
        db.commit()
    except Exception:
        db.rollback()
        remove_files([key])
        raise
    remove_files([old])
    return account(user)


@router.delete('/avatar')
def remove_avatar(db=Depends(owned_session)):
    from app.api.project_features import remove_files
    user = db.get(User, db.info['owner_id'])
    old = user.avatar_path
    user.avatar_path = None
    db.commit()
    remove_files([old])
    return account(user)


class Preferences(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    library_name: str = Field(min_length=1, max_length=60)
    accent_color: str = Field(pattern=r'^(green|blue|purple|pink|orange|teal|#[0-9a-fA-F]{6})$')


class ProfileUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    display_name: str = Field(min_length=1, max_length=200)


@router.patch('/profile')
def update_profile(data: ProfileUpdate, db=Depends(owned_session)):
    user = db.get(User, db.info['owner_id'])
    user.display_name = data.display_name
    db.commit()
    return account(user)


@router.patch('/preferences')
def preferences(data: Preferences, db=Depends(owned_session)):
    user = db.get(User, db.info['owner_id'])
    user.library_name = data.library_name
    user.accent_color = data.accent_color
    db.commit()
    return account(user)
