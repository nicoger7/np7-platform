"use client";

import Link from "next/link";
import { useCart } from "@/components/hardware/cart";

// The cart is where the dream firms up — it should feel like gear, not a form.
export default function CartPage() {
  const cart = useCart();

  return (
    <main className="min-h-screen bg-[#0a0c10] text-white px-5 pt-28 pb-16">
      <div className="max-w-2xl mx-auto">
        <p className="font-mono text-[11px] font-bold tracking-[0.25em] uppercase text-[#c2ff38] mb-2">// NP7 HARDWARE</p>
        <h1 className="text-4xl sm:text-5xl font-black tracking-[-0.02em] mb-2">Your new quiver</h1>
        <p className="text-white/50 text-sm mb-10">Picked by you. Built by riders. Almost yours.</p>

        {cart.items.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-10 text-center">
            <p className="text-2xl font-black mb-2">Nothing here yet.</p>
            <p className="text-white/50 text-sm mb-6">The wind won&apos;t wait — go find the gear that fits your riding.</p>
            <Link href="/hardware" className="inline-block px-7 py-3.5 rounded-full bg-[#c2ff38] text-black text-sm font-black uppercase tracking-wide hover:brightness-110 transition-all">
              Browse the gear
            </Link>
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-white/10 bg-white/5 divide-y divide-white/10 mb-6 overflow-hidden">
              {cart.items.map((i) => {
                const k = cart.keyOf(i);
                return (
                  <div key={k} className="flex flex-wrap items-center gap-4 p-4">
                    <Link href={`/hardware/${i.slug}`} className="shrink-0 w-16 h-16 rounded-xl overflow-hidden bg-black/50 border border-white/10 grid place-items-center">
                      {i.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={i.image} alt={i.name} className="w-full h-full object-cover" />
                      ) : (
                        <span className="font-mono text-[10px] text-white/30">NP7</span>
                      )}
                    </Link>
                    <div className="flex-1 min-w-[140px]">
                      <Link href={`/hardware/${i.slug}`} className="text-[15px] font-black hover:text-[#c2ff38] transition-colors">{i.name}</Link>
                      {i.variantName && <p className="font-mono text-[11px] text-[#c2ff38]/80 uppercase tracking-wider mt-0.5">{i.variantName}</p>}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => cart.setQty(k, i.qty - 1)} aria-label="Less"
                        className="w-8 h-8 rounded-full border border-white/20 hover:border-[#c2ff38] transition-colors">−</button>
                      <span className="w-6 text-center text-sm font-bold tabular-nums">{i.qty}</span>
                      <button onClick={() => cart.setQty(k, i.qty + 1)} aria-label="More"
                        className="w-8 h-8 rounded-full border border-white/20 hover:border-[#c2ff38] transition-colors">+</button>
                    </div>
                    <span className="w-24 text-right text-[15px] font-black tabular-nums">€{(i.qty * i.unitGross).toLocaleString("en-US")}</span>
                    <button onClick={() => cart.remove(k)} aria-label="Remove" className="text-white/30 hover:text-red-400 transition-colors">✕</button>
                  </div>
                );
              })}
            </div>

            <div className="flex items-baseline justify-between mb-8">
              <span className="text-sm text-white/50">Total · incl. VAT</span>
              <span className="text-3xl font-black tabular-nums" style={{ color: "#c2ff38" }}>€{cart.subtotal.toLocaleString("en-US")}</span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link href="/hardware/checkout" className="px-8 py-4 rounded-full bg-[#c2ff38] text-black text-sm font-black uppercase tracking-wide hover:brightness-110 hover:-translate-y-0.5 transition-all shadow-[0_0_30px_rgba(194,255,56,0.35)]">
                Lock it in →
              </Link>
              <Link href="/hardware" className="px-7 py-3.5 rounded-full border border-white/20 text-sm font-bold hover:border-white/40 transition-colors">
                Keep browsing
              </Link>
            </div>
            <p className="font-mono text-[10px] uppercase tracking-wider text-white/35 mt-5">
              14-day withdrawal · 2-year warranty · packed by riders
            </p>
          </>
        )}
      </div>
    </main>
  );
}
