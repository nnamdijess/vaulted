"""Stock provider network boundary. Clients submit IDs, never download URLs."""
import hashlib
import json
import time
from typing import Protocol
from urllib.parse import urlparse
import httpx
from fastapi import HTTPException
from app.core.config import settings
from app.services.studio_storage import content_path


def safe_media_url(url: str, provider: str | None = None) -> bool:
    try:
        parsed = urlparse(url)
        hosts = {'pixabay': {'cdn.pixabay.com'}, 'pexels': {'videos.pexels.com'}}
        allowed = hosts.get(provider, set()) if provider else set.union(*hosts.values())
        return (parsed.scheme == 'https' and parsed.hostname in allowed
                and not parsed.username and not parsed.password and parsed.port in (None, 443))
    except ValueError:
        return False


class VisualProvider(Protocol):
    def search(self, query: str, page: int = 1) -> list[dict]: ...


class PixabayProvider:
    def search(self, query: str, page: int = 1) -> list[dict]:
        if not settings.pixabay_api_key:
            raise HTTPException(503, 'Add PIXABAY_API_KEY to the backend environment to find stock footage.')
        key = hashlib.sha256(f'{query}:{page}'.encode()).hexdigest()
        cache = content_path(f'provider-cache/{key}.json')
        try:
            if time.time() - cache.stat().st_mtime < 86400:
                return json.loads(cache.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            pass
        try:
            with httpx.Client(timeout=20, follow_redirects=False) as client:
                response = client.get('https://pixabay.com/api/videos/', params={
                    'key': settings.pixabay_api_key, 'q': query, 'page': page,
                    'per_page': 30, 'safesearch': 'true', 'video_type': 'film'})
                response.raise_for_status()
                raw = response.json()
        except (httpx.HTTPError, ValueError):
            # Never include the request URL (contains the API key) in public errors.
            raise HTTPException(502, 'Pixabay search is unavailable. Check your key or try again later.') from None
        results = []
        for hit in raw.get('hits', []):
            variants = hit.get('videos', {})
            usable = variants.get('medium') or variants.get('large') or variants.get('small')
            preview = variants.get('tiny') or variants.get('small') or usable
            if not usable or not preview or not safe_media_url(usable.get('url', ''), 'pixabay') or not safe_media_url(preview.get('url', ''), 'pixabay'):
                continue
            if hit.get('duration', 0) <= 0 or usable.get('width', 0) <= 0 or usable.get('height', 0) <= 0:
                continue
            results.append({'provider': 'pixabay', 'provider_id': str(hit['id']), 'thumbnail': preview.get('thumbnail', ''),
                            'preview_url': preview['url'], 'video_url': usable['url'], 'duration': hit['duration'],
                            'width': usable['width'], 'height': usable['height'], 'tags': hit.get('tags', ''),
                            'source_url': f"https://pixabay.com/videos/id-{hit['id']}/"})
        results.sort(key=lambda item: abs(item['width'] / item['height'] - 9 / 16))
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(results), encoding='utf-8')
        return results


class PexelsProvider:
    def search(self, query: str, page: int = 1) -> list[dict]:
        if not settings.pexels_api_key:
            raise HTTPException(503, 'Add PEXELS_API_KEY to the backend environment to search Pexels.')
        key = hashlib.sha256(f'pexels:{query}:{page}'.encode()).hexdigest()
        cache = content_path(f'provider-cache/{key}.json')
        try:
            if time.time() - cache.stat().st_mtime < 86400:
                return json.loads(cache.read_text(encoding='utf-8'))
        except (OSError, ValueError):
            pass
        try:
            with httpx.Client(timeout=20, follow_redirects=False) as client:
                response = client.get('https://api.pexels.com/v1/videos/search',
                                      headers={'Authorization': settings.pexels_api_key},
                                      params={'query': query, 'page': page, 'per_page': 30})
                response.raise_for_status()
                raw = response.json()
        except httpx.HTTPStatusError as error:
            if error.response.status_code == 429:
                raise HTTPException(429, 'Pexels search limit reached. Please try again later.') from None
            raise HTTPException(502, 'Pexels search is unavailable. Check your key or try again later.') from None
        except (httpx.HTTPError, ValueError):
            raise HTTPException(502, 'Pexels search is unavailable. Try again later.') from None
        results = []
        for hit in raw.get('videos', []):
            files = [item for item in hit.get('video_files', []) if item.get('file_type') == 'video/mp4'
                     and safe_media_url(item.get('link', ''), 'pexels') and (item.get('width') or 0) > 0
                     and (item.get('height') or 0) > 0]
            if not files or not isinstance(hit.get('id'), int) or (hit.get('duration') or 0) <= 0:
                continue
            preview = min(files, key=lambda item: item['width'] * item['height'])
            usable = min(files, key=lambda item: abs(max(item['width'], item['height']) - 1920))
            thumbnail = hit.get('image', '')
            parsed = urlparse(thumbnail)
            if parsed.scheme != 'https' or parsed.netloc != 'images.pexels.com':
                thumbnail = ''
            source_url = hit.get('url', '')
            source = urlparse(source_url)
            if source.scheme != 'https' or source.netloc != 'www.pexels.com' or not source.path.startswith('/video/'):
                source_url = f"https://www.pexels.com/video/{hit['id']}/"
            results.append({'provider': 'pexels', 'provider_id': str(hit['id']), 'thumbnail': thumbnail,
                            'preview_url': preview['link'], 'video_url': usable['link'],
                            'duration': hit['duration'], 'width': usable['width'], 'height': usable['height'],
                            'tags': query, 'author': (hit.get('user') or {}).get('name', ''),
                            'source_url': source_url})
        results.sort(key=lambda item: abs(item['width'] / item['height'] - 9 / 16))
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_text(json.dumps(results), encoding='utf-8')
        return results


def download_video(url: str, target):
    if not safe_media_url(url):
        raise ValueError('Stock host is not allowed')
    target.parent.mkdir(parents=True, exist_ok=True)
    partial = target.with_suffix('.part')
    try:
        with httpx.Client(timeout=60, follow_redirects=False) as client:
            with client.stream('GET', url) as response:
                response.raise_for_status()  # Redirects are rejected, not followed to arbitrary hosts.
                if not response.headers.get('content-type', '').split(';')[0].startswith('video/'):
                    raise ValueError('Provider did not return video')
                total = 0
                with partial.open('wb') as output:
                    for chunk in response.iter_bytes(65536):
                        total += len(chunk)
                        if total > settings.max_stock_bytes:
                            raise ValueError('Stock clip exceeds the download limit')
                        output.write(chunk)
                if total == 0:
                    raise ValueError('Empty stock clip')
        with partial.open('rb') as source:
            if b'ftyp' not in source.read(64):
                raise ValueError('Provider media is not an MP4 container')
        partial.replace(target)
    finally:
        partial.unlink(missing_ok=True)
