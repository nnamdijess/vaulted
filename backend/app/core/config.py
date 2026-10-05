from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_ROOT = Path(__file__).resolve().parents[2]
REPOSITORY_ROOT = BACKEND_ROOT.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_ROOT / ".env", env_file_encoding="utf-8", extra="ignore"
    )

    cookie_secure: bool = False
    session_days: int = Field(default=7, ge=1, le=30)
    registration_enabled: bool = True

    database_url: str = f"sqlite:///{(BACKEND_ROOT / 'music.db').as_posix()}"
    uploads_dir: Path = REPOSITORY_ROOT / "uploads"
    content_dir: Path = REPOSITORY_ROOT / "content"
    pixabay_api_key: str = ""
    ffmpeg_binary: str = ""
    ffprobe_binary: str = "ffprobe"
    max_stock_bytes: int = 150 * 1024 * 1024
    max_upload_bytes: int = 250 * 1024 * 1024
    max_cover_bytes: int = 10 * 1024 * 1024
    cors_origins: list[str] = ["http://localhost:3000", "http://127.0.0.1:3000"]

    @field_validator('cors_origins')
    @classmethod
    def explicit_origins(cls, origins):
        if any('*' in origin or not origin.startswith(('http://', 'https://')) for origin in origins):
            raise ValueError('CORS_ORIGINS must contain exact HTTP(S) origins, without wildcards')
        return origins


settings = Settings()
