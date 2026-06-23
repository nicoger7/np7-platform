import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getRequestAccess } from "@/lib/admin-auth";
import { effectiveCanSeeField } from "@/lib/access";

// GET /api/admin/bookings/:id — get booking with all related data
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;

  const [booking, payments, addons, tasks, hotelRooms] = await Promise.all([
    client
      .from("exp_bookings")
      .select(
        "*, contacts(name, email, phone, country, level, tshirt_size, diet_allergies), exp_experiences(title, slug), exp_editions(year, date_start, date_end, deposit), exp_packages(name, price, deposit, downpayment_percent, final_days_before, deposit_refund_days)"
      )
      .eq("id", id)
      .single(),
    client
      .from("exp_payments")
      .select("*")
      .eq("booking_id", id)
      .order("date", { ascending: false }),
    client.from("exp_booking_addons").select("*, exp_components(*)").eq("booking_id", id),
    client
      .from("exp_tasks")
      .select("*")
      .eq("booking_id", id)
      .order("due_date"),
    client.from("exp_hotel_rooms").select("*").eq("booking_id", id),
  ]);

  if (booking.error) {
    return NextResponse.json(
      { error: booking.error.message },
      { status: 404 }
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let out: Record<string, any> = {
    ...booking.data,
    payments: payments.data || [],
    addons: addons.data || [],
    tasks: tasks.data || [],
    hotel_rooms: hotelRooms.data || [],
  };

  // Field redaction by role: money (prices/payments), costs (component costs),
  // contact PII (email/phone). Owner/manager tiers see everything.
  const access = await getRequestAccess();
  if (access) {
    if (!effectiveCanSeeField(access, "money")) {
      out = { ...out, agreed_price: null, deposit: null, exp_packages: out.exp_packages ? { ...out.exp_packages, price: null } : out.exp_packages, payments: [], money_redacted: true };
    }
    if (!effectiveCanSeeField(access, "costs")) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      out.addons = (out.addons || []).map((a: any) => ({ ...a, exp_components: a.exp_components ? { ...a.exp_components, unit_cost: null } : a.exp_components }));
    }
    if (!effectiveCanSeeField(access, "contact_pii")) {
      out.contacts = out.contacts ? { ...out.contacts, email: null, phone: null, diet_allergies: null } : out.contacts;
    }
  }

  return NextResponse.json(out);
}

// PATCH /api/admin/bookings/:id — update booking (status change, etc.)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;
  const body = await request.json();

  const { data, error } = await client
    .from("exp_bookings")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}

// DELETE /api/admin/bookings/:id
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;

  const { error } = await client.from("exp_bookings").delete().eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ success: true });
}
