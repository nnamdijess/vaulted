import random
import shutil
from fastapi import APIRouter, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy import select, or_
from app.api.music import Database, require_record, lock_track_order
from app.models.music import Song, SongVersion, Project, utc_now
from app.models.studio import ContentProject, ContentLyricLine, ContentMedia, ContentClip, ContentRenderJob, AestheticCollection
from app.schemas.studio import Create, Edit, Timing, Search, Draft, Replace, Favorite, CollectionInput, TextStyle
from app.services.studio_fonts import FONT_DIR, FONT_FILES
from app.services.studio_presets import RECIPES, STYLES
from app.services.studio_storage import duration, content_path
from app.services.visual_provider import PixabayProvider, PexelsProvider
from app.services.video_upload import ingest_video
from app.schemas.studio import MediaDetails

router = APIRouter(prefix='/studio', tags=['studio'])


def owned(db, model, identifier):
    item = db.get(model, identifier)
    if item is None or item.owner_id != db.info['owner_id']:
        raise HTTPException(404, 'Studio item not found')
    return item


def job_view(job):
    return {key: getattr(job, key) for key in ('id', 'status', 'progress', 'error', 'created_at')} | {'revision': job.snapshot['revision']}


def view(project, db):
    version = require_record(db, SongVersion, project.song_version_id)
    song = version.song
    return {key: getattr(project, key) for key in ('id', 'title', 'song_id', 'song_version_id', 'status', 'start_time', 'end_time',
             'lyrics_text', 'aesthetic', 'lyric_style', 'media_pool', 'text_style', 'revision', 'created_at', 'updated_at')} | {
        'song_title': song.title, 'artist': song.artist or song.project.artist or song.project.owner_name,
        'project_id': song.project_id, 'cover_path': song.project.cover_path, 'version_name': version.version_name,
        'lines': [{'text': line.text, 'start_time': line.start_time, 'end_time': line.end_time} for line in project.lines],
        'clips': [{'id': clip.id, 'media_id': clip.media_id, 'start_time': clip.start_time, 'end_time': clip.end_time,
                   'source_start': clip.source_start, 'media': clip.media.metadata_json} for clip in project.clips],
        'jobs': [job_view(job) for job in project.jobs]}


def changed(project):
    project.revision += 1
    project.updated_at = utc_now()
    project.status = 'draft'


def collection_for(db, aesthetic):
    if aesthetic.startswith('custom:'):
        try:
            identifier = int(aesthetic.split(':', 1)[1])
        except ValueError:
            raise HTTPException(422, 'Invalid aesthetic') from None
        return owned(db, AestheticCollection, identifier)
    if aesthetic not in RECIPES:
        raise HTTPException(422, 'Unknown aesthetic')
    return None


def collection_view(item, db):
    media = [owned(db, ContentMedia, identifier) for identifier in item.media_ids]
    return {'id': item.id, 'name': item.name, 'base_aesthetic': item.base_aesthetic, 'keywords': item.keywords,
            'media_ids': item.media_ids, 'media': [{'id': m.id, 'favorite': m.favorite, **m.metadata_json} for m in media]}


@router.get('/aesthetics')
def collections(db: Database):
    return [collection_view(item, db) for item in db.scalars(select(AestheticCollection).where(AestheticCollection.owner_id == db.info['owner_id']))]


def validate_collection(data, db):
    if data.base_aesthetic not in RECIPES:
        raise HTTPException(422, 'Choose a built-in base aesthetic')
    for identifier in data.media_ids:
        owned(db, ContentMedia, identifier)


@router.post('/aesthetics', status_code=201)
def create_collection(data: CollectionInput, db: Database):
    validate_collection(data, db)
    item = AestheticCollection(owner_id=db.info['owner_id'], **data.model_dump())
    db.add(item)
    db.commit()
    return collection_view(item, db)


@router.put('/aesthetics/{identifier}')
def edit_collection(identifier: int, data: CollectionInput, db: Database):
    lock_track_order(db)
    item = owned(db, AestheticCollection, identifier)
    validate_collection(data, db)
    for key, value in data.model_dump().items():
        setattr(item, key, value)
    db.commit()
    return collection_view(item, db)


@router.get('/presets')
def presets(db: Database):
    return {'aesthetics': [{'id': key, 'name': value[0], 'keywords': [{'query': q, 'weight': w} for q, w in value[1]]}
                           for key, value in RECIPES.items()] + [
                               {'id': f'custom:{item.id}', 'name': item.name, 'keywords': [{'query': q, 'weight': 1} for q in item.keywords]}
                               for item in db.scalars(select(AestheticCollection).where(AestheticCollection.owner_id == db.info['owner_id']))],
            'styles': [{'id': key, 'name': value} for key, value in STYLES.items()]}


@router.get('/fonts/{font_id}')
def font_file(font_id: str, db: Database):
    if font_id not in FONT_FILES:
        raise HTTPException(404, 'Font not found')
    return FileResponse(FONT_DIR / FONT_FILES[font_id], media_type='font/ttf',
                        headers={'Cache-Control': 'private, max-age=86400'})


@router.put('/projects/{identifier}/text-style')
def edit_text_style(identifier: int, data: TextStyle, db: Database):
    lock_track_order(db)
    project = owned(db, ContentProject, identifier)
    project.text_style = data.model_dump()
    changed(project)
    db.commit()
    return view(project, db)


@router.get('/songs')
def songs(db: Database, q: str = ''):
    if len(q) > 100:
        raise HTTPException(422, 'Search is too long')
    rows = db.scalars(select(Song).join(Project).where(Project.owner_id == db.info['owner_id']).order_by(Song.id.desc())).all()
    return [{'id': song.id, 'title': song.title, 'artist': song.artist or song.project.artist or song.project.owner_name,
             'project_id': song.project_id, 'project_name': song.project.name, 'cover_path': song.project.cover_path,
             'versions': [{'id': v.id, 'name': v.version_name} for v in sorted(song.versions, key=lambda v: -v.id)]}
            for song in rows if song.versions and q.casefold() in f'{song.title} {song.artist} {song.project.name}'.casefold()][:100]


@router.get('/versions/{version_id}/metadata')
def metadata(version_id: int, db: Database):
    return {'duration': duration(require_record(db, SongVersion, version_id))}


@router.get('/projects')
def projects(db: Database):
    return [view(item, db) for item in db.scalars(select(ContentProject).where(ContentProject.owner_id == db.info['owner_id']).order_by(ContentProject.updated_at.desc()))]


@router.post('/projects', status_code=201)
def create(data: Create, db: Database):
    version = require_record(db, SongVersion, data.song_version_id)
    project = ContentProject(owner_id=db.info['owner_id'], song_id=version.song_id, song_version_id=version.id,
                             title=data.title, end_time=min(15, duration(version)))
    db.add(project)
    db.commit()
    return view(project, db)


@router.get('/projects/{identifier}')
def get(identifier: int, db: Database):
    return view(owned(db, ContentProject, identifier), db)


@router.patch('/projects/{identifier}')
def edit(identifier: int, data: Edit, db: Database):
    lock_track_order(db)
    project = owned(db, ContentProject, identifier)
    version = require_record(db, SongVersion, project.song_version_id)
    collection_for(db, data.aesthetic)
    if not data.title.strip() or data.lyric_style not in STYLES:
        raise HTTPException(422, 'Choose a title and valid presets')
    if not 0 < data.end_time - data.start_time <= 60 or data.end_time > duration(version) + 0.01:
        raise HTTPException(422, 'Section must fit the song and be at most 60 seconds')
    lines = [line for line in data.lyrics_text.splitlines() if line.strip()]
    if len(lines) > 200 or any(len(line) > 500 for line in lines):
        raise HTTPException(422, 'Use at most 200 lyric lines, each at most 500 characters')
    section_changed = (project.start_time, project.end_time) != (data.start_time, data.end_time)
    if project.lyrics_text != data.lyrics_text or section_changed:
        project.lines.clear()
        project.lines.extend(ContentLyricLine(line_index=index, text=line) for index, line in enumerate(lines))
    if section_changed:
        project.clips.clear()
    for key, value in data.model_dump().items():
        setattr(project, key, value)
    changed(project)
    db.commit()
    return view(project, db)


@router.put('/projects/{identifier}/timings')
def timings(identifier: int, data: Timing, db: Database):
    lock_track_order(db)
    project = owned(db, ContentProject, identifier)
    length = project.end_time - project.start_time
    if len(data.starts) != len(project.lines) or any(not 0 <= t < length for t in data.starts) or any(a >= b for a, b in zip(data.starts, data.starts[1:])):
        raise HTTPException(422, 'Give each line an increasing start time within the section')
    for index, line in enumerate(project.lines):
        line.start_time = data.starts[index]
        line.end_time = data.starts[index + 1] if index + 1 < len(data.starts) else length
    changed(project)
    db.commit()
    return view(project, db)


def search_media(data, db):
    collection = collection_for(db, data.aesthetic)
    recipe = [(q, 1) for q in collection.keywords] if collection else RECIPES[data.aesthetic][1]
    # Three distinct weighted queries; round-robin results avoids one-query domination.
    queries = [data.query.strip()] if data.query.strip() else []
    pool = list(recipe)
    while not data.query.strip() and len(queries) < min(3, len(recipe)):
        choice = random.choices(pool, weights=[weight for _, weight in pool])[0]
        queries.append(choice[0])
        pool.remove(choice)
    provider = PexelsProvider() if data.provider == 'pexels' else PixabayProvider()
    batches = [provider.search(query, data.page) for query in queries]
    items, seen = [], set()
    for index in range(max(map(len, batches), default=0)):
        for batch in batches:
            if index >= len(batch):
                continue
            value = batch[index]
            if value['provider_id'] in seen:
                continue
            seen.add(value['provider_id'])
            media = db.scalar(select(ContentMedia).where(ContentMedia.owner_id == db.info['owner_id'], ContentMedia.provider == data.provider, ContentMedia.provider_id == value['provider_id']))
            if media is None:
                media = ContentMedia(owner_id=db.info['owner_id'], provider=data.provider, provider_id=value['provider_id'], metadata_json=value)
                db.add(media)
                db.flush()
            items.append({'id': media.id, 'favorite': media.favorite, **media.metadata_json})
            if len(items) >= data.count:
                return items
    return items


@router.post('/visuals/search')
def search(data: Search, db: Database):
    result = search_media(data, db)
    db.commit()
    return result


@router.get('/media/favorites')
def favorites(db: Database, q: str = ''):
    if len(q) > 100:
        raise HTTPException(422, 'Search is too long')
    return [{'id': item.id, 'favorite': item.favorite, **item.metadata_json} for item in db.scalars(select(ContentMedia).where(ContentMedia.owner_id == db.info['owner_id'], or_(ContentMedia.favorite.is_(True), ContentMedia.provider == 'upload')).order_by(ContentMedia.id.desc()))
            if q.casefold() in f"{item.metadata_json.get('title', '')} {item.metadata_json.get('tags', '')}".casefold()]


@router.post('/media/upload', status_code=201)
def upload_media(db: Database, file: UploadFile):
    identifier, metadata = ingest_video(file)
    try:
        media = ContentMedia(owner_id=db.info['owner_id'], provider='upload', provider_id=identifier,
                             metadata_json=metadata, favorite=True)
        db.add(media)
        db.flush()
        url = f'/api/studio/media/{media.id}'
        media.metadata_json = {**metadata, 'preview_url': url + '/video', 'video_url': url + '/video', 'thumbnail': url + '/poster'}
        db.commit()
        return {'id': media.id, 'favorite': True, **media.metadata_json}
    except Exception:
        db.rollback()
        shutil.rmtree(content_path(f'library/{identifier}'), ignore_errors=True)
        raise
    finally:
        file.file.close()


@router.get('/media/{identifier}/video')
def uploaded_video(identifier: int, db: Database):
    media = owned(db, ContentMedia, identifier)
    if media.provider != 'upload':
        raise HTTPException(404, 'Upload not found')
    return FileResponse(content_path(media.metadata_json['local_path']), media_type='video/mp4', headers={'Cache-Control': 'private, no-store'})


@router.get('/media/{identifier}/poster')
def uploaded_poster(identifier: int, db: Database):
    media = owned(db, ContentMedia, identifier)
    if media.provider != 'upload':
        raise HTTPException(404, 'Upload not found')
    return FileResponse(content_path(media.metadata_json['local_path']).with_name('poster.jpg'), media_type='image/jpeg', headers={'Cache-Control': 'private, no-store'})


@router.put('/media/{identifier}/details')
def media_details(identifier: int, data: MediaDetails, db: Database):
    media = owned(db, ContentMedia, identifier)
    media.metadata_json = {**media.metadata_json, 'title': data.title.strip(), 'tags': data.tags.strip()}
    db.commit()
    return {'id': media.id, 'favorite': media.favorite, **media.metadata_json}


@router.patch('/media/{identifier}')
def favorite(identifier: int, data: Favorite, db: Database):
    media = owned(db, ContentMedia, identifier)
    media.favorite = data.favorite
    db.commit()
    return {'favorite': media.favorite}


@router.post('/projects/{identifier}/draft')
def draft(identifier: int, data: Draft, db: Database):
    project = owned(db, ContentProject, identifier)
    ids = data.media_ids
    if data.mode == 'selected' or (data.mode == 'reroll' and project.media_pool):
        ids = list(dict.fromkeys(data.media_ids if data.mode == 'selected' else project.media_pool))
        for value in ids:
            owned(db, ContentMedia, value)
        project.media_pool = ids.copy()
        old = {clip.media_id for clip in project.clips}
        fresh = [value for value in ids if value not in old]
        previous = [value for value in ids if value in old]
        random.shuffle(fresh)
        random.shuffle(previous)
        ids = fresh + previous
    elif data.mode in ('automatic', 'reroll'):
        collection = collection_for(db, project.aesthetic)
        results = [{'id': identifier} for identifier in collection.media_ids] if collection and collection.media_ids else search_media(Search(aesthetic=project.aesthetic, provider=data.provider, count=30, page=random.randint(1, 3) if data.mode == 'reroll' else 1), db)
        old = {clip.media_id for clip in project.clips}
        ids = [item['id'] for item in results if item['id'] not in old]
        previous = [item['id'] for item in results if item['id'] in old]
        random.shuffle(ids)
        random.shuffle(previous)
        # Prefer new clips, but keep enough curated footage to fill the section.
        ids.extend(previous)
        project.media_pool = []
    elif data.mode == 'order':
        ids = list(dict.fromkeys(clip.media_id for clip in project.clips))
        random.shuffle(ids)
    ids = list(dict.fromkeys(ids))
    media = [owned(db, ContentMedia, value) for value in ids]
    length = project.end_time - project.start_time
    if not media or sum(min(4, item.metadata_json['duration']) for item in media) < length:
        raise HTTPException(422, 'Select more distinct clips to cover the section (up to four seconds per clip).')
    project.clips.clear()
    elapsed = 0
    for position, item in enumerate(media):
        if elapsed >= length:
            break
        end = min(length, elapsed + min(4, item.metadata_json['duration']))
        project.clips.append(ContentClip(media_id=item.id, position=position, start_time=elapsed, end_time=end))
        elapsed = end
    changed(project)
    project.status = 'ready'
    db.commit()
    db.refresh(project)
    return view(project, db)


@router.delete('/projects/{identifier}/clips')
def clear_clips(identifier: int, db: Database):
    lock_track_order(db)
    project = owned(db, ContentProject, identifier)
    project.clips.clear()
    changed(project)
    db.commit()
    return view(project, db)


@router.put('/projects/{identifier}/clips/{clip_id}')
def replace(identifier: int, clip_id: int, data: Replace, db: Database):
    lock_track_order(db)
    project = owned(db, ContentProject, identifier)
    clip = next((clip for clip in project.clips if clip.id == clip_id), None)
    media = owned(db, ContentMedia, data.media_id)
    if clip is None:
        raise HTTPException(404, 'Clip not found')
    if media.metadata_json['duration'] < clip.end_time - clip.start_time:
        raise HTTPException(422, 'Choose a longer clip')
    clip.media = media
    clip.source_start = 0
    changed(project)
    db.commit()
    return view(project, db)


@router.post('/projects/{identifier}/renders', status_code=202)
def render(identifier: int, db: Database):
    lock_track_order(db)
    project = owned(db, ContentProject, identifier)
    if any(job.status in ('queued', 'rendering') for job in project.jobs):
        raise HTTPException(409, 'A render is already queued or running')
    if not project.clips or any(line.start_time is None for line in project.lines):
        raise HTTPException(422, 'Generate a draft and time every lyric line before rendering')
    snapshot = view(project, db)
    collection = collection_for(db, project.aesthetic)
    snapshot['render_aesthetic'] = collection.base_aesthetic if collection else project.aesthetic
    # JSON snapshot is intentionally separate from live ORM relationships.
    snapshot.pop('jobs')
    snapshot.pop('created_at')
    snapshot.pop('updated_at')
    snapshot['audio_path'] = require_record(db, SongVersion, project.song_version_id).file_path
    job = ContentRenderJob(content_project_id=project.id, snapshot=snapshot)
    db.add(job)
    project.status = 'rendering'
    db.commit()
    return job_view(job)


@router.get('/projects/{identifier}/renders/{job_id}')
def render_status(identifier: int, job_id: int, db: Database):
    project = owned(db, ContentProject, identifier)
    job = next((job for job in project.jobs if job.id == job_id), None)
    if job is None:
        raise HTTPException(404, 'Render not found')
    return job_view(job)


@router.get('/projects/{identifier}/renders/{job_id}/video')
def render_video(identifier: int, job_id: int, db: Database, download: bool = False):
    project = owned(db, ContentProject, identifier)
    job = next((job for job in project.jobs if job.id == job_id), None)
    if not job or job.status != 'completed' or not job.output_path or not content_path(job.output_path).is_file():
        raise HTTPException(404, 'Export not found')
    return FileResponse(content_path(job.output_path), media_type='video/mp4', filename=f'vaulted-studio-{job.id}.mp4',
                        content_disposition_type='attachment' if download else 'inline')


@router.delete('/projects/{identifier}', status_code=204)
def remove(identifier: int, db: Database):
    lock_track_order(db)
    project = owned(db, ContentProject, identifier)
    if any(job.status in ('queued', 'rendering') for job in project.jobs):
        raise HTTPException(409, 'Wait for the active render before deleting this draft')
    db.delete(project)
    db.commit()
    shutil.rmtree(content_path(f'projects/{identifier}'), ignore_errors=True)
    return Response(status_code=204)
