# Now Playing and profile updates

Restart the backend after updating so startup creates the new `favorites` table.
Existing projects, accounts, media, and SQLite rows are retained. No dependency
installation or environment changes are required.

## Using the controls

- Open your profile to edit **Display name**. This does not change your email or
  password. Explicit song and project artist names take precedence over your name.
- Select an accent swatch to preview it immediately. **Save preferences** keeps
  the choice; **Revert changes** or leaving the profile discards unsaved previews.
  Light, Dark, and System retain their existing behavior.
- Tap the playing track's artwork or title to open **Now Playing**. The phone view
  fills the screen; desktop uses a dialog. Close it with the close button or Escape.
  Opening and closing keep the same audio element and current position.
- Use the heart to favorite the song, regardless of its selected version. Favorites
  are private to the owner and are not available on shared pages. **View song details**
  opens the existing owner version/details page.
- Drag the numbered grip to reorder. Swiping elsewhere scrolls normally. Keyboard:
  Space to pick up, arrows to move, Enter to save, Escape to cancel.

## Playback modes

Shuffle randomizes upcoming tracks within the current queue without changing the
saved album order. Each cycle visits every track once. Previous follows listening
history (up to 500 entries), including across mode changes. Disabling shuffle uses
the current saved order for subsequent Next actions. Mode changes never seek or
restart the current track.

Repeat cycles **Off → All → One → Off**. Off stops at the end; All starts another
queue cycle (reshuffled when shuffle is on); One replays the selected recording
on natural ending. Manual Next still advances where another track is available.
Modes are kept only for the current page session, not in account settings.

Every actual replay starts a fresh analytics session. Pause/resume, seeking,
opening the view, and changing modes do not. Existing real listening thresholds
and duplicate-event protection remain in use.

Each new playback uses a fresh media URL to recheck owner/share authorization
instead of reusing the browser's buffered response. Already delivered audio cannot
be remotely erased. Shared queues identify the version loaded with the project;
if the owner replaces it with a newer version, reload the share page. Historical
versions remain private, and revoked tokens fail all new media requests.

## API and storage

- `PATCH /api/auth/profile`: `{ "display_name": "Your name" }`; session-derived
  account, trimmed nonempty name, maximum 200 characters, unknown fields rejected.
- `GET /api/songs/{id}/favorite`: returns `{ "favorite": true|false }`.
- `PUT /api/songs/{id}/favorite`: sets that boolean idempotently; authenticated
  owner only. SQLite `favorites` has a composite `(owner_id, song_id)` primary key
  and `created_at`. Song/project deletion removes dependent favorites.
- Owner song responses include `latest_version_name`; search returns version name
  and whether the artist fallback is the owner name.
- Shared track responses include current `version_id` and `version_name`. Public
  audio and waveform accept an optional `version_id` that must match the currently
  shared version. Token and download-policy checks remain required.

Startup's existing `create_all` safely adds the favorites table. No existing table
columns change. Image/audio storage is unchanged. Inline SVG controls and the
existing real-audio waveform add no UI or animation dependencies.

## Validation and manual checks

Automated coverage includes backend name validation, account isolation, favorite
idempotency/deletion, public-version authorization; browser profile preview/save/
revert/navigation, theme persistence/hydration, both-theme contrast, SVG controls,
expanded playback continuity, favorite failures, shuffle history, repeat analytics,
touch reorder/cancel/scrolling, failed saves, and existing upload/share/crop flows.
Browser automation uses Chromium with phone viewport/touch emulation, not a
physical iPhone or Safari.

On your iPhone, refresh after restarting the local servers, then:

1. Preview an accent, revert it, save another, and refresh. Edit your display name.
2. Play an album and tap the compact title/artwork. Check square artwork, the
   artist/version subtitle, waveform seeking, and uninterrupted collapse/reopen.
3. Favorite a song, reopen the view, and verify the saved heart. Try shuffle and
   each repeat mode with several tracks and with a single track.
4. Drag a grip, cancel a drag, and swipe outside it to scroll. Confirm no text
   callout appears on the handle. Ordinary text elsewhere should remain selectable.
5. Open a share link in a private browser. Confirm playback, no favorites/private
   details, and that revocation prevents the next playback request.

Physical Safari touch callouts, safe-area behavior, and background playback remain
device checks. No new background-playback guarantees or animation libraries are
introduced in this update.
