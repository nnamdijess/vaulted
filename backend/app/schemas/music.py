from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field, field_validator


class InputModel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class ProjectCreate(InputModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=10000)
    artist: str = Field(default="", max_length=200)


class SongCreate(InputModel):
    title: str = Field(min_length=1, max_length=200)
    artist: str = Field(default="", max_length=200)
    bpm: float | None = Field(default=None, gt=0, le=1000, allow_inf_nan=False)
    key: str = Field(default="", max_length=50)
    status: str = Field(default="demo", min_length=1, max_length=50)
    notes: str = Field(default="", max_length=10000)


class VersionCreate(InputModel):
    version_name: str = Field(min_length=1, max_length=200)
    notes: str = Field(default="", max_length=10000)


class SongUpdate(InputModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    artist: str | None = Field(default=None, max_length=200)
    bpm: float | None = Field(default=None, gt=0, le=1000, allow_inf_nan=False)
    key: str | None = Field(default=None, max_length=50)
    status: str | None = Field(default=None, min_length=1, max_length=50)
    notes: str | None = Field(default=None, max_length=10000)

    @field_validator("title", "artist", "key", "status", "notes")
    @classmethod
    def reject_explicit_null(cls, value):
        if value is None:
            raise ValueError("Use an empty string to clear optional text fields")
        return value


class Record(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def utc_timestamp(cls, value: datetime) -> datetime:
        # SQLite returns naive timestamps; values are always written in UTC.
        return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


class ProjectRead(Record):
    name: str
    description: str
    artist: str
    cover_path: str | None
    notes: str


class SongRead(Record):
    project_id: int
    title: str
    artist: str
    bpm: float | None
    key: str
    status: str
    notes: str
    position: int
    latest_version_id: int | None


class VersionRead(Record):
    song_id: int
    version_name: str
    file_path: str
    original_filename: str
    notes: str
