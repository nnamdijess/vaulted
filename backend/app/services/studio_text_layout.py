"""Explicit word wrapping shared by libass preview and exported subtitles."""
from PIL import ImageFont
from app.services.studio_fonts import FONT_DIR, FONT_FILES


def wrap_words(text, font_key, size, width, word_spacing):
    font = ImageFont.truetype(str(FONT_DIR / FONT_FILES.get(font_key, 'Montserrat-Variable.ttf')), round(size))
    gap = font.getlength(' ') + word_spacing
    rows = []
    for paragraph in text.replace('\r', '').split('\n'):
        row = ''
        length = 0
        for word in paragraph.split():
            word_length = font.getlength(word)
            if row and length + gap + word_length > width:
                rows.append(row)
                row, length = '', 0
            # Split a single overlong word rather than clipping it.
            if word_length > width:
                for char in word:
                    if row and font.getlength(row + char) > width:
                        rows.append(row)
                        row = ''
                    row += char
                length = font.getlength(row)
            else:
                length += (gap if row else 0) + word_length
                row += (' ' if row else '') + word
        rows.append(row)
    return rows


def spaced_ass(text, gap):
    # Escape user text before introducing our own trusted formatting tags.
    text = text.replace('\\', '＼').replace('{', '｛').replace('}', '｝')
    return text.replace(' ', '{\\fsp' + str(gap) + '}\\h{\\fsp0}')


def justified_gap(text, font_key, size, width):
    """Extra space per word gap; never stretch letters or a single word."""
    words = text.split()
    if len(words) < 2:
        return 0
    font = ImageFont.truetype(str(FONT_DIR / FONT_FILES.get(font_key, 'Montserrat-Variable.ttf')), round(size))
    return max(0, (width - sum(font.getlength(word) for word in words)) / (len(words) - 1) - font.getlength(' '))


def justified_words(text, font_key, size, width):
    """Anchor outer words to the box edges instead of relying on ASS spacing."""
    words = text.split()
    if len(words) < 2:
        return [(text, 5, 540)]
    font = ImageFont.truetype(str(FONT_DIR / FONT_FILES.get(font_key, 'Montserrat-Variable.ttf')), round(size))
    lengths = [font.getlength(word) for word in words]
    left = (1080 - width) / 2
    gap = max(0, (width - sum(lengths)) / (len(words) - 1))
    result = [(words[0], 4, left)]
    cursor = left + lengths[0] + gap
    for word, length in zip(words[1:-1], lengths[1:-1]):
        result.append((word, 5, cursor + length / 2))
        cursor += length + gap
    result.append((words[-1], 6, left + width))
    return result
