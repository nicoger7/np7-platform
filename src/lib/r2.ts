/**
 * Cloudflare R2 upload/delete helpers (S3-compatible via @aws-sdk/client-s3).
 *
 * Server-only — never import this module in client components or pages that
 * run in the browser. All credential env vars are server-side only.
 *
 * Env vars required:
 *   CF_R2_ACCESS_KEY_ID       - R2 access key ID
 *   CF_R2_SECRET_ACCESS_KEY   - R2 secret access key
 *   R2_S3_ENDPOINT            - full S3-compatible endpoint URL from Cloudflare
 *   R2_BUCKET                 - bucket name (np7-media)
 *   NEXT_PUBLIC_R2_CDN_URL    - public CDN base URL (e.g. https://media.np-seven.com)
 */

import { S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";

// ── Client (lazy singleton) ────────────────────────────────────────────────

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (_client) return _client;
  _client = new S3Client({
    region: "auto",
    endpoint: process.env.R2_S3_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.CF_R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.CF_R2_SECRET_ACCESS_KEY!,
    },
  });
  return _client;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Returns true when all R2 credentials and endpoint are configured.
 * Use this as a feature flag before calling uploadToR2 / deleteFromR2.
 */
export function r2Enabled(): boolean {
  return Boolean(
    process.env.CF_R2_ACCESS_KEY_ID &&
    process.env.CF_R2_SECRET_ACCESS_KEY &&
    process.env.R2_S3_ENDPOINT
  );
}

/**
 * Upload a file to R2.
 *
 * @param body       - File, Buffer, or Uint8Array to upload
 * @param key        - Object key (path) inside the bucket, e.g. spots/123/photo.jpg
 * @param contentType - MIME type of the object
 * @returns Public CDN URL of the uploaded object
 */
export async function uploadToR2(
  body: File | Buffer | Uint8Array,
  key: string,
  contentType: string
): Promise<string> {
  const bucket = process.env.R2_BUCKET || "np7-media";
  const cdnBase = (process.env.NEXT_PUBLIC_R2_CDN_URL || "").replace(/\/$/, "");

  const upload = new Upload({
    client: getClient(),
    params: {
      Bucket: bucket,
      Key: key,
      Body: body instanceof File ? (await body.arrayBuffer()) as unknown as Buffer : body,
      ContentType: contentType,
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
 * Extract the R2 object key from a full CDN URL.
 * Returns null if the URL does not belong to the configured CDN base.
 */
export function keyFromR2Url(url: string): string | null {
  const cdnBase = (process.env.NEXT_PUBLIC_R2_CDN_URL || "").replace(/\/$/, "");
  if (!cdnBase || !url.startsWith(cdnBase + "/")) return null;
  return url.slice(cdnBase.length + 1);
}
