import { NextRequest, NextResponse, after } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/email/send";
import { noteForStatus, effectiveAddonStatus, type AddonStatus } from "@/lib/addons";
import { sumReceived } from "@/lib/payment-totals";
import { resyncBookingBilling } from "@/lib/invoices/promote";

// Flag (or clear) hotel_confirmed on the guest's room week-row — same row the
// extra-nights extend targets. Best-effort: no room assigned yet is fine.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function markRoomHotelConfirmed(client: any, bookingId: string, flag: boolean) {
  try {
    const { data: bk } = await client.from("exp_bookings").select("edition_id").eq("id", bookingId).maybeSingle();
    let q = client.from("exp_hotel_rooms").select("id").eq("booking_id", bookingId).is("archived_at", null);
    if (bk?.edition_id) q = q.eq("edition_id", bk.edition_id);
    const { data: rows } = await q.limit(1);
    if (!rows?.[0]) return;
    await client.from("exp_hotel_rooms").update({
      hotel_confirmed: flag,
      hotel_confirmed_at: flag ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    }).eq("id", rows[0].id);
  } catch (e) { console.error("[addons] hotel-confirmed sync failed:", e); }
}

// GET /api/admin/bookings/:id/addons — list add-ons for a booking
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;

  const { data, error } = await client
    .from("exp_booking_addons")
    .select("*, exp_components(id, name, category, unit_cost, payment_mode, payment_note)")
    .eq("booking_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

// POST /api/admin/bookings/:id/addons — add an add-on to a booking
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;
  const body = await request.json();

  const { data, error } = await client
    .from("exp_booking_addons")
    .insert({
      booking_id: id,
      component_id: body.component_id || null,
      label: body.label,
      price: body.price || null,
      notes: body.notes || null,
    })
    .select("*, exp_components(id, name, category, unit_cost, payment_mode, payment_note)")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data, { status: 201 });
}

// PATCH /api/admin/bookings/:id/addons — confirm (or update) a member-requested add-on.
// On confirm it counts toward the balance and the member gets a "confirmed" email.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = createAdminClient() as any;
  const { id } = await params;
  const body = await request.json();
  if (!body.addon_id) return NextResponse.json({ error: "addon_id is required" }, { status: 400 });

  // Backend-only "hotel confirmed": the hotel OK'd the (possibly overlapping)
  // stay with us. Marks the add-on + the guest's room row — no member email, no
  // billing change, no status change. Confirming to the CUSTOMER (below) also
  // sets this; this alone never confirms anything to the customer.
  if (body.hotel_confirmed !== undefined && body.status === undefined) {
    const flag = body.hotel_confirmed === true;
    const { data: cur, error: curErr } = await client
      .from("exp_booking_addons").select("meta").eq("id", body.addon_id).eq("booking_id", id).maybeSingle();
    if (curErr) return NextResponse.json({ error: curErr.message }, { status: 400 });
    const meta = { ...(cur?.meta ?? {}), hotelConfirmed: flag, hotelConfirmedAt: flag ? new Date().toISOString() : null };
    const { data: upd, error: updErr } = await client
      .from("exp_booking_addons").update({ meta }).eq("id", body.addon_id).eq("booking_id", id)
      .select("*, exp_components(name)").single();
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 400 });
    await markRoomHotelConfirmed(client, id, flag);
    return NextResponse.json(upd);
  }

  const status: AddonStatus = body.status === "declined" ? "declined" : "confirmed";
  const patch: Record<string, unknown> = { status };
  if (status === "confirmed") patch.confirmed_at = new Date().toISOString();
  // "Confirm, no charge": include the add-on but don't bill for it (price → 0),
  // so the agreed price / balance is unchanged. Default confirm charges extra.
  if (status === "confirmed" && body.complimentary === true) patch.price = 0;

  let { data, error } = await client
    .from("exp_booking_addons").update(patch).eq("id", body.addon_id).eq("booking_id", id)
    .select("*, exp_components(name)").single();
  if (error && /column|schema cache|does not exist/i.test(error.message)) {
    // pre-migration 024 — persist the state in the notes sentinel instead
    ({ data, error } = await client.from("exp_booking_addons").update({ notes: noteForStatus(status) }).eq("id", body.addon_id).eq("booking_id", id)
      .select("*, exp_components(name)").single());
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // A confirm/decline changes the trip total → refresh the open pro-forma so the
  // amount due reflects the add-on (best-effort; never blocks the response).
  after(() => resyncBookingBilling(id).catch((e) => console.error("[addons] resync billing failed:", e)));

  // Extra nights: when the confirmed add-on carries stay dates, EXTEND the guest's
  // room week-row so the allotment slot reflects the real stay — that's what the
  // cross-edition overlap warnings watch. Extend-only: never shrinks an existing
  // range; missing sides fall back to the edition's window.
  if (status === "confirmed") {
    const meta = (data?.meta ?? {}) as { checkIn?: string | null; checkOut?: string | null; hotelConfirmed?: boolean };
    const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);
    if (isDate(meta.checkIn) || isDate(meta.checkOut)) {
      // customer-confirm implies the hotel side is settled → mark the add-on too
      if (!meta.hotelConfirmed) {
        const newMeta = { ...meta, hotelConfirmed: true, hotelConfirmedAt: new Date().toISOString() };
        await client.from("exp_booking_addons").update({ meta: newMeta }).eq("id", body.addon_id);
        data.meta = newMeta;
      }
      after(async () => {
        try {
          const { data: bk2 } = await client.from("exp_bookings").select("edition_id").eq("id", id).maybeSingle();
          let q = client.from("exp_hotel_rooms").select("id, check_in, check_out, edition_id").eq("booking_id", id).is("archived_at", null);
          if (bk2?.edition_id) q = q.eq("edition_id", bk2.edition_id);
          const { data: rows } = await q.limit(1);
          const row = rows?.[0];
          if (!row) return; // no room slot assigned yet — dates get set when the admin assigns one
          let edStart: string | null = null, edEnd: string | null = null;
          if (row.edition_id) {
            const { data: ed } = await client.from("exp_editions").select("date_start,date_end").eq("id", row.edition_id).maybeSingle();
            edStart = ed?.date_start ?? null; edEnd = ed?.date_end ?? null;
          }
          const roomPatch: Record<string, unknown> = {};
          if (isDate(meta.checkIn)) {
            const base = row.check_in ?? edStart;
            roomPatch.check_in = !base || meta.checkIn < base ? meta.checkIn : base;
          }
          if (isDate(meta.checkOut)) {
            const base = row.check_out ?? edEnd;
            roomPatch.check_out = !base || meta.checkOut > base ? meta.checkOut : base;
          }
          // Confirming to the customer implies the hotel side is settled too —
          // set hotel_confirmed so any overlap this stay causes reads as OK'd.
          roomPatch.hotel_confirmed = true;
          roomPatch.hotel_confirmed_at = new Date().toISOString();
          await client.from("exp_hotel_rooms").update({ ...roomPatch, updated_at: new Date().toISOString() }).eq("id", row.id);
        } catch (e) { console.error("[addons] room-dates sync failed:", e); }
      });
    }
  }

  // notify the member on confirm (best-effort)
  if (status === "confirmed") {
    const { data: bk } = await client
      .from("exp_bookings")
      .select("id, agreed_price, contacts(name,email), exp_experiences(title)")
      .eq("id", id).maybeSingle();
    const email = bk?.contacts?.email;
    if (email) {
      const label = data?.label ?? data?.exp_components?.name ?? "your add-on";
      const isDirect = data?.payment_mode === "direct";
      const money = (n: number) => `€${Number(n).toLocaleString("en-US")}`;
      // The whole booking's confirmed add-ons, split by who gets paid, plus the
      // ledger balance — so the mail states facts, not the milestone formula.
      const [{ data: allAddons }, { data: pays }] = await Promise.all([
        client.from("exp_booking_addons").select("label, price, status, notes, payment_mode, exp_components(name)").eq("booking_id", id),
        client.from("exp_payments").select("amount,direction,type,status").eq("booking_id", id),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const confirmedAll = ((allAddons ?? []) as any[]).filter((a) => effectiveAddonStatus(a) === "confirmed");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const nameOf = (a: any) => String(a.label || a.exp_components?.name || "Add-on");
      const ours = confirmedAll.filter((a) => a.payment_mode !== "direct");
      const direct = confirmedAll.filter((a) => a.payment_mode === "direct");
      const oursTotal = ours.reduce((s, a) => s + (Number(a.price) || 0), 0);
      const received = sumReceived(pays ?? []);
      const balance = Math.max(0, (Number(bk?.agreed_price) || 0) + oursTotal - received);
      const priceNum = Number(data?.price) || 0;
      await sendEmail({
        to: email,
        templateKey: "addon_confirmed",
        bookingId: id,
        dedupeKey: `addon_confirmed:${body.addon_id}`,
        vars: {
          firstName: (bk?.contacts?.name ?? "").split(" ")[0] || "there",
          experienceTitle: bk?.exp_experiences?.title ?? "",
          addonLabel: label,
          addonPayDirect: isDirect ? "yes" : undefined,
          // guard on the NUMBER: "€0" is a truthy string, and it once printed
          // "adds €0 to your balance — payable by bank transfer" for a transfer
          // the guest pays the driver for
          addonPrice: !isDirect && priceNum > 0 ? money(priceNum) : undefined,
          balance: balance > 0 ? money(balance) : undefined,
          // one sentence a flat DB-edited body can embed as {{addonPriceLine}}
          addonPriceLine: isDirect
            ? "You'll pay for this directly with the local provider on site — it doesn't change your NP7 balance."
            : priceNum > 0
              ? `It adds ${money(priceNum)} to your trip balance${balance > 0 ? ` — your remaining balance is ${money(balance)}` : ""}, payable by bank transfer with the rest.`
              : "",
          // both buckets, only when there is more than this one add-on to show
          addonsOurs: confirmedAll.length > 1 && ours.length ? ours.map((a) => `${nameOf(a)} — ${money(Number(a.price) || 0)}`).join("\n") : undefined,
          addonsDirect: confirmedAll.length > 1 && direct.length ? direct.map((a) => `${nameOf(a)} (pay on site)`).join("\n") : undefined,
          bookingLink: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/account/bookings/${id}`,
        },
      }).catch(() => {});
    }
  }

  return NextResponse.json(data);
}

// DELETE /api/admin/bookings/:id/addons — remove an add-on
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const client = createAdminClient();
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const addonId = searchParams.get("addon_id");

  if (!addonId) {
    return NextResponse.json(
      { error: "addon_id is required" },
      { status: 400 }
    );
  }

  const { error } = await client
    .from("exp_booking_addons")
    .delete()
    .eq("id", addonId)
    .eq("booking_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Removing an add-on lowers the total → refresh the open pro-forma. If a real
  // invoice already covered more than the new total, this can't undo it (the
  // balance goes ≤ 0) — that case needs a credit note, handled separately.
  after(() => resyncBookingBilling(id).catch((e) => console.error("[addons] resync billing failed:", e)));

  return NextResponse.json({ success: true });
}
