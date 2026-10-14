# Lyric effects and optional fonts

Local font installation update: Arial Nova Regular was found in the installed Microsoft Store package and copied into the Git-excluded private folder. The supplied `HelveticaNeueCyr-Light.otf` was installed as a separate **Helvetica Neue Cyr Light** option (weight 300), preserving its true family/style. Both fonts were verified through the shared renderer in vertical and landscape formats. Helvetica Neue Regular remains unavailable. Restart the backend/worker and refresh the editor. The Mac mini still needs the corresponding font files installed separately; Git does not include them.

This update is local; it has not been pushed or deployed.

Outline has an enable toggle, color, and thickness (0–12 export pixels). Shadow has an enable toggle, color, blur (0–30), horizontal/vertical offsets (−40 to 40), and opacity. Both are saved in the existing project text_style JSON and included in immutable render snapshots. No database migration is required.

Old drafts preserve their existing 1px dark outline and no shadow. Both landscape and vertical preview/export use the same Pillow rasterizer. Large effects reserve extra canvas margins to avoid cutting off text. The small typography sample uses CSS; the video preview is the authoritative export match.

Helvetica Neue and Arial Nova are registered throughout the lyric font system. Their actual files are not present in this repository or the checked local font folders. They remain visibly disabled as “Not installed” rather than silently rendering another font under those names. Install font files you have permission to use on the backend machine:

```
backend/app/assets/studio-fonts/private/HelveticaNeue.ttf
backend/app/assets/studio-fonts/private/ArialNova.ttf
```

This private folder is excluded from Git. Use actual regular TrueType files; don't rename an unrelated font. Both browser font previews and rendered video use these same server files. The initial support exposes regular weight (400); existing italic text uses the shared renderer's synthetic slant. Restart backend and worker after adding/replacing files, then refresh the editor. The regular font files need to be installed separately on the laptop and Mac mini if using both.

The Studio Recent Content Projects arrow overlay is removed, including the expanded project list. Cards remain links with the existing focus/click behavior.

## Files

- Backend: `app/schemas/studio.py`, `app/services/studio_fonts.py`, `app/services/studio_layout.py`, `app/api/studio.py`.
- Frontend: `src/lib/studio-text-style.ts`, `src/components/studio/text-style-panel.tsx`, new `text-effects.tsx`, `recent-projects.tsx`, `studio.css`, `studio-refresh.css`.
- Tests: new `backend/tests/test_text_effects.py`, extended `test_studio_formats_folders.py`, and `frontend/tests/studio-improvements.spec.ts`.
- `.gitignore`: exclude private font files.

Tests cover legacy defaults, effect color/opacity, validation, save/reload, font availability and absent-font rejection, real exports with effects in both formats, and arrow-free clickable cards. Actual Helvetica Neue/Arial Nova rendering still needs verification after their files are installed.

After a separately requested push, deploy the update, rebuild the frontend, and restart `vaulted-backend`, `vaulted-studio-worker`, and `vaulted-frontend`. Wait for active renders to finish before restarting the worker. Check one outline/shadow export on the Mac mini and refresh the iPhone PWA to load the new controls.
