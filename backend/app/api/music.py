from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse
from pydantic import ValidationError
from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session, selectinload

from app.api.auth import owned_session
from app.models.music import ListenEvent, Project, Song, SongVersion
from app.schemas.music import ProjectCreate, ProjectRead, SongCreate, SongRead, SongUpdate, VersionCreate, VersionRead
from app.services.storage import AUDIO_TYPES, audio_path, save_audio

router = APIRouter()
Database = Annotated[Session, Depends(owned_session)]


def require_record(db: Session, model, record_id: int):
    record = db.get(model, record_id)
    if record is None:
        raise HTTPException(404, f"{model.__name__} not found")
    if model is Project:
        project = record
    elif model is Song:
        project = record.project
    else:
        project = record.song.project
    if project is None or project.owner_id != db.info.get('owner_id') or project.owner_id is None:
        raise HTTPException(404, f"{model.__name__} not found")
    return record


@router.get("/projects", response_model=list[ProjectRead], tags=["projects"])
def list_projects(db: Database):
    return db.scalars(select(Project).where(Project.owner_id == db.info['owner_id']).order_by(Project.id.desc())).all()


@router.post("/projects", response_model=ProjectRead, status_code=201, tags=["projects"])
def create_project(data: ProjectCreate, db: Database):
    project = Project(owner_id=db.info['owner_id'], **data.model_dump())
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
    return db.scalars(select(Song).options(selectinload(Song.versions)).where(Song.project_id == project_id).order_by(Song.position, Song.id)).all()


def lock_track_order(db: Session):
    if db.bind.dialect.name == "sqlite":
        db.execute(text("BEGIN IMMEDIATE"))


def next_position(db: Session, project_id: int) -> int:
    return (db.scalar(select(func.max(Song.position)).where(Song.project_id == project_id)) or 0) + 1


@router.post("/projects/{project_id}/songs", response_model=SongRead, status_code=201, tags=["songs"])
def create_song(project_id: int, data: SongCreate, db: Database):
    lock_track_order(db)
    require_record(db, Project, project_id)
    song = Song(project_id=project_id, position=next_position(db, project_id), **data.model_dump())
    db.add(song)
    db.commit()
    db.refresh(song)
    return song


@router.get("/songs/{song_id}", response_model=SongRead, tags=["songs"])
def get_song(song_id: int, db: Database):
    return require_record(db, Song, song_id)


@router.post("/projects/{project_id}/tracks", response_model=list[SongRead], status_code=201, tags=["songs"])
def upload_tracks(project_id: int, db: Database, files: Annotated[list[UploadFile], File()]):
    if not 1 <= len(files) <= 50:
        raise HTTPException(422, "Choose between 1 and 50 audio files")
    lock_track_order(db)
    require_record(db, Project, project_id)
    position = next_position(db, project_id)
    saved: list[str] = []
    songs: list[Song] = []
    try:
        for offset, upload in enumerate(files):
            key, original = save_audio(upload)
            saved.append(key)
            title = Path(original).stem.strip()[:200] or "Untitled track"
            song = Song(project_id=project_id, position=position + offset, title=title)
            song.versions.append(SongVersion(version_name="Original", file_path=key, original_filename=original))
            db.add(song)
            songs.append(song)
        db.commit()
    except Exception:
        db.rollback()
        for key in saved:
            audio_path(key).unlink(missing_ok=True)
        raise
    return songs


@router.patch("/songs/{song_id}", response_model=SongRead, tags=["songs"])
def update_song(song_id: int, data: SongUpdate, db: Database):
    song = require_record(db, Song, song_id)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(song, field, value)
    db.commit()
    db.refresh(song)
    return song


@router.delete("/songs/{song_id}", status_code=204, tags=["songs"])
def delete_song(song_id: int, db: Database):
    song = require_record(db, Song, song_id)
    paths = [audio_path(version.file_path) for version in song.versions]
    db.execute(delete(ListenEvent).where(ListenEvent.song_id == song_id))
    db.delete(song)
    db.commit()
    # Metadata deletion must commit before removing any irreplaceable files.
    for path in paths:
        try:
            path.unlink(missing_ok=True)
        except OSError:
            import logging
            logging.getLogger(__name__).exception("Could not remove orphaned audio file %s", path)
    return Response(status_code=204)


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
def stream_audio(version_id: int, db: Database, download: bool = False):
    version = require_record(db, SongVersion, version_id)
    return audio_response(version, download)


def audio_response(version, download=False):
    path = audio_path(version.file_path)
    if not path.is_file():
        raise HTTPException(404, "Audio file not found")
    return FileResponse(
        path, media_type=AUDIO_TYPES.get(Path(version.file_path).suffix.lower(), "application/octet-stream"),
        filename=version.original_filename, content_disposition_type="attachment" if download else "inline",
        headers={"X-Content-Type-Options": "nosniff"},
    )
