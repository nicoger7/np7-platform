"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCart } from "@/components/hardware/cart";

const COUNTRIES: [string, string][] = [
  ["DE", "Germany"], ["AT", "Austria"], ["NL", "Netherlands"], ["BE", "Belgium"],
  ["FR", "France"], ["IT", "Italy"], ["ES", "Spain"], ["DK", "Denmark"],
  ["SE", "Sweden"], ["FI", "Finland"], ["PL", "Poland"], ["CZ", "Czechia"],
  ["PT", "Portugal"], ["IE", "Ireland"], ["GR", "Greece"], ["HR", "Croatia"],
  ["CH", "Switzerland"], ["NO", "Norway"], ["GB", "United Kingdom"],
];

const input = "w-full bg-black/40 border border-white/15 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#c2ff38] transition-colors";
const label = "block text-xs text-white/50 mb-1.5";
const eyebrow = "font-mono text-[11px] font-bold tracking-[0.25em] uppercase text-[#c2ff38]";

export default function CheckoutPage() {
  const cart = useCart();
  const router = useRouter();
  const [form, setForm] = useState({
    email: "", phone: "", name: "", line1: "", line2: "", postal_code: "", city: "", country: "DE", notes: "",
  });
  const [accept, setAccept] = useState(false);
  const [tax, setTax] = useState<{ rate: number; treatment: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/shop/quote?country=${form.country}`).then((r) => r.json()).then(setTax).catch(() => setTax(null));
  }, [form.country]);

  const gross = cart.subtotal;
  const rate = tax?.rate ?? 19;
  const net = gross / (1 + rate / 100);
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function placeOrder() {
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/shop/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: form.email,
        phone: form.phone || null,
        notes: form.notes || null,
        accept_terms: accept,
        shipping_address: {
          name: form.name, line1: form.line1, line2: form.line2 || null,
          postal_code: form.postal_code, city: form.city, country: form.country,
        },
        lines: cart.items.map((i) => ({ variant_id: i.variantId, quantity: i.qty })),
      }),
    });
    const d = await res.json();
    setSubmitting(false);
    if (!res.ok) { setError(d.error || "Something went wrong — nothing was ordered."); return; }
    cart.clear();
    router.push(`/orders/${d.token}?placed=1`);
  }

  const nonVariantItems = cart.items.filter((i) => !i.variantId);
  const ready = form.email && form.name && form.line1 && form.postal_code && form.city && accept && cart.items.length > 0 && !nonVariantItems.length;

  return (
    <main className="min-h-screen bg-[#0a0c10] text-white px-5 pt-28 pb-16">
      <div className="max-w-3xl mx-auto">
        <p className={`${eyebrow} mb-2`}>// NP7 HARDWARE</p>
        <h1 className="text-4xl sm:text-5xl font-black tracking-[-0.02em] mb-2">Almost on the water.</h1>
        <p className="text-white/50 text-sm mb-10 max-w-md">
          Tell us where the gear lands — we handle the rest. Next stop: your first session on it.
        </p>

        {cart.items.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center">
            <p className="text-2xl font-black mb-2">Your quiver is empty.</p>
            <p className="text-white/50 text-sm mb-6">Pick your weapon first.</p>
            <Link href="/hardware" className="inline-block px-7 py-3.5 rounded-full bg-[#c2ff38] text-black text-sm font-black uppercase tracking-wide">Browse the gear</Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-[1fr_320px] gap-6 items-start">
            {/* Address + contact */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-5">
              <p className={eyebrow}>// WHERE IT LANDS</p>
              <div>
                <label className={label}>Email *</label>
                <input className={input} type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="you@..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2"><label className={label}>Full name *</label>
                  <input className={input} value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
                <div className="col-span-2"><label className={label}>Street &amp; number *</label>
                  <input className={input} value={form.line1} onChange={(e) => set("line1", e.target.value)} /></div>
                <div className="col-span-2"><label className={label}>Address extra</label>
                  <input className={input} value={form.line2} onChange={(e) => set("line2", e.target.value)} /></div>
                <div><label className={label}>Postal code *</label>
                  <input className={input} value={form.postal_code} onChange={(e) => set("postal_code", e.target.value)} /></div>
                <div><label className={label}>City *</label>
                  <input className={input} value={form.city} onChange={(e) => set("city", e.target.value)} /></div>
                <div><label className={label}>Country *</label>
                  <select className={input} value={form.country} onChange={(e) => set("country", e.target.value)}>
                    {COUNTRIES.map(([c, n]) => <option key={c} value={c}>{n}</option>)}
                  </select></div>
                <div><label className={label}>Phone</label>
                  <input className={input} value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
              </div>
              <div>
                <label className={label}>Anything we should know?</label>
                <input className={input} value={form.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Delivery notes, questions…" />
              </div>

              {/* Payment: bank transfer v1; Stripe joins when keys land */}
              <div className="rounded-xl border border-[#c2ff38]/30 bg-[#c2ff38]/5 p-4">
                <p className={`${eyebrow} mb-2`}>// PAYMENT</p>
                <p className="text-sm font-bold mb-1">Bank transfer (Vorkasse)</p>
                <p className="text-xs text-white/50 leading-relaxed">
                  Bank details land with your confirmation — your gear is packed the moment the
                  transfer arrives. Card &amp; PayPal are coming soon.
                </p>
              </div>

              <label className="flex items-start gap-2.5 text-xs text-white/60 leading-relaxed cursor-pointer">
                <input type="checkbox" className="mt-0.5 accent-[#c2ff38]" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
                <span>
                  I accept the terms of sale and have read the{" "}
                  <Link href="/widerrufsbelehrung" className="text-[#c2ff38] underline" target="_blank">withdrawal policy</Link>{" "}
                  (14-day right of withdrawal). *
                </span>
              </label>

              {nonVariantItems.length > 0 && (
                <p className="text-xs text-amber-400">
                  {nonVariantItems.map((i) => i.name).join(", ")}: this product has no selectable size yet —
                  please re-add it from its product page.
                </p>
              )}
              {error && <p className="text-sm text-red-400">{error}</p>}
              <button
                onClick={placeOrder}
                disabled={!ready || submitting}
                className="w-full px-7 py-4 rounded-full bg-[#c2ff38] text-black text-sm font-black uppercase tracking-wide disabled:opacity-40 hover:brightness-110 hover:-translate-y-0.5 transition-all shadow-[0_0_30px_rgba(194,255,56,0.35)]"
              >
                {submitting ? "Making it yours…" : "Buy now · zahlungspflichtig bestellen"}
              </button>
              <p className="font-mono text-[10px] uppercase tracking-wider text-white/35 text-center">The wind won&apos;t wait.</p>
            </div>

            {/* Summary */}
            <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
              <p className={`${eyebrow} mb-4`}>// YOUR NEW SETUP</p>
              <div className="space-y-3 mb-4">
                {cart.items.map((i) => (
                  <div key={cart.keyOf(i)} className="flex items-center gap-3">
                    <span className="shrink-0 w-11 h-11 rounded-lg overflow-hidden bg-black/50 border border-white/10 grid place-items-center">
                      {i.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={i.image} alt="" className="w-full h-full object-cover" />
                      ) : <span className="font-mono text-[9px] text-white/30">NP7</span>}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold truncate">{i.qty}× {i.name}</p>
                      {i.variantName && <p className="font-mono text-[10px] text-[#c2ff38]/70 uppercase">{i.variantName}</p>}
                    </div>
                    <span className="text-xs font-bold tabular-nums">€{(i.qty * i.unitGross).toLocaleString("en-US")}</span>
                  </div>
                ))}
              </div>
              <div className="border-t border-white/10 pt-3 space-y-1.5 text-xs">
                <div className="flex justify-between text-white/50"><span>Net</span><span className="tabular-nums">€{net.toLocaleString("en-US", { maximumFractionDigits: 2 })}</span></div>
                <div className="flex justify-between text-white/50">
                  <span>VAT {rate}%{tax?.treatment === "export" ? " (export)" : ""} · {form.country}</span>
                  <span className="tabular-nums">€{(gross - net).toLocaleString("en-US", { maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-lg font-black pt-1.5"><span>Total</span><span className="tabular-nums" style={{ color: "#c2ff38" }}>€{gross.toLocaleString("en-US")}</span></div>
              </div>
              <div className="border-t border-white/10 mt-4 pt-4 space-y-1.5">
                {["14-day withdrawal right", "2-year warranty", "Packed & checked by riders"].map((t) => (
                  <p key={t} className="text-[11px] text-white/50 flex items-center gap-2">
                    <span className="text-[#c2ff38]">✓</span>{t}
                  </p>
                ))}
              </div>
              <p className="text-[10px] text-white/35 mt-3">Shipping confirmed with your order — free EU shipping on boards.</p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
