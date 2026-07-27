import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase";
import ReturnForm, { type ReturnableLine } from "./return-form";

export const metadata = { title: "Your order · NP7", robots: { index: false } };

// Tokenized order page — tracking + the withdrawal/return entry. No login;
// the unguessable token in the confirmation email is the key. Server-rendered,
// only customer-safe fields ever reach the page.
export default async function OrderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { data: order } = await db.from("hw_orders")
    .select("id,display_number,status,payment_status,fulfillment_status,grand_total,currency,placed_at,email")
    .eq("public_token", token).single();
  if (!order) notFound();

  const [{ data: lines }, { data: fulfillments }, { data: returns }] = await Promise.all([
    db.from("hw_order_lines").select("id,title,variant_title,quantity,unit_price_gross,total_gross,quantity_shipped,quantity_returned").eq("order_id", order.id),
    db.from("hw_fulfillments").select("status,carrier,tracking_number,tracking_url,shipped_at,delivered_at").eq("order_id", order.id).neq("status", "canceled"),
    db.from("hw_returns").select("id,status,type,declared_at, hw_return_lines(order_line_id,quantity)").eq("order_id", order.id),
  ]);

  const money = (cents: number) => `€${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
  const steps = ["Ordered", "Packed", "Shipped", "Delivered"];
  const stepIndex =
    ["delivered", "partially_delivered"].includes(order.fulfillment_status) ? 3
    : ["shipped", "partially_shipped"].includes(order.fulfillment_status) ? 2
    : ["fulfilled", "partially_fulfilled"].includes(order.fulfillment_status) ? 1 : 0;

  // Returnable = shipped − returned − pending in open returns.
  const pending = new Map<string, number>();
  for (const r of returns ?? []) {
    if (["requested", "approved", "in_transit", "received"].includes(r.status)) {
      for (const l of r.hw_return_lines ?? []) pending.set(l.order_line_id, (pending.get(l.order_line_id) ?? 0) + l.quantity);
    }
  }
  const returnable: ReturnableLine[] = (lines ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((l: any) => ({
      id: l.id, title: l.title, variant_title: l.variant_title,
      returnable: l.quantity_shipped - l.quantity_returned - (pending.get(l.id) ?? 0),
    }))
    .filter((l: ReturnableLine) => l.returnable > 0);
  const openReturns = (returns ?? []).filter((r: { status: string }) => !["resolved", "rejected"].includes(r.status));

  return (
    <main className="min-h-screen bg-[#0a0c10] text-white px-5 py-10">
      <div className="max-w-2xl mx-auto space-y-6">
        <header>
          <p className="text-xs font-bold tracking-[0.2em] uppercase text-[#c2ff38] mb-1">NP7 Hardware</p>
          <h1 className="text-3xl font-black">Order #{order.display_number}</h1>
          <p className="text-sm text-white/50 mt-1">
            Placed {new Date(order.placed_at).toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" })}
            {order.status === "canceled" ? " · canceled" : ""}
          </p>
        </header>

        {/* Progress */}
        {order.status !== "canceled" && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <div className="flex items-center">
              {steps.map((s, i) => (
                <div key={s} className="flex-1 flex items-center">
                  <div className="flex flex-col items-center flex-1">
                    <div className={`w-3 h-3 rounded-full ${i <= stepIndex ? "bg-[#c2ff38]" : "bg-white/15"}`} />
                    <span className={`text-[11px] mt-2 ${i <= stepIndex ? "text-white" : "text-white/40"}`}>{s}</span>
                  </div>
                  {i < steps.length - 1 && <div className={`h-px flex-1 -mt-4 ${i < stepIndex ? "bg-[#c2ff38]" : "bg-white/15"}`} />}
                </div>
              ))}
            </div>
            {(fulfillments ?? []).filter((f: { tracking_number: string | null }) => f.tracking_number).map((f: { tracking_number: string; tracking_url: string | null; carrier: string | null }, i: number) => (
              <p key={i} className="text-sm text-white/70 mt-4">
                {f.carrier || "Tracking"}:{" "}
                {f.tracking_url
                  ? <a className="text-[#c2ff38] underline" href={f.tracking_url} target="_blank" rel="noreferrer">{f.tracking_number}</a>
                  : <span className="font-mono">{f.tracking_number}</span>}
              </p>
            ))}
          </div>
        )}

        {/* Items */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="text-lg font-bold mb-4">Your gear</h2>
          <div className="space-y-3">
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {(lines ?? []).map((l: any) => (
              <div key={l.id} className="flex items-baseline gap-3 text-sm">
                <span className="flex-1">{l.quantity}× {l.title}{l.variant_title ? <span className="text-white/50"> · {l.variant_title}</span> : null}</span>
                <span className="text-white/70 tabular-nums">{money(l.total_gross)}</span>
              </div>
            ))}
            <div className="flex items-baseline gap-3 text-sm font-bold border-t border-white/10 pt-3">
              <span className="flex-1">Total (incl. VAT)</span>
              <span className="tabular-nums">{money(order.grand_total)}</span>
            </div>
          </div>
        </div>

        {/* Open returns */}
        {openReturns.length > 0 && (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-lg font-bold mb-2">Return in progress</h2>
            {openReturns.map((r: { id: string; status: string; declared_at: string }) => (
              <p key={r.id} className="text-sm text-white/70">
                Declared {new Date(r.declared_at).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })} — status: <span className="text-[#c2ff38]">{r.status.replace(/_/g, " ")}</span>
              </p>
            ))}
          </div>
        )}

        {/* Withdrawal / returns entry (the legally required function) */}
        <ReturnForm token={token} lines={returnable} />

        <footer className="text-xs text-white/40 leading-relaxed pt-2">
          Questions? Just reply to your order email. Withdrawal right: 14 days from delivery,
          confirmation is emailed the moment you submit. NP7 GmbH.
        </footer>
      </div>
    </main>
  );
}
