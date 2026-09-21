# Cropping, profiles, mobile viewing and waveforms

## Use the new controls

Click a project's cover or choose **Change cover** from its actions menu. Select a
JPEG, PNG or WebP, view the entire image, then move the outlined square with a mouse or finger.
Drag its bottom-right handle to resize, or adjust Selection zoom.
Horizontal/Vertical position sliders also support precise keyboard adjustments.
**Save** uploads a 1024×1024 PNG of the selected area; **Cancel** leaves the stored
cover unchanged. Replacement updates owner cards/pages/player and subsequent public
page loads. An already open friend's page needs a refresh for new artwork. Original
uncropped images are not retained; choose the original file again to change the crop.
Existing limits (10 MiB input and 25 megapixels) remain; the backend independently
validates the saved image. There is no new image-library dependency.

Tap your profile picture (or the fallback avatar) in the top-right header to open `/profile`. It shows your existing
name/email, profile picture upload/replace/remove, and Light/Dark/System selection.
Logout and appearance controls now live only in the private profile. Theme selection
continues to persist on that browser and respect the system on first visit.

`users.avatar_path` is a nullable relative key added at startup without resetting
existing accounts or projects. Images are stored as `uploads/avatars/{uuid}.png`
(the API also validates JPEG/WebP uploads). The self-only GET/POST/DELETE
`/api/auth/avatar` routes derive the account from the session, never a supplied user
ID. Replacements/removals commit before deleting the old file. Profile images are
private and are not added to public shared project responses.

## Waveforms

The player requests real peak data for the selected version from
`GET /api/versions/{id}/waveform`; the shared player uses
`GET /api/public/{token}/songs/{id}/waveform` for the same latest version used by
shared playback. Every request checks ownership or the live share token before
reading the cache. Revocation still blocks subsequent requests. Peaks do not create
listen events. Seeking resets the analytics sample instead of adding skipped time.

The new `imageio-ffmpeg` Python dependency provides a packaged FFmpeg executable on
supported platforms, including this Windows environment. It converts audio to mono
8 kHz PCM on temporary disk, then summarizes it into at most 240 real peak values.
The waveform shows these values normalized to the track's maximum. A silent track
has a minimal baseline, not invented audio bars. Click/tap to seek or focus the
waveform and use the keyboard's native range controls. Played bars use the accent.

Derived JSON is cached under ignored `uploads/waveforms/`, keyed by the immutable
stored audio filename. It is regenerated only on cache misses, not every render.
These small derived files can safely be discarded when the app is stopped; they are
not original audio. Deleting audio may leave its derived cache file, which is never
accessible without an authorized existing version. This cache is not exposed as a
static directory. Browser memory holds only peak data, not a second decoded song.

Bounds: two concurrent decoders per backend process, 60-second decode timeout,
30-minute maximum track length for waveform generation, and about 29 MB maximum
scratch PCM per job. Input demuxers are restricted by supported audio extension;
network protocols are disabled. Unavailable/unsupported/overlong audio or a busy
worker falls back to an ordinary accessible seek slider without stopping playback.
Returning to the track retries. Cache publication races on Windows are nonfatal.
FFmpeg support does not add browser transcoding; playback still depends on the
browser's codec support. Cached/generated data already received cannot be recalled.

## Update and run on Windows

From the repository root:

```powershell
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements-lock.txt
```

Restart the backend and frontend using the README commands. Startup adds the avatar
field automatically. No new npm dependencies are required. On future Ubuntu setups,
use the Linux Python environment instead of copying the Windows virtual environment;
FFmpeg can also be selected through `IMAGEIO_FFMPEG_EXE` if the packaged binary does
not support that machine.

## Desktop mobile preview

With the app open in Firefox, press **Ctrl+Shift+M** to enter Responsive Design Mode.
Choose a phone preset or set the viewport to 390×844. In Chrome/Edge, open DevTools
with **F12**, then press **Ctrl+Shift+M** for device emulation. Browser emulation is
useful for layout and touch testing; it is not a substitute for a real phone's codecs.

## Open on your phone over trusted home Wi-Fi

These are optional manual steps. No firewall, router, real environment file, or network
settings were changed by this implementation. Use only your trusted local network;
HTTP is for local development. Internet hosting needs HTTPS and Secure cookies.

1. Connect PC and phone to the same Wi-Fi (not an isolated guest network). In a PC
   terminal run `ipconfig`. Find the Wi-Fi adapter's IPv4 address, for example
   `192.168.1.42`. Substitute your actual address in every example below.
2. Edit the existing `backend/.env` without replacing other settings. Include the
   exact frontend origin alongside the existing ones:

   ```dotenv
   CORS_ORIGINS=["http://localhost:3000","http://127.0.0.1:3000","http://192.168.1.42:3000"]
   COOKIE_SECURE=false
   ```

3. Add to `frontend/.env.local` (preserve other settings):

   ```dotenv
   API_INTERNAL_URL=http://127.0.0.1:8000
   DEV_ALLOWED_ORIGINS=192.168.1.42
   ```

4. Restart the backend in terminal 1, keeping it private to the PC:

   ```powershell
   cd C:\Users\Nnamd\Documents\ChatGPT\unreleased\backend
   .venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
   ```

5. Stop the existing frontend with Ctrl+C, then start it in terminal 2:

   ```powershell
   cd C:\Users\Nnamd\Documents\ChatGPT\unreleased\frontend
   npm.cmd run dev -- --hostname 0.0.0.0 --port 3000
   ```

6. Open `http://192.168.1.42:3000` on your phone and log in to your existing account.
   Do not use `localhost` on the phone: that means the phone itself. Cookies belong
   to the frontend hostname and device, so the PC login is not shared with the phone.
   API requests/audio/images stay on the same frontend origin, with HttpOnly cookies;
   do not expose port 8000. Shared links copied using this LAN address work on Wi-Fi.
7. If it cannot connect, check the address and Wi-Fi isolation first. Windows Firewall
   may require a narrowly scoped private-network rule for Node/port 3000. Ask before
   changing it; do not disable the firewall or open router ports. No firewall rule
   has been created here.

For HTTPS later, set `COOKIE_SECURE=true` and use the exact HTTPS frontend origin in
CORS_ORIGINS. Stop the LAN server when finished; use the usual local start command
to return to the previous workflow.

## Verification

Backend tests cover avatar type/size validation, replacement/removal and isolation,
additive account migration, real decoded peaks, per-version caching, waveform
ownership and share revocation. Browser tests cover save/cancel crop, touch dragging,
profile picture controls, persisted theme, mobile overflow, waveform click/tap and
keyboard seeking, decode failure fallback, shared playback and analytics regressions.
The mobile test saves screenshots under ignored `frontend/test-results/`.

```powershell
# backend/
.venv/Scripts/python.exe -m unittest discover -s tests -v
# frontend/
npm.cmd run test:e2e
npm.cmd run lint
$env:NEXT_DIST_DIR='.next-verify'
npm.cmd run typecheck
npm.cmd run build
Remove-Item Env:NEXT_DIST_DIR
```

### Firefox player reload regression

Player buttons and the seek input opt out of browser form-state restoration with
`autocomplete="off"`. Firefox can otherwise restore dynamic disabled states before
React hydrates, even when the server and initial React state agree. Do not replace
this with hydration-warning suppression.

The player reload test runs in Chromium by default. To check Firefox specifically:

```powershell
npx.cmd playwright install firefox
$env:TEST_BROWSER='firefox'
npm.cmd run test:e2e -- firefox-hydration
Remove-Item Env:TEST_BROWSER
```


## Saved project artwork and song search

**Change cover → Saved artwork** shows your retained project covers. Choose a thumbnail
to reuse it; the current one is marked Selected. Uploading a replacement, removing a
cover, or deleting a project retains the collection. Profile photos are separate.
Existing owned project covers are indexed on startup; previously deleted files cannot
be recovered. The collection retains saved crops, not uncropped originals.

The additive `artworks` table stores id, owner_id, relative file_path and created_at.
Files remain under `uploads/covers/` with unique names. Projects continue to reference
cover_path; shared files are never deleted by project operations.
Private endpoints: `GET /api/artworks`, `GET /api/artworks/{id}/image`, and
`PUT /api/projects/{id}/cover` with `{ "artwork_id": id }`. Ownership is checked for
both the artwork and project. Public links expose only the active project cover.

The Vault's **Search songs** matches partial titles, including Unicode case folding.
Results show artwork, artist and project, with links and playback of the latest version.
`GET /api/search/songs?q=...&offset=0` returns at most 50 results and has_more. Search
scans only owned titles (appropriate for the local MVP), not private notes. Clear search
to dismiss results. Requests are debounced and stale responses are ignored.

Player subtitles use song artist, then project artist, then owner display name.
Project and public-project responses now include owner_name, never the owner's email.
Anonymous shared pages keep their existing theme control.
