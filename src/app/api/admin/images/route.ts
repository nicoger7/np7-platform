import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { NextRequest } from "next/server";

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
  if (!user) {
    throw new Error("Unauthorized");
  }
  return user;
}

export async function GET(request: NextRequest) {
  try {
    await requireAuth();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const folder = request.nextUrl.searchParams.get("folder") || "";
  const admin = getServiceClient();

  const { data, error } = await admin.storage
    .from(BUCKET)
    .list(folder, { limit: 200, sortBy: { column: "name", order: "asc" } });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  const baseUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET}`;

  const files = (data || [])
    .filter((item) => item.name !== ".emptyFolderPlaceholder")
    .map((item) => {
      const path = folder ? `${folder}/${item.name}` : item.name;
      const isFolder = !item.metadata || item.id === null;
      return {
        name: item.name,
        path,
        isFolder,
        url: isFolder ? null : `${baseUrl}/${path}`,
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

  const { from, to } = await request.json();

  if (!from || !to) {
    return Response.json({ error: "Missing from/to paths" }, { status: 400 });
  }

  const admin = getServiceClient();

  const { error } = await admin.storage.from(BUCKET).move(from, to);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ from, to });
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
