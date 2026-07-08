/**
 * R2 video helpers — presigned direct-to-R2 uploads + prefix listing.
 *
 * Big trip videos are far too large to route through a Vercel function body,
 * so the browser PUTs them STRAIGHT to R2 with a short-lived presigned URL.
 * jibe's always-on box then compresses each raw file (ffmpeg → web MP4 + poster)
 * and deletes the original, so we never keep the giant files.
 *
 * Server-only — imports S3 credentials from server env. Kept separate from
 * `r2.ts` (the image path) so the two upload flows evolve independently.
 *
 * Storage layout (bucket = R2_BUCKET, served via NEXT_PUBLIC_R2_CDN_URL):
 *   _vidraw/{editionId}[/p/{bookingId}]/{name}.{ext}   raw upload (transient)
 *   _video/{editionId}[/p/{bookingId}]/{name}.mp4      compressed (served)
 *   _video/{editionId}[/p/{bookingId}]/{name}.jpg      poster frame
 */

import { S3Client, ListObjectsV2Command, DeleteObjectsCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const accessKeyId = () => process.env.CF_R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = () => process.env.CF_R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY;
const endpoint = () =>
  process.env.R2_S3_ENDPOINT ||
  (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined);
const bucket = () => process.env.R2_BUCKET || "np7-media";

/** True when R2 credentials + endpoint are configured (feature flag). */
export function r2VideoEnabled(): boolean {
  return Boolean(accessKeyId() && secretAccessKey() && endpoint());
}

/** Public CDN base URL (no trailing slash), or "" when unset. */
export function r2CdnBase(): string {
  return (process.env.NEXT_PUBLIC_R2_CDN_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_URL || "").replace(/\/$/, "");
}

let _client: S3Client | null = null;
function client(): S3Client {
  if (_client) return _client;
  _client = new S3Client({
    region: "auto",
    endpoint: endpoint()!,
    credentials: { accessKeyId: accessKeyId()!, secretAccessKey: secretAccessKey()! },
  });
  return _client;
}

/** Full public CDN URL for an object key. */
export function cdnUrlFor(key: string): string {
  const base = r2CdnBase();
  const enc = key.split("/").map(encodeURIComponent).join("/");
  return base ? `${base}/${enc}` : enc;
}

/** A short-lived presigned PUT URL so the browser can upload straight to R2. */
export async function presignPut(key: string, contentType: string, expiresSec = 3600): Promise<string> {
  return getSignedUrl(
    client(),
    new PutObjectCommand({ Bucket: bucket(), Key: key, ContentType: contentType }),
    { expiresIn: expiresSec }
  );
}

export type R2Object = { key: string; size: number; lastModified: string | null };

/** List every object under a prefix (paged; bounded so a huge prefix can't hang). */
export async function listUnderPrefix(prefix: string): Promise<R2Object[]> {
  const out: R2Object[] = [];
  let token: string | undefined;
  let pages = 0;
  do {
    const res = await client().send(
      new ListObjectsV2Command({ Bucket: bucket(), Prefix: prefix, ContinuationToken: token, MaxKeys: 1000 })
    );
    for (const o of res.Contents || []) {
      if (o.Key && !o.Key.endsWith("/")) {
        out.push({ key: o.Key, size: o.Size || 0, lastModified: o.LastModified ? o.LastModified.toISOString() : null });
      }
    }
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token && ++pages < 20);
  return out;
}

/** Delete a set of keys in one request (best-effort). */
export async function deleteKeys(keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  await client().send(
    new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true } })
  );
}

// -- Key builders -------------------------------------------------------------

/** Folder for a scope: "" = everyone, else a bookingId → its private subfolder. */
export function scopeFolder(root: "_vidraw" | "_video", editionId: string, bookingId?: string): string {
  return bookingId ? `${root}/${editionId}/p/${bookingId}` : `${root}/${editionId}`;
}

/** Filesystem-safe object name: keep letters/digits/dot/dash, collapse the rest. */
export function safeName(name: string): string {
  return name.normalize("NFKD").replace(/[^\w.-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 120) || "clip";
}
