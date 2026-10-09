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


class TextStyle(Input):
    bold: bool = False
    italic: bool = False
    underline: bool = False
    letter_spacing: float = Field(default=0, ge=0, le=0.3)
    text_width: int = Field(default=82, ge=40, le=90)
    color: str = Field(pattern=r'^#[0-9a-fA-F]{6}$')
    font: Literal['default', 'abel', 'anton', 'lobster', 'blackletter', 'mono', 'bebas', 'dela', 'bowlby', 'montserrat', 'playfair', 'oswald', 'unbounded', 'josefin']
    align: Literal['left', 'center', 'right']


class Search(Input):
    provider: Literal['pixabay', 'pexels'] = 'pixabay'
    aesthetic: str = 'night-drive'
    query: str = Field(default='', max_length=100)
    page: int = Field(default=1, ge=1, le=10)
    count: int = Field(default=18, ge=1, le=30)


class Draft(Input):
    provider: Literal['pixabay', 'pexels'] = 'pixabay'
    media_ids: list[int] = Field(default_factory=list, max_length=1000)
    mode: Literal['selected', 'automatic', 'reroll', 'order'] = 'selected'


class Replace(Input):
    media_id: int = Field(gt=0)


class Favorite(Input):
    favorite: bool


class MediaDetails(Input):
    title: str = Field(max_length=200)
    tags: str = Field(max_length=1000)


class CollectionInput(Input):
    name: str = Field(min_length=1, max_length=100)
    base_aesthetic: str
    keywords: list[str] = Field(min_length=1, max_length=12)
    media_ids: list[int] = Field(default_factory=list, max_length=100)

    @field_validator('name')
    @classmethod
    def clean_name(cls, value):
        if not value.strip():
            raise ValueError('Name is required')
        return value.strip()

    @field_validator('keywords')
    @classmethod
    def clean_keywords(cls, value):
        if any(not word.strip() or len(word.strip()) > 100 for word in value):
            raise ValueError('Each keyword must be 1–100 characters')
        return list(dict.fromkeys(word.strip() for word in value))
