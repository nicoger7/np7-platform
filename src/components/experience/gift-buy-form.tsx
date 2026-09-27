"use client";

import { useState } from "react";
import { fmtVoucherMoney } from "@/lib/vouchers";
import { track } from "@/lib/analytics-client";
import type { GiftExp, GiftPkg } from "@/lib/gift-data";

// €200 steps up to €5,000, then €1,000 steps to €10,000. The same grid
// /api/voucher accepts for a free amount.
const AMOUNTS = [
  ...Array.from({ length: 25 }, (_, i) => 200 * (i + 1)),
  ...Array.from({ length: 5 }, (_, i) => 6000 + 1000 * i),
];
const DEFAULT_IDX = AMOUNTS.indexOf(1000);

/** The slider step at or just below a package price, so the thumb sits where
 *  the number is when a package is picked. */
function nearestIdx(price: number): number {
  let best = 0;
  AMOUNTS.forEach((a, i) => { if (a <= price) best = i; });
  return best;
}

/*
 * One product, one control (Nico, 27 Sep 2026). A voucher is VALUE: paid by
 * bank transfer, activated by the team when the money lands, and entered as a
 * code on a trip's payment plan. So every choice on this form ends on the same
 * slider, whether it is for any trip or a specific one.
 *
 * It used to be three different forms behind one row of buttons. "Any" had the
 * slider. An experience with packages quoted a package and promised "they pick
 * the week when they book", but every package is sold on one week only. And an
 * experience with no package on sale (Lake Garda, Croatia between seasons)
 * showed a fixed €1,000 "complete experience" with no way to change it, or
 * whatever the slider had been left on under "Any".
 *
 * Packages are now quick picks: tapping one sets the voucher to that
 * package's price and says which week it is on. Moving the slider goes back to
 * a free amount. Nothing is promised about the week, because the voucher does
 * not hold one.
 */
export function GiftBuyForm({ experiences, packages = [] }: { experiences: GiftExp[]; packages?: GiftPkg[] }) {
  const [idx, setIdx] = useState(DEFAULT_IDX);
  const [expId, setExpId] = useState(""); // "" = any NP7 trip
  const [pkgId, setPkgId] = useState(""); // "" = a free amount from the slider
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

  const isAny = !expId;
  const selectedExp = experiences.find((e) => e.id === expId) || null;
  const expPkgs = packages
    .filter((p) => p.experience_id === expId && p.price != null && p.price > 0)
    .sort((a, b) => (a.week_start ?? "").localeCompare(b.week_start ?? "") || (a.price as number) - (b.price as number));
  // Grouped by week, soonest first; a package with no week reads "Any week".
  const weeks: { label: string; pkgs: GiftPkg[] }[] = [];
  for (const p of expPkgs) {
    const label = p.week ?? "Any week";
    const g = weeks.find((w) => w.label === label);
    if (g) g.pkgs.push(p);
    else weeks.push({ label, pkgs: [p] });
  }
  const selectedPkg = expPkgs.find((p) => p.id === pkgId) || null;
  // No fallback to the experience's own price column: see no-legacy-price.test.ts.
  const amount = selectedPkg?.price ?? AMOUNTS[idx];
  // A voucher for any trip is in euros, like the invoices it pays; a specific
  // trip's voucher is in that trip's currency.
  const currency = selectedExp?.currency || "EUR";
  // Same rule as activation (admin/vouchers/[id]): 2 years only for an
  // any-trip voucher over €5,000, a trip-specific one is always 1 year.
  const validity = isAny && amount > 5000 ? "Valid for 2 years." : "Valid for 1 year.";

  function pickExperience(eId: string) { setExpId(eId); setPkgId(""); }
  function pickPackage(p: GiftPkg) {
    if (pkgId === p.id) { setPkgId(""); return; }
    setPkgId(p.id);
    setIdx(nearestIdx(Number(p.price)));
  }
  function slide(i: number) { setIdx(i); setPkgId(""); }

  async function submit() {
    setError("");
    if (!buyerName.trim()) { setError("Please enter your name."); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(buyerEmail.trim())) { setError("Please enter a valid email address."); return; }
    if (recipientEmail.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipientEmail.trim())) { setError("Please check the recipient's email address, or leave it empty."); return; }
    if (nicoCall && !recipientPhone.trim()) { setError("Add the recipient's phone number so Nico can call them."); return; }
    setBusy(true);
    // A dropped connection used to leave the button on "Creating…" for good.
    const res = await fetch("/api/voucher", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experienceId: expId || null, packageId: selectedPkg?.id || null, amount, buyerName, buyerEmail, recipientName, recipientEmail, message, nicoCall, recipientPhone, callDate }),
    }).catch(() => null);
    setBusy(false);
    if (!res) { setError("We couldn't reach the server. Please check your connection and try again."); return; }
    const j = await res.json().catch(() => ({}));
    if (res.ok) { track("voucher_buy", { amount, currency, experience: expId || "any" }); setDone({ code: j.voucher?.code, amount: j.voucher?.amount ?? amount, currency: j.voucher?.currency ?? currency, pay: j.pay ?? null }); }
    else { setError(j.error || "Couldn't order the voucher. Please try again."); }
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
    const to = recipientEmail.trim();
    return (
      <div className="bg-white rounded-2xl border border-[#f0e6d6] p-7">
        <div className="text-center">
          <div className="mx-auto w-14 h-14 rounded-full bg-[#00afdb] grid place-items-center mb-4"><svg className="w-7 h-7 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg></div>
          <h2 className="text-2xl font-black text-[#00374a] mb-2">Voucher ordered</h2>
          <p className="text-[14.5px] text-[#5a6b72] leading-relaxed mb-1 max-w-[440px] mx-auto">
            {amountLabel ? <>Your <strong>{amountLabel}</strong> voucher is ordered.</> : "Your voucher is ordered."} Pay by bank transfer and we activate it as soon as the money lands.
          </p>
          <p className="text-[13px] text-[#8a9aa0] mb-5 max-w-[440px] mx-auto">
            Then we email the printable voucher to <strong>{buyerEmail}</strong>
            {/* Not to the recipient when Nico is calling them: notify.ts holds
                that mail back so the call is the surprise, and this line must
                not promise it (review, 27 Sep 2026). */}
            {to && !nicoCall ? <> and to <strong>{to}</strong></> : null}
            {nicoCall ? ", and line up Nico's call" : ""}.
          </p>
        </div>
        <div className="rounded-xl bg-[#f6fafb] border border-[#dde6e9] p-4 text-[13.5px]">
          {payRows.map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4 py-1.5 border-b border-[#e7eef0] last:border-0">
              <span className="text-[#8a9aa0] shrink-0">{k}</span><span className="font-bold text-[#00374a] text-right break-all">{v}</span>
            </div>
          ))}
        </div>
        {/* The order email (voucher_ordered, sent by /api/voucher) carries the
            amount, the bank account and the reference, so the buyer can close
            this page. This line used to promise "we'll email you the
            bank-transfer details shortly" when no such email existed. */}
        <p className="text-[13px] text-[#8a9aa0] text-center mt-4">We&apos;ve also emailed you these details.</p>
        <p className="text-[12px] text-[#9aa6ac] text-center mt-2">Please use reference <strong>{done.code}</strong> so we can match your payment.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-[#f0e6d6] p-6 sm:p-8 space-y-6">
      {/* What the voucher is for */}
      <div>
        <label className={label}>Voucher for</label>
        <div className="flex flex-wrap gap-2">
          {[{ id: "", title: "Any NP7 trip" }, ...experiences].map((e) => {
            const on = expId === e.id;
            return (
              <button key={e.id || "any"} type="button" onClick={() => pickExperience(e.id)}
                className={`px-3.5 py-2 rounded-full text-[13px] font-semibold transition-colors border ${on ? "bg-[#00afdb] text-white border-[#00afdb]" : "bg-white text-[#00374a] border-[#dde6e9] hover:border-[#00afdb]"}`}>
                {e.title}
              </button>
            );
          })}
        </div>
      </div>

      {/* Value: always the slider; packages are quick picks on top of it */}
      <div className="border-t border-[#f3ede2] pt-5">
        <label className={label}>Voucher value</label>
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[34px] font-black text-[#00374a]">{fmtVoucherMoney(amount, currency)}</span>
          <span className="text-[12px] text-[#9aa6ac]">{fmtVoucherMoney(AMOUNTS[0], currency)} to {fmtVoucherMoney(AMOUNTS[AMOUNTS.length - 1], currency)}</span>
        </div>
        <input type="range" aria-label="Voucher value" min={0} max={AMOUNTS.length - 1} step={1} value={idx} onChange={(e) => slide(Number(e.target.value))} className="w-full accent-[#00afdb] cursor-pointer" />
        <p className="text-[13px] text-[#5a6b72] mt-2">
          {isAny ? (
            <>A voucher worth <strong>{fmtVoucherMoney(amount, currency)}</strong> towards any NP7 trip.</>
          ) : selectedPkg ? (
            <>A voucher for <strong>{selectedExp?.title}</strong>, worth the <strong>{selectedPkg.name}</strong> price{selectedPkg.week ? <>, {selectedPkg.week}</> : null}.</>
          ) : (
            <>A voucher for <strong>{selectedExp?.title}</strong>.</>
          )}
          {" "}{validity}
        </p>

        {weeks.length > 0 && (
          <div className="mt-5">
            <p className={label}>Or match a package price</p>
            <div className="space-y-3">
              {weeks.map((w) => (
                <div key={w.label}>
                  <p className="text-[12px] font-semibold text-[#6a7a80] mb-1.5">{w.label}</p>
                  <div className="flex flex-wrap gap-2">
                    {w.pkgs.map((pk) => {
                      const on = selectedPkg?.id === pk.id;
                      return (
                        <button key={pk.id} type="button" aria-pressed={on} onClick={() => pickPackage(pk)}
                          className={`px-3.5 py-2 rounded-xl text-[13px] font-semibold transition-colors border text-left ${on ? "bg-[#f47b20] text-white border-[#f47b20]" : "bg-white text-[#00374a] border-[#dde6e9] hover:border-[#f47b20]"}`}>
                          <span className="block">{pk.name}</span>
                          <span className={`block text-[12px] font-bold ${on ? "text-white/90" : "text-[#f47b20]"}`}>{fmtVoucherMoney(pk.price, currency)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Buyer */}
      <div className="border-t border-[#f3ede2] pt-5">
        <p className="text-[13px] text-[#8a9aa0] mb-3">Your details: where we&apos;ll send the confirmation.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className={label}>Your name</label><input className={input} value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Your name" /></div>
          <div><label className={label}>Your email</label><input className={input} type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} placeholder="you@email.com" /></div>
        </div>
      </div>

      {/* Recipient */}
      <div className="border-t border-[#f3ede2] pt-5">
        <p className="text-[13px] text-[#8a9aa0] mb-3">Who&apos;s it for? (Optional, or keep it for yourself.)</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className={label}>Recipient name</label><input className={input} value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Their name" /></div>
          <div>
            {/* Says what the field does. A buyer planning a surprise typed the
                recipient's address and found the gift had already arrived in
                their inbox the day the transfer cleared. */}
            <label className={label}>Recipient email (optional)</label>
            <input className={input} type="email" value={recipientEmail} onChange={(e) => setRecipientEmail(e.target.value)} placeholder="their@email.com" />
            <p className="text-[12px] text-[#8a9aa0] mt-1.5">{nicoCall
              ? "Nico brings them the news, so we don't email them. Leave it empty to hand it over yourself."
              : "We email them the voucher when your payment lands. Leave it empty to hand it over yourself."}</p>
          </div>
        </div>
        <div className="mt-3"><label className={label}>Personal message</label><textarea className={`${input} min-h-[80px] resize-y`} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Add a note. It'll show on the printed voucher." /></div>
      </div>

      {/* Nico call extra */}
      <div className="border-t border-[#f3ede2] pt-5">
        <label className="flex items-start gap-3 cursor-pointer">
          <input type="checkbox" checked={nicoCall} onChange={(e) => setNicoCall(e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#00afdb]" />
          <span>
            <span className="block text-[14px] font-bold text-[#00374a]">Have Nico call them with the news</span>
            <span className="block text-[12.5px] text-[#6a7a80] mt-0.5">A personal phone call from Nico to share the gift, a lovely surprise. We&apos;ll arrange the timing with you.</span>
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
        Paid by bank transfer. Once it lands we activate the voucher and email the printable PDF. A voucher is value, not a booking: it doesn&apos;t hold a spot on a trip. If the trip costs less, whatever is left stays on the voucher.
      </div>

      {/* Art. 246a EGBGB pre-contract info: withdrawal right + existence and
          placement of the online withdrawal function (§ 356a BGB). */}
      <p className="text-[12px] text-[#8a9aa0] leading-relaxed">
        Für den Gutscheinkauf gilt das gesetzliche 14-tägige Widerrufsrecht. Details in der{" "}
        <a href="/widerrufsbelehrung" className="underline hover:text-[#00374a]">Widerrufsbelehrung</a>. Sie können Ihren
        Widerruf auch online über unsere <a href="/widerruf" className="underline hover:text-[#00374a]">Widerrufsfunktion</a> erklären.{" "}
        <em>The statutory 14-day right of withdrawal applies to voucher purchases.</em>
      </p>

      {error && <p className="text-[13px] text-red-500">{error}</p>}
      <button onClick={submit} disabled={busy} className="w-full px-7 py-4 rounded-full text-[15px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] disabled:opacity-60 transition-all">
        {busy ? "Ordering…" : `Order a ${fmtVoucherMoney(amount, currency)} voucher`}
      </button>
    </div>
  );
}
