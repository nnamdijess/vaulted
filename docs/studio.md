# Vaulted Studio

Studio is a private lyric-video workspace, separate from the music Library. Enter using **Studio** in the workspace navigation. No music re-upload is needed.

## Start locally on Windows

Keep the existing backend and frontend setup. Install the updated backend requirements from the repository root:

```powershell
cd backend
.\.venv\Scripts\python.exe -m pip install -r requirements-lock.txt
```

Add your own `PIXABAY_API_KEY` to **backend/.env**, then restart the backend. Never put it in a `NEXT_PUBLIC_` variable. A blank key produces a helpful setup message; editing songs, sections and lyrics still works.

Use three VS Code terminals:

```powershell
# Terminal 1, from backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```powershell
# Terminal 2, from frontend
npm.cmd run dev
```

```powershell
# Terminal 3, from backend
.\.venv\Scripts\python.exe -m app.studio_worker
```

Open http://localhost:3000/studio and sign in. The worker is required for rendering; a stopped worker leaves jobs safely queued. Only one worker may use a content directory. Restarting it requeues jobs interrupted by a crash. Do not run it against a different database or content directory than the API.

## FFmpeg and deployment

The existing `imageio-ffmpeg` executable is the default. Rendering requires H.264 (`libx264`), AAC, and the `subtitles` filter/libass. Set `FFMPEG_BINARY` to a full executable path if your bundled build lacks these features. Install FFprobe and set `FFPROBE_BINARY` for reliable metadata probing; common audio can fall back to FFmpeg inspection. A DejaVu Sans font is recommended for matching captions across machines.

On Ubuntu, a standard FFmpeg installation and `fonts-dejavu-core` provide the required codecs/filter/font on typical distributions. Check `ffmpeg -filters`, `ffmpeg -encoders`, and `ffprobe -version` before deploying. No packages or services on your Mac mini have been changed by this implementation.

Run the worker as an additional systemd service using the same user, backend working directory, environment file, virtual environment, database and storage locations as FastAPI. Its ExecStart should end in `.venv/bin/python -m app.studio_worker`; use `Restart=on-failure`. Stop the worker before moving/deleting storage or doing manual cleanup. Keep the existing Tailscale HTTPS origin in CORS_ORIGINS and secure cookie configuration. Studio uses the existing same-origin `/api` proxy; it needs no additional public port.

## Workflow

1. Create New, search your Library, choose a specific version. The version is pinned for this draft.
2. Choose a 10/15/20/30-second duration, then drag the highlighted waveform window to position it. The time ruler shows minutes/seconds; dragging preserves duration. Keyboard arrows move by one second (Shift: five); Home/End reach the bounds. Exact start/end fields remain available. Save section before syncing. Sections must fit the actual audio, with an MVP maximum of 60 seconds.
3. Paste lyrics and choose an aesthetic/style; Save draft. Original whitespace and line breaks are stored. Blank lines are preserved in the source text but skipped for synchronization.
4. Restart syncing, tap at the start of each line, undo or adjust times, then Save timing. Preview synced lyrics uses the timestamps currently visible in the inputs, even before saving; all lines need valid increasing times. Times are relative to the section. The last line ends with the section. Changing lyrics or section resets timing; changing the section also resets the sequence.
5. Generate Immediately, or Review Media. Search, preview, save favorite clips, select/deselect, and Generate Draft. Selected IDs persist in the generated sequence; unsaved selection checkboxes are local to the current visit. Clips use up to four seconds each; choose enough distinct clips to cover the section.
6. Preview draft, replace a segment, reroll visuals or order. These actions preserve lyrics, timing, source and section. Browser previews are approximate; final cuts are rendered by FFmpeg.
7. Render video, wait for the worker, preview and download the private MP4. Each export records its draft revision; subsequent edits do not mutate queued exports. Old exports remain available until the Studio draft is deleted.

Section previews share the global audio engine, pause normal listening and do not record streams. Leaving the editor restores the previous Library source/position, paused. Stock/export video playback pauses audio to avoid overlap.

## Provider and rendering behavior

In Lyrics & look, **Customize aesthetic** makes a private reusable collection from a built-in preset. Name it, edit its search keywords, and choose videos via search or saved clips. **Edit aesthetic collection** updates your collection across drafts; built-in presets remain unchanged. Save the draft to apply the chosen collection. Generate Immediately uses its curated video pool if populated (choose enough videos to fill the section), otherwise it searches the collection's keywords. Existing draft sequences and rendered exports are not rewritten by editing a collection.

Collections live in the additive `aesthetic_collections` table, with owner, name, base preset, keyword list and validated owned media IDs. `GET/POST /api/studio/aesthetics` lists/creates collections; `PUT /api/studio/aesthetics/{id}` edits them. Existing `content_projects.aesthetic` values remain valid; personal collections use `custom:<id>`. All reads, edits, searches and clip selections enforce ownership.

Pixabay is behind a `VisualProvider` interface. Each preset has weighted keyword groups; up to three distinct searches are interleaved and deduplicated. Search responses are cached on disk for 24 hours. Vertical footage is ranked ahead of footage requiring more cropping. Preview cards link to Pixabay. Only chosen render clips are downloaded, with HTTPS host checks, no redirects, bounded sizes and video content-type checks. The browser never receives the API key and cannot submit download paths or URLs.

The worker normalizes clips to 1080×1920, 30fps, centered 9:16 crops, straight cuts, H.264/yuv420p, AAC audio and MP4 fast-start. Lyrics use ASS/libass with escaped plain text. Highlight is line-level, not word-level. Black & White applies desaturation; other preset color treatments/animations are future work. Progress advances per normalized clip and at final assembly, not frame-by-frame.

MVP tradeoffs: fixed center crop, no clip trim UI, no transcription, no general video editor, no offline stock searches, no social posting. Clips are processed sequentially with two FFmpeg threads to limit memory/CPU. Encoding speed depends on the server. Source and export sizes consume disk; monitor free space.

## Storage and data safety

`CONTENT_DIR` defaults to repository-root `content/`, ignored by Git:

```
content/metadata/                     audio duration cache
content/provider-cache/               24-hour Pixabay results
content/projects/<id>/stock/           selected stock downloads
content/projects/<id>/temp/<job>/      intermediate segments (cleaned after jobs)
content/projects/<id>/renders/<job>.mp4 final exports
```

Startup adds new SQLAlchemy tables without altering/resetting existing music tables: `content_projects`, `content_lyric_lines`, `content_media`, `content_clips`, `content_render_jobs`. All content access requires owner authentication. Original audio remains in uploads. Songs/projects referenced by Studio cannot be deleted until their Studio drafts are removed. Content deletion is blocked while a render is active. Back up SQLite, uploads and content together.

## Routes and API

Pages: `/studio`, `/studio/new`, `/studio/[id]`. All APIs below use `/api/studio` and existing authenticated sessions:

| Endpoint | Purpose |
| --- | --- |
| GET `/songs?q=` | Owned song/version picker |
| GET `/versions/{id}/metadata` | Authorized cached duration |
| GET `/presets` | Aesthetic recipes and lyric styles |
| GET/POST `/projects` | List/create drafts |
| GET/PATCH/DELETE `/projects/{id}` | Read/edit/delete owned draft |
| PUT `/projects/{id}/timings` | Validate and save line start times |
| POST `/visuals/search` | Backend-only stock search |
| GET `/media/favorites` | Saved owned stock selections |
| PATCH `/media/{id}` | Favorite/unfavorite |
| POST `/projects/{id}/draft` | Selected/automatic/reroll/order sequence |
| PUT `/projects/{id}/clips/{clip_id}` | Replace one visual |
| POST `/projects/{id}/renders` | Queue immutable render snapshot |
| GET `/projects/{id}/renders/{job_id}` | Poll status/progress/error |
| GET `/projects/{id}/renders/{job_id}/video` | Private range-enabled preview; `?download=true` for download |

## Validation

Backend: `python -m unittest discover -s tests` from backend. Provider network requests are mocked; a short local synthetic clip exercises actual FFmpeg rendering. Frontend: `npm.cmd run lint`, `npm.cmd run typecheck`, `npm.cmd run build`, `npm.cmd run test:e2e`. Playwright uses isolated SQLite/upload/content directories and an empty provider key.

Manual live-provider smoke test after adding your key: choose a song, time two lyric lines, Review Media, preview and select enough clips, generate a draft, replace a clip, render with worker running, preview/download. Verify a different account cannot access the draft or export. Test at 390px and on your actual iPhone PWA (browser emulation does not fully represent iOS media behavior).
