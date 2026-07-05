/**
 * One-time (resumable) copy of the Supabase `assets` bucket → Cloudflare R2,
 * generating a 640px `_thumb/` variant per image. Supabase is left intact.
 *
 * Run:  node --env-file=.env.local scripts/migrate-to-r2.mjs
 * Needs: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 *        R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET
 *
 * Safe to re-run: it skips objects already present in R2, so a timeout just
 * means "run it again". Flip NEXT_PUBLIC_R2_PUBLIC_URL only AFTER this finishes.
 */
import { createClient } from "@supabase/supabase-js";
import { S3Client, PutObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import sharp from "sharp";

const need = ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"];
const missing = need.filter((k) => !process.env[k]);
if (missing.length) { console.error("Missing env:", missing.join(", ")); process.exit(1); }

const SRC = "assets";
const R2B = process.env.R2_BUCKET;
const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
});

const has = async (key) => { try { await r2.send(new HeadObjectCommand({ Bucket: R2B, Key: key })); return true; } catch { return false; } };
const put = (key, body, ct) => r2.send(new PutObjectCommand({ Bucket: R2B, Key: key, Body: body, ContentType: ct, CacheControl: "public, max-age=31536000, immutable" }));

async function* walk(prefix) {
  const stack = [prefix];
  while (stack.length) {
    const dir = stack.pop();
    for (let off = 0; ; off += 1000) {
      const { data } = await supa.storage.from(SRC).list(dir, { limit: 1000, offset: off });
      if (!data || !data.length) break;
      for (const f of data) {
        const path = dir ? `${dir}/${f.name}` : f.name;
        if (f.id) yield { path, mime: f.metadata?.mimetype || "application/octet-stream" };
        else if (f.name !== ".emptyFolderPlaceholder") stack.push(path);
      }
      if (data.length < 1000) break;
    }
  }
}

let copied = 0, thumbs = 0, skipped = 0, failed = 0, bytes = 0;
for await (const f of walk("")) {
  const isRaster = /\.(jpe?g|png|webp)$/i.test(f.path);
  try {
    const mainThere = await has(f.path);
    const thumbKey = `_thumb/${f.path}`;
    const thumbThere = !isRaster || (await has(thumbKey));
    if (mainThere && thumbThere) { skipped++; }
    else {
      const { data: blob } = await supa.storage.from(SRC).download(f.path);
      if (!blob) { failed++; continue; }
      const buf = Buffer.from(await blob.arrayBuffer());
      if (!mainThere) { await put(f.path, buf, f.mime); copied++; bytes += buf.length; }
      if (isRaster && !thumbThere) {
        try {
          const t = await sharp(buf, { failOn: "none" }).rotate().resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
          await put(thumbKey, t, "image/webp"); thumbs++;
        } catch { /* leave without thumb; grid falls back to main */ }
      }
    }
  } catch { failed++; }
  if ((copied + skipped) % 100 === 0) process.stdout.write(`\r  …${copied} copied · ${thumbs} thumbs · ${skipped} skipped`);
}
console.log(`\nDONE — copied ${copied} (${(bytes / 1048576).toFixed(0)} MB) · thumbs ${thumbs} · skipped ${skipped} · failed ${failed}`);
