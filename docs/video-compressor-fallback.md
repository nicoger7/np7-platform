# Video compressor — fallback worker (rarely needed)

**Primary path (no server, no AI, nothing to run):** trip videos are compressed
**in the photographer's browser** (WebCodecs hardware encoding via mediabunny)
before upload — only the small ≤1080p MP4 + poster ever reach R2 (`_video/…`),
exactly like the photo resize-on-upload. See `src/lib/video-compress.ts` and
the uploader in `src/components/edition-memories-uploader.tsx`.

**This fallback only matters** for uploads from a browser WITHOUT WebCodecs
(very old browsers). Those land as raw originals under `_vidraw/…` and show
"Compressing…" in the admin until something converts them.

## Running the fallback (plain node + ffmpeg — any machine, e.g. Nico's Mac)
```
brew install ffmpeg        # once
node scripts/compress-videos.mjs
```
The script (idempotent, safe to re-run) converts every `_vidraw/…` object to a
web MP4 + poster under `_video/…` and deletes the raw original. R2 credentials
are read from `.env.local`. If `_vidraw/` is empty it exits immediately — so in
practice you'll likely never need this.
