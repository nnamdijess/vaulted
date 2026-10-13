# Music project management and Studio controls

Implemented locally on October 13, 2026. Not committed or pushed. Existing TikTok/slideshow work remains separate and locally disabled.

## Changes

- Song menus now offer Move to project. The dialog shows the current project, disables it as a destination, and confirms the move with a Move song button. Errors stay in the dialog; successful moves refresh the current music view.
- The move changes the existing song relationship in a SQLite write transaction. Song/version IDs, audio files, notes, metadata, favorites and Studio references remain intact. Both project track orders are normalized. Listening event IDs and timestamps are retained, with their project association following the song so deleting the former project cannot delete those events.
- Moved songs retain their original artwork, including an originally empty cover. Ordinary songs continue inheriting their project's artwork. Private cover serving, search, Studio covers and playback use the saved song artwork.
- Visuals uses Play/Pause and resumes at the paused timestamp. Existing media timing remains the source of truth; the Studio clock updates on animation frames, pauses at the section endpoint and reflects media events/errors. Editing a paused timeline retains its current preview position.
- Section controls now group Play/Pause, Restart and Last 3s. A generated draft's visuals and lyrics appear in the section preview. Restart resets playback only; Last 3s clamps to the selected section, including sections shorter than three seconds.
- Back to Video sits beside Review Media and scrolls to the actual preview without calling pause or resetting edits. It honors reduced-motion preferences and top safe-area spacing.
- Lyric vertical position is a fine-grained slider with Top/Middle/Bottom shortcuts. A normalized 0–1 value positions the entire multiline block inside the canonical canvas margins. Existing presets map exactly to 0, 0.5 and 1, and projects without a custom value retain their existing positioning. Autosave, preview and export share the saved value and layout engine.

## Database migration

One additive SQLite migration adds nullable `songs.cover_path`. It runs automatically through the existing startup migration system and is repeatable. Null means inherit project artwork; an empty string preserves an originally blank cover after moving. The new lyric position lives in the existing text_style JSON and requires no new column. No databases, media, projects or renders were deleted.

## Validation

- Full backend suite: 70 tests passed with experimental routes enabled only for the isolated test process. With those routes disabled, nine unrelated TikTok/photo tests returned 404; the remaining tests passed. Persistent feature configuration was not changed.
- Final targeted backend run: 4 tests passed, including authorization, stable IDs/audio/artwork bytes, listening history, track ordering, Studio references, failed-commit rollback, legacy position equivalence, position persistence/bounds and repeatable migration. Two of these checks were added after the full run.
- Browser regression batch: 8 tests passed across navigation, timeline playback, autosave, typography and mobile media editing. Final navigation run: 3 passed, including an additional short trimmed-section/end-boundary and rejected-play test. Nine distinct browser tests passed overall.
- Actual FFmpeg export test used custom vertical position 0.735; exported lyric bounds matched canonical preview bounds within two pixels, and cue timing was preserved.
- Production frontend build passed after final implementation changes. TypeScript and targeted ESLint passed. Mobile screenshots were inspected and horizontal overflow checks passed.

## Limits

Browser tests used desktop Chromium and iPhone-sized/touch layouts, not a physical iPhone Safari/PWA session. Device audio restrictions and background playback/suspension still need a real iPhone check. No remote Ubuntu deployment was performed. Moving a song appends it to the destination project. This preserves the song's cover rather than adopting the destination cover. The approved Studio UI refresh is now implemented; see studio-design-proposal.md for its scope and validation.

## Files changed for this request

Backend:
- app/api/music.py — move and private song-cover routes
- app/api/library.py — saved song artwork in search
- app/api/studio.py — saved song artwork in Studio
- app/models/music.py, app/schemas/music.py, app/db/migrations.py — artwork storage and move input
- app/schemas/studio.py, app/services/studio_layout.py — normalized vertical positioning
- tests/test_studio_navigation.py — move, migration and position regressions
- tests/test_studio_improvements.py — custom-position MP4 parity

Frontend:
- src/components/song-actions.tsx, music-workspace.tsx — move dialog and refreshed views
- src/components/audio-player.tsx, song-search.tsx — playback state and preserved covers
- src/components/studio/editor.tsx, draft-timeline.tsx — section/draft playback controls
- src/components/studio/text-style-panel.tsx, visuals.tsx, studio.css — position slider and preview navigation
- src/components/studio/workspace.tsx — song artwork URLs (also contains pre-existing TikTok edits)
- src/lib/api.ts, src/lib/studio-text-style.ts — types
- tests/studio-navigation.spec.ts, studio-video.spec.ts, studio-improvements.spec.ts — browser coverage

Documentation: this file and studio-design-proposal.md. Other dirty/untracked files predate this request and are not part of this change.

## Ubuntu deployment after reviewing and pushing this change

Wait for active renders/uploads to finish. Back up the configured SQLite database using your existing backup process. The update is still local, so pulling before it has been pushed will not install it.

```sh
cd ~/vaulted
git pull --ff-only origin main
cd frontend
npm run build
sudo systemctl stop vaulted-studio-worker
sudo systemctl restart vaulted-backend
sudo systemctl start vaulted-studio-worker
sudo systemctl restart vaulted-frontend
sudo systemctl --no-pager --full status vaulted-backend vaulted-studio-worker vaulted-frontend
```

The backend startup applies the additive migration before the worker is started. Refresh Vaulted afterward. On a locally running development setup, restart the backend and Studio worker; the frontend dev server should reload the component changes.

See studio-design-proposal.md for the implemented Untitled-inspired UI refresh.
