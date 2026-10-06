/**
 * Make a phone photo small enough to upload, in the browser (Nico, 6 Oct 2026).
 *
 * The add-a-spot form can now carry one photo. A phone shot is often 4 to 8 MB,
 * and a Vercel function refuses any request body over about 4.5 MB before our
 * code even runs, so the rider would see a bare "Upload failed" for a perfectly
 * good picture. The server downsizes again for storage (image-resize.ts); this
 * only has to get it through the door, and gives the form a light preview.
 *
 * `fitWithin` is pure and tested; `shrinkPhoto` needs a browser (canvas).
 */

/** Safely under the ~4.5 MB request cap, with room for the form fields. */
export const PHOTO_UPLOAD_CAP = 3_800_000;
/** Plenty for a spot photo shown at card and gallery size. */
export const PHOTO_MAX_DIM = 2400;

/** The size to draw at: the longest side at most `max`, never upscaled, never 0. */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number } {
  const scale = Math.min(1, max / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

export class PhotoError extends Error {}

export async function shrinkPhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) throw new PhotoError("That file is not a photo.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    // A format this browser cannot draw (HEIC on desktop Chrome). Send it as it
    // is when it fits, and let the server decide; otherwise say what to do.
    if (file.size <= PHOTO_UPLOAD_CAP) return file;
    throw new PhotoError("This photo can't be read here. Try a JPG or PNG.");
  }
  try {
    if (Math.max(bitmap.width, bitmap.height) <= PHOTO_MAX_DIM && file.size <= 1_500_000) return file;
    for (const dim of [PHOTO_MAX_DIM, 1800, 1400]) {
      for (const q of [0.85, 0.72]) {
        const { w, h } = fitWithin(bitmap.width, bitmap.height, dim);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) break;
        ctx.drawImage(bitmap, 0, 0, w, h);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", q));
        if (blob && blob.size <= PHOTO_UPLOAD_CAP) {
          return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
        }
      }
    }
  } finally {
    bitmap.close();
  }
  if (file.size <= PHOTO_UPLOAD_CAP) return file;
  throw new PhotoError("This photo is too big to upload. Try a smaller one.");
}
