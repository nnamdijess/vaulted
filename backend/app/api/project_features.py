import logging
import secrets
from datetime import timezone
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import delete, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from app.api.music import Database, lock_track_order, require_record, audio_response
from app.models.music import ListenEvent, Project, Song, SongVersion
from app.schemas.music import ProjectRead
from app.schemas.project_features import ListenCreate, NotesUpdate, ProjectUpdate, ShareUpdate, TrackOrder
from app.services.artwork import COVER_TYPES, save_cover
from app.services.storage import audio_path

router = APIRouter(tags=['project features'])
from app.db.session import get_session
from sqlalchemy.orm import Session
PublicDatabase = Annotated[Session, Depends(get_session)]

public_router = APIRouter(prefix='/public', tags=['public sharing'])


def remove_files(keys):
    for key in keys:
        if key:
            try:
                audio_path(key).unlink(missing_ok=True)
            except OSError:
                logging.getLogger(__name__).exception('Unable to remove orphaned upload %s', key)


@router.patch('/projects/{project_id}', response_model=ProjectRead)
def update_project(project_id: int, data: ProjectUpdate, db: Database):
    project = require_record(db, Project, project_id)
    for field, value in data.model_dump().items():
        setattr(project, field, value)
    db.commit()
    return project


@router.patch('/projects/{project_id}/notes', response_model=ProjectRead)
def project_notes(project_id: int, data: NotesUpdate, db: Database):
    project = require_record(db, Project, project_id)
    project.notes = data.notes
    db.commit()
    return project


@router.delete('/projects/{project_id}', status_code=204)
def delete_project(project_id: int, db: Database):
    project = require_record(db, Project, project_id)
    keys = [project.cover_path] + [v.file_path for s in project.songs for v in s.versions]
    db.execute(delete(ListenEvent).where(ListenEvent.project_id == project_id))
    db.delete(project)
    db.commit()
    remove_files(keys)
    return Response(status_code=204)


@router.patch('/projects/{project_id}/order')
def order_tracks(project_id: int, data: TrackOrder, db: Database):
    lock_track_order(db)
    project = require_record(db, Project, project_id)
    songs = {s.id: s for s in project.songs}
    if len(data.song_ids) != len(songs) or set(data.song_ids) != set(songs):
        raise HTTPException(422, 'Include every project song exactly once')
    for position, song_id in enumerate(data.song_ids, 1):
        songs[song_id].position = position
    db.commit()
    return {'ok': True}


@router.post('/projects/{project_id}/cover', response_model=ProjectRead)
def upload_cover(project_id: int, db: Database, file: Annotated[UploadFile, File()]):
    project = require_record(db, Project, project_id)
    key = save_cover(file)
    old_key = project.cover_path
    try:
        project.cover_path = key
        db.commit()
    except Exception:
        db.rollback()
        remove_files([key])
        raise
    remove_files([old_key])
    return project


@router.delete('/projects/{project_id}/cover', response_model=ProjectRead)
def remove_cover(project_id: int, db: Database):
    project = require_record(db, Project, project_id)
    old_key = project.cover_path
    project.cover_path = None
    db.commit()
    remove_files([old_key])
    return project


def cover_response(project):
    if not project.cover_path or not audio_path(project.cover_path).is_file():
        raise HTTPException(404, 'Cover not found')
    path = audio_path(project.cover_path)
    return FileResponse(path, media_type=COVER_TYPES[path.suffix], headers={'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'})


@router.get('/projects/{project_id}/cover')
def get_cover(project_id: int, db: Database):
    return cover_response(require_record(db, Project, project_id))


def sharing(project):
    return {'enabled': project.sharing_enabled, 'allow_downloads': project.allow_downloads,
            'token': project.share_token if project.sharing_enabled else None}


@router.get('/projects/{project_id}/share')
def get_sharing(project_id: int, db: Database):
    return sharing(require_record(db, Project, project_id))


@router.put('/projects/{project_id}/share')
def set_sharing(project_id: int, data: ShareUpdate, db: Database):
    project = require_record(db, Project, project_id)
    if not data.enabled:
        project.share_token = None
    elif data.regenerate or not project.share_token:
        project.share_token = secrets.token_urlsafe(32)
    project.sharing_enabled = data.enabled
    project.allow_downloads = data.allow_downloads
    db.commit()
    return sharing(project)


def shared_project(db, token):
    project = db.scalar(select(Project).where(Project.share_token == token, Project.sharing_enabled.is_(True)))
    if project is None:
        raise HTTPException(404, 'This share link is unavailable')
    return project


def shared_song(db, token, song_id):
    project = shared_project(db, token)
    song = db.get(Song, song_id)
    if not song or song.project_id != project.id:
        raise HTTPException(404, 'Track not found')
    return project, song


@public_router.get('/{token}')
def public_project(token: str, db: PublicDatabase):
    project = shared_project(db, token)
    songs = db.scalars(select(Song).options(selectinload(Song.versions)).where(Song.project_id == project.id).order_by(Song.position, Song.id)).all()
    # Explicit allowlist: never serialize owner schemas, notes, file paths or tokens.
    return {'name': project.name, 'artist': project.artist, 'has_cover': bool(project.cover_path),
            'allow_downloads': project.allow_downloads,
            'tracks': [{'id': s.id, 'title': s.title, 'artist': s.artist, 'position': s.position,
                        'playable': s.latest_version_id is not None} for s in songs]}


@public_router.get('/{token}/cover')
def public_cover(token: str, db: PublicDatabase):
    return cover_response(shared_project(db, token))


@public_router.get('/{token}/songs/{song_id}/audio')
def public_audio(token: str, song_id: int, db: PublicDatabase, download: bool = False):
    project, song = shared_song(db, token, song_id)
    if download and not project.allow_downloads:
        raise HTTPException(403, 'Downloads are disabled for this project')
    if song.latest_version_id is None:
        raise HTTPException(404, 'Audio not found')
    response = audio_response(db.get(SongVersion, song.latest_version_id), download)
    response.headers['Cache-Control'] = 'no-store'
    return response


def record_listen(db, song, data, source):
    threshold = min(30.0, data.duration / 2)
    if data.listened_seconds < threshold:
        return {'counted': False, 'threshold': threshold}
    event = ListenEvent(project_id=song.project_id, song_id=song.id, source=source,
                        session_id=str(data.session_id), playback_id=str(data.playback_id))
    try:
        db.add(event)
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.scalar(select(ListenEvent).where(ListenEvent.playback_id == str(data.playback_id)))
        if existing is None:
            raise
        return {'counted': False, 'duplicate': True}
    return {'counted': True}


@router.post('/songs/{song_id}/listens')
def owner_listen(song_id: int, data: ListenCreate, db: Database):
    return record_listen(db, require_record(db, Song, song_id), data, 'owner')


@public_router.post('/{token}/songs/{song_id}/listens')
def public_listen(token: str, song_id: int, data: ListenCreate, db: PublicDatabase):
    _, song = shared_song(db, token, song_id)
    return record_listen(db, song, data, 'shared')


@router.get('/projects/{project_id}/insights')
def insights(project_id: int, db: Database):
    require_record(db, Project, project_id)
    rows = db.execute(select(Song.id, Song.title, func.count(ListenEvent.id)).outerjoin(ListenEvent, ListenEvent.song_id == Song.id).where(Song.project_id == project_id).group_by(Song.id).order_by(Song.position, Song.id)).all()
    counts = dict(db.execute(select(ListenEvent.source, func.count()).where(ListenEvent.project_id == project_id).group_by(ListenEvent.source)).all())
    recent = db.execute(select(ListenEvent, Song.title).join(Song, Song.id == ListenEvent.song_id).where(ListenEvent.project_id == project_id).order_by(ListenEvent.id.desc()).limit(20)).all()
    top = max(rows, key=lambda row: row[2], default=None)
    return {'total': sum(row[2] for row in rows), 'owner': counts.get('owner', 0), 'shared': counts.get('shared', 0),
            'songs': [{'id': row[0], 'title': row[1], 'streams': row[2]} for row in rows],
            'most_played': top[1] if top and top[2] else None,
            'recent': [{'title': title, 'source': event.source, 'timestamp': event.created_at.replace(tzinfo=timezone.utc).isoformat()} for event, title in recent]}
