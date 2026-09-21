# Vaulted

A self-hosted workspace for unreleased music, inspired by Untitled.

## Current milestone

Artwork, share links, private notes, listening insights and persistent light/dark/system
themes are now available. See [the feature guide](docs/project-features.md) for API
details, public-hosting boundaries, counting rules, hydration findings and tests.

Upload-first MVP: create a project, add multiple audio tracks, edit details later,
and listen to the project in a persistent sequential player. Next.js with
TypeScript calls a FastAPI API backed by SQLAlchemy, SQLite and local audio files.
Account authentication and user ownership are included. See [authentication setup](docs/authentication.md), especially the explicit command for claiming existing projects. No Docker is included.

## Structure

```text
unreleased/                 # repository root (equivalent to music-app/)
  frontend/                 # Next.js App Router and TypeScript
  backend/
    app/
      api/                  # REST routes
      core/                 # environment configuration
      db/                   # SQLAlchemy engine and sessions
      models/               # Project, Song, SongVersion models
      schemas/              # validated request/response schemas
      services/             # local file storage
  uploads/                  # local audio; only .gitkeep is tracked
  .gitignore
  README.md
```

## Windows setup (PowerShell in VS Code)

Install Git, Node.js 22 LTS or newer, and Python 3.13. Enable the Python
installer's PATH option. Open the repository folder in VS Code.

From the repository root, create the backend environment:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements-lock.txt
Copy-Item backend/.env.example backend/.env
```

If Windows provides the Python launcher instead, use `py -3 -m venv backend/.venv`.
The commands use the virtual environment interpreter directly; activation and
PowerShell execution-policy changes are unnecessary.
Copy example environment files only when the destination does not already exist.

Run the backend in terminal 1:

```powershell
cd backend
.venv/Scripts/python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

API health: http://127.0.0.1:8000/api/health
Interactive API docs: http://127.0.0.1:8000/docs

Install and run the frontend in terminal 2, starting from the repository root:

```powershell
cd frontend
npm.cmd ci
Copy-Item .env.example .env.local
npm.cmd run dev
```

Open http://localhost:3000. `npm.cmd` avoids PowerShell's script-policy restriction
on `npm.ps1`. Stop either server with Ctrl+C.

## Checks

```powershell
# From frontend/
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
# From backend/, with the API running in another terminal
Invoke-RestMethod http://127.0.0.1:8000/api/health
```

## Configuration and future work

Backend configuration comes from `backend/.env` or process environment variables.
`requirements.txt` declares direct dependency ranges; `requirements-lock.txt` records
the exact versions verified on Windows with Python 3.13. Update both deliberately
when upgrading dependencies. The frontend uses `package-lock.json` with `npm ci`.
The default SQLite file is `backend/music.db`; the default media root is `uploads/`.
Paths resolve from the repository, not from the terminal working directory.
`DATABASE_URL` can later select PostgreSQL after installing its driver and adding
migrations. SQLAlchemy sessions are isolated from route handlers.
`UPLOADS_DIR` is the single storage-root setting. The storage service saves
relative media keys in the database, so moving uploads to the Ubuntu Mac mini
does not require rewriting absolute Windows paths. Back up both database and media.

Tables are created automatically on API startup. A small idempotent SQLite upgrade
adds `Project.artist` and `Song.position` to existing databases. Existing IDs,
metadata, notes, versions and audio paths are preserved. On first upgrade, track
positions preserve the previous newest-first order. Later uploads append in the
order received. Restart the backend to apply the upgrade. `Project` has many
`Song` records, and each song has many `SongVersion` records. No audio bytes are
stored in SQLite. Uploads use unique UUID filenames; their original names are
preserved as metadata. `MAX_UPLOAD_BYTES` defaults to 262144000 (250 MiB).

## Try the full flow

1. Start both servers using the commands above and open http://localhost:3000. Register or log in; claim legacy projects using the authentication guide if needed.
2. Click **New Project**, enter a name and optional artist/owner and description.
3. Open the album-style project and click **Add Tracks**. Choose one or multiple
   WAV, MP3, M4A, FLAC, AAC, OGG, OPUS or AIFF files, then **Upload tracks**.
   Each file creates one Song and its initial Original SongVersion. Titles come
   from filenames without extensions. No metadata entry is required.
4. Open a track's three-dot menu to **Rename**, **Edit details**, **Upload new
   version**, **Download** the latest original file, or **Delete** the song and
   all its versions/files after confirming in the dialog.
5. Click **Play All** or a track's play button. The bottom player supports
   play/pause, seek, elapsed/duration and previous/next. It advances on audio end,
   uses the latest version of each track, and stops at the end of the queue.
   Playback persists while navigating within the app, but not after a full reload.
6. Open a song title to inspect metadata and play older versions. Uploading a
   new version keeps the same song and position. Refresh to verify persistence.

Batch uploads are all-or-nothing, with at most 50 files per request and the
configured per-file size limit. Duplicate original filenames are safe. An invalid
file rolls back the batch and removes already-saved batch files. Position numbers
are stable; deleting a track may leave gaps. Older tracks with no audio remain
visible and editable; Play All skips them until a version is added.

## REST endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Existing health check |
| GET, POST | `/api/projects` | List / create projects |
| GET | `/api/projects/{project_id}` | Project details |
| GET, POST | `/api/projects/{project_id}/songs` | List / create songs |
| POST | `/api/projects/{project_id}/tracks` | Batch upload tracks and initial versions |
| GET, PATCH, DELETE | `/api/songs/{song_id}` | View / edit / delete song |
| GET, POST | `/api/songs/{song_id}/versions` | List / upload versions |
| GET | `/api/versions/{version_id}/audio` | Inline audio with byte-range seeking |
| GET | `/api/versions/{version_id}/audio?download=true` | Download original file |

The legacy JSON create-song endpoint remains available. Batch track uploads use
repeated multipart `files` fields. PATCH accepts any subset of title, artist, BPM,
key, status and notes; use null to clear BPM and empty strings for optional text.
Create projects with JSON (including optional artist). Upload versions using multipart form fields
`version_name`, `notes` (optional), and `file`. Swagger at `/docs` provides forms
and the full schemas. Missing records return 404, unsupported extensions 415,
invalid/empty input 422, and files exceeding the configured size limit 413.

## Automated integration tests

From `frontend/`, after installing both sets of dependencies:

```powershell
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

The tests start their own backend on port 8011 and frontend on port 3011. They
use `frontend/.e2e-data/` for a separate database and audio files, all ignored by
Git. These ports must be free. Fixtures are generated in code; no audio is tracked.
The test frontend uses `.next-e2e/` to coexist with a normal dev server. Production
verification can use `$env:NEXT_DIST_DIR='.next-verify'; npm.cmd run build` while
the dev server is running (remove that environment variable afterwards).
Tests cover API validation, duplicate filenames, batch rollback, byte ranges,
CORS, track edits/deletion, downloads, navigation and sequential browser playback.
Browser playback runs muted. Test records
remain in the isolated test database; your normal library is not touched.

From `backend/`, run the legacy database preservation test:

```powershell
.venv/Scripts/python.exe -m unittest discover -s tests -v
```

## Current limitations

- Existing version notes cannot yet be edited. Project menus support
  settings, notes, artwork, insights, sharing and deletion.
- Play queues are snapshots. Press Play All again to include new uploads or latest versions.
- Private workspaces require login. Share pages remain anonymous read-only token links.
  Future hosting requires HTTPS and secure cookies; see the authentication guide.
- No transcoding or audio-content inspection: extensions are checked, and media
  types are inferred from them. Codec support depends on the browser; PCM WAV and
  MP3 are good choices for the first test.
- Upload size is checked while copying from the multipart temporary file; this
  is not a server-wide request-body limit. No resumable uploads or progress bar.
- No pagination, full migration framework or automatic media
  cleanup on manual database changes. Song deletion removes stored audio after
  committing metadata deletion; a filesystem failure is logged and can leave an
  orphaned file for manual cleanup. Back up the database and uploads together.

## Git policy

Track all source, dependency manifests, lockfiles, and sanitized `.env.example` files.
Never commit real environment files, secrets, virtual environments, node_modules,
databases, generated builds, or audio. Review staged changes before each commit.
The uploads ignore rule covers every file type under that directory.
Setup uses separate commits for the root scaffold, backend, and frontend.
No push is performed automatically and force pushes are never required.

Framework references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation)
and [FastAPI first steps](https://fastapi.tiangolo.com/tutorial/first-steps/).

See [cropping, profiles, mobile preview and waveforms](docs/media-profile-mobile.md) for the latest controls and exact same-Wi-Fi setup instructions.

## Vaulted appearance and organization

The app is now named Vaulted. Existing repository paths, accounts and uploads are unchanged.
Your library defaults to **Vault**. Open your profile to change its label and choose
green, blue, purple, pink, orange or teal accents. These preferences are saved to
your account and work with Light, Dark and System themes.

Drag a track number with a mouse or touch to reorder songs. The order saves on drop
and is reflected in public shares and the current project queue without restarting
the playing song. Keyboard: focus a track number, Space to pick up, arrows to move,
Enter to save, Escape to cancel. This replaces the Sort tracks dialog.

The persistent player now uses a compact floating dock and shorter real-audio
waveform with a playhead. On phones, elapsed/duration text is visually hidden to
leave room for track information, playback controls and seeking in one row.

Tap the playing artwork/title for the expanded **Now Playing** view with favorites,
shuffle, repeat, and waveform seeking. Profile now supports display-name editing
and live accent previews with Save/Revert. See [Now Playing and profile updates](docs/now-playing.md)
for playback rules, API additions, and phone testing instructions.
