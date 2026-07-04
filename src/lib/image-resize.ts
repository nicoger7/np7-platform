import sharp from "sharp";

const MAX_DIM = 2560;        // plenty for retina full-screen; caps 12-megapixel phone shots
const SKIP_UNDER = 1_400_000; // ~1.4 MB — already reasonable, don't bother re-encoding

/**
 * Downscale + re-encode a raster upload so we never STORE 10–20 MB originals
 * (the main driver of Supabase Storage egress — every view/thumbnail derives
 * from the stored file). Caps the long edge at 2560px and re-encodes at q82.
 *
 * Returns the original bytes untouched for SVG/GIF, already-small files, or on
 * any decode failure — never blocks an upload. Node runtime only (sharp).
 */
export async function resizeForStorage(file: File): Promise<{ body: Buffer | File; contentType: string }> {
  const name = (file.name || "").toLowerCase();
  if (!/\.(jpe?g|png|webp)$/.test(name)) return { body: file, contentType: file.type || "application/octet-stream" };
  try {
    const input = Buffer.from(await file.arrayBuffer());
    const img = sharp(input, { failOn: "none" }).rotate(); // auto-orient from EXIF
    const meta = await img.metadata();
    const tooBig = (meta.width ?? 0) > MAX_DIM || (meta.height ?? 0) > MAX_DIM || input.length > SKIP_UNDER;
    if (!tooBig) return { body: file, contentType: file.type };
    const resized = img.resize({ width: MAX_DIM, height: MAX_DIM, fit: "inside", withoutEnlargement: true });
    if (name.endsWith(".png")) return { body: await resized.png({ compressionLevel: 9 }).toBuffer(), contentType: "image/png" };
    if (name.endsWith(".webp")) return { body: await resized.webp({ quality: 82 }).toBuffer(), contentType: "image/webp" };
    return { body: await resized.jpeg({ quality: 82, mozjpeg: true }).toBuffer(), contentType: "image/jpeg" };
  } catch {
    return { body: file, contentType: file.type }; // decode failed — store as-is
  }
}
