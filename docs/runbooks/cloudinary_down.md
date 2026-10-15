# Runbook — Cloudinary is down

Last reviewed: 2026-10-08 · Next review: 2027-01

Cloudinary hosts: avatars, campaign images, campaign video, prayer audio/
video, DD-214 private uploads, identity-verification private uploads.
When it is down we lose both uploads AND reads (CDN assets 5xx).

## Detection

- Grafana panel **Video upload success rate** < 90 % for 5 minutes.
- Alert **Cloudinary 5xx share** > 5 %.
- User reports: broken campaign images, "upload failed" on new campaigns,
  video stuck in `processing`.

## Immediate response

1. Confirm with `curl -sS -o /dev/null -w '%{http_code}\n' https://res.cloudinary.com/${CLOUDINARY_CLOUD_NAME}/image/upload/v1/placeholder`
   and <https://status.cloudinary.com>.
2. **Disable uploads at the API edge** so the writes don't pile up in the
   client:
   ```bash
   node scripts/admin/set-flag.js uploads_enabled false
   ```
3. Post the status banner.

## Rollback / recovery

- Signed-URL expiries on existing private assets (identity, DD-214) are
  60 min by default — a Cloudinary outage that persists past that window
  will cause admin reviewers to see 404s even after service restores. The
  identity submission is still in Mongo; the asset re-signs on next read.
- When Cloudinary recovers:
  1. Flip `uploads_enabled` back on.
  2. Clear any `Video.status='uploading'` rows older than 1 h — they are
     dead:
     ```bash
     node scripts/jobs/sweep-stale-video-uploads.js --older-than=1h
     ```
  3. Watch the upload-success panel for 30 min before closing.

## Communication

- Status page: "Image and video uploads are temporarily unavailable. All
  previously uploaded media remains accessible once service restores."
- An in-product toast on upload fail is already rendered by the frontend;
  the flag flip above will swap that message to the "feature paused"
  variant.

## Known fast fixes

- Only uploads failing, reads OK → likely our `CLOUDINARY_API_SECRET`
  rotated. Check env and the Cloudinary dashboard access key.
- A single file 5xx with everything else green → an invalid `public_id`
  character (e.g. a slash where none was expected). Not a Cloudinary
  outage — route to the dev on call.
