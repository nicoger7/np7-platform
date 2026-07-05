/**
 * Background-removal for coach tile cutouts.
 *
 * Takes a coach photo (URL or local path), removes the background, trims the
 * transparent margins and writes a transparent PNG. Optionally uploads it to R2
 * and stamps exp_coaches.cutout_url.
 *
 * Run:
 *   node --env-file=.env.local scripts/coach-cutout.mjs <imageUrlOrPath> <outName> [--upload] [--coach="Nico Prien"]
 *
 * Example (local preview only):
 *   node --env-file=.env.local scripts/coach-cutout.mjs \
 *     "https://…/Nico Profile.jpg.webp" nico
 *
 * Deps are installed locally with --no-save (not shipped to production):
 *   npm install --no-save @imgly/background-removal-node
 */
import { removeBackground } from "@imgly/background-removal-node";
import sharp from "sharp";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

const [input, outName = "coach"] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const flags = process.argv.slice(2).filter((a) => a.startsWith("--"));
const doUpload = flags.includes("--upload");
const coachName = (flags.find((f) => f.startsWith("--coach=")) || "").split("=")[1]?.replace(/^"|"$/g, "");

if (!input) {
  console.error("Usage: node --env-file=.env.local scripts/coach-cutout.mjs <imageUrlOrPath> <outName> [--upload] [--coach=\"Name\"]");
  process.exit(1);
}

console.log("• removing background from:", input);
const blob = await removeBackground(input);            // downloads model on first run
const cutBuf = Buffer.from(await blob.arrayBuffer());

// Trim the transparent border and cap the height so the PNG isn't huge.
const png = await sharp(cutBuf)
  .trim()
  .resize({ height: 900, withoutEnlargement: true })
  .png({ compressionLevel: 9 })
  .toBuffer();

const outDir = path.resolve("public/coaches");
await mkdir(outDir, { recursive: true });
const outPath = path.join(outDir, `${outName}.png`);
await writeFile(outPath, png);
console.log(`✓ wrote ${outPath} (${(png.length / 1024).toFixed(0)} KB)`);

if (doUpload) {
  const { S3Client, PutObjectCommand } = await import("@aws-sdk/client-s3");
  const { createClient } = await import("@supabase/supabase-js");
  const key = `coaches/${outName}.png`;
  const r2 = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY },
  });
  await r2.send(new PutObjectCommand({
    Bucket: process.env.R2_BUCKET, Key: key, Body: png, ContentType: "image/png",
    CacheControl: "public, max-age=31536000, immutable",
  }));
  const url = `${(process.env.NEXT_PUBLIC_R2_PUBLIC_URL || "").replace(/\/$/, "")}/${key}`;
  console.log("✓ uploaded to R2:", url);

  if (coachName) {
    const supa = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { error } = await supa.from("exp_coaches").update({ cutout_url: url }).ilike("name", coachName);
    console.log(error ? `✗ cutout_url not set (${error.message})` : `✓ exp_coaches.cutout_url set for "${coachName}"`);
  }
}
