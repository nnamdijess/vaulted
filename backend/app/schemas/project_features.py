from uuid import UUID

from pydantic import Field

from app.schemas.music import InputModel


class ProjectUpdate(InputModel):
    name: str = Field(min_length=1, max_length=200)
    artist: str = Field(default='', max_length=200)
    description: str = Field(default='', max_length=10000)


class NotesUpdate(InputModel):
    notes: str = Field(max_length=10000)


class ShareUpdate(InputModel):
    enabled: bool
    allow_downloads: bool = False
    regenerate: bool = False


class TrackOrder(InputModel):
    song_ids: list[int] = Field(max_length=10000)


class ListenCreate(InputModel):
    playback_id: UUID
    session_id: UUID
    listened_seconds: float = Field(ge=0, le=86400, allow_inf_nan=False)
    duration: float = Field(gt=0, le=86400, allow_inf_nan=False)
