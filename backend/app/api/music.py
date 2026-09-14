from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.session import get_session
from app.models.music import Project, Song, SongVersion
from app.schemas.music import ProjectCreate, ProjectRead, SongCreate, SongRead, VersionCreate, VersionRead
from app.services.storage import AUDIO_TYPES, audio_path, save_audio

router = APIRouter()
Database = Annotated[Session, Depends(get_session)]


def require_record(db: Session, model, record_id: int):
    record = db.get(model, record_id)
    if record is None:
        raise HTTPException(404, f"{model.__name__} not found")
    return record


@router.get("/projects", response_model=list[ProjectRead], tags=["projects"])
def list_projects(db: Database):
    return db.scalars(select(Project).order_by(Project.id.desc())).all()


@router.post("/projects", response_model=ProjectRead, status_code=201, tags=["projects"])
def create_project(data: ProjectCreate, db: Database):
    project = Project(**data.model_dump())
    db.add(project)
    db.commit()
    db.refresh(project)
    return project


@router.get("/projects/{project_id}", response_model=ProjectRead, tags=["projects"])
def get_project(project_id: int, db: Database):
    return require_record(db, Project, project_id)


@router.get("/projects/{project_id}/songs", response_model=list[SongRead], tags=["songs"])
def list_songs(project_id: int, db: Database):
    require_record(db, Project, project_id)
    return db.scalars(select(Song).where(Song.project_id == project_id).order_by(Song.id.desc())).all()


@router.post("/projects/{project_id}/songs", response_model=SongRead, status_code=201, tags=["songs"])
def create_song(project_id: int, data: SongCreate, db: Database):
    require_record(db, Project, project_id)
    song = Song(project_id=project_id, **data.model_dump())
    db.add(song)
    db.commit()
    db.refresh(song)
    return song


@router.get("/songs/{song_id}", response_model=SongRead, tags=["songs"])
def get_song(song_id: int, db: Database):
    return require_record(db, Song, song_id)


@router.get("/songs/{song_id}/versions", response_model=list[VersionRead], tags=["versions"])
def list_versions(song_id: int, db: Database):
    require_record(db, Song, song_id)
    return db.scalars(select(SongVersion).where(SongVersion.song_id == song_id).order_by(SongVersion.id.desc())).all()


@router.post("/songs/{song_id}/versions", response_model=VersionRead, status_code=201, tags=["versions"])
def create_version(
    song_id: int, db: Database,
    version_name: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
    notes: Annotated[str, Form()] = "",
):
    require_record(db, Song, song_id)
    try:
        data = VersionCreate(version_name=version_name, notes=notes)
    except ValidationError:
        raise HTTPException(422, "Version name must be 1–200 characters and notes at most 10000 characters") from None
    key, original = save_audio(file)
    version = SongVersion(song_id=song_id, file_path=key, original_filename=original, **data.model_dump())
    try:
        db.add(version)
        db.commit()
    except Exception:
        db.rollback()
        audio_path(key).unlink(missing_ok=True)
        raise
    db.refresh(version)
    return version


@router.get("/versions/{version_id}/audio", response_class=FileResponse, tags=["versions"])
def stream_audio(version_id: int, db: Database):
    version = require_record(db, SongVersion, version_id)
    path = audio_path(version.file_path)
    if not path.is_file():
        raise HTTPException(404, "Audio file not found")
    return FileResponse(
        path, media_type=AUDIO_TYPES.get(Path(version.file_path).suffix.lower(), "application/octet-stream"),
        filename=version.original_filename, content_disposition_type="inline",
        headers={"X-Content-Type-Options": "nosniff"},
    )
