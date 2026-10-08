"""Studio metadata. Media bytes remain in private disk storage."""
from datetime import datetime
from sqlalchemy import DateTime, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.db.session import Base
from app.models.music import utc_now


class ContentProject(Base):
    __tablename__ = 'content_projects'
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey('users.id'), index=True)
    song_id: Mapped[int] = mapped_column(ForeignKey('songs.id'), index=True)
    song_version_id: Mapped[int] = mapped_column(ForeignKey('song_versions.id'))
    title: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(30), default='draft')
    start_time: Mapped[float] = mapped_column(default=0)
    end_time: Mapped[float]
    lyrics_text: Mapped[str] = mapped_column(Text, default='')
    aesthetic: Mapped[str] = mapped_column(String(40), default='night-drive')
    lyric_style: Mapped[str] = mapped_column(String(40), default='minimal')
    text_style: Mapped[dict] = mapped_column(JSON, default=dict)
    revision: Mapped[int] = mapped_column(default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
    lines: Mapped[list['ContentLyricLine']] = relationship(cascade='all, delete-orphan', order_by='ContentLyricLine.line_index')
    clips: Mapped[list['ContentClip']] = relationship(cascade='all, delete-orphan', order_by='ContentClip.position')
    jobs: Mapped[list['ContentRenderJob']] = relationship(cascade='all, delete-orphan', order_by='ContentRenderJob.id.desc()')


class ContentLyricLine(Base):
    __tablename__ = 'content_lyric_lines'
    id: Mapped[int] = mapped_column(primary_key=True)
    content_project_id: Mapped[int] = mapped_column(ForeignKey('content_projects.id'), index=True)
    line_index: Mapped[int]
    text: Mapped[str] = mapped_column(Text)
    start_time: Mapped[float | None]
    end_time: Mapped[float | None]


class ContentMedia(Base):
    __tablename__ = 'content_media'
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey('users.id'), index=True)
    provider: Mapped[str] = mapped_column(String(30), default='pixabay')
    provider_id: Mapped[str] = mapped_column(String(80))
    metadata_json: Mapped[dict] = mapped_column(JSON)
    favorite: Mapped[bool] = mapped_column(default=False)


class AestheticCollection(Base):
    __tablename__ = 'aesthetic_collections'
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey('users.id'), index=True)
    name: Mapped[str] = mapped_column(String(100))
    base_aesthetic: Mapped[str] = mapped_column(String(40))
    keywords: Mapped[list] = mapped_column(JSON)
    media_ids: Mapped[list] = mapped_column(JSON, default=list)


class ContentClip(Base):
    __tablename__ = 'content_clips'
    id: Mapped[int] = mapped_column(primary_key=True)
    content_project_id: Mapped[int] = mapped_column(ForeignKey('content_projects.id'), index=True)
    media_id: Mapped[int] = mapped_column(ForeignKey('content_media.id'))
    position: Mapped[int]
    start_time: Mapped[float]
    end_time: Mapped[float]
    source_start: Mapped[float] = mapped_column(default=0)
    media: Mapped[ContentMedia] = relationship()


class ContentRenderJob(Base):
    __tablename__ = 'content_render_jobs'
    id: Mapped[int] = mapped_column(primary_key=True)
    content_project_id: Mapped[int] = mapped_column(ForeignKey('content_projects.id'), index=True)
    status: Mapped[str] = mapped_column(String(30), default='queued', index=True)
    snapshot: Mapped[dict] = mapped_column(JSON)
    progress: Mapped[int] = mapped_column(default=0)
    error: Mapped[str | None] = mapped_column(Text)
    output_path: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now)
