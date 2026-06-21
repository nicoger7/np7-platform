"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { fmtVoucherMoney } from "@/lib/vouchers";

type Exp = { id: string; title: string; currency: string | null };
type Pkg = { id: string; name: string; price: number | null; experience_id: string };

export function GiftBuyForm({ experiences, packages }: { experiences: Exp[]; packages: Pkg[] }) {
  const [expId, setExpId] = useState(experiences[0]?.id ?? "");
  const pkgs = useMemo(() => packages.filter((p) => p.experience_id === expId), [packages, expId]);
  const [pkgId, setPkgId] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const exp = experiences.find((e) => e.id === expId);
  const pkg = pkgs.find((p) => p.id === pkgId);
  const currency = exp?.currency ?? "EUR";

  function pickExp(id: string) { setExpId(id); setPkgId(""); }

  async function submit() {
    setError("");
    if (!expId) { setError("Choose an experience."); return; }
    setBusy(true);
    const res = await fetch("/api/voucher", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experienceId: expId, packageId: pkgId || null, recipientName, recipientEmail, message }),
    });
    setBusy(false);
    if (res.ok) setDone(true);
    else { const j = await res.json().catch(() => ({})); setError(j.error || "Couldn't create the voucher — please try again."); }
  }

  const input = "w-full px-4 py-3 rounded-xl border border-[#dde6e9] text-[15px] text-[#00374a] outline-none focus:border-[#00afdb] bg-white";
  const label = "block text-[11px] font-bold uppercase tracking-wide text-[#9aa6ac] mb-1.5";

  if (done) {
    return (
      <div className="bg-white rounded-2xl border border-[#f0e6d6] p-7 text-center">
        <div className="mx-auto w-14 h-14 rounded-full bg-[#00afdb] grid place-items-center mb-4"><svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg></div>
        <h2 className="text-2xl font-black text-[#00374a] mb-2">Gift voucher created 🎁</h2>
        <p className="text-[14.5px] text-[#5a6b72] leading-relaxed mb-6 max-w-[420px] mx-auto">It&apos;s in your account. Pay by bank transfer to activate it — then you can print it and gift it, or use it yourself.</p>
        <Link href="/account/vouchers" className="inline-block px-7 py-3.5 rounded-full text-[13.5px] font-bold text-white bg-[#00afdb]">Go to my gift vouchers</Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-[#f0e6d6] p-6 sm:p-8 space-y-5">
      <div>
        <label className={label}>Experience</label>
        <select className={input} value={expId} onChange={(e) => pickExp(e.target.value)}>
          {experiences.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
        </select>
      </div>

      <div>
        <label className={label}>Package</label>
        <select className={input} value={pkgId} onChange={(e) => setPkgId(e.target.value)} disabled={pkgs.length === 0}>
          <option value="">{pkgs.length ? "Choose a package…" : "No packages yet"}</option>
          {pkgs.map((p) => <option key={p.id} value={p.id}>{p.name}{p.price != null ? ` — ${fmtVoucherMoney(p.price, currency)}` : ""}</option>)}
        </select>
      </div>

      {pkg?.price != null && (
        <div className="rounded-xl bg-[#eef6f8] border border-[#d4e8ee] px-4 py-3 flex items-center justify-between">
          <span className="text-[13.5px] text-[#5a6b72]">Voucher value</span>
          <span className="text-[18px] font-black text-[#00374a]">{fmtVoucherMoney(pkg.price, currency)}</span>
        </div>
      )}

      <div className="border-t border-[#f3ede2] pt-5">
        <p className="text-[13px] text-[#8a9aa0] mb-3">Who&apos;s it for? (optional — you can also keep it for yourself)</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className={label}>Recipient name</label><input className={input} value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Their name" /></div>
          <div><label className={label}>Recipient email</label><input className={input} value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="optional" /></div>
        </div>
        <div className="mt-3"><label className={label}>Personal message</label><textarea className={`${input} min-h-[80px] resize-y`} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Add a note — it'll show on the printed voucher." /></div>
      </div>

      <div className="rounded-xl bg-[#fff7ec] border border-[#f0e6d6] px-4 py-3 text-[12.5px] text-[#6a7a80] leading-relaxed">
        Paid by bank transfer — we&apos;ll activate the voucher once it arrives. Valid <strong>1 year</strong> at today&apos;s price; if it isn&apos;t used, 50% is refundable.
      </div>

      {error && <p className="text-[13px] text-red-500">{error}</p>}
      <button onClick={submit} disabled={busy} className="w-full px-7 py-4 rounded-full text-[15px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] disabled:opacity-60 transition-all">
        {busy ? "Creating…" : "Create gift voucher"}
      </button>
    </div>
  );
}
