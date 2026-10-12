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
The render worker copies the same directory into each temporary render workspace
and passes it to libass as `fontsdir`, without relying on a font installation or
runtime downloads. Keep this directory when packaging the backend.

Added 2026-10-12 (unmodified variable TrueType, with matching OFL licenses):

- Roboto Mono: https://github.com/google/fonts/tree/main/ofl/robotomono
- Space Grotesk: https://github.com/google/fonts/tree/main/ofl/spacegrotesk
- Atkinson Hyperlegible Next: https://github.com/google/fonts/tree/main/ofl/atkinsonhyperlegiblenext

Mono and Unbounded remain bundled for existing drafts but are hidden in the font picker.
Default uses bundled Montserrat so wrapping does not depend on server-installed fonts.
