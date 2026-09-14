from pathlib import Path
from uuid import uuid4

from fastapi import HTTPException, UploadFile

from app.core.config import REPOSITORY_ROOT, settings

AUDIO_TYPES = {
    ".wav": "audio/wav", ".mp3": "audio/mpeg", ".m4a": "audio/mp4",
    ".flac": "audio/flac", ".aac": "audio/aac", ".ogg": "audio/ogg",
    ".opus": "audio/ogg", ".aif": "audio/aiff", ".aiff": "audio/aiff",
}


def storage_root() -> Path:
    root = settings.uploads_dir
    return (root if root.is_absolute() else REPOSITORY_ROOT / root).resolve()


def audio_path(key: str) -> Path:
    root = storage_root()
    path = (root / key).resolve()
    if not path.is_relative_to(root):
        raise HTTPException(404, "Audio file not found")
    return path


def save_audio(upload: UploadFile) -> tuple[str, str]:
    original = (upload.filename or "").replace("\\", "/").rsplit("/", 1)[-1]
    extension = Path(original).suffix.lower()
    if extension not in AUDIO_TYPES:
        raise HTTPException(415, "Unsupported audio extension. Use WAV, MP3, M4A, FLAC, AAC, OGG, OPUS or AIFF.")
    if len(original) > 255:
        raise HTTPException(422, "Filename must be at most 255 characters")
    root = storage_root()
    root.mkdir(parents=True, exist_ok=True)
    key = f"{uuid4().hex}{extension}"
    path = audio_path(key)
    size = 0
    try:
        with path.open("xb") as destination:
            while chunk := upload.file.read(1024 * 1024):
                size += len(chunk)
                if size > settings.max_upload_bytes:
                    raise HTTPException(413, "Audio exceeds the configured upload limit")
                destination.write(chunk)
            if size == 0:
                raise HTTPException(422, "Audio file is empty")
    except FileExistsError:
        raise HTTPException(409, "Filename collision; please retry") from None
    except Exception:
        path.unlink(missing_ok=True)
        raise
    return key, original
