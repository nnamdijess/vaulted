from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.core.config import settings
from app.api.music import router as music_router
from app.db.session import Base, engine
from app.db.migrations import upgrade_local_database
from app.api.project_features import router as project_router, public_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    upgrade_local_database(engine)
    yield


app = FastAPI(title="Unreleased API", version="0.2.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
    allow_headers=["Content-Type", "Range"],
    expose_headers=["Accept-Ranges", "Content-Range", "Content-Length"],
)
app.include_router(health_router, prefix="/api")
app.include_router(music_router, prefix="/api")
app.include_router(project_router, prefix="/api")
app.include_router(public_router, prefix="/api")


@app.middleware("http")
async def private_share_cache(request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/public/"):
        response.headers["Cache-Control"] = "no-store"
        response.headers["Referrer-Policy"] = "no-referrer"
    return response
