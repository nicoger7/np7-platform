#!/usr/bin/env node
/**
 * Trip-video compressor — runs on jibe's always-on box (NOT on Vercel).
 *
 * The admin uploader drops full-size camera clips STRAIGHT into R2 under
 * `_vidraw/…`. This worker turns each one into a web-friendly MP4 + poster
 * under `_video/…`, then DELETES the giant raw original — so we never keep the
 * big files. Members only ever see the compressed `_video/…` output.
 *
 *   _vidraw/{editionId}[/p/{bookingId}]/{name}.{ext}   → in
 *   _video/{editionId}[/p/{bookingId}]/{name}.mp4      → out (H.264, faststart)
 *   _video/{editionId}[/p/{bookingId}]/{name}.jpg      → out (poster @ ~1s)
 *
 * Idempotent: skips any raw whose compressed .mp4 already exists. Safe to run on
 * a schedule (e.g. every 10 min) or one-shot. Requires `ffmpeg` on PATH.
 *
 * Env (same names as the web app; .env.local is loaded if present):
 *   R2_ACCOUNT_ID | R2_S3_ENDPOINT
 *   R2_ACCESS_KEY_ID | CF_R2_ACCESS_KEY_ID
 *   R2_SECRET_ACCESS_KEY | CF_R2_SECRET_ACCESS_KEY
 *   R2_BUCKET (default np7-media)
 */

import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { spawn } from "node:child_process";
import { mkdtemp, rm, readFile, stat } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

// -- tiny .env.local loader (no dependency) -----------------------------------
try {
  const env = await readFile(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch { /* no .env.local — rely on the real environment */ }

const BUCKET = process.env.R2_BUCKET || "np7-media";
const endpoint = process.env.R2_S3_ENDPOINT ||
  (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : null);
const accessKeyId = process.env.R2_ACCESS_KEY_ID || process.env.CF_R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || process.env.CF_R2_SECRET_ACCESS_KEY;

if (!endpoint || !accessKeyId || !secretAccessKey) {
  console.error("[compress-videos] Missing R2 credentials/endpoint — nothing to do.");
  process.exit(1);
}

const s3 = new S3Client({ region: "auto", endpoint, credentials: { accessKeyId, secretAccessKey } });

const log = (...a) => console.log(new Date().toISOString(), "[compress-videos]", ...a);

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    p.stderr.on("data", (d) => { err += d; });
    p.on("error", reject);
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${err.slice(-500)}`))));
  });
}

async function exists(key) {
  try { await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key })); return true; }
  catch { return false; }
}

async function listRaw() {
  const out = [];
  let token;
  do {
    const res = await s3.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: "_vidraw/", ContinuationToken: token, MaxKeys: 1000 }));
    for (const o of res.Contents || []) if (o.Key && !o.Key.endsWith("/")) out.push(o.Key);
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}

/** _vidraw/a/b/name.mov → { mp4: _video/a/b/name.mp4, poster: _video/a/b/name.jpg } */
function outKeys(rawKey) {
  const rel = rawKey.replace(/^_vidraw\//, "").replace(/\.[^.]+$/, "");
  return { mp4: `_video/${rel}.mp4`, poster: `_video/${rel}.jpg` };
}

async function download(key, dest) {
  const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  await pipeline(res.Body, createWriteStream(dest));
}

async function upload(key, file, contentType) {
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: key, Body: await readFile(file), ContentType: contentType,
    CacheControl: "public, max-age=31536000, immutable",
  }));
}

async function processOne(rawKey) {
  const { mp4, poster } = outKeys(rawKey);
  if (await exists(mp4)) {
    // Already compressed on a previous run — clean up the stray raw and move on.
    log("already done, deleting raw:", rawKey);
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: rawKey }));
    return;
  }
  const dir = await mkdtemp(join(tmpdir(), "np7vid-"));
  const inFile = join(dir, "in");
  const outFile = join(dir, "out.mp4");
  const posterFile = join(dir, "poster.jpg");
  try {
    log("downloading", rawKey);
    await download(rawKey, inFile);

    log("transcoding →", mp4);
    // Cap at 1080p, H.264 high, sane quality, web-streamable (+faststart), AAC audio.
    await run("ffmpeg", [
      "-y", "-i", inFile,
      "-vf", "scale='min(1920,iw)':-2",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "24", "-pix_fmt", "yuv420p",
      "-movflags", "+faststart",
      "-c:a", "aac", "-b:a", "128k",
      outFile,
    ]);
    // Poster frame ~1s in (fallback to first frame for very short clips).
    await run("ffmpeg", ["-y", "-ss", "1", "-i", inFile, "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", posterFile])
      .catch(() => run("ffmpeg", ["-y", "-i", inFile, "-frames:v", "1", "-vf", "scale='min(1280,iw)':-2", posterFile]));

    const before = (await stat(inFile)).size;
    const after = (await stat(outFile)).size;
    await upload(mp4, outFile, "video/mp4");
    await upload(poster, posterFile, "image/jpeg").catch((e) => log("poster upload failed (non-fatal):", e.message));

    log(`uploaded ${mp4} (${(before / 1e6).toFixed(0)}MB → ${(after / 1e6).toFixed(0)}MB), deleting raw`);
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: rawKey }));
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function main() {
  const raws = await listRaw();
  if (raws.length === 0) { log("no raw videos pending."); return; }
  log(`${raws.length} raw video(s) to process.`);
  for (const key of raws) {
    try { await processOne(key); }
    catch (e) { log("FAILED", key, "-", e.message); } // leave raw in place → retried next run
  }
  log("done.");
}

main().catch((e) => { log("fatal:", e); process.exit(1); });
