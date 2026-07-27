"use client";

import { useState } from "react";
import Link from "next/link";
import { LegalShell } from "@/components/shared/legal-shell";

/**
 * Online-Widerrufsfunktion (§ 356a BGB). Two statutory steps:
 *   1) statement — name, contract identification, email for the acknowledgment
 *   2) a separate confirmation control labelled exactly "Widerruf bestätigen"
 * Reachable without any login; the acknowledgment email documents content +
 * date + time of receipt.
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
      if (!res.ok) { setError(j.error || "Das hat leider nicht geklappt. Bitte versuchen Sie es erneut."); return; }
      setReceivedAt(j.receivedAt || null);
      setStep(3);
    } catch {
      setError("Netzwerkfehler — bitte versuchen Sie es erneut oder senden Sie Ihren Widerruf per E-Mail (Adresse im Impressum).");
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full px-4 py-3 rounded-xl border border-[#e2e2e2] text-[15px] focus:outline-none focus:border-[#00afdb] focus:ring-1 focus:ring-[#00afdb] transition-colors";
  const label = "block text-[13px] font-semibold text-[#00374a] mb-1.5";

  return (
    <LegalShell title="Vertrag widerrufen">
      <p>
        Hier können Sie Verträge mit der NP7 GmbH, für die ein gesetzliches Widerrufsrecht besteht
        (z.&nbsp;B. den Kauf eines Wertgutscheins), online widerrufen — ohne Anmeldung und ohne Angabe
        von Gründen. Details: <Link href="/widerrufsbelehrung">Widerrufsbelehrung</Link>.
        {" "}<em>English: withdraw from a contract with NP7 GmbH online — no login, no reasons required.</em>
      </p>

      {step === 1 && (
        <div className="mt-8 space-y-4 max-w-[480px]">
          <div>
            <label className={label}>Ihr Name / your name *</label>
            <input className={input} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
          </div>
          <div>
            <label className={label}>Bestell-, Gutschein- oder Buchungsnummer — oder die E-Mail-Adresse der Bestellung *</label>
            <input className={input} value={form.contractRef} onChange={(e) => setForm({ ...form, contractRef: e.target.value })} placeholder="z. B. Gutschein-Code oder Bestellnummer" />
            <p className="text-[12px] text-[#8a9aa0] mt-1">Order / voucher number, or the email you ordered with — anything that identifies the contract.</p>
          </div>
          <div>
            <label className={label}>E-Mail für die Eingangsbestätigung / email for the confirmation *</label>
            <input className={input} type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" />
          </div>
          <div>
            <label className={label}>Anmerkung <span className="font-normal text-[#8a9aa0]">(optional — nie erforderlich)</span></label>
            <textarea className={`${input} min-h-[70px] resize-y`} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          </div>
          {/* Honeypot — hidden from real visitors */}
          <input type="text" value={form.website} onChange={(e) => setForm({ ...form, website: e.target.value })} className="hidden" tabIndex={-1} autoComplete="off" aria-hidden="true" />
          <button
            onClick={() => canContinue && setStep(2)}
            disabled={!canContinue}
            className="px-7 py-3.5 rounded-full text-[15px] font-bold text-white bg-[#00374a] hover:bg-[#00475f] disabled:opacity-40 transition-colors"
          >
            Weiter zur Bestätigung
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="mt-8 max-w-[480px]">
          <div className="note">
            <strong>Bitte prüfen / please check:</strong>
            <br />Name: {form.name.trim()}
            <br />Vertrag: {form.contractRef.trim()}
            <br />Bestätigung an: {form.email.trim()}
            {form.note.trim() ? <><br />Anmerkung: {form.note.trim()}</> : null}
          </div>
          <p className="text-[13.5px]">
            Mit Klick auf <strong>„Widerruf bestätigen"</strong> geben Sie Ihre Widerrufserklärung ab.
            Sie erhalten unverzüglich eine Eingangsbestätigung per E-Mail mit Datum und Uhrzeit des Eingangs.
          </p>
          {error && <p className="text-[13.5px] text-red-500 mb-3">{error}</p>}
          <div className="flex flex-wrap items-center gap-3 mt-4">
            <button
              onClick={confirm}
              disabled={busy}
              className="px-8 py-4 rounded-full text-[16px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] disabled:opacity-60 transition-colors"
            >
              {busy ? "Wird gesendet…" : "Widerruf bestätigen"}
            </button>
            <button onClick={() => { setStep(1); setError(""); }} className="text-[14px] text-[#8a9aa0] hover:text-[#00374a] transition-colors">← Zurück / back</button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="mt-8 max-w-[520px]">
          <div className="note" style={{ background: "#effaf5", borderColor: "#cdeeda" }}>
            <strong>Ihr Widerruf ist eingegangen.</strong>
            {receivedAt && (
              <> Eingang: {new Date(receivedAt).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" })}
                {" um "}
                {new Date(receivedAt).toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" })} Uhr.</>
            )}
            {" "}Die Eingangsbestätigung mit allen Details ist auf dem Weg an {form.email.trim()}.
            <br /><em>English: your withdrawal was received — the confirmation email with date and time is on its way.</em>
          </div>
          <p className="text-[13.5px]">Wir prüfen Ihre Erklärung und melden uns zeitnah zur Rückabwicklung.</p>
        </div>
      )}
    </LegalShell>
  );
}
