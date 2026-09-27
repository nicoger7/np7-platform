import "server-only";
import { createAdminClient } from "@/lib/supabase";
import { publicOrigin } from "@/lib/public-origin";
import { fmtCents } from "@/lib/hardware/orders";
import { recipientsFor, mailTeam, nobody, whoIs, type SweepResult } from "@/lib/email/team-alerts";
import { fmtWhen } from "@/lib/email/team-alerts-guests";

/**
 * Team alerts for the NP7 Hardware shop (Nico, 27 Sep 2026: an email for
 * every sign-up and every order).
 *
 * The shop pages 404 until SHOW_HARDWARE is set, but the APIs behind them are
 * not gated, and all three of these need a person the moment they happen: v1 is
 * paid by bank transfer, so somebody matches the money and ships while the
 * stock is held; a return has a legal window; an enquiry's sender expects a
 * reply and gets nothing automatic. So the alerts are built now, and nobody is
 * subscribed yet: Nico has not said who gets them. With nobody on the list
 * each sweep returns before it reads anything.
 *
 * Same rules as every team alert: a sweep over the table, a window, deduped per
 * recipient, never to the customer. Sent as Hardware mail.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRow = any;

const defaultSince = () => new Date(Date.now() - 6 * 3600 * 1000).toISOString();
const failed = (to: number, error: unknown): SweepResult =>
  ({ looked: 0, announced: 0, recipients: to, skipped: [String((error as { message?: string })?.message ?? error)] });

const itemLine = (l: AnyRow) =>
  `${Number(l?.quantity) || 1} × ${[l?.title, l?.variant_title].filter(Boolean).join(" ") || "an item"}`;

/**
 * An order placed in the web shop. Only `web`: an order the team typed into
 * the admin is not news to the team. A cancelled or archived one (the checkout
 * deletes a half-reserved order, but a quick cancel is possible) is left out.
 */
export async function sweepHwOrders(opts?: { since?: string; limit?: number }): Promise<SweepResult> {
  const to = await recipientsFor("hw_order_placed");
  if (!to.length) return nobody();
  const db: Db = createAdminClient();
  const { data, error } = await db
    .from("hw_orders")
    .select("id,display_number,email,currency,grand_total,status,payment_status,sales_channel,shipping_address,created_at,archived_at,hw_order_lines(title,variant_title,quantity)")
    .eq("sales_channel", "web")
    .is("archived_at", null)
    .gte("created_at", opts?.since ?? defaultSince())
    .order("created_at", { ascending: true })
    .limit(opts?.limit ?? 50);
  if (error) return failed(to.length, error);

  const rows = ((data ?? []) as AnyRow[]).filter((o) => o.status !== "canceled");
  const origin = publicOrigin();
  const tally = { announced: 0, skipped: [] as string[] };
  for (const o of rows) {
    const ship = o.shipping_address ?? {};
    await mailTeam(to, {
      event: "hw_order_placed",
      what: o.id,
      templateKey: "team_hw_order_placed",
      division: "hardware",
      vars: {
        orderNumber: String(o.display_number ?? ""),
        guestName: whoIs(ship.name, o.email),
        guestEmail: o.email ?? "",
        total: fmtCents(o.grand_total, o.currency ?? "EUR"),
        items: ((o.hw_order_lines ?? []) as AnyRow[]).map(itemLine).join("\n"),
        shipTo: [ship.city, ship.country].filter(Boolean).join(", "),
        paymentStatus: o.payment_status === "awaiting" ? "Waiting for the bank transfer" : String(o.payment_status ?? ""),
        reference: o.display_number ? `NP7-${o.display_number}` : "",
        adminLink: `${origin}/admin/orders/${o.id}`,
      },
    }, tally);
  }
  return { looked: rows.length, ...tally, recipients: to.length };
}

/**
 * A return the customer asked for themselves (the order page or the
 * withdrawal button). One the team logged from an email or in the admin is
 * already known to whoever logged it.
 */
export async function sweepHwReturns(opts?: { since?: string; limit?: number }): Promise<SweepResult> {
  const to = await recipientsFor("hw_return_requested");
  if (!to.length) return nobody();
  const db: Db = createAdminClient();
  const { data, error } = await db
    .from("hw_returns")
    .select("id,order_id,type,channel,status,declared_at,customer_message,created_at,archived_at,hw_orders(display_number,email,shipping_address),hw_return_lines(quantity,reason_code,hw_order_lines(title,variant_title))")
    .in("channel", ["portal", "withdrawal_button"])
    .is("archived_at", null)
    .gte("created_at", opts?.since ?? defaultSince())
    .order("created_at", { ascending: true })
    .limit(opts?.limit ?? 50);
  if (error) return failed(to.length, error);

  const rows = (data ?? []) as AnyRow[];
  const origin = publicOrigin();
  const tally = { announced: 0, skipped: [] as string[] };
  for (const r of rows) {
    const o = r.hw_orders ?? {};
    await mailTeam(to, {
      event: "hw_return_requested",
      what: r.id,
      templateKey: "team_hw_return_requested",
      division: "hardware",
      vars: {
        orderNumber: String(o.display_number ?? ""),
        guestName: whoIs(o.shipping_address?.name, o.email),
        guestEmail: o.email ?? "",
        returnType: r.type === "warranty" ? "Warranty claim" : r.type === "goodwill" ? "Goodwill return" : "Withdrawal (Widerruf)",
        items: ((r.hw_return_lines ?? []) as AnyRow[])
          .map((l) => `${itemLine({ ...l.hw_order_lines, quantity: l.quantity })}${l.reason_code ? ` · ${l.reason_code}` : ""}`)
          .join("\n"),
        declaredAt: fmtWhen(r.declared_at ?? r.created_at),
        message: String(r.customer_message ?? "").slice(0, 1000),
        adminLink: `${origin}/admin/returns/${r.id}`,
      },
    }, tally);
  }
  return { looked: rows.length, ...tally, recipients: to.length };
}

/** A question from the enquiry form on a product page. Only ones still `new`. */
export async function sweepHwEnquiries(opts?: { since?: string; limit?: number }): Promise<SweepResult> {
  const to = await recipientsFor("hw_enquiry");
  if (!to.length) return nobody();
  const db: Db = createAdminClient();
  const { data, error } = await db
    .from("hw_inquiries")
    .select("id,name,email,phone,message,status,product_id,created_at,hw_products(name)")
    .eq("status", "new")
    .gte("created_at", opts?.since ?? defaultSince())
    .order("created_at", { ascending: true })
    .limit(opts?.limit ?? 50);
  if (error) return failed(to.length, error);

  const rows = (data ?? []) as AnyRow[];
  const origin = publicOrigin();
  const tally = { announced: 0, skipped: [] as string[] };
  for (const q of rows) {
    await mailTeam(to, {
      event: "hw_enquiry",
      what: q.id,
      templateKey: "team_hw_enquiry",
      division: "hardware",
      vars: {
        guestName: whoIs(q.name, q.email),
        guestEmail: q.email ?? "",
        phone: q.phone ?? "",
        productName: q.hw_products?.name ?? "a product",
        message: String(q.message ?? "").slice(0, 1500),
        adminLink: q.product_id ? `${origin}/admin/products/${q.product_id}` : `${origin}/admin/products`,
      },
    }, tally);
  }
  return { looked: rows.length, ...tally, recipients: to.length };
}
