/**
 * Backfill missing `_thumb/` variants for images that live ONLY in R2
 * (the Supabase→R2 mirror script can't thumb files whose Supabase source
 * is gone). Walks the R2 bucket directly and generates a 640px webp thumb
 * for every raster image that doesn't have one.
 *
 * Run:  node --env-file=.env.local scripts/backfill-r2-thumbs.mjs
 * Needs: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *
 * Safe to re-run: only writes thumbs that don't exist yet.
 */
import { S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

const need = ["R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"];
const missing = need.filter((k) => !process.env[k]);
if (missing.length) { console.error("Missing env:", missing.join(", ")); process.exit(1); }

const R2B = process.env.R2_BUCKET;
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const keys = new Set();
for (let token; ; ) {
  const { Contents, NextContinuationToken, IsTruncated } = await r2.send(
    new ListObjectsV2Command({ Bucket: R2B, ContinuationToken: token })
  );
  for (const o of Contents ?? []) keys.add(o.Key);
  if (!IsTruncated) break;
  token = NextContinuationToken;
}

const rasters = [...keys].filter(
  (k) => /\.(jpe?g|png|webp)$/i.test(k) && !k.startsWith("_thumb/") && !k.startsWith("_video/") && !k.startsWith("_vidraw/")
);
const todo = rasters.filter((k) => !keys.has(`_thumb/${k}`));
console.log(`${keys.size} objects · ${rasters.length} rasters · ${todo.length} missing thumbs`);

let done = 0, failed = 0;
for (const key of todo) {
  try {
    const { Body } = await r2.send(new GetObjectCommand({ Bucket: R2B, Key: key }));
    const buf = Buffer.from(await Body.transformToByteArray());
    const t = await sharp(buf, { failOn: "none" })
      .rotate()
      .resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
    await r2.send(new PutObjectCommand({
      Bucket: R2B, Key: `_thumb/${key}`, Body: t, ContentType: "image/webp",
      CacheControl: "public, max-age=31536000, immutable",
    }));
    done++;
    process.stdout.write(`\r  …${done}/${todo.length}`);
  } catch (e) {
    failed++;
    console.error(`\n  FAIL ${key}: ${e.message}`);
  }
}
console.log(`\nDONE — ${done} thumbs created · ${failed} failed`);
