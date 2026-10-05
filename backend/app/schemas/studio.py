from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator


class Input(BaseModel):
    model_config = ConfigDict(extra='forbid', allow_inf_nan=False)


class Create(Input):
    song_version_id: int = Field(gt=0)
    title: str = Field(min_length=1, max_length=200)

    @field_validator('title')
    @classmethod
    def title_not_blank(cls, value):
        if not value.strip():
            raise ValueError('Title is required')
        return value.strip()


class Edit(Input):
    title: str = Field(min_length=1, max_length=200)
    start_time: float = Field(ge=0)
    end_time: float = Field(gt=0)
    lyrics_text: str = Field(max_length=20000)
    aesthetic: str
    lyric_style: str


class Timing(Input):
    starts: list[float] = Field(max_length=200)


class Search(Input):
    aesthetic: str = 'night-drive'
    query: str = Field(default='', max_length=100)
    page: int = Field(default=1, ge=1, le=10)
    count: int = Field(default=18, ge=1, le=30)


class Draft(Input):
    media_ids: list[int] = Field(default_factory=list, max_length=30)
    mode: Literal['selected', 'automatic', 'reroll', 'order'] = 'selected'


class Replace(Input):
    media_id: int = Field(gt=0)


class Favorite(Input):
    favorite: bool
