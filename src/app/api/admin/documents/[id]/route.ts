import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// Admin routes are gated by middleware; no per-route auth check needed.

type RouteContext = { params: Promise<{ id: string }> };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isMissingTable(message?: string | null) {
  return (
    !!message &&
    /(documents|relation|schema cache|does not exist)/i.test(message)
  );
}

// ─── GET /api/admin/documents/[id] ───────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: RouteContext
) {
  const { id } = await params;
  const db = createAdminClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dbAny = db as any;

  const { data, error } = await dbAny
    .from("documents")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    if (isMissingTable(error.message)) {
      return NextResponse.json({ error: "Run migration 021 first (documents table missing)." }, { status: 503 });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  if (!data) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }

  let signedUrl: string | null = null;
  if (data.file_path) {
    const { data: urlData } = await dbAny.storage
      .from("documents")
      .createSignedUrl(data.file_path as string, 3600);
    signedUrl = urlData?.signedUrl ?? null;
  }

  return NextResponse.json({ ...data, signedUrl });
}

// ─── PATCH /api/admin/documents/[id] ─────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext
) {
  const { id } = await params;
  const body: { status?: string } = await request.json();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const updates: Record<string, unknown> = {};
  if (body.status !== undefined) {
    if (!["issued", "void"].includes(body.status)) {
      return NextResponse.json(
        { error: `Invalid status "${body.status}". Must be "issued" or "void".` },
        { status: 400 }
      );
    }
    updates.status = body.status;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  updates.updated_at = new Date().toISOString();

  const { data, error } = await db
    .from("documents")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (isMissingTable(error.message)) {
      return NextResponse.json(
        { error: "Run migration 021 first (documents table missing)." },
        { status: 503 }
      );
    }
    if (/updated_at/.test(error.message || "")) {
      // Column may not exist pre-migration; retry without it
      const { updated_at: _ts, ...rest } = updates;
      void _ts;
      const { data: retryData, error: retryError } = await db
        .from("documents")
        .update(rest)
        .eq("id", id)
        .select()
        .single();
      if (retryError) return NextResponse.json({ error: retryError.message }, { status: 400 });
      return NextResponse.json(retryData);
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}
