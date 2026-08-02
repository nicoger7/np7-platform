import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { after } from "next/server";
import { resizeForStorage, makeThumb } from "@/lib/image-resize";
import { r2Enabled, r2CdnBase, uploadToR2, deleteFromR2, keyFromR2Url } from "@/lib/r2";
import { requirePdEdit } from "@/lib/product-dev-api";

/**
 * The Product Development media root.
 *
 * `/api/admin/images` hides `product-dev/` from every caller, so this is the
 * only way in or out of it. Two things it does NOT do:
 *
 *  - It never accepts the root from the client. `ROOT` is pinned here, and every
 *    key is built from it, so there is no parameter to point somewhere else.
 *  - It is not a second implementation. Resize, R2 upload, thumbnails and the
 *    Supabase catalog mirror are the same helpers the shared route uses, so the
 *    CDN, `_thumb/` and `/cdn` caching all keep working identically.
 *
 * Why a separate path rather than a `?scope=` on the shared route:
 * sectionForPath maps `/api/admin/images` to `file_storage`, which lives in the
 * EXPERIENCE world. A Product-Dev-only staffer would be 403'd by middleware
 * before the handler ever ran. This is the only shape the RBAC model can express.
 */

export const runtime = "nodejs"; // sharp (image resize) needs the Node runtime

const BUCKET = "assets";
const ROOT = "product-dev";

function svc() {
  return createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/** Clamp any client-supplied folder inside ROOT, defeating `../` and absolutes. */
function scopedFolder(raw: string | null): string {
  const clean = (raw ?? "")
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s && s !== "." && s !== "..")
    .join("/");
  if (!clean || clean === ROOT) return ROOT;
  return clean.startsWith(`${ROOT}/`) ? clean : `${ROOT}/${clean}`;
}

const isFolderItem = (item: { metadata?: unknown; id?: string | null }) => !item.metadata || item.id === null;

// GET /api/admin/product-dev/media?folder=&recursive=1
export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const folder = scopedFolder(sp.get("folder"));
  const recursive = sp.get("recursive") === "1";

  const admin = svc();
  const R2 = r2CdnBase();
  const base = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}`;
  const renderBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/render/image/public/${BUCKET}`;
  const enc = (p: string) => p.split("/").map(encodeURIComponent).join("/");
  const pubUrl = (p: string) => (R2 ? `${R2}/${enc(p)}` : `${base}/${enc(p)}`);
  const thumb = (p: string) =>
    R2 ? `${R2}/_thumb/${enc(p)}` : `${renderBase}/${enc(p)}?width=400&height=400&resize=cover&quality=70`;

  type Item = { name: string; path: string; isFolder: boolean; url: string | null; thumbUrl: string | null; size: number; type: string | null; updatedAt: string | null };

  if (recursive) {
    const files: Item[] = [];
    const queue = [folder];
    let visited = 0;
    while (queue.length && visited < 120 && files.length < 800) {
      const batch = queue.splice(0, 12);
      visited += batch.length;
      const results = await Promise.all(batch.map(async (prefix) => {
        const { data, error } = await admin.storage.from(BUCKET).list(prefix, { limit: 1000, sortBy: { column: "name", order: "asc" } });
        return { prefix, data: error ? [] : data ?? [] };
      }));
      for (const { prefix, data } of results) {
        for (const item of data) {
          if (item.name === ".emptyFolderPlaceholder") continue;
          const path = `${prefix}/${item.name}`;
          if (isFolderItem(item)) queue.push(path);
          else files.push({
            name: item.name, path, isFolder: false, url: pubUrl(path), thumbUrl: thumb(path),
            size: item.metadata?.size ?? 0, type: item.metadata?.mimetype ?? null, updatedAt: item.updated_at ?? null,
          });
        }
      }
    }
    files.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
    return NextResponse.json({ files, folder, root: ROOT, recursive: true });
  }

  const { data, error } = await admin.storage.from(BUCKET).list(folder, { limit: 1000 });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const files: Item[] = (data ?? [])
    .filter((item) => item.name !== ".emptyFolderPlaceholder")
    .map((item) => {
      const path = `${folder}/${item.name}`;
      const isFolder = isFolderItem(item);
      return {
        name: item.name, path, isFolder,
        url: isFolder ? null : pubUrl(path),
        thumbUrl: isFolder ? null : thumb(path),
        size: item.metadata?.size ?? 0,
        type: item.metadata?.mimetype ?? null,
        updatedAt: item.updated_at ?? null,
      };
    })
    .sort((a, b) => Number(b.isFolder) - Number(a.isFolder) || a.name.localeCompare(b.name, undefined, { numeric: true }));

  return NextResponse.json({ files, folder, root: ROOT });
}

// POST — upload one file into the scoped root.
export async function POST(request: NextRequest) {
  const denied = await requirePdEdit("/api/admin/product-dev/media");
  if (denied) return denied;

  const form = await request.formData();
  const file = form.get("file") as File | null;
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

  const folder = scopedFolder(form.get("folder") as string | null);
  const safe = file.name.replace(/[^\w.\-]+/g, "-");
  const key = `${folder}/${Date.now().toString(36)}-${safe}`;

  // Only images go through the resizer; CAD files and PDFs are stored as-is.
  const isImage = (file.type || "").startsWith("image/");
  const buf = Buffer.from(await file.arrayBuffer());
  const { body, contentType } = isImage
    ? await resizeForStorage(file)
    : { body: buf, contentType: file.type || "application/octet-stream" };
  const bytes = Buffer.isBuffer(body) ? body : buf;

  if (r2Enabled()) {
    try {
      const url = await uploadToR2(bytes, key, contentType);
      after(async () => {
        if (isImage) {
          try { const t = await makeThumb(file); if (t) await uploadToR2(t.body, `_thumb/${key}`, t.contentType); } catch { /* ignore */ }
        }
        // Supabase stays the CATALOG — the folder listing walks it.
        try { await svc().storage.from(BUCKET).upload(key, bytes, { upsert: true, contentType }); } catch { /* ignore */ }
      });
      return NextResponse.json({ url, path: key });
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Upload failed" }, { status: 500 });
    }
  }

  const { error } = await svc().storage.from(BUCKET).upload(key, bytes, { upsert: true, contentType });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ url: `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${key}`, path: key });
}

// PUT — create a subfolder inside the root.
export async function PUT(request: NextRequest) {
  const denied = await requirePdEdit("/api/admin/product-dev/media");
  if (denied) return denied;

  const { folder } = await request.json().catch(() => ({ folder: "" }));
  const target = scopedFolder(folder);
  if (target === ROOT) return NextResponse.json({ error: "Name that folder something." }, { status: 400 });

  const { error } = await svc().storage.from(BUCKET).upload(`${target}/.emptyFolderPlaceholder`, new Blob([""]), { upsert: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ folder: target });
}

// DELETE — remove files, from R2 (+ its thumb) and the Supabase catalog.
export async function DELETE(request: NextRequest) {
  const denied = await requirePdEdit("/api/admin/product-dev/media");
  if (denied) return denied;

  const body = await request.json().catch(() => ({}));
  const paths: string[] = Array.isArray(body.paths) ? body.paths : [];
  const urls: string[] = Array.isArray(body.urls) ? body.urls : [];
  const supaBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
  const fromUrls = urls
    .map((u) => keyFromR2Url(u) ?? (u.startsWith(supaBase) ? u.slice(supaBase.length) : null))
    .filter((k): k is string => k !== null);

  // Whatever the caller names, only keys inside this root are touchable.
  const keys = Array.from(new Set([...paths, ...fromUrls])).filter((k) => k === ROOT || k.startsWith(`${ROOT}/`));
  if (!keys.length) return NextResponse.json({ error: "Nothing to delete in this section." }, { status: 400 });

  if (r2Enabled()) {
    await Promise.all(keys.flatMap((k) => [deleteFromR2(k).catch(() => {}), deleteFromR2(`_thumb/${k}`).catch(() => {})]));
  }
  const { error } = await svc().storage.from(BUCKET).remove(keys);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ deleted: keys.length });
}
