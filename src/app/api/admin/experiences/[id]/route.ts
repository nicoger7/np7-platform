import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// GET /api/admin/experiences/:id — get experience with editions
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminClient = client as any;

  const [experience, editions, packages, costs, bookings] = await Promise.all([
    client.from("exp_experiences").select("*").eq("id", id).single(),
    adminClient
      .from("exp_editions")
      .select("*")
      .eq("experience_id", id)
      .order("year", { ascending: false }),
    client
      .from("exp_packages")
      .select("*")
      .eq("experience_id", id)
      .order("sort_order"),
    client
      .from("exp_costs")
      .select("*")
      .eq("experience_id", id)
      .order("created_at"),
    client
      .from("exp_bookings")
      .select("*, contacts(name, email, phone)")
      .eq("experience_id", id)
      .order("created_at", { ascending: false }),
  ]);

  if (experience.error) {
    return NextResponse.json(
      { error: experience.error.message },
      { status: 404 }
    );
  }

  // Compute each edition's price range from its packages (price = retail/sell).
  // Price is derived, never typed — min/max of the edition's active packages.
  const editionList = editions.data || [];
  const editionIds = editionList.map((e: { id: string }) => e.id);
  let editionPackages: { edition_id: string | null; price: number | null; status: string | null }[] = [];

  if (editionIds.length > 0) {
    const { data: pkgs } = await adminClient
      .from("exp_packages")
      .select("edition_id, price, status")
      .in("edition_id", editionIds);
    editionPackages = pkgs || [];
  }

  // Spots "taken" = confirmed bookings per edition (money-down & beyond),
  // not the stored spots_taken field.
  const CONFIRMED = ["downpayment_paid", "create_invoice", "paid", "confirmed", "attended"];
  const confirmedByEdition: Record<string, number> = {};
  for (const b of (bookings.data || []) as unknown as { edition_id: string | null; status: string }[]) {
    if (b.edition_id && CONFIRMED.includes(b.status)) {
      confirmedByEdition[b.edition_id] = (confirmedByEdition[b.edition_id] || 0) + 1;
    }
  }

  const editionsWithPrice = editionList.map((ed: { id: string }) => {
    const prices = editionPackages
      .filter(
        (p) =>
          p.edition_id === ed.id &&
          p.price != null &&
          (p.status == null || p.status === "active")
      )
      .map((p) => Number(p.price));
    return {
      ...ed,
      computed_price_from: prices.length ? Math.min(...prices) : null,
      computed_price_to: prices.length ? Math.max(...prices) : null,
      confirmed_count: confirmedByEdition[ed.id] || 0,
    };
  });

  return NextResponse.json({
    ...experience.data,
    editions: editionsWithPrice,
    packages: packages.data || [],
    costs: costs.data || [],
    bookings: bookings.data || [],
  });
}

// PATCH /api/admin/experiences/:id — update an experience (template fields only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;
  const body = await request.json();

  // Sanitize: only allow template-level fields.
  // Edition-level fields (currency, total_fixed_costs, whatsapp_group_link,
  // whats_included) live on exp_editions and are intentionally excluded here.
  const allowed = [
    "title", "slug", "code", "location", "location_country", "description",
    "hero_image", "gallery", "cancellation_policy",
    "status", "timezone", "hotels", "airport_code",
    "notes", "active_status", "location_lat",
    "location_lng", "notion_id", "destination_id",
  ];
  const sanitized = Object.fromEntries(
    Object.entries(body).filter(([k]) => allowed.includes(k))
  );

  const { data, error } = await client
    .from("exp_experiences")
    .update({ ...sanitized, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}

// DELETE /api/admin/experiences/:id
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;

  const { error } = await client
    .from("exp_experiences")
    .delete()
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
