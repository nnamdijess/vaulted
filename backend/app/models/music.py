from datetime import datetime, timezone

from sqlalchemy import DateTime, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.session import Base


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Project(Base):
    __tablename__ = "projects"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    owner: Mapped["User | None"] = relationship(back_populates="projects")
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str] = mapped_column(Text, default="")
    artist: Mapped[str] = mapped_column(String(200), default="")
    cover_path: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    share_token: Mapped[str | None] = mapped_column(String(100), nullable=True, unique=True)
    sharing_enabled: Mapped[bool] = mapped_column(default=False)
    allow_downloads: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    @property
    def owner_name(self) -> str:
        return self.owner.display_name if self.owner else ""

    songs: Mapped[list["Song"]] = relationship(back_populates="project", cascade="all, delete-orphan")


class Artwork(Base):
    __tablename__ = "artworks"
    __table_args__ = (UniqueConstraint("owner_id", "file_path", name="uq_artwork_owner_path"),)
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)
    file_path: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)


class Song(Base):
    __tablename__ = "songs"

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    position: Mapped[int] = mapped_column(default=1)
    title: Mapped[str] = mapped_column(String(200))
    artist: Mapped[str] = mapped_column(String(200), default="")
    bpm: Mapped[float | None]
    key: Mapped[str] = mapped_column(String(50), default="")
    status: Mapped[str] = mapped_column(String(50), default="demo")
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    project: Mapped[Project] = relationship(back_populates="songs")
    versions: Mapped[list["SongVersion"]] = relationship(back_populates="song", cascade="all, delete-orphan")

    @property
    def latest_version_id(self) -> int | None:
        return max((version.id for version in self.versions), default=None)


class SongVersion(Base):
    __tablename__ = "song_versions"

    id: Mapped[int] = mapped_column(primary_key=True)
    song_id: Mapped[int] = mapped_column(ForeignKey("songs.id"), index=True)
    version_name: Mapped[str] = mapped_column(String(200))
    file_path: Mapped[str] = mapped_column(String(255), unique=True)
    original_filename: Mapped[str] = mapped_column(String(255))
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    song: Mapped[Song] = relationship(back_populates="versions")


class ListenEvent(Base):
    __tablename__ = "listen_events"
    __table_args__ = (UniqueConstraint("playback_id", name="uq_listen_playback"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    project_id: Mapped[int] = mapped_column(ForeignKey("projects.id"), index=True)
    song_id: Mapped[int] = mapped_column(ForeignKey("songs.id"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    source: Mapped[str] = mapped_column(String(10))
    session_id: Mapped[str] = mapped_column(String(36))
    playback_id: Mapped[str] = mapped_column(String(36))
