import "server-only";
import { createAdminClient } from "@/lib/supabase";
import { getRequestMember } from "@/lib/admin-auth";

/**
 * Plate Designer projects (migration 258): what a save may carry and where the
 * board file lives.
 *
 * The board file is the one thing that makes a project reopen in one click,
 * and it is NP7's own shape, so it goes to the PRIVATE documents bucket, named
 * by its content: product-dev/plate-designer/boards/{sha256}.{stl|s3dx}. The
 * browser uploads it straight there through a signed link (a board STL is far
 * bigger than a Vercel function accepts), and the path is always rebuilt here
 * from the hash, never taken from the client.
 */

export const PLATE_BUCKET = "documents";
/** The storage project's per-file limit. */
export const PLATE_BOARD_MAX_BYTES = 50 * 1024 * 1024;

const DESIGN_MAX_CHARS = 1_000_000;
const SETUP_MAX_CHARS = 20_000;
const THUMB_MAX_CHARS = 200_000;
const NAME_MAX = 120;

export type BoardKind = "stl" | "s3dx";
export type BoardRef = { sha256: string; kind: BoardKind; name: string; size: number };

/** Columns the project list needs (no design, it is only read on open). */
export const PLATE_LIST_COLUMNS = "id,name,board_file_name,board_file_kind,board_file_size,thumb,updated_by,created_at,updated_at";

export function boardFilePath(sha256: string, kind: BoardKind): string {
  return `product-dev/plate-designer/boards/${sha256}.${kind}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function plateDb(): any {
  return createAdminClient();
}

/** The board file a save refers to, checked. A string is the error. */
export function parseBoardRef(raw: unknown): BoardRef | string {
  if (!raw || typeof raw !== "object") return "No board file given.";
  const b = raw as Record<string, unknown>;
  const sha256 = typeof b.sha256 === "string" ? b.sha256.toLowerCase() : "";
  if (!/^[0-9a-f]{64}$/.test(sha256)) return "The board file's fingerprint is not valid.";
  if (b.kind !== "stl" && b.kind !== "s3dx") return "Only STL and Shape3D (.s3dx) boards can be kept.";
  const size = Number(b.size);
  if (!Number.isFinite(size) || size <= 0) return "The board file is empty.";
  if (size > PLATE_BOARD_MAX_BYTES) return "The board file is larger than 50 MB.";
  const name = typeof b.name === "string" && b.name.trim() ? b.name.trim().slice(0, 200) : `board.${b.kind}`;
  return { sha256, kind: b.kind, name, size };
}

/**
 * The columns a create or save may write, from the request body. Only the keys
 * present are checked and returned, so a save that leaves the board alone does
 * not clear it. A string is the error.
 */
export function parseSave(body: Record<string, unknown>, creating: boolean): Record<string, unknown> | string {
  const out: Record<string, unknown> = {};

  if ("name" in body || creating) {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (!name) return "Give the project a name.";
    out.name = name.slice(0, NAME_MAX);
  }

  if ("design" in body || creating) {
    const d = body.design as Record<string, unknown> | null;
    if (!d || typeof d !== "object" || d.type !== "board-plate-design" || !d.plate || typeof d.plate !== "object") {
      return "That is not a plate design.";
    }
    if (JSON.stringify(d).length > DESIGN_MAX_CHARS) return "The design is too large to save.";
    out.design = d;
  }

  if ("setup" in body) {
    const s = body.setup;
    if (s != null && (typeof s !== "object" || JSON.stringify(s).length > SETUP_MAX_CHARS)) return "The board setup is not valid.";
    out.setup = s ?? null;
  }

  if ("thumb" in body) {
    const t = body.thumb;
    if (t != null && (typeof t !== "string" || t.length > THUMB_MAX_CHARS || !/^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(t))) {
      return "The preview picture is not valid.";
    }
    out.thumb = t ?? null;
  }

  if ("board" in body) {
    if (body.board === null) {
      Object.assign(out, { board_file_path: null, board_file_name: null, board_file_kind: null, board_file_size: null, board_file_sha256: null });
    } else {
      const ref = parseBoardRef(body.board);
      if (typeof ref === "string") return ref;
      Object.assign(out, {
        board_file_path: boardFilePath(ref.sha256, ref.kind),
        board_file_name: ref.name,
        board_file_kind: ref.kind,
        board_file_size: ref.size,
        board_file_sha256: ref.sha256,
      });
    }
  }

  return out;
}

/** True once the board file is really in storage (the upload finished). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function boardFileStored(db: any, path: string): Promise<boolean> {
  const { data, error } = await db.storage.from(PLATE_BUCKET).exists(path);
  return !error && data === true;
}

/** The name the save is recorded under ("Saved 14:02 by Nico"). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function saverName(db: any): Promise<string | null> {
  const member = await getRequestMember();
  if (!member) return null;
  const { data } = await db.from("team_members").select("name").eq("id", member.id).maybeSingle();
  return (data?.name as string | undefined) ?? null;
}

export const isUuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
