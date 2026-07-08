# jibe task — trip-video compressor (always-on box)

**Goal:** shrink the big raw trip videos uploaded by the admin/photographer, and
delete the giant originals so we never pay to store them. This runs on jibe's
always-on OpenClaw box, NOT on Vercel (Vercel has no ffmpeg and a short function
budget). Same "keyless, runs on the box" shape as the spot-descriptions cron.

## What already exists (built on `dev`/`main`)
- Admin uploads full-size clips straight to R2 via a presigned PUT →
  `_vidraw/{editionId}[/p/{bookingId}]/{name}.{ext}`.
- The worker script is committed: **`scripts/compress-videos.mjs`**.
- The member area shows only the compressed output (`_video/…`), and the admin
  uploader shows a "Compressing…" spinner for any raw with no `_video/…` yet.

## What the worker does (already implemented — just schedule it)
For every object under `_vidraw/`:
1. download → `ffmpeg` transcode to ≤1080p H.264 MP4 (`+faststart`, AAC) +
   a poster JPG (~1s in);
2. upload to `_video/{same relative path}.mp4` and `.jpg`;
3. **delete the raw `_vidraw/…` original**.
Idempotent (skips anything already compressed); a failed clip is left in place
and retried next run.

## Setup on the box
1. **Install ffmpeg** if missing: `ffmpeg -version` (Debian: `apt-get install -y ffmpeg`).
2. Ensure the box's checkout has the R2 env vars (same names the web app uses —
   already in `.env.local` there, or export them):
   `R2_ACCOUNT_ID` (or `R2_S3_ENDPOINT`), `R2_ACCESS_KEY_ID`/`CF_R2_ACCESS_KEY_ID`,
   `R2_SECRET_ACCESS_KEY`/`CF_R2_SECRET_ACCESS_KEY`, `R2_BUCKET` (=`np7-media`).
   The write keys are the SAME R2 secret keys already used for uploads.
3. `npm install` (needs `@aws-sdk/client-s3`, already a dependency).

## Run it
- One-shot / test: `node scripts/compress-videos.mjs`
- Schedule every ~10 min on the box (cron/systemd-timer/OpenClaw scheduler):
  `*/10 * * * * cd /home/np7/agents/main/git/np7-platform && node scripts/compress-videos.mjs >> /var/log/np7-video.log 2>&1`

## First live run
After scheduling, upload one clip from the admin (Editions → an edition →
Memories → **Trip videos**), then run the worker once by hand and confirm:
- a `_video/…mp4` + `_video/…jpg` appear,
- the `_vidraw/…` original is gone,
- the admin tile flips from "Compressing…" to a playable poster,
- the member sees it under My memories → that trip → Trip videos.

## Notes / future
- Single presigned PUT handles up to 5 GB per file; if we ever need bigger,
  switch the uploader to S3 multipart (server issues part URLs). Not needed yet.
- CRF 24 / veryfast is a good size/quality default for handheld clips; bump to
  CRF 22 if quality complaints, or add a 720p rung if we want adaptive later.
