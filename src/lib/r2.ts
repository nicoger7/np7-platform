/**
 * Cloudflare R2 upload/delete helpers (S3-compatible via @aws-sdk/client-s3).
 *
 * Server-only -- never import this module in client components or pages that
 * run in the browser. All credential env vars are server-side only.
 *
 * Env vars (two spellings accepted — .env.local / the migrate script use the
 * short names; the CF_-prefixed ones also work, so whichever set gets pasted
 * into Vercel activates R2):
 *   CF_R2_ACCESS_KEY_ID     | R2_ACCESS_KEY_ID        - R2 access key ID
 *   CF_R2_SECRET_ACCESS_KEY | R2_SECRET_ACCESS_KEY    - R2 secret access key
 *   R2_S3_ENDPOINT          | derived from R2_ACCOUNT_ID
 *   R2_BUCKET                                         - bucket name (np7-media)
 *   NEXT_PUBLIC_R2_CDN_URL  | NEXT_PUBLIC_R2_PUBLIC_URL - public CDN base URL
 */

import { S3Client, DeleteObjectCommand, CopyObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

// -- Env (accept both spellings) ----------------------------------------------

const accessKeyId = () => process.env.CF_R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = () => process.env.CF_R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY;
const endpoint = () =>
  process.env.R2_S3_ENDPOINT ||
  (process.env.R2_ACCOUNT_ID ? `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com` : undefined);

/** Public CDN base URL (no trailing slash), or "" when unset. */
export function r2CdnBase(): string {
  return (process.env.NEXT_PUBLIC_R2_CDN_URL || process.env.NEXT_PUBLIC_R2_PUBLIC_URL || "").replace(/\/$/, "");
}

// -- Client (lazy singleton) --------------------------------------------------

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (_client) return _client;
  _client = new S3Client({
    region: "auto",
    endpoint: endpoint()!,
    credentials: {
      accessKeyId: accessKeyId()!,
      secretAccessKey: secretAccessKey()!,
    },
  });
  return _client;
}

// -- Public API ---------------------------------------------------------------

/**
 * Returns true when all R2 credentials and endpoint are configured.
 * Use this as a feature flag before calling uploadToR2 / deleteFromR2.
 */
export function r2Enabled(): boolean {
  return Boolean(accessKeyId() && secretAccessKey() && endpoint());
}

/**
 * Upload a file to R2.
 *
 * @param body        - File, Buffer, or Uint8Array to upload
 * @param key         - Object key (path) inside the bucket, e.g. spots/123/photo.jpg
 * @param contentType - MIME type of the object
 * @returns Public CDN URL of the uploaded object
 */
export async function uploadToR2(
  body: File | Buffer | Uint8Array,
  key: string,
  contentType: string
): Promise<string> {
  const bucket = process.env.R2_BUCKET || "np7-media";
  const cdnBase = r2CdnBase();

  const resolvedBody = body instanceof File
    ? Buffer.from(await body.arrayBuffer())
    : body;

  const upload = new Upload({
    client: getClient(),
    params: {
      Bucket: bucket,
      Key: key,
      Body: resolvedBody,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    },
  });

  await upload.done();

  return `${cdnBase}/${key}`;
}

/**
 * Delete an object from R2 by key.
 *
 * @param key - Object key (path) inside the bucket
 */
export async function deleteFromR2(key: string): Promise<void> {
  const bucket = process.env.R2_BUCKET || "np7-media";
  await getClient().send(
    new DeleteObjectCommand({ Bucket: bucket, Key: key })
  );
}

/**
 * Move (rename) an object inside R2: server-side copy + delete of the old key.
 * Silently ignores a missing source (e.g. a file that only exists in the
 * Supabase catalog and was never mirrored) — the move is best-effort.
 */
export async function moveInR2(fromKey: string, toKey: string): Promise<void> {
  const bucket = process.env.R2_BUCKET || "np7-media";
  try {
    await getClient().send(
      new CopyObjectCommand({
        Bucket: bucket,
        CopySource: `${bucket}/${encodeURIComponent(fromKey).replace(/%2F/g, "/")}`,
        Key: toKey,
      })
    );
    await deleteFromR2(fromKey);
  } catch {
    /* source absent in R2 — nothing to move */
  }
}

/**
 * Extract the R2 object key from a full CDN URL.
 * Returns null if the URL does not belong to the configured CDN base.
 */
export function keyFromR2Url(url: string): string | null {
  const cdnBase = r2CdnBase();
  if (!cdnBase || !url.startsWith(cdnBase + "/")) return null;
  return url.slice(cdnBase.length + 1);
}
