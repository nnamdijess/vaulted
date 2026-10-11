# Studio timeline and mobile media upgrade

## Changes

- Timeline clips retain the existing relational model. Each clip gains a `framing` JSON column; an additive, repeatable startup migration defaults old rows to `{}` (centered Fill, 1x zoom).
- `PUT /api/studio/projects/{id}/timeline` accepts the draft revision and ordered clip durations, source offsets and framing. It checks ownership and revision, packs clips without gaps, and limits timelines to 200 clips within the song section. Partial timelines may be saved but cannot render until filled.
- Edge trims and splits snap to 30fps. Reordering preserves trim/crop; duplication copies them. Delete removes the timeline reference only. Insertion/duplication ripple later clips right and trim overflow at the end of the fixed song section. Undo restores the prior sequence. Extending a clip uses spare room, then trims the beginning of following clips; it is bounded by the source duration unless that clip loops to fit a replacement. Replacement preserves assigned duration and framing, resets the new source offset to zero. Reroll order now preserves individual edits.
- Crop uses normalized free-space positions (x/y 0–1), Fit/Fill and 1–4x zoom. Browser and FFmpeg apply the same 1080x1920 coordinate model, with even-pixel rounding for encoded video. Drag/pinch controls and numeric sliders are available. Timeline zoom uses a slider; horizontal scrolling is separate from handle dragging.
- Newly generated and inserted footage stops at its natural duration, including GIFs converted to MP4. Only short replacements loop to fill their assigned slot. An additive `loop_source` migration preserves older stretched assignments, and old render snapshots keep their existing behavior. Last 3s is in the Section step and previews the end of the selected song section.
- Font size is saved in `text_style.font_size` (24–160 output pixels). Missing sizes retain the existing 48/72 preset defaults. Transparent lyric PNGs come from the same FFmpeg/libass subtitle function and fonts as export, so typography and wrapping use identical coordinates. This requires the existing FFmpeg/libass runtime in the API process as well as the worker. New text/style combinations incur a short generation delay; caches and next-line prefetch reduce repeat work. The sync step remains an editing aid rather than a render-size preview.
- Completed renders offer confirmed deletion and Prepare Save / Share MP4. Preparation fetches an authenticated File; a second tap supplies the user gesture required by file sharing. Unsupported browsers receive an object-URL download or separate-tab link. Exports above 150 MiB use the separate-tab route. Photos is only an option when iOS offers it.
- Music Media Session metadata includes title, artist, album and authenticated artwork converted to a local data URL, plus playback/seek controls. No artwork becomes public.

## Original issues and limits

The previous preview remounted video elements at clip changes, corrected time frequently, and clamped short media at its last frame. Two stable video slots now preload the next clip, keep only the active slot playing, use modulo source time only for looping replacements and correct substantial drift. Existing authenticated byte-range media delivery and H.264/faststart upload normalization remain in use. No new proxy copies or source-quality migrations were introduced. Network buffering over Tailscale and hardware decoding on the actual iPhone still need measurement; this is not a guarantee of seamless playback on every device.

The old text preview used browser pixel sizes independent of the 1080x1920 export. Server-generated transparent text overlays now share the export subtitle engine. This adds bounded FFmpeg work to the API: two concurrent text renders, 64 cached combinations per API process, 32 image URLs per mounted preview. Playback can briefly wait for uncached lyrics on a slow server; test the old Mac mini before heavy use.

No production data, SQLite database, uploads or content directories were changed during development. Tests use isolated accounts/databases/media. Existing job snapshots remain readable with default framing/font size. Dependencies and service names do not change.

## Ubuntu deployment (not performed)

1. Publish the reviewed local commit to GitHub when ready. This task does not push it.
2. On Ubuntu, note the repository path, service names and actual DATABASE_URL, UPLOADS_DIR and CONTENT_DIR. Stop frontend, backend and Studio worker using their existing service manager (or Ctrl+C in all three terminals). Let running exports finish first.
3. While stopped, back up the database and complete uploads/content directories together, plus backend `.env` and frontend `.env.local`, outside the checkout. Preserve paths/permissions. Do not replace these files with laptop versions or delete them.
4. From the Ubuntu repository root, inspect then update:

```bash
git status --short
git branch --show-current
git pull --ff-only
```

Resolve local changes deliberately if pull refuses; never reset the server's data. The local commit must have been pushed first.

5. Install from lockfiles and build (starting at the repository root):

```bash
cd backend
.venv/bin/python -m pip install -r requirements-lock.txt
cd ../frontend
npm ci
npm run build
```

6. Ensure Ubuntu FFmpeg supports libass/subtitles, libx264, AAC and PNG, and `fonts-dejavu-core` is installed. Keep the existing Tailscale HTTPS and same-origin API proxy configuration. No new public ports, API keys or CORS origins are needed.
7. Restart the backend first so its startup migration adds framing and loop_source, then the worker, then frontend. Use the existing systemd units if configured. For manual terminals, replace `/path/to/vaulted` with the actual checkout:

```bash
# Backend terminal
cd /path/to/vaulted/backend
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

```bash
# Worker terminal
cd /path/to/vaulted/backend
.venv/bin/python -m app.studio_worker
```

```bash
# Frontend terminal (after the production build)
cd /path/to/vaulted/frontend
npm run start -- --hostname 0.0.0.0 --port 3000
```

Use your existing host/port bindings where different. A production service manager is preferable to terminals for ongoing hosting.
8. Open an existing draft, verify its media and styling, save a copy/test draft, and export a short test before regular use. On migration/startup failure stop services and inspect logs; do not reset the database. A rollback should use the matching backup set while services are stopped.

## Manual iPhone verification still required

Test both Safari and the installed home-screen web app over the existing HTTPS Tailscale URL:

- Drag/reorder and trim both edges; scroll the timeline separately. Pinch/drag framing and compare Fit/Fill in landscape and portrait clips. Wait for Saved, leave, reload and verify.
- Assign a subsecond GIF to a longer section; check loops, seeking, clip transitions and audio sync. Last 3s must stop at the selected boundary.
- Export a mixed sequence with noncentral crops and multiline large text. Compare preview framing and text with the MP4.
- Prepare then Save / Share MP4; try Save to Files, cancel, and repeat. Check whether Photos is offered. Use the separate-tab fallback and verify Studio remains available.
- Play private and shared albums, lock the phone, verify artwork/title changes and play/pause/previous/next/seek. iOS may ignore or cache artwork despite correct browser metadata; browser automation cannot establish system lock-screen behavior.
- Delete a disposable export, cancel another deletion, and confirm source clips/draft still load.

## Main implementation files

Backend: `app/api/studio.py`, `app/models/studio.py`, `app/db/migrations.py`, `app/schemas/studio.py`, `app/services/studio_renderer.py`, `app/services/studio_text_preview.py`.
Frontend: `components/studio/draft-timeline.tsx`, `timeline-preview.tsx`, `crop-controls.tsx`, `lyric-overlay.tsx`, `render-actions.tsx`, `text-style-panel.tsx`, `lib/studio-geometry.ts`, `lib/music-session.ts`, plus editor/player integration.

For very short clips, increase Timeline zoom or use the duration/source fields and Move earlier/later buttons when adjacent handles are too close for a finger. Timeline and text/font changes save automatically after a short pause through one revision-checked editor endpoint. Edits made during an in-flight request are queued, not overwritten by its response. Failed saves retain the edits and offer Retry; navigation is blocked while pending and closing/reloading warns. Additional clip controls are under Clip options. Space toggles playback when the timeline is focused, but never while typing. The insertion tray shows playable media previews and supports drag/drop or tap-to-insert.

## Previous validation results (before the autosave update)

- Backend: 36 unittest cases passed, including additive migration, authenticated timeline persistence, revision conflicts, real GIF-to-MP4 looping export, libass transparent lyric rasterization, pixel-based crop positions, scoped/missing-file render deletion and ownership.
- Browser: all 34 configured Playwright cases passed across the full run and focused reruns. The initial full run had a stale pre-logo theme selector and a GIF test interrupted by a development reload; the selector was updated and both tests passed on rerun. Coverage includes touch trimming, timeline drag/order, split/duplicate/delete, crop persistence, Last 3s, replacement timing, file-share/fallback/delete UI and Media Session metadata/control updates, plus existing music/auth/profile regressions.
- ESLint, `npm run typecheck` and `npm run build` passed. The build includes TypeScript checking.
- Actual iPhone hardware, native lock-screen UI, Photos/Files share sheet and production Tailscale performance were not tested. Follow the device checklist above.

## Autosave and direct editing validation

- 38 backend regression tests passed, plus a new one-frame round-trip regression after correcting microsecond rounding tolerance (39 cases total).
- All 37 Playwright tests passed in one complete run. New coverage includes live end trimming on a full timeline, touch edge trimming/reordering, delayed overlapping font/timeline saves, failed-save retry, reload persistence, Space versus typing, playable insert previews, drag/drop insertion and Undo.
- ESLint, TypeScript checks and the production build passed. A 390px mobile insertion-tray screenshot was inspected; actual iPhone testing remains outstanding.
- New footage uses each source at most once per generated draft and stops at its natural duration (up to the existing four-second default per clip). A small selected pool can therefore leave a partial timeline; add more footage before exporting. Short replacements and migrated older stretched assignments retain looping explicitly.

## Uploaded preview loading and reroll rotation

Library cards now show posters without fetching video data. Play attaches a video source on demand; another preview, scrolling offscreen, or leaving the page releases it. Retry explicitly reloads a failed source. Authenticated uploaded video/poster responses release their database connection before streaming, while retaining ownership checks and byte-range support. Missing local files return 404 rather than a file-response server error.

Each draft now keeps a bounded, private media-use history (an additive `media_history` JSON column). Generation prefers unseen and then least recently used candidates, so clearing and rerolling does not repeatedly return to the same small subset. This cannot provide variety beyond the selected pool.

Validation: 41 backend tests, five focused browser tests (including a 50-card library, failed-request retry, offscreen unload, MP4/GIF touch playback, timeline/autosave), lint and production build with TypeScript passed. Ubuntu/Tailscale verification remains required after deploying the commit and restarting the backend and rebuilt frontend. No user media was modified or re-encoded.
