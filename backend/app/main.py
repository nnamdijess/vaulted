from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.library import router as library_router
from app.api.health import router as health_router
from app.core.config import settings
from app.api.music import router as music_router
from app.db.session import Base, engine
from app.db.migrations import upgrade_local_database
from app.api.project_features import router as project_router, public_router
from app.api.auth import router as auth_router
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from collections import OrderedDict
import time

# Bounded per-process abuse limit; keys expire and are never persisted/logged.
_auth_attempts = OrderedDict()

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    upgrade_local_database(engine)
    yield


app = FastAPI(title="Vaulted API", version="0.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Range"],
    expose_headers=["Accept-Ranges", "Content-Range", "Content-Length"],
)
app.include_router(library_router, prefix="/api")
app.include_router(health_router, prefix="/api")
app.include_router(music_router, prefix="/api")
app.include_router(project_router, prefix="/api")
app.include_router(public_router, prefix="/api")
app.include_router(auth_router, prefix="/api")


@app.middleware("http")
async def private_share_cache(request, call_next):
    if request.url.path in ('/api/auth/login', '/api/auth/register') and request.method == 'POST':
        now = time.monotonic()
        key = request.client.host if request.client else 'unknown'
        attempts = [stamp for stamp in _auth_attempts.pop(key, []) if now - stamp < 300]
        if len(attempts) >= 60:
            _auth_attempts[key] = attempts
            return JSONResponse({'detail': 'Too many attempts. Try again in five minutes.'}, status_code=429, headers={'Retry-After': '300'})
        attempts.append(now)
        _auth_attempts[key] = attempts
        if len(_auth_attempts) > 4096:
            _auth_attempts.popitem(last=False)
    # Reject browser cross-origin mutations, including login/logout CSRF. Missing
    # Origin remains usable for non-browser clients; cross-site browser requests
    # are rejected even if they omit it. Never trust a client-supplied Host here.
    if request.method not in ('GET', 'HEAD', 'OPTIONS') and not request.url.path.startswith('/api/public/'):
        origin = request.headers.get('origin')
        if (origin and origin not in settings.cors_origins) or request.headers.get('sec-fetch-site') == 'cross-site':
            return JSONResponse({'detail': 'Request origin is not allowed'}, status_code=403)
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
        response.headers["Referrer-Policy"] = "no-referrer"
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    # Pydantic's default error includes submitted input (potentially passwords).
    return JSONResponse({'detail': [{'loc': e['loc'], 'msg': e['msg'], 'type': e['type']} for e in exc.errors()]}, status_code=422, headers={'Cache-Control': 'no-store'})
