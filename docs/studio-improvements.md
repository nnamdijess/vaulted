# Studio improvements — 12 October 2026

Studio improvements prepared for main. Production deployment remains a separate step; production settings are unchanged.

## Behavior

- Uploaded video cards have a neutral, 44px trash control and a confirmation dialog. The authenticated delete route checks ownership and blocks stock media, timeline references, saved selections, aesthetic collections, and queued/running render snapshots. Successful deletion removes the upload folder and database record; absent files are tolerated. Library cards and the current selection update immediately. Clearing a timeline continues to preserve its reroll pool.
- Back to top scrolls the media browser into view without resetting filters or selection, and respects reduced motion.
- Lyrics use explicit rows with editable line breaks, including blank rows. The editor supports region width and horizontal position, alignment, final-line alignment, line spacing, font size, real font weights, and tracking. A single word stays intact. Excessively tall blocks shrink to fit; overlong words wrap.
- `studio_layout.py` is the canonical 1080 × 1920 layout and raster engine. It measures the bundled font, calculates word/row coordinates, and creates transparent PNG overlays. Both preview and MP4 use those pixels; the worker renders one overlay per cue rather than per frame. Cue times and the existing whole-cue highlight color are preserved.
- Profile has a compact native accessible color picker, live preview, and server-persisted preferences. Light/dark UI shades are adjusted for contrast. Render text color remains independent.
- Studio no longer shows a separate Drafts list. Draft projects remain accessible through recent/all projects and existing URLs. Create New has a plus icon.
- The font picker groups condensed/display fonts separately. Added Barlow Condensed, Archivo Narrow, Teko, Fjalla One, Saira Condensed, League Gothic, and Roboto Condensed; retained Oswald, Bebas Neue, Anton and the other existing options. Previously hidden legacy fonts remain bundled for old drafts. See the font asset README for sources and redistribution licenses.

## Main changed files

- Backend routes: `backend/app/api/studio.py`, `backend/app/api/auth.py`.
- Typography schema/engine: `backend/app/schemas/studio.py`, `backend/app/services/studio_layout.py`, `studio_text_preview.py`, `studio_renderer.py`, `studio_fonts.py` and `backend/app/assets/studio-fonts/`.
- Studio UI: `frontend/src/components/studio/visuals.tsx`, `text-style-panel.tsx`, `workspace.tsx`, `studio-icon.tsx`, `render-actions.tsx`, `studio.css`, and `frontend/src/lib/studio-text-style.ts`.
- Profile/theme: `frontend/src/components/profile.tsx`, `auth-provider.tsx`, and `frontend/src/lib/accent-color.ts`.
- Tests: `backend/tests/test_studio_improvements.py`, `test_studio.py`, `test_word_spacing.py`; `frontend/tests/studio-improvements.spec.ts`, `studio-dashboard.spec.ts`, `studio-video.spec.ts`, `studio.spec.ts`, and the updated preset selector in `vaulted.spec.ts`.

## Validation

- Backend Studio, typography, and authentication regression suites passed.
- Browser checks passed for custom accent persistence/contrast, Studio navigation, editable rows, preview loading, deletion confirmation and reference rejection, reduced-motion scrolling/state preservation, and portrait layout.
- Existing MP4/GIF touch previews, tagging, filtering, crop controls, and draft generation were checked.
- A real worker-generated H.264/AAC MP4 was decoded and compared with preview text bounds (within 2 pixels after compression). Frames before the first cue and during subsequent cues were checked.
- Lint, explicit TypeScript checks, and the production build passed.

Tests use temporary/test-only accounts, media, and databases. No existing user uploads or project data were deleted. Portrait checks use browser emulation; a physical iPhone and the Ubuntu deployment were not exercised in this workspace.

## Migration and deployment

No database migration is required: typography settings use the existing JSON field, and the existing accent string column accommodates HEX values. Older typography settings receive defaults and legacy bold remains supported.

When these changes are deliberately committed and deployed:

1. Include the new font files, licenses, layout module, shared icon component and color helper.
2. Pull the chosen commit on the Ubuntu server and build the frontend with `npm run build` from `~/vaulted/frontend`.
3. Restart `vaulted-backend`, `vaulted-studio-worker`, and `vaulted-frontend` after active renders finish.
4. Refresh the browser. Existing MP4s stay unchanged; render again to apply new typography.

The workspace also contains earlier TikTok/photo work. Review the intended files/hunks before a future commit; this task does not enable or deploy that integration.

Follow-up: removed Studio text-color swatches and Profile preset/HEX controls. Both now use a single compact color box; saved legacy preset preferences still resolve correctly.
