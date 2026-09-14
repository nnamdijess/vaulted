# Unreleased

A self-hosted workspace for unreleased music, inspired by Untitled.

## Current milestone

Working MVP: create projects and songs, save metadata and notes, upload multiple
audio versions, and play or seek through them in the browser. Next.js with
TypeScript calls a FastAPI API backed by SQLAlchemy, SQLite and local audio files.
No Docker or authentication is included at this stage. Run locally on loopback only.

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

Tables are created automatically on API startup. This creates missing tables; it
does not migrate existing tables when their schema changes. `Project` has many
`Song` records, and each song has many `SongVersion` records. No audio bytes are
stored in SQLite. Uploads use unique UUID filenames; their original names are
preserved as metadata. `MAX_UPLOAD_BYTES` defaults to 262144000 (250 MiB).

## Try the full flow

1. Start both servers using the commands above and open http://localhost:3000.
2. Enter a project name and optional description, then click **Create project**.
3. Open the project, enter a song title, artist, BPM, key, status and notes, then
   click **Create song**. Only the title is required; status defaults to demo.
4. Open the song. Enter a version name, optional notes, and choose a WAV, MP3,
   M4A, FLAC, AAC, OGG, OPUS or AIFF file. Click **Upload version**.
5. Use the audio controls to play and seek. Upload another version, including
   one with the same original filename, to confirm both versions remain available.
6. Refresh the page to confirm projects, metadata, notes and versions persist.

## REST endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Existing health check |
| GET, POST | `/api/projects` | List / create projects |
| GET | `/api/projects/{project_id}` | Project details |
| GET, POST | `/api/projects/{project_id}/songs` | List / create songs |
| GET | `/api/songs/{song_id}` | Song details |
| GET, POST | `/api/songs/{song_id}/versions` | List / upload versions |
| GET | `/api/versions/{version_id}/audio` | Inline audio with byte-range seeking |

Create projects and songs with JSON. Upload versions using multipart form fields
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
Tests cover API validation, duplicate filenames, byte ranges, CORS, and the actual
browser create/upload/play/seek flow. Browser playback runs muted. Test records
remain in the isolated test database; your normal library is not touched.

## Current limitations

- Creation and viewing only; editing/deleting metadata, notes or records is not yet implemented.
- No authentication or public sharing. Intended for local development.
- No transcoding or audio-content inspection: extensions are checked, and media
  types are inferred from them. Codec support depends on the browser; PCM WAV and
  MP3 are good choices for the first test.
- Upload size is checked while copying from the multipart temporary file; this
  is not a server-wide request-body limit. No resumable uploads or progress bar.
- No pagination, migrations, waveform display, or automatic media cleanup on
  manual database changes. Back up the database and uploads together.

## Git policy

Track all source, dependency manifests, lockfiles, and sanitized `.env.example` files.
Never commit real environment files, secrets, virtual environments, node_modules,
databases, generated builds, or audio. Review staged changes before each commit.
The uploads ignore rule covers every file type under that directory.
Setup uses separate commits for the root scaffold, backend, and frontend.
No push is performed automatically and force pushes are never required.

Framework references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation)
and [FastAPI first steps](https://fastapi.tiangolo.com/tutorial/first-steps/).
