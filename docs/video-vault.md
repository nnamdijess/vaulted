# Shared Studio Video Vault

The Video Vault shares uploaded Studio footage and its folders. Music, drafts,
renders, stock-search collections, and account preferences remain private.

## Start using it

1. Deploy the backend and frontend together and restart the API and Studio worker.
   Startup creates the vault tables and adds nullable vault references to existing
   media and folders. Existing libraries remain private until activation.
2. Sign in as `itsfadajesse@gmail.com`, open Studio → Video Vault, and select
   **Activate Video Vault**. Existing uploaded videos and folders join the vault
   in place; media files are not copied or moved.
3. Enter a friend's registered email, create an invitation, and copy the link.
   Send it yourself. The app does not send email. Create links from the server's
   normal reachable address, not a laptop-only localhost address.
4. The friend signs in with that email and accepts the invitation. They can then
   create a Studio draft using their own song and browse **Visuals → Review Media**.

`VIDEO_VAULT_ADMIN_EMAIL` can override the configured owner email. It authorizes
creation only; an existing vault's owner is recorded by account ID and does not
change when the setting changes. There is one active vault membership per account.
Invites expire after seven days, work once, and are stored as hashes. Issuing a
replacement invite for the same email revokes earlier unused invitations.

## Permissions and deletion

| Action | Owner | Contributor |
| --- | --- | --- |
| Browse/use shared clips with own songs | Yes | Yes |
| Upload shared clips and create shared folders | Yes | Yes |
| Edit clip titles/tags or move clips | Any shared clip | Own uploads |
| Rename/delete shared folders | Yes, deletion requires empty folder | No |
| Delete shared clips | Yes | No |
| Invite/remove people | Yes | No |
| Read another account's music, drafts, or exports | No | No |

Contributors' pre-existing private uploads/folders stay private. Their new uploads
and folders go into the vault after joining. Private clips cannot be moved into
shared folders or vice versa. Duplicate detection checks the accessible library.

Removing a member blocks browsing and new use. Their contributions remain in the
vault. References already saved in their own drafts remain editable, previewable,
and renderable; completed videos are unaffected. Removing a clip from such a draft
means it cannot be selected again without restored membership.

Deleting footage replaces references across every affected draft with a black
screen, retaining durations and lyrics. Pools and history stop referencing it and
draft revisions advance, preventing stale saves from restoring deleted media.
Completed exports stay unchanged. Files needed by an already queued/running render
are retained until that render finishes, then cleaned up by the worker. The clip
disappears from browsing and streaming immediately.

## Implementation and verification

- Models and additive database upgrade: `app/models/studio.py`, `app/db/migrations.py`.
- Membership/invites: `app/api/video_vault.py`, `app/services/video_vault.py`.
- Media permissions, folders, deletion, and duplicates: `app/api/studio.py`,
  `app/services/media_duplicates.py`.
- UI: `/studio/vault`, `video-vault.tsx`, `visuals.tsx`, `media-folders.tsx`,
  and the Studio dashboard link in `workspace.tsx`.
- Tests: `tests/test_video_vault.py`, migration preservation, and
  `frontend/tests/video-vault.spec.ts` (two browser accounts, mobile layout).

Run the browser test with a unique `VIDEO_VAULT_ADMIN_EMAIL` environment variable;
the isolated Playwright backend inherits it. Never use a live database for tests.
The unrelated local TikTok/photo experiments remain controlled by their existing
feature flag and are not required by Video Vault.
