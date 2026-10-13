# Studio UI refresh

Implemented locally on October 13, 2026 following approval of the Untitled-inspired proposal. Vaulted branding, artwork, themes and existing workflows are retained.

## Implemented

- Artwork-first project cards with readable titles, song names and status pills. The landing page keeps five recent projects and three exports, with existing full-list links.
- A compact editor heading and five-step navigation with a clear active step.
- Separate playback and timeline-editing toolbars. Play/Pause and elapsed time stay together; Split, Add clips and Undo remain distinct.
- A text inspector with searchable, collapsible Font controls, an open Position & alignment group, and collapsible Size & spacing controls. Custom color and manual line breaks remain available.
- Occasional visual actions grouped under More visual options, with existing confirmations preserved. Review Media and Back to Video remain directly available.
- Larger export previews and quieter secondary actions.

## Responsive behavior

Desktop uses a preview/timeline column and a bounded inspector. At 900px and below the inspector stacks beneath the preview. Project cards use five columns on desktop, three at medium widths, two on typical phones and one below 340px. The page remains the main scroll container; playback is not sticky, preserving phone editing space. Focus outlines, touch targets, reduced motion and light/dark themes are retained.

## Validation

All 15 distinct browser checks passed across the regression run and focused rerun, including playback, autosave, typography, navigation, mobile MP4/GIF uploads, responsive cards and font search. TypeScript, targeted ESLint and the production build passed. Desktop light/dark and phone screenshots were inspected. Mobile tests used Chromium emulation; physical iPhone Safari/PWA testing remains outstanding.

## Implementation

The scoped stylesheet is frontend/src/components/studio/studio-refresh.css, imported by workspace.tsx. Component changes cover recent-projects.tsx, editor.tsx, draft-timeline.tsx, text-style-panel.tsx and visuals.tsx. Browser coverage is in studio-refresh.spec.ts with existing typography and media checks adjusted to open the new control groups.

Not committed, pushed or deployed. These UI changes need a frontend rebuild/restart on the deployed server; the local development server reloads them automatically.
