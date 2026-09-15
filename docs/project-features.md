# Artwork, sharing, insights, notes and themes

## What changed

The upload-first Project -> Song -> SongVersion workflow remains intact. Project
menus now provide Insights, Notes, Share project, Change cover, Sort tracks,
Project settings and Delete project. Track menus retain all previous actions and
add a dedicated private Notes dialog. Artwork appears on albums and library cards.
The public `/share/{token}` page contains only cover, title, artist, ordered tracks,
playback and optional downloads. It uses the same persistent player and theme switch.

## Files

- Backend models: `backend/app/models/music.py`.
- Additive startup upgrades: `backend/app/db/migrations.py` and `app/main.py`.
- Feature routes and public allowlists: `backend/app/api/project_features.py`.
- Song deletion also removes associated listens in `backend/app/api/music.py`.
- Request validation: `backend/app/schemas/project_features.py` and `schemas/music.py`.
- Cover validation/storage: `backend/app/services/artwork.py`, `core/config.py`.
- Pillow dependency: `backend/requirements.txt` and `requirements-lock.txt`.
- Owner UI: `frontend/src/components/project-actions.tsx`, `project-cover.tsx`,
  `music-workspace.tsx`, `song-actions.tsx`, and `src/lib/api.ts`.
- Public UI: `frontend/src/app/share/[token]/page.tsx` and `components/shared-project.tsx`.
- Player and counting: `components/audio-player.tsx`, `src/lib/playback-insights.ts`.
- Themes: `components/theme-provider.tsx`, `app/layout.tsx`, `app/globals.css`.
- Same-origin public API proxy: `frontend/next.config.ts`.
- Tests: `frontend/tests/project-features.spec.ts`, `tests/music.spec.ts`,
  `tests/fixtures.ts`, `playwright.config.ts`, and `backend/tests/test_migrations.py`.

## Data and artwork

Projects gain nullable `cover_path` and `share_token`, private plain-text `notes`,
`sharing_enabled` and `allow_downloads`. Existing projects default to no artwork,
empty notes and sharing disabled. The startup migration adds only missing columns
and a unique token index; no database reset occurs. Existing songs and versions
are retained. The previous positional migration remains idempotent.

`listen_events` records `id`, `project_id`, `song_id`, UTC `created_at`, `source`
(owner/shared), random anonymous `session_id`, and unique `playback_id`.
Deleting a song or project removes its related listening history.

Cover bytes live under `uploads/covers/{uuid}.{extension}` (or the configured
uploads root); SQLite stores only that relative key. JPEG/PNG/WebP are checked by
extension and actual Pillow-detected format and verified for structural validity.
The default limit is 10 MiB and 25 megapixels. SVG is not accepted. Replacement
commits the new key before removing the old file. Removal restores the placeholder.
Filesystem cleanup failures are logged; backups should include database and uploads.

Project and song notes are plain text with a 10,000-character limit. They are not
included in public responses, including nested track/version information. The public
response uses an explicit allowlist instead of the owner response schemas.

## API

All paths below are under `/api`.

| Method | Path | Purpose |
| --- | --- | --- |
| PATCH | `/projects/{id}` | Project name, artist, description |
| PATCH | `/projects/{id}/notes` | Private project notes |
| DELETE | `/projects/{id}` | Delete project, versions, artwork and listens |
| PATCH | `/projects/{id}/order` | Persist exact `song_ids` ordering |
| POST / GET / DELETE | `/projects/{id}/cover` | Upload, serve, remove artwork |
| GET / PUT | `/projects/{id}/share` | Read/update enabled, allow_downloads, regenerate |
| GET | `/projects/{id}/insights` | Totals, per-song counts, top song, last 20 listens |
| POST | `/songs/{id}/listens` | Record owner/local qualified stream |
| GET | `/public/{token}` | Read-only project allowlist |
| GET | `/public/{token}/cover` | Token-checked artwork |
| GET | `/public/{token}/songs/{id}/audio` | Token-checked latest audio, range support |
| GET | `/public/{token}/songs/{id}/audio?download=true` | Download if allowed |
| POST | `/public/{token}/songs/{id}/listens` | Record qualified shared stream |

Existing song PATCH, batch upload, version and audio APIs remain supported. Project
owner reads now include cover path and notes. PUT sharing receives `enabled`,
`allow_downloads` and optional `regenerate`; tokens are returned only by this owner
settings API. Notes use `{ "notes": "..." }`. Covers use multipart `file`.

## Sharing and network boundaries

Tokens use `secrets.token_urlsafe(32)` (256 random bits). Enabling creates a token;
disabling deletes it. Regenerating creates a different token. Every public data,
cover, audio, download and listen request checks the active token and song membership.
Revoked/disabled tokens return 404, and public responses specify `Cache-Control:
no-store`. Already downloaded/buffered audio cannot be recalled. Allow downloads
controls explicit downloads; it is not DRM and cannot prevent saving streamed audio.

The owner app remains unauthenticated and is intended for the local owner. **Keep
FastAPI bound to 127.0.0.1; do not expose the private backend port or proxy `/api/*`
wholesale.** The frontend forwards only `/api/public/*` to the internal backend.
`API_INTERNAL_URL` (server-only) defaults to `http://127.0.0.1:8000`. Shared pages use
same-origin public requests, so listeners never need the backend's private address.

A link copied from localhost works only on that machine. For friends to use links,
serve the Next.js frontend at a reachable hostname, preferably HTTPS, and open the
project using that hostname before copying its link. Keep the backend loopback-only.
This change does not publish the app or configure a domain, TLS, router, or tunnel.
For a LAN frontend after building, `npx.cmd next start --hostname 0.0.0.0 --port 3000`
is available; HTTPS is recommended for Internet hosting. Do not expose owner API
routes when configuring a reverse proxy. A production owner login is future work.
Use `--no-access-log` with Uvicorn and configure proxy logs appropriately if you
want share URLs and visitor IPs excluded from infrastructure access logs.

## Stream counting and privacy

At the start of each deliberate track playback, the client generates a fresh random
playback UUID. A random listener UUID lives in sessionStorage for that tab; there is
no account ID, geographic collection, IP field, device signature or fingerprint.
Playback UUIDs are generated only during browser playback handlers, never in render.

The player sums real playback time using audio time deltas bounded by monotonic wall
clock time. Seeking resets sampling and does not add the seek jump. Pause/resume
keeps the same playback record. A stream qualifies at `min(30, duration / 2)` seconds.
The client submits only after that threshold, and the backend validates the reported
threshold again. The endpoint determines owner/shared source, not a caller field.

The database's unique playback ID prevents duplicate counts on retries or repeated
pause/resume. Requests below threshold do not insert rows. Retries reuse the ID.
Starting another track/replay starts a new playback session that must qualify again.
Counts are lightweight client-reported insights, not fraud-resistant billing metrics:
a malicious client can fabricate durations/listens. No invasive anti-fraud tracking
is added. Insights show total, per-song, most played, owner/shared split and recent
listens without exposing session identifiers in the UI.

## Hydration investigation: evidence and limits

The reported error described server `disabled=null` versus client `disabled=true`
for the previous-track button. In the supplied branch at the start of this work:

- There was no theme implementation or localStorage/browser-state initialization.
- The queue initialized to `[]` and index to `0` on both server and client.
- The expression `!current || index === 0` already evaluated to true in both places.
- Reading the running localhost server's HTML showed `aria-label="Previous track"
  disabled=""`, not an absent/null disabled attribute.

Consequently, the exact historical trigger is **not reproducible or established**
from the available source/runtime. It would be inaccurate to claim that a particular
localStorage read, browser extension, or stale bundle caused it. The reported symptom
means the server markup and first client state differed, but its original origin
requires the failing build or a reproducible browser session.

This implementation explicitly computes boolean `canPlay`, `canPrevious`, `canNext`
from the same empty initial queue and never restores playback state during render.
The theme begins as literal `system` in both SSR and first client render. CSS media
queries respect system preference immediately; an effect reads the saved override
only after hydration. Theme changes update a wrapper attribute, not the audio state.
No suppression flags, SSR disable, or client-only application shell are used. Dates
in fetched lists are formatted only after client fetching, not in initial SSR markup.

Tests assert the actual SSR disabled attributes, no initial hydration errors, system
preference, both theme selections and refresh persistence, plus previous/next behavior
during a live theme change. The original warning was not reproduced in these tests.

## Run and test

From the repository root, update backend dependencies:

```powershell
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements-lock.txt
```

Restart the backend normally; startup applies additive migrations. In `frontend/`,
run `npm.cmd ci` if needed, then `npm.cmd run dev`. Open http://localhost:3000.

1. Click an album cover, choose a valid image, Save; replace it, then Remove cover.
2. Add project notes from Project actions; add song notes from its track menu.
3. Enable sharing, copy the link, open in a private browser window. Check artwork,
   track order, Play All and individual playback. Owner actions/notes are absent.
4. Toggle downloads, reload the shared page, and test the download control.
5. Regenerate or disable sharing; reload the old link and test its audio URL (404).
6. Play less than half a short track: no stream. Listen beyond half, then pause/resume:
   one stream. Seek near the end without listening: no stream. Inspect project Insights.
7. Switch Light, Dark and System; refresh and inspect the console. Previous/next
   remain disabled with an empty queue and correctly enabled during project playback.
8. Use Sort tracks, Project settings and existing upload/version actions to verify
   the album workflow. Delete only a disposable test project when testing deletion.

Automated checks:

```powershell
# In backend/
.venv/Scripts/python.exe -m unittest discover -s tests -v
# In frontend/
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run test:e2e
npm.cmd run build
```

Integration tests use separate ports/databases/uploads. Build verification uses
`.next-verify` when needed to coexist with an existing dev server. User audio,
artwork, SQLite files and generated test artifacts are ignored by Git.
