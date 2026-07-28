"use client";

import { useState } from "react";
import Link from "next/link";
import { LegalShell } from "@/components/shared/legal-shell";

/**
 * Online withdrawal function (§ 356a BGB). Two statutory steps:
 *   1) statement — name, contract identification, email for the acknowledgment
 *   2) a separate confirmation control ("Confirm withdrawal" — the directive's
 *      English wording; the German statutory label is shown alongside)
 * Reachable without any login; the acknowledgment email documents content +
 * date + time of receipt. Page copy is English-first to match the site, with
 * the statutory German kept where it carries legal weight.
 */
export default function WiderrufPage() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState({ name: "", contractRef: "", email: "", note: "", website: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [receivedAt, setReceivedAt] = useState<string | null>(null);

  const canContinue = form.name.trim() && form.contractRef.trim() && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim());

  async function confirm() {
    setBusy(true); setError("");
    try {
      const res = await fetch("/api/widerruf", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, name: form.name.trim(), contractRef: form.contractRef.trim(), email: form.email.trim(), note: form.note.trim() }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { setError(j.error || "That didn't work — please try again."); return; }
      setReceivedAt(j.receivedAt || null);
      setStep(3);
    } catch {
      setError("Network error — please try again, or send your withdrawal by email (address in the Impressum).");
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full px-4 py-3 rounded-xl border border-[#e2e2e2] text-[15px] focus:outline-none focus:border-[#00afdb] focus:ring-1 focus:ring-[#00afdb] transition-colors";
  const label = "block text-[13px] font-semibold text-[#00374a] mb-1.5";

  return (
    <LegalShell title="Withdraw from contract">
      <p>
        Withdraw from a contract with NP7 GmbH that carries a statutory right of withdrawal
        (e.g. a gift-voucher purchase) — online, no login, no reasons required
        (<em>gesetzliche Online-Widerrufsfunktion, § 356a BGB</em>).
        Details: <Link href="/widerrufsbelehrung">withdrawal policy</Link>.
      </p>

      {step === 1 && (
        <div className="mt-8 space-y-4 max-w-[480px]">
          <div>
            <label className={label}>Your name *</label>
            <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
          </div>
          <div>
            <label className={label}>Order, voucher or booking number — or the email you ordered with *</label>
            <input className={input} value={form.contractRef} onChange={(e) => setForm({ ...form, contractRef: e.target.value })} placeholder="e.g. voucher code or order number" />
            <p className="text-[12px] text-[#8a9aa0] mt-1">Anything that identifies the contract.</p>
          </div>
          <div>
            <label className={label}>Email for the confirmation *</label>
            <input className={input} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" />
          </div>
          <div>
            <label className={label}>Note <span className="font-normal text-[#8a9aa0]">(optional — never required)</span></label>
            <textarea className={`${input} min-h-[70px] resize-y`} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          {/* Honeypot — hidden from real visitors */}
          <input type="text" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />
          <button
            onClick={() => canContinue && setStep(2)}
            disabled={!canContinue}
            className="px-7 py-3.5 rounded-full text-[15px] font-bold text-white bg-[#00374a] hover:bg-[#00475f] disabled:opacity-40 transition-colors"
          >
            Continue to confirmation
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="mt-8 max-w-[480px]">
          <div className="note">
            <strong>Please check:</strong>
            <br />Name: {form.name.trim()}
            <br />Contract: {form.contractRef.trim()}
            <br />Confirmation to: {form.email.trim()}
            {form.note.trim() ? <><br />Note: {form.note.trim()}</> : null}
          </div>
          <p className="text-[13.5px]">
            Clicking <strong>&ldquo;Confirm withdrawal&rdquo;</strong> submits your withdrawal declaration
            (<em>Widerruf bestätigen</em>). You&apos;ll immediately receive an acknowledgment email with
            the date and time of receipt.
          </p>
          {error && <p className="text-[13.5px] text-red-500 mb-3">{error}</p>}
          <div className="flex flex-wrap items-center gap-3 mt-4">
            <button
              onClick={confirm}
              disabled={busy}
              className="px-8 py-4 rounded-full text-[16px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] disabled:opacity-60 transition-colors"
            >
              {busy ? "Sending…" : "Confirm withdrawal"}
            </button>
            <button onClick={() => { setStep(1); setError(""); }} className="text-[14px] text-[#8a9aa0] hover:text-[#00374a] transition-colors">← Back</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="mt-8 max-w-[520px]">
          <div className="note" style={{ background: "#effaf5", borderColor: "#cdeeda" }}>
            <strong>Your withdrawal has been received.</strong>
            {receivedAt && (
              <> Received: {new Date(receivedAt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "Europe/Berlin" })}
                {" at "}
                {new Date(receivedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" })} (German time).</>
            )}
            {" "}The acknowledgment email with all details is on its way to {form.email.trim()}.
          </div>
          <p className="text-[13.5px]">We&apos;ll review your declaration and get back to you shortly about the refund.</p>
        </div>
      )}
    </LegalShell>
  );
}
