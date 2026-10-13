"""Private artwork history and lightweight owner-scoped song search."""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select, delete
from sqlalchemy.dialects.sqlite import insert
from sqlalchemy.orm import selectinload
from app.api.music import Database, require_record
from app.models.music import Artwork, Project, Song, Favorite
from app.schemas.music import ProjectRead
from app.services.artwork import image_response

router = APIRouter(tags=["library"])

class FavoriteUpdate(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    favorite: bool

@router.get('/songs/{song_id}/favorite')
def get_favorite(song_id: int, db: Database):
    require_record(db, Song, song_id)
    return {'favorite': db.get(Favorite, (db.info['owner_id'], song_id)) is not None}

@router.put('/songs/{song_id}/favorite')
def set_favorite(song_id: int, data: FavoriteUpdate, db: Database):
    require_record(db, Song, song_id)
    owner_id = db.info['owner_id']
    if data.favorite:
        # Idempotent even when two tabs favorite the same song concurrently.
        db.execute(insert(Favorite).values(owner_id=owner_id, song_id=song_id).on_conflict_do_nothing())
    else:
        db.execute(delete(Favorite).where(Favorite.owner_id == owner_id, Favorite.song_id == song_id))
    db.commit()
    return {'favorite': data.favorite}

@router.get('/artworks')
def artworks(db: Database):
    return [{'id': a.id, 'file_path': a.file_path, 'created_at': a.created_at}
            for a in db.scalars(select(Artwork).where(Artwork.owner_id == db.info['owner_id']).order_by(Artwork.id.desc()))]

@router.get('/artworks/{artwork_id}/image')
def artwork_image(artwork_id: int, db: Database):
    return image_response(owned_artwork(db, artwork_id).file_path)

def owned_artwork(db, artwork_id):
    item = db.get(Artwork, artwork_id)
    if not item or item.owner_id != db.info['owner_id']:
        raise HTTPException(404, 'Artwork not found')
    return item

class ArtworkSelection(BaseModel):
    model_config = ConfigDict(extra='forbid')
    artwork_id: int

@router.put('/projects/{project_id}/cover', response_model=ProjectRead)
def select_artwork(project_id: int, data: ArtworkSelection, db: Database):
    project = require_record(db, Project, project_id)
    item = owned_artwork(db, data.artwork_id)
    # Validate that this retained file still exists before selecting it.
    image_response(item.file_path)
    project.cover_path = item.file_path
    db.commit()
    return project

@router.get('/search/songs')
def search_songs(db: Database, q: str = Query(default='', max_length=200), offset: int = Query(default=0, ge=0)):
    query = q.strip().casefold()
    if not query:
        return {'items': [], 'has_more': False}
    # Python casefold provides Unicode matching independent of SQLite's ASCII LIKE.
    # Stream rows to bound memory; hydrate versions only for the returned page.
    candidates = db.execute(select(Song.id, Song.title).join(Project).where(Project.owner_id == db.info['owner_id']).order_by(Song.id.desc()).execution_options(yield_per=200))
    ids = []
    matches = 0
    for song_id, title in candidates:
        if query in title.casefold():
            if matches >= offset:
                ids.append(song_id)
                if len(ids) == 51:
                    break
            matches += 1
    songs = db.scalars(select(Song).where(Song.id.in_(ids[:50])).options(selectinload(Song.versions), selectinload(Song.project).selectinload(Project.owner)).order_by(Song.id.desc()))
    return {'items': [{'id': s.id, 'project_id': s.project_id, 'title': s.title,
             'artist': s.artist or s.project.artist or s.project.owner_name,
             'song_artist': s.artist, 'fallback_artist': s.project.artist or s.project.owner_name,
             'uses_owner_name': not bool(s.project.artist), 'version_name': s.latest_version_name,
             'latest_version_id': s.latest_version_id,
             'project_name': s.project.name, 'cover_path': s.cover_path if s.cover_path is not None else s.project.cover_path} for s in songs],
            'has_more': len(ids) > 50}
