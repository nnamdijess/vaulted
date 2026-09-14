# Unreleased

A self-hosted workspace for unreleased music, inspired by Untitled.

## Current milestone

Scaffolding only: Next.js with TypeScript, FastAPI, SQLAlchemy/SQLite configuration,
and a reserved local uploads directory. Music features are intentionally not implemented yet.
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
      models/               # future Project, Song, SongVersion models
      schemas/              # future request/response schemas
      services/             # future music and storage operations
  uploads/                  # local audio; only .gitkeep is tracked
  .gitignore
  README.md
```

## Windows setup (PowerShell in VS Code)

Install Git, Node.js 22 LTS or newer, and Python 3.12 or newer. Enable the Python
installer's PATH option. Open the repository folder in VS Code.

From the repository root, create the backend environment:

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
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
The default SQLite file is `backend/music.db`; the default media root is `uploads/`.
Paths resolve from the repository, not from the terminal working directory.
`DATABASE_URL` can later select PostgreSQL after installing its driver and adding
migrations. SQLAlchemy sessions are isolated from route handlers.
`UPLOADS_DIR` is the single storage-root setting. Future storage services should
store relative media keys in the database, so moving uploads to the Ubuntu Mac mini
does not require rewriting absolute Windows paths. Back up both database and media.

Next milestone: Project, Song, and SongVersion models; project/song CRUD; metadata
(title, artist, BPM, key, status); notes per song/version; audio upload and browser
playback. Add a separate commit when the first upload/playback flow works.

## Git policy

Track all source, dependency manifests, lockfiles, and sanitized `.env.example` files.
Never commit real environment files, secrets, virtual environments, node_modules,
databases, generated builds, or audio. Review staged changes before each commit.
The uploads ignore rule covers every file type under that directory.
Setup uses separate commits for the root scaffold, backend, and frontend.
No push is performed automatically and force pushes are never required.

Framework references: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation)
and [FastAPI first steps](https://fastapi.tiangolo.com/tutorial/first-steps/).
