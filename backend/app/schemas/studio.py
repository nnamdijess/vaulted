from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


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
    position: Literal['top', 'middle', 'bottom'] | None = None
    font_size: float | None = Field(default=None, ge=24, le=160)
    bold: bool = False
    italic: bool = False
    underline: bool = False
    letter_spacing: float = Field(default=0, ge=0, le=0.3)
    font_weight: int = Field(default=400, ge=100, le=900)
    tracking: float = Field(default=0, ge=-2, le=12)
    text_y: float | None = Field(default=None, ge=0, le=1, allow_inf_nan=False)
    text_x: float = Field(default=0.5, ge=0, le=1)
    last_line_align: Literal['left', 'center', 'right', 'justify'] = 'center'
    line_breaks: dict[str, str] = Field(default_factory=dict, max_length=200)

    @model_validator(mode='before')
    @classmethod
    def legacy_bold_weight(cls, value):
        if isinstance(value, dict) and value.get('bold') and 'font_weight' not in value:
            return {**value, 'font_weight': 700}
        return value

    @field_validator('line_breaks')
    @classmethod
    def only_line_break_changes(cls, value):
        for original, layout in value.items():
            if len(original) > 500 or len(layout) > 1000 or original.split() != layout.split() or len(layout.splitlines()) > 30:
                raise ValueError('Change only spaces and line breaks; keep the original lyric words.')
        return value

    word_spacing: float = Field(default=0, ge=0, le=160)
    line_spacing: float = Field(default=1.2, ge=1, le=2.5)
    text_width_px: int | None = Field(default=None, ge=240, le=972)
    text_width: int = Field(default=82, ge=40, le=90)
    color: str = Field(pattern=r'^#[0-9a-fA-F]{6}$')
    font: Literal['default', 'abel', 'anton', 'lobster', 'blackletter', 'mono', 'bebas', 'dela', 'bowlby', 'montserrat', 'playfair', 'oswald', 'unbounded', 'josefin', 'roboto_mono', 'space_grotesk', 'atkinson_next', 'barlow_condensed', 'archivo_narrow', 'teko', 'fjalla_one', 'saira_condensed', 'league_gothic', 'roboto_condensed']
    align: Literal['left', 'center', 'right', 'justify']


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


class Framing(Input):
    mode: Literal['fit', 'fill'] = 'fill'
    zoom: float = Field(default=1, ge=1, le=4)
    x: float = Field(default=0.5, ge=0, le=1)
    y: float = Field(default=0.5, ge=0, le=1)


class TimelineClip(Input):
    loop_source: bool = False
    media_id: int = Field(gt=0)
    # Timeline boundaries are persisted to six decimal places.
    duration: float = Field(ge=1/30 - 0.000001, le=60)
    source_start: float = Field(default=0, ge=0, le=600)
    framing: Framing = Field(default_factory=Framing)


class Timeline(Input):
    revision: int = Field(gt=0)
    clips: list[TimelineClip] = Field(max_length=200)


class LyricPreview(Input):
    text: str = Field(max_length=500)
    style: TextStyle
    preset: Literal['minimal', 'large', 'lower', 'highlight'] = 'minimal'


class EditorChanges(Input):
    revision: int = Field(gt=0)
    clips: list[TimelineClip] | None = Field(default=None, max_length=200)
    text_style: TextStyle | None = None
