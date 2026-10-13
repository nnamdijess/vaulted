# Studio fonts

Unmodified static TrueType fonts from the Google Fonts repository, downloaded 2026-10-05:

- https://github.com/google/fonts/tree/main/ofl/abel
- https://github.com/google/fonts/tree/main/ofl/anton
- https://github.com/google/fonts/tree/main/ofl/lobster

Added 2026-10-08:

- Blackletter: UnifrakturCook Bold, https://github.com/google/fonts/tree/main/ofl/unifrakturcook
- Mono: Space Mono Regular, https://github.com/google/fonts/tree/main/ofl/spacemono

Each font is distributed with its corresponding SIL Open Font License file.
The authenticated Studio font endpoint serves these files to the browser.
The canonical Pillow layout engine uses these same files to generate transparent
text overlays for both browser previews and FFmpeg exports, without system fonts
or runtime downloads. Keep this directory when packaging the backend.

Added 2026-10-12 (unmodified variable TrueType, with matching OFL licenses):

- Roboto Mono: https://github.com/google/fonts/tree/main/ofl/robotomono
- Space Grotesk: https://github.com/google/fonts/tree/main/ofl/spacegrotesk
- Atkinson Hyperlegible Next: https://github.com/google/fonts/tree/main/ofl/atkinsonhyperlegiblenext

Mono and Unbounded remain bundled for existing drafts but are hidden in the font picker.
Default uses bundled Montserrat so wrapping does not depend on server-installed fonts.

Added 2026-10-12 for expanded typography (unmodified Google Fonts assets):

- https://github.com/google/fonts/tree/main/ofl/barlowcondensed (matching barlowcondensed-OFL.txt)
- https://github.com/google/fonts/tree/main/ofl/archivonarrow (matching archivonarrow-OFL.txt)
- https://github.com/google/fonts/tree/main/ofl/teko (matching teko-OFL.txt)
- https://github.com/google/fonts/tree/main/ofl/fjallaone (matching fjallaone-OFL.txt)
- https://github.com/google/fonts/tree/main/ofl/sairacondensed (matching sairacondensed-OFL.txt)
- https://github.com/google/fonts/tree/main/ofl/leaguegothic (matching leaguegothic-OFL.txt)
- https://github.com/google/fonts/tree/main/ofl/robotocondensed (matching robotocondensed-OFL.txt)

Barlow Condensed and Saira Condensed include upright weights 100–900. Archivo Narrow,
Teko and Roboto Condensed use variable weight fonts; Fjalla One and League Gothic
use their available regular weight. Unsupported weights resolve to the closest
available weight. Fonts load only inside Studio, when their previews are displayed.
