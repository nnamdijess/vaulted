from pathlib import Path

FONT_DIR = Path(__file__).resolve().parents[1] / 'assets' / 'studio-fonts'
FONTS = {'abel': 'Abel', 'anton': 'Anton', 'lobster': 'Lobster', 'blackletter': 'UnifrakturCook', 'mono': 'Space Mono'}
FONT_FILES = {'abel': 'Abel-Regular.ttf', 'anton': 'Anton-Regular.ttf', 'lobster': 'Lobster-Regular.ttf',
              'blackletter': 'UnifrakturCook-Bold.ttf', 'mono': 'SpaceMono-Regular.ttf'}

FONTS.update({'bebas': 'Bebas Neue', 'dela': 'Dela Gothic One', 'bowlby': 'Bowlby One SC'})
FONT_FILES.update({'bebas': 'BebasNeue-Regular.ttf', 'dela': 'DelaGothicOne-Regular.ttf', 'bowlby': 'BowlbyOneSC-Regular.ttf'})

FONTS.update({'montserrat': 'Montserrat', 'playfair': 'Playfair Display', 'oswald': 'Oswald', 'unbounded': 'Unbounded', 'josefin': 'Josefin Sans'})
FONT_FILES.update({'montserrat': 'Montserrat-Variable.ttf', 'playfair': 'PlayfairDisplay-Variable.ttf', 'oswald': 'Oswald-Variable.ttf', 'unbounded': 'Unbounded-Variable.ttf', 'josefin': 'JosefinSans-Variable.ttf'})
