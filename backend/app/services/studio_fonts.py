from pathlib import Path

FONT_DIR = Path(__file__).resolve().parents[1] / 'assets' / 'studio-fonts'
FONTS = {'abel': 'Abel', 'anton': 'Anton', 'lobster': 'Lobster', 'blackletter': 'UnifrakturCook', 'mono': 'Space Mono'}
FONT_FILES = {'abel': 'Abel-Regular.ttf', 'anton': 'Anton-Regular.ttf', 'lobster': 'Lobster-Regular.ttf',
              'blackletter': 'UnifrakturCook-Bold.ttf', 'mono': 'SpaceMono-Regular.ttf'}

FONTS.update({'bebas': 'Bebas Neue', 'dela': 'Dela Gothic One', 'bowlby': 'Bowlby One SC'})
FONT_FILES.update({'bebas': 'BebasNeue-Regular.ttf', 'dela': 'DelaGothicOne-Regular.ttf', 'bowlby': 'BowlbyOneSC-Regular.ttf'})

FONTS.update({'montserrat': 'Montserrat', 'playfair': 'Playfair Display', 'oswald': 'Oswald', 'unbounded': 'Unbounded', 'josefin': 'Josefin Sans'})
FONT_FILES.update({'montserrat': 'Montserrat-Variable.ttf', 'playfair': 'PlayfairDisplay-Variable.ttf', 'oswald': 'Oswald-Variable.ttf', 'unbounded': 'Unbounded-Variable.ttf', 'josefin': 'JosefinSans-Variable.ttf'})

FONTS.update({"roboto_mono": "Roboto Mono", "space_grotesk": "Space Grotesk", "atkinson_next": "Atkinson Hyperlegible Next"})
FONT_FILES.update({"roboto_mono": "RobotoMono-Variable.ttf", "space_grotesk": "SpaceGrotesk-Variable.ttf", "atkinson_next": "AtkinsonHyperlegibleNext-Variable.ttf"})

FONTS.update({'barlow_condensed':'Barlow Condensed','archivo_narrow':'Archivo Narrow','teko':'Teko','fjalla_one':'Fjalla One','saira_condensed':'Saira Condensed','league_gothic':'League Gothic','roboto_condensed':'Roboto Condensed'})
FONT_FILES.update({'barlow_condensed':'BarlowCondensed-Regular.ttf','archivo_narrow':'ArchivoNarrow-Variable.ttf','teko':'Teko-Variable.ttf','fjalla_one':'FjallaOne-Regular.ttf','saira_condensed':'SairaCondensed-Regular.ttf','league_gothic':'LeagueGothic-Variable.ttf','roboto_condensed':'RobotoCondensed-Variable.ttf'})
