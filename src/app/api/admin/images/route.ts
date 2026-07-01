import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";
import { isActiveTeamMember } from "@/lib/admin-auth";

const BUCKET = "assets";

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function requireAuth() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !(await isActiveTeamMember(user.id))) {
    throw new Error("Unauthorized");
  }
  return user;
}

type ListedFile = {
  name: string; path: string; isFolder: boolean; url: string | null; thumbUrl: string | null;
  size: number; type: string | null; updatedAt: string | null;
};

const isFolderItem = (item: { metadata?: unknown; id?: string | null }) =>
  !item.metadata || item.id === null;

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const folder = sp.get("folder") || "";
  const recursive = sp.get("recursive") === "1";
  const admin = getServiceClient();
  const baseUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}`;
  const renderBase = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/render/image/public/${BUCKET}`;
  // Encode each path segment — filenames can contain spaces etc., which otherwise
  // break <img>/CSS loading. thumb() serves a small transform (fast grids vs MBs).
  const enc = (p: string) => p.split("/").map(encodeURIComponent).join("/");
  const pubUrl = (p: string) => `${baseUrl}/${enc(p)}`;
  const thumb = (p: string) => `${renderBase}/${enc(p)}?width=400&height=400&resize=cover&quality=70`;

  // ── Recursive mode: walk the whole tree so EVERY image surfaces in one
  // searchable, newest-first view (the library's default). Bounded so a huge
  // bucket can't hang the request.
  if (recursive) {
    const images: ListedFile[] = [];
    const queue: string[] = [folder];
    let visited = 0;
    const MAX_FOLDERS = 250;
    while (queue.length && visited < MAX_FOLDERS && images.length < 1500) {
      const prefix = queue.shift()!;
      visited++;
      const { data, error } = await admin.storage
        .from(BUCKET)
        .list(prefix, { limit: 1000, sortBy: { column: "name", order: "asc" } });
      if (error) continue;
      for (const item of data || []) {
        if (item.name === ".emptyFolderPlaceholder") continue;
        const path = prefix ? `${prefix}/${item.name}` : item.name;
        if (isFolderItem(item)) {
          queue.push(path);
        } else if ((item.metadata?.mimetype || "").startsWith("image/")) {
          images.push({
            name: item.name, path, isFolder: false, url: pubUrl(path), thumbUrl: thumb(path),
            size: item.metadata?.size || 0, type: item.metadata?.mimetype || null,
            updatedAt: item.updated_at,
          });
        }
      }
    }
    images.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
    return Response.json({ files: images, recursive: true });
  }

  // ── Single-folder mode (folder browsing). Page through so >1000 photos aren't
  // truncated; sort naturally by filename ("…-2" before "…-10").
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all: any[] = [];
  const PAGE = 1000;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await admin.storage.from(BUCKET).list(folder, { limit: PAGE, offset });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    all.push(...(data || []));
    if (!data || data.length < PAGE) break;
  }
  all.sort((a, b) => String(a.name).localeCompare(String(b.name), undefined, { numeric: true, sensitivity: "base" }));

  const files: ListedFile[] = all
    .filter((item) => item.name !== ".emptyFolderPlaceholder")
    .map((item) => {
      const path = folder ? `${folder}/${item.name}` : item.name;
      const isFolder = isFolderItem(item);
      return {
        name: item.name,
        path,
        isFolder,
        url: isFolder ? null : pubUrl(path),
        thumbUrl: isFolder ? null : thumb(path),
        size: item.metadata?.size || 0,
        type: item.metadata?.mimetype || null,
        updatedAt: item.updated_at,
      };
    });

  return Response.json({ files });
}

export async function POST(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file") as File | null;
  const folder = formData.get("folder") as string || "";

  if (!file) {
    return Response.json({ error: "No file provided" }, { status: 400 });
  }

  const path = folder ? `${folder}/${file.name}` : file.name;
  const admin = getServiceClient();

  const { error } = await admin.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const url = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;

  return Response.json({ url, path });
}

export async function PUT(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { folder } = await request.json();

  if (!folder || typeof folder !== "string") {
    return Response.json({ error: "No folder name provided" }, { status: 400 });
  }

  const admin = getServiceClient();

  const { error } = await admin.storage
    .from(BUCKET)
    .upload(`${folder}/.emptyFolderPlaceholder`, new Blob([""]), { upsert: true });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ folder });
}

export async function PATCH(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  // Accept a single { from, to } OR a bulk { moves: [{from,to}, …] } so the
  // client can assign many photos in ONE request (moved concurrently) instead of
  // one slow round-trip per photo.
  const moves: { from: string; to: string }[] = Array.isArray(body.moves)
    ? body.moves.filter((m: { from?: string; to?: string }) => m?.from && m?.to)
    : body.from && body.to ? [{ from: body.from, to: body.to }] : [];

  if (moves.length === 0) {
    return Response.json({ error: "Missing from/to paths" }, { status: 400 });
  }

  const admin = getServiceClient();
  const results = await Promise.all(
    moves.map(async (m) => {
      const { error } = await admin.storage.from(BUCKET).move(m.from, m.to);
      return { from: m.from, to: m.to, ok: !error, error: error?.message };
    })
  );
  const failed = results.filter((r) => !r.ok);
  if (failed.length === moves.length) {
    return Response.json({ error: failed[0].error || "Move failed" }, { status: 500 });
  }
  return Response.json({ moved: moves.length - failed.length, failed });
}

export async function DELETE(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { paths } = await request.json();

  if (!paths || !Array.isArray(paths) || paths.length === 0) {
    return Response.json({ error: "No paths provided" }, { status: 400 });
  }

  const admin = getServiceClient();

  const { error } = await admin.storage
    .from(BUCKET)
    .remove(paths);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ deleted: paths });
}
