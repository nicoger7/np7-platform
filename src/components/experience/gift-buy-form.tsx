"use client";

import { useState } from "react";
import { fmtVoucherMoney } from "@/lib/vouchers";
import { track } from "@/lib/analytics-client";

type Exp = { id: string; title: string; currency: string | null };

// €200 steps up to €5,000, then €1,000 steps to €10,000.
const AMOUNTS = [
  ...Array.from({ length: 25 }, (_, i) => 200 * (i + 1)),
  ...Array.from({ length: 5 }, (_, i) => 6000 + 1000 * i),
];
const DEFAULT_IDX = AMOUNTS.indexOf(1000);

export function GiftBuyForm({ experiences }: { experiences: Exp[] }) {
  const [idx, setIdx] = useState(DEFAULT_IDX);
  const amount = AMOUNTS[idx];
  const [expId, setExpId] = useState(""); // "" = any NP7 Experience (value voucher)
  const [buyerName, setBuyerName] = useState("");
  const [buyerEmail, setBuyerEmail] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [message, setMessage] = useState("");
  const [nicoCall, setNicoCall] = useState(false);
  const [recipientPhone, setRecipientPhone] = useState("");
  const [callDate, setCallDate] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  type Pay = { iban: string; bic: string | null; bank_name: string | null; legal_name: string | null } | null;
  const [done, setDone] = useState<null | { code: string; amount: number | null; currency: string | null; pay: Pay }>(null);

  const currency = experiences.find((e) => e.id === expId)?.currency ?? experiences[0]?.currency ?? "EUR";
  const over5k = amount > 5000;

  async function submit() {
    setError("");
    if (!buyerName.trim()) { setError("Please enter your name."); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(buyerEmail.trim())) { setError("Please enter a valid email address."); return; }
    if (nicoCall && !recipientPhone.trim()) { setError("Add the recipient's phone number so Nico can call them."); return; }
    setBusy(true);
    const res = await fetch("/api/voucher", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experienceId: expId || null, amount, buyerName, buyerEmail, recipientName, recipientEmail, message, nicoCall, recipientPhone, callDate }),
    });
    setBusy(false);
    const j = await res.json().catch(() => ({}));
    if (res.ok) { track("voucher_buy", { amount, experience: expId || "any" }); setDone({ code: j.voucher?.code, amount: j.voucher?.amount ?? amount, currency: j.voucher?.currency ?? currency, pay: j.pay ?? null }); }
    else { setError(j.error || "Couldn't create the voucher — please try again."); }
  }

  const input = "w-full px-4 py-3 rounded-xl border border-[#dde6e9] text-[15px] text-[#00374a] outline-none focus:border-[#00afdb] bg-white";
  const label = "block text-[11px] font-bold uppercase tracking-wide text-[#9aa6ac] mb-1.5";

  if (done) {
    const amountLabel = done.amount != null ? fmtVoucherMoney(done.amount, done.currency || "EUR") : null;
    const payRows: [string, string][] = [];
    if (amountLabel) payRows.push(["Amount", amountLabel]);
    if (done.pay) {
      if (done.pay.legal_name) payRows.push(["Account", done.pay.legal_name]);
      payRows.push(["IBAN", done.pay.iban]);
      if (done.pay.bic) payRows.push(["BIC", done.pay.bic]);
      if (done.pay.bank_name) payRows.push(["Bank", done.pay.bank_name]);
    }
    payRows.push(["Reference", done.code]);
    return (
      <div className="bg-white rounded-2xl border border-[#f0e6d6] p-7">
        <div className="text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-[#00afdb] grid place-items-center mb-4"><svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg></div>
          <h2 className="text-2xl font-black text-[#00374a] mb-2">Gift voucher reserved 🎁</h2>
          <p className="text-[14.5px] text-[#5a6b72] leading-relaxed mb-1 max-w-[440px] mx-auto">
            {amountLabel ? <>Your <strong>{amountLabel}</strong> voucher is reserved.</> : "Your voucher is reserved."} Pay by bank transfer to confirm it.
          </p>
          <p className="text-[13px] text-[#8a9aa0] mb-5 max-w-[440px] mx-auto">Once your payment lands we&apos;ll email the printable voucher to <strong>{buyerEmail}</strong>{nicoCall ? " and line up Nico's call" : ""}.</p>
        </div>
        {done.pay ? (
          <div className="rounded-xl bg-[#f6fafb] border border-[#dde6e9] p-4 text-[13.5px]">
            {payRows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 py-1.5 border-b border-[#e7eef0] last:border-0">
                <span className="text-[#8a9aa0] shrink-0">{k}</span><span className="font-bold text-[#00374a] text-right break-all">{v}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[13px] text-[#8a9aa0] text-center">We&apos;ll email you the bank-transfer details and your voucher shortly.</p>
        )}
        <p className="text-[12px] text-[#9aa6ac] text-center mt-4">Please use reference <strong>{done.code}</strong> so we can match your payment.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-[#f0e6d6] p-6 sm:p-8 space-y-6">
      {/* Amount */}
      <div>
        <label className={label}>Voucher amount</label>
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[34px] font-black text-[#00374a]">{fmtVoucherMoney(amount, currency)}</span>
          <span className="text-[12px] text-[#9aa6ac]">€200 – €10,000</span>
        </div>
        <input type="range" min={0} max={AMOUNTS.length - 1} step={1} value={idx} onChange={(e) => setIdx(Number(e.target.value))} className="w-full accent-[#00afdb] cursor-pointer" />
        <p className="text-[12px] text-[#9aa6ac] mt-1.5">{over5k ? "Over €5,000 — valid for 2 years." : "Valid for 1 year. €200 steps (then €1,000 over €5,000)."}</p>
      </div>

      {/* Towards which experience */}
      <div className="border-t border-[#f3ede2] pt-5">
        <label className={label}>Towards</label>
        <div className="flex flex-wrap gap-2">
          {[{ id: "", title: "Any NP7 Experience" }, ...experiences].map((e) => {
            const on = expId === e.id;
            return (
              <button key={e.id || "any"} type="button" onClick={() => setExpId(e.id)}
                className={`px-3.5 py-2 rounded-full text-[13px] font-semibold transition-colors border ${on ? "bg-[#00afdb] text-white border-[#00afdb]" : "bg-white text-[#00374a] border-[#dde6e9] hover:border-[#00afdb]"}`}>
                {e.title}
              </button>
            );
          })}
        </div>
        <p className="text-[12px] text-[#9aa6ac] mt-2">{expId ? "Earmarked for this trip — they pick the week & package when they book." : "A value voucher — usable on any available NP7 Experience."}</p>
      </div>

      {/* Buyer */}
      <div className="border-t border-[#f3ede2] pt-5">
        <p className="text-[13px] text-[#8a9aa0] mb-3">Your details — where we&apos;ll send the confirmation.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className={label}>Your name</label><input className={input} value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Your name" /></div>
          <div><label className={label}>Your email</label><input className={input} type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} placeholder="you@email.com" /></div>
        </div>
      </div>

      {/* Recipient */}
      <div className="border-t border-[#f3ede2] pt-5">
        <p className="text-[13px] text-[#8a9aa0] mb-3">Who&apos;s it for? (optional — you can also keep it for yourself)</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className={label}>Recipient name</label><input className={input} value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Their name" /></div>
          <div><label className={label}>Recipient email</label><input className={input} value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="optional" /></div>
        </div>
        <div className="mt-3"><label className={label}>Personal message</label><textarea className={`${input} min-h-[80px] resize-y`} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Add a note — it'll show on the printed voucher." /></div>
      </div>

      {/* Nico call extra */}
      <div className="border-t border-[#f3ede2] pt-5">
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={nicoCall} onChange={(e) => setNicoCall(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#00afdb]" />
          <span>
            <span className="block text-[14px] font-bold text-[#00374a]">Have Nico call them with the news 🎉</span>
            <span className="block text-[12.5px] text-[#6a7a80] mt-0.5">A personal phone call from Nico to share the gift — a lovely surprise. We&apos;ll arrange the timing with you.</span>
          </span>
        </label>
        {nicoCall && (
          <div className="grid sm:grid-cols-2 gap-3 mt-3">
            <div><label className={label}>Recipient phone</label><input className={input} value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} placeholder="+49 …" /></div>
            <div><label className={label}>Preferred date</label><input className={input} type="date" value={callDate} onChange={(e) => setCallDate(e.target.value)} /></div>
          </div>
        )}
      </div>

      <div className="rounded-xl bg-[#fff7ec] border border-[#f0e6d6] px-4 py-3 text-[12.5px] text-[#6a7a80] leading-relaxed">
        Paid by bank transfer — we&apos;ll activate the voucher and email the printable PDF once it arrives. The voucher is pure value: it doesn&apos;t hold a spot, and it&apos;s used when the recipient books an available trip.
      </div>

      {error && <p className="text-[13px] text-red-500">{error}</p>}
      <button onClick={submit} disabled={busy} className="w-full px-7 py-4 rounded-full text-[15px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] disabled:opacity-60 transition-all">
        {busy ? "Creating…" : `Gift ${fmtVoucherMoney(amount, currency)}`}
      </button>
    </div>
  );
}
