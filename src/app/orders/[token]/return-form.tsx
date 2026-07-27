"use client";

import { useState } from "react";
import { RETURN_REASONS } from "@/lib/hardware/orders";

export interface ReturnableLine {
  id: string; title: string; variant_title: string | null; returnable: number;
}

// The withdrawal / return declaration — two-step (select → confirm), as the
// EU withdrawal-function rules require, with a durable confirmation emailed.
export default function ReturnForm({ token, lines }: { token: string; lines: ReturnableLine[] }) {
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [step, setStep] = useState<"select" | "confirm" | "done">("select");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const chosen = lines.filter((l) => (qty[l.id] ?? 0) > 0);

  async function submit() {
    setSubmitting(true);
    setError("");
    const res = await fetch("/api/shop/return", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        token,
        channel: "withdrawal_button",
        message,
        lines: chosen.map((l) => ({ order_line_id: l.id, quantity: qty[l.id], reason_code: reason[l.id] || null })),
      }),
    });
    setSubmitting(false);
    if (!res.ok) {
      setError((await res.json()).error || "Something went wrong — please try again or reply to your order email.");
      setStep("select");
      return;
    }
    setStep("done");
  }

  if (!lines.length) return null;

  if (step === "done") {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
        <h2 className="text-lg font-bold mb-2">Return registered ✓</h2>
        <p className="text-sm text-white/70 leading-relaxed">
          We&apos;ve emailed you a confirmation. We&apos;ll review it and send return instructions —
          for boards and bulky gear we arrange the pickup, don&apos;t ship anything yourself.
          Refunds go to your original payment method within 14 days of the return.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <h2 className="text-lg font-bold mb-1">Return items / withdraw from purchase</h2>
      <p className="text-xs text-white/50 mb-5 leading-relaxed">
        You can withdraw from your purchase within 14 days of delivery, no reason needed.
        Pick what goes back — we&apos;ll confirm by email right away.
      </p>

      {step === "select" && (
        <>
          <div className="space-y-3 mb-5">
            {lines.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-3">
                <span className="flex-1 min-w-[180px] text-sm">{l.title}{l.variant_title ? <span className="text-white/50"> · {l.variant_title}</span> : null}</span>
                <select
                  className="bg-black/40 border border-white/15 rounded-lg px-2 py-1.5 text-sm"
                  value={qty[l.id] ?? 0}
                  onChange={(e) => setQty({ ...qty, [l.id]: Number(e.target.value) })}
                >
                  {Array.from({ length: l.returnable + 1 }, (_, i) => (
                    <option key={i} value={i}>{i === 0 ? "Keep" : `Return ${i}`}</option>
                  ))}
                </select>
                {(qty[l.id] ?? 0) > 0 && (
                  <select
                    className="bg-black/40 border border-white/15 rounded-lg px-2 py-1.5 text-sm"
                    value={reason[l.id] ?? ""}
                    onChange={(e) => setReason({ ...reason, [l.id]: e.target.value })}
                  >
                    <option value="">Reason (optional)</option>
                    {RETURN_REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                  </select>
                )}
              </div>
            ))}
          </div>
          <textarea
            className="w-full bg-black/40 border border-white/15 rounded-lg px-3 py-2 text-sm mb-4 min-h-[64px]"
            placeholder="Anything we should know? (optional)"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
          <button
            onClick={() => chosen.length && setStep("confirm")}
            disabled={!chosen.length}
            className="px-5 py-2.5 rounded-full bg-[#c2ff38] text-black text-sm font-bold disabled:opacity-40"
          >
            Continue
          </button>
        </>
      )}

      {step === "confirm" && (
        <>
          <p className="text-sm mb-3">You&apos;re returning:</p>
          <ul className="text-sm text-white/80 mb-5 space-y-1">
            {chosen.map((l) => <li key={l.id}>· {qty[l.id]}× {l.title}{l.variant_title ? ` ${l.variant_title}` : ""}</li>)}
          </ul>
          <div className="flex gap-3">
            <button
              onClick={submit}
              disabled={submitting}
              className="px-5 py-2.5 rounded-full bg-[#c2ff38] text-black text-sm font-bold disabled:opacity-40"
            >
              {submitting ? "Sending…" : "Confirm withdrawal"}
            </button>
            <button onClick={() => setStep("select")} className="px-5 py-2.5 rounded-full border border-white/20 text-sm">
              Back
            </button>
          </div>
        </>
      )}
    </div>
  );
}
