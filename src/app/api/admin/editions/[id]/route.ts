import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { softDelete } from "@/lib/archive";
import { flags } from "@/lib/flags";

// GET /api/admin/editions/:id — single edition with related counts
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminClient = client as any;

  // Confirmed = hold-deposit in & beyond — the real "spots taken". Lists both the
  // lean (confirmed/paid/attended) and legacy values so the count is right pre-migration.
  const CONFIRMED = ["confirmed", "paid", "attended", "downpayment_paid", "create_invoice"];

  const [edition, bookingCount, confirmedCount, packageCount, costCount, roomCount] =
    await Promise.all([
      adminClient
        .from("exp_editions")
        .select(`*, exp_experiences(id, title, slug, location, hero_image, currency, code, status)`)
        .eq("id", id)
        .single(),
      adminClient
        .from("exp_bookings")
        .select("id", { count: "exact", head: true })
        .eq("edition_id", id),
      adminClient
        .from("exp_bookings")
        .select("id", { count: "exact", head: true })
        .eq("edition_id", id)
        .in("status", CONFIRMED),
      adminClient
        .from("exp_packages")
        .select("id", { count: "exact", head: true })
        .eq("edition_id", id),
      adminClient
        .from("exp_costs")
        .select("id", { count: "exact", head: true })
        .eq("edition_id", id),
      adminClient
        .from("exp_hotel_rooms")
        .select("id", { count: "exact", head: true })
        .eq("edition_id", id),
    ]);

  if (edition.error) {
    return NextResponse.json({ error: edition.error.message }, { status: 404 });
  }

  // Derive the price range from this edition's active packages (price = retail/sell).
  const { data: pkgs } = await adminClient
    .from("exp_packages")
    .select("price, status")
    .eq("edition_id", id);
  const prices = (pkgs || [])
    .filter(
      (p: { price: number | null; status: string | null }) =>
        p.price != null && (p.status == null || p.status === "active")
    )
    .map((p: { price: number }) => Number(p.price));

  // Would this edition actually be visible to the public right now? It must be
  // published, its experience published, and the public Experience section
  // revealed (SHOW_EXPERIENCE) — which stays off in production until launch.
  const expStatus = edition.data?.exp_experiences?.status ?? null;
  const siteLive = flags.showExperience;
  const publicVisible = siteLive && edition.data?.status === "published" && expStatus === "published";

  return NextResponse.json({
    ...edition.data,
    site_live: siteLive,
    public_visible: publicVisible,
    computed_price_from: prices.length ? Math.min(...prices) : null,
    computed_price_to: prices.length ? Math.max(...prices) : null,
    confirmed_count: confirmedCount.count ?? 0,
    _counts: {
      bookings: bookingCount.count ?? 0,
      packages: packageCount.count ?? 0,
      costs: costCount.count ?? 0,
      rooms: roomCount.count ?? 0,
    },
  });
}

// PUT /api/admin/editions/:id — update edition
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;
  const body = await request.json();

  // hero_image / hero_in_emails (047) + pre_trip_note (051) are optional columns —
  // strip & retry if they aren't there yet so the rest of an edition save still works.
  const PENDING_OPTIONAL = ["hero_image", "hero_in_emails", "pre_trip_note"];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const run = (payload: Record<string, unknown>) => (client as any)
    .from("exp_editions")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(`*, exp_experiences(id, title, slug, location)`)
    .single();
  let { data, error } = await run(body);
  if (error && PENDING_OPTIONAL.some((k) => k in body) && /column .* does not exist|schema cache|could not find/i.test(error.message)) {
    ({ data, error } = await run(Object.fromEntries(Object.entries(body).filter(([k]) => !PENDING_OPTIONAL.includes(k)))));
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}

// PATCH /api/admin/editions/:id — partial update (alias for PUT)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return PUT(request, { params });
}

// DELETE /api/admin/editions/:id — delete edition
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { ok, error } = await softDelete(client as any, "exp_editions", id);

  if (!ok) {
    return NextResponse.json({ error }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
