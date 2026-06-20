"use client";

import { useState } from "react";
import { SignaturePad } from "./signature-pad";

export function SignWaiver({ bookingId, html, defaultName, signed }: {
  bookingId: string;
  html: string;
  defaultName: string;
  signed: { name: string; at: string } | null;
}) {
  const [name, setName] = useState(defaultName);
  const [signature, setSignature] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(!!signed);

  async function submit() {
    setError("");
    if (!name.trim()) { setError("Please type your full name."); return; }
    if (!agree) { setError("Please tick the box to confirm you agree."); return; }
    setSubmitting(true);
    const res = await fetch(`/api/portal/bookings/${bookingId}/waiver`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), signature, agree }),
    });
    setSubmitting(false);
    if (res.ok) setDone(true);
    else { const j = await res.json().catch(() => ({})); setError(j.error || "Couldn't save — please try again."); }
  }

  if (done) {
    return (
      <main className="min-h-[100svh] bg-[#fff7ec] grid place-items-center px-5">
        <div className="bg-white rounded-2xl border border-[#f0e6d6] p-8 max-w-[440px] text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-[#00afdb] grid place-items-center mb-4"><svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg></div>
          <h1 className="text-2xl font-black text-[#00374a] mb-2">Waiver signed ✓</h1>
          <p className="text-[14px] text-[#5a6b72] mb-6">Thanks{signed?.name ? `, ${signed.name}` : name ? `, ${name}` : ""} — it&apos;s saved in your account and with our team.</p>
          <a href="/account" className="inline-block px-7 py-3.5 rounded-full text-[13.5px] font-bold text-white bg-[#00afdb]">Back to my account</a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-[100svh] bg-[#fff7ec]">
      <style>{`.waiver-doc h2{font-size:17px;font-weight:800;color:#00374a;margin:0 0 8px}.waiver-doc h3{font-size:14px;font-weight:700;color:#00374a;margin:16px 0 4px}.waiver-doc p{margin:0 0 10px}.waiver-doc strong{color:#00374a}`}</style>
      <div className="max-w-[720px] mx-auto px-5 sm:px-8 py-10">
        <a href="/account" className="text-[13px] font-semibold text-[#0782a0]">← My account</a>
        <h1 className="text-2xl font-black text-[#00374a] mt-3 mb-5">Sign your waiver</h1>
        <div className="bg-white rounded-2xl border border-[#f0e6d6] p-6 sm:p-8">
          <div className="waiver-doc max-h-[44vh] overflow-y-auto pr-2 mb-6 text-[13.5px] text-[#3a4a50] leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
          <label className="block text-xs font-bold uppercase tracking-wide text-[#9aa6ac] mb-1">Full name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your full name" className="w-full px-4 py-3 rounded-xl border border-[#dde6e9] text-[15px] text-[#00374a] outline-none focus:border-[#00afdb] mb-4" />
          <SignaturePad onChange={setSignature} />
          <label className="flex items-start gap-2.5 mt-4 cursor-pointer">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#00afdb]" />
            <span className="text-[13px] text-[#5a6b72] leading-snug">I have read and understood this agreement and I agree to it.</span>
          </label>
          {error && <p className="text-[13px] text-red-500 mt-3">{error}</p>}
          <button onClick={submit} disabled={submitting} className="w-full mt-5 px-7 py-4 rounded-full text-[15px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] disabled:opacity-60 transition-all">{submitting ? "Saving…" : "Sign now"}</button>
        </div>
      </div>
    </main>
  );
}
