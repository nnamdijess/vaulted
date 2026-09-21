from io import BytesIO
from pathlib import Path
from uuid import uuid4
import warnings

from fastapi import HTTPException, UploadFile
from PIL import Image, UnidentifiedImageError

from app.core.config import settings
from app.services.storage import audio_path, storage_root

COVER_TYPES = {'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp'}
FORMATS = {'JPEG': '.jpg', 'PNG': '.png', 'WEBP': '.webp'}


def save_cover(upload: UploadFile, directory: str = 'covers') -> str:
    extension = Path(upload.filename or '').suffix.lower()
    if extension not in COVER_TYPES:
        raise HTTPException(415, 'Choose a JPEG, PNG or WebP image')
    content = upload.file.read(settings.max_cover_bytes + 1)
    if len(content) > settings.max_cover_bytes:
        raise HTTPException(413, 'Cover image exceeds the 10 MiB limit')
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(BytesIO(content)) as image:
                actual = FORMATS.get(image.format)
                if not actual or COVER_TYPES[actual] != COVER_TYPES[extension]:
                    raise HTTPException(415, 'Image content does not match its extension')
                if image.width * image.height > 25_000_000:
                    raise HTTPException(413, 'Cover image must be at most 25 megapixels')
                image.verify()
    except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise HTTPException(422, 'Invalid or unsafe image file') from None
    key = f'{directory}/{uuid4().hex}{actual}'
    (storage_root() / directory).mkdir(parents=True, exist_ok=True)
    try:
        with audio_path(key).open('xb') as output:
            output.write(content)
    except FileExistsError:
        raise HTTPException(409, 'Filename collision; retry the upload') from None
    except Exception:
        audio_path(key).unlink(missing_ok=True)
        raise
    return key


def image_response(key):
    from fastapi.responses import FileResponse
    if not key or not audio_path(key).is_file():
        raise HTTPException(404, 'Image not found')
    path = audio_path(key)
    return FileResponse(path, media_type=COVER_TYPES[path.suffix], headers={'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'})
