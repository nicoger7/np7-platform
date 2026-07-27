"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

// The permanently available withdrawal function (Directive 2023/2673):
// order lookup → the tokenized order page, where the two-step declaration lives.
export default function WithdrawPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function lookup() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/shop/withdraw-lookup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, order_number: orderNumber }),
    });
    const d = await res.json();
    setLoading(false);
    if (!res.ok) { setError(d.error || "Not found."); return; }
    router.push(`/orders/${d.token}`);
  }

  return (
    <main className="min-h-screen bg-[#0a0c10] text-white px-5 py-16">
      <div className="max-w-md mx-auto">
        <p className="text-xs font-bold tracking-[0.2em] uppercase text-[#c2ff38] mb-1">NP7 Hardware</p>
        <h1 className="text-3xl font-black mb-3">Withdraw from a purchase</h1>
        <p className="text-sm text-white/60 mb-8 leading-relaxed">
          You can withdraw from your order within 14 days of delivery — no reason needed.
          Enter your order details and declare the return on the next page; you&apos;ll get an
          email confirmation immediately.
        </p>
        <div className="space-y-4">
          <div>
            <label className="block text-xs text-white/50 mb-1.5">Email used for the order</label>
            <input
              className="w-full bg-black/40 border border-white/15 rounded-lg px-3 py-2.5 text-sm"
              type="email" value={email} onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1.5">Order number (e.g. 10432)</label>
            <input
              className="w-full bg-black/40 border border-white/15 rounded-lg px-3 py-2.5 text-sm"
              value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            onClick={lookup}
            disabled={loading || !email || !orderNumber}
            className="px-6 py-3 rounded-full bg-[#c2ff38] text-black text-sm font-bold disabled:opacity-40"
          >
            {loading ? "Looking up…" : "Find my order"}
          </button>
        </div>
        <p className="text-xs text-white/40 mt-8 leading-relaxed">
          Prefer email? A plain message to the address in your order confirmation counts too —
          this page is just the fastest way.
        </p>
      </div>
    </main>
  );
}
