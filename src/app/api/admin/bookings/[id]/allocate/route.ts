import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { isActiveTeamMember } from "@/lib/admin-auth";

function getServiceClient() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function requireAuth() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await isActiveTeamMember(user.id))) throw new Error("Unauthorized");
  return user;
}

/** First name, lowercased — matches the "alloc:silvia←mathias" reference style. */
function firstName(name: string | null): string {
  const n = (name || "").trim().split(/\s+/)[0]?.toLowerCase().replace(/[^\p{L}0-9]/gu, "");
  return n || "booking";
}

/**
 * POST /api/admin/bookings/:id/allocate  { toBookingId, amount }
 *
 * Moves part of THIS booking's received money onto another booking (group
 * bookings: one person pays, the money is split). The amount is completely
 * free — no fixed percentage. Creates a mirrored pair of payment rows that
 * shares an `alloc#token` reference, so the pair can be removed together
 * later (DELETE on the payments route).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAuth();
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const toBookingId = String(body.toBookingId || "");
  const amt = Math.round(Number(body.amount) * 100) / 100;
  if (!toBookingId || toBookingId === id) {
    return Response.json({ error: "Pick a different booking to move money to." }, { status: 400 });
  }
  if (!Number.isFinite(amt) || amt <= 0) {
    return Response.json({ error: "Enter an amount above zero." }, { status: 400 });
  }

  const admin = getServiceClient();
  const { data: bookings } = await admin.from("exp_bookings").select("id, name").in("id", [id, toBookingId]);
  const from = bookings?.find((b) => b.id === id);
  const to = bookings?.find((b) => b.id === toBookingId);
  if (!from || !to) return Response.json({ error: "Booking not found" }, { status: 404 });

  const token = Math.random().toString(36).slice(2, 8);
  const now = new Date().toISOString();
  const f = firstName(from.name);
  const t = firstName(to.name);
  const { data, error } = await admin
    .from("exp_payments")
    .insert([
      { booking_id: id, amount: -amt, type: "partial", direction: "revenue", status: "paid", received_at: now, reference: `alloc#${token}:${f}→${t}` },
      { booking_id: toBookingId, amount: amt, type: "partial", direction: "revenue", status: "paid", received_at: now, reference: `alloc#${token}:${t}←${f}` },
    ])
    .select();
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ payments: data });
}
