"use client";

import { useState, type ReactNode } from "react";
import { fmtVoucherMoney, VOUCHER_VALIDITY_LABEL } from "@/lib/vouchers";
import { track } from "@/lib/analytics-client";
import {
  GIFT_ANY_TRIP,
  giftChoice,
  giftFromPrice,
  giftLevelHint,
  giftLevelLabel,
  giftPackagesFor,
  giftValueLine,
  type GiftPackage,
  type GiftTrip,
} from "@/lib/gift-catalog";

// €200 steps up to €5,000, then €1,000 steps to €10,000. The same grid
// /api/voucher accepts for a free amount.
const AMOUNTS = [
  ...Array.from({ length: 25 }, (_, i) => 200 * (i + 1)),
  ...Array.from({ length: 5 }, (_, i) => 6000 + 1000 * i),
];
const DEFAULT_IDX = AMOUNTS.indexOf(1000);

/** The slider step at or just below a package price, so "change amount"
 *  opens with the thumb where the number is. */
function nearestIdx(price: number): number {
  let best = 0;
  AMOUNTS.forEach((a, i) => { if (a <= price) best = i; });
  return best;
}

/*
 * A step chooser (Nico, 27 Sep 2026: "make it easily bookable and choosable
 * (package etc.)"). Mobile first, one question at a time:
 *
 *   1  Which trip?   chips for every giftable trip, plus "Any NP7 trip"
 *   2  Which week?   only when the trip has more than one week on sale
 *   3  Which level?  only when that week sells Beginner AND Advanced
 *   4  Room or package, plus "A set amount instead"
 *
 * and then the voucher's value, big, with "Change amount" for the slider.
 *
 * Round 1 put every week's packages under the slider as flat quick picks.
 * Bonaire sells the same room at both levels, so the buyer saw "WANAPA Double
 * Deluxe with Balcony" twice with €660 between them and no way to tell which
 * was which; Alaçatı sells one room name at two hotels. The level and the
 * hotel now come with the data (gift-catalog.ts) and the chooser asks.
 *
 * The voucher itself is unchanged: VALUE, paid by bank transfer, activated when
 * the money lands, entered as a code on a trip's payment plan. Picking a
 * package only sets the amount to that package's price; the order still posts
 * experienceId + packageId + amount and /api/voucher re-reads the price. A
 * trip voucher works on any week of that trip (the redeem route checks the
 * experience, never the week or the package), so that is what the copy says.
 * It does not say "any NP7 trip": a trip voucher is refused on another trip.
 */
export function GiftBuyForm({ trips }: { trips: GiftTrip[] }) {
  const [tripId, setTripId] = useState<string | null>(null); // null = nothing picked yet
  const [weekId, setWeekId] = useState<string | null>(null);
  const [level, setLevel] = useState<string | null>(null);
  const [pkgId, setPkgId] = useState<string | null>(null);
  const [custom, setCustom] = useState(false); // the slider is open
  const [idx, setIdx] = useState(DEFAULT_IDX);
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
  const [done, setDone] = useState<null | { code: string; amount: number | null; currency: string | null; pay: Pay; emailed: boolean | null }>(null);

  // What is chosen so far, and what the order posts: one pure function
  // (gift-catalog.ts), tested without a browser. A voucher for any trip is in
  // euros, like the invoices it pays; a trip's voucher is in its currency.
  const choice = giftChoice(trips, { tripId, weekId, level, pkgId, custom, sliderAmount: AMOUNTS[idx] });
  const { isAny, trip, week, askLevel, cards, pkg, byValue, amount, ready, currency } = choice;
  const weeks = trip?.weeks ?? [];
  const money = (n: number | null) => fmtVoucherMoney(n, currency);

  function pickTrip(id: string) {
    // A new trip starts the slider fresh, not wherever the last package left it.
    setTripId(id); setWeekId(null); setLevel(null); setPkgId(null); setCustom(false); setIdx(DEFAULT_IDX); setError("");
  }
  function pickWeek(id: string) { setWeekId(id); setLevel(null); setPkgId(null); setCustom(false); }
  function pickLevel(l: string) { setLevel(l); setPkgId(null); setCustom(false); }
  function pickPackage(p: GiftPackage) { setPkgId(p.id); setCustom(false); setIdx(nearestIdx(p.price)); setError(""); }
  function pickSetAmount() { setPkgId(null); setCustom(true); setError(""); }
  // "Change amount" keeps the package until the thumb actually moves.
  function openSlider() { setCustom(true); if (pkg) setIdx(nearestIdx(pkg.price)); }
  function slide(i: number) { setIdx(i); setPkgId(null); setCustom(true); }

  async function submit() {
    setError("");
    if (!ready) { setError("Choose a trip and a room, or a set amount, first."); return; }
    if (!buyerName.trim()) { setError("Please enter your name."); return; }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(buyerEmail.trim())) { setError("Please enter a valid email address."); return; }
    if (recipientEmail.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(recipientEmail.trim())) { setError("Please check the recipient's email address, or leave it empty."); return; }
    if (nicoCall && !recipientPhone.trim()) { setError("Add the recipient's phone number so Nico can call them."); return; }
    setBusy(true);
    const { experienceId, packageId } = choice;
    // A dropped connection used to leave the button on "Creating..." for good.
    const res = await fetch("/api/voucher", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experienceId, packageId, amount, buyerName, buyerEmail, recipientName, recipientEmail, message, nicoCall, recipientPhone, callDate }),
    }).catch(() => null);
    setBusy(false);
    if (!res) { setError("We couldn't reach the server. Please check your connection and try again."); return; }
    const j = await res.json().catch(() => ({}));
    if (res.ok) {
      track("voucher_buy", { amount, currency, experience: experienceId || "any" });
      setDone({
        code: j.voucher?.code, amount: j.voucher?.amount ?? amount, currency: j.voucher?.currency ?? currency, pay: j.pay ?? null,
        emailed: typeof j.emailed === "boolean" ? j.emailed : null,
      });
    } else { setError(j.error || "Couldn't order the voucher. Please try again."); }
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
      <div className="bg-white rounded-2xl border border-[#f0e6d6] p-6 sm:p-7">
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
        {/* The order email (voucher_ordered) carries the amount, the bank
            account and the reference, so the buyer can close this page. The
            line says so only when there ARE bank details and the mail went
            out (review, 27 Sep 2026): with no IBAN in company settings the
            screen and the mail both lack them, and the mail asks for a reply.
            With no IBAN AND no mail, nothing will reach the buyer on its own,
            so the line asks them to write to us instead of promising an email
            nobody sends (review, 28 Sep 2026). */}
        {done.pay ? (
          done.emailed !== false && <p className="text-[13px] text-[#8a9aa0] text-center mt-4">We&apos;ve also emailed you these details.</p>
        ) : (
          <p className="text-[13px] text-[#8a9aa0] text-center mt-4">
            {done.emailed ? "We've emailed you your order. Reply to it and we'll send you our bank details." : (
              <>Email <a href="mailto:experience@np-seven.com" className="underline">experience@np-seven.com</a> with reference {done.code} and we&apos;ll send you our bank details.</>
            )}
          </p>
        )}
        <p className="text-[12px] text-[#9aa6ac] text-center mt-2">Please use reference <strong>{done.code}</strong> so we can match your payment.</p>
      </div>
    );
  }

  // Steps are numbered as they appear, so a trip with one week reads 1, 2, 3.
  let step = 0;
  const next = () => ++step;

  return (
    <div className="bg-white rounded-2xl border border-[#f0e6d6] p-5 sm:p-8 space-y-6">
      {/* 1 · Which trip */}
      <section aria-label="Which trip">
        <StepHead n={next()} title="Which trip is it for?" hint="Pick one, or leave it open for any NP7 trip." />
        <div className="flex flex-wrap gap-2">
          {trips.map((t) => (
            <Chip key={t.id} on={tripId === t.id} onClick={() => pickTrip(t.id)}>{t.name}</Chip>
          ))}
          <Chip on={isAny} onClick={() => pickTrip(GIFT_ANY_TRIP)}>Any NP7 trip</Chip>
        </div>
        {trip && weeks.length === 0 && (
          <p className="text-[13px] text-[#6a7a80] mt-3">The next {trip.name} prices aren&apos;t out yet, so choose an amount below.</p>
        )}
      </section>

      {/* 2 · Which week (only with more than one on sale) */}
      {trip && choice.askWeek && (
        <section aria-label="Which week" className="border-t border-[#f3ede2] pt-5">
          <StepHead n={next()} title="Which week?" hint={`It sets the price. They can still use the voucher on any ${trip.name} week.`} />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {weeks.map((w) => {
              const on = week?.id === w.id;
              const from = giftFromPrice(w.packages);
              return (
                <button key={w.id} type="button" aria-pressed={on} onClick={() => pickWeek(w.id)}
                  className={`min-h-[56px] px-4 py-3 rounded-xl border text-left transition-colors ${on ? "bg-[#00afdb] border-[#00afdb] text-white" : "bg-white border-[#dde6e9] text-[#00374a] hover:border-[#00afdb]"}`}>
                  <span className="block text-[14.5px] font-bold">{w.dates}</span>
                  <span className={`block text-[12px] ${on ? "text-white/85" : "text-[#6a7a80]"}`}>
                    {[w.label, from != null ? `from ${money(from)}` : null].filter(Boolean).join(" · ")}
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* 3 · Which level (only when the week sells both) */}
      {week && askLevel && (
        <section aria-label="Which level" className="border-t border-[#f3ede2] pt-5">
          {/* The hint names the groups this week really sells (review, 28 Sep 2026). */}
          <StepHead n={next()} title="Which level?" hint={weeks.length === 1 ? week.dates : giftLevelHint(week.levels) || undefined} />
          <div className="grid grid-cols-2 gap-2">
            {week.levels.map((l) => {
              const on = level === l;
              const from = giftFromPrice(giftPackagesFor(week, l));
              return (
                <button key={l} type="button" aria-pressed={on} onClick={() => pickLevel(l)}
                  className={`min-h-[56px] px-4 py-3 rounded-xl border text-left transition-colors ${on ? "bg-[#00afdb] border-[#00afdb] text-white" : "bg-white border-[#dde6e9] text-[#00374a] hover:border-[#00afdb]"}`}>
                  <span className="block text-[14.5px] font-bold">{giftLevelLabel(l)}</span>
                  {from != null && <span className={`block text-[12px] ${on ? "text-white/85" : "text-[#6a7a80]"}`}>from {money(from)}</span>}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* 4 · Room or package, or a set amount */}
      {week && choice.showCards && (
        <section aria-label="Room or package" className="border-t border-[#f3ede2] pt-5">
          <StepHead
            n={next()}
            title="Room or package"
            hint={[
              weeks.length === 1 && !askLevel ? week.dates : null,
              !askLevel && week.levels.length === 1 ? `${giftLevelLabel(week.levels[0])} coaching` : null,
            ].filter(Boolean).join(" · ") || undefined}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {cards.map((p) => {
              const on = pkg?.id === p.id;
              return (
                <button key={p.id} type="button" aria-pressed={on} onClick={() => pickPackage(p)}
                  className={`min-h-[64px] px-4 py-3 rounded-xl border text-left transition-colors flex items-start justify-between gap-3 ${on ? "bg-[#fff7ec] border-[#f47b20] ring-2 ring-[#f47b20]/25" : "bg-white border-[#dde6e9] hover:border-[#f47b20]"}`}>
                  <span className="min-w-0">
                    <span className="block text-[14.5px] font-bold text-[#00374a] leading-snug">{p.name}</span>
                    {p.hotel && <span className="block text-[12px] text-[#6a7a80] mt-0.5">{p.hotel}</span>}
                  </span>
                  <span className="shrink-0 text-[14.5px] font-black text-[#f47b20]">{money(p.price)}</span>
                </button>
              );
            })}
            <button type="button" aria-pressed={custom && !pkg} onClick={pickSetAmount}
              className={`min-h-[64px] px-4 py-3 rounded-xl border border-dashed text-left transition-colors ${custom && !pkg ? "bg-[#fff7ec] border-[#f47b20] ring-2 ring-[#f47b20]/25" : "bg-white border-[#cfd9dd] hover:border-[#f47b20]"}`}>
              <span className="block text-[14.5px] font-bold text-[#00374a]">A set amount instead</span>
              <span className="block text-[12px] text-[#6a7a80] mt-0.5">{money(AMOUNTS[0])} to {money(AMOUNTS[AMOUNTS.length - 1])}, you choose</span>
            </button>
          </div>
        </section>
      )}

      {/* The voucher's value */}
      {ready && (
        <section aria-label="Voucher value" className="rounded-2xl bg-[#fff7ec] border border-[#f0e6d6] p-5">
          <p className={label}>Voucher value</p>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-[40px] leading-none font-black tracking-[-0.02em] text-[#00374a]">{money(amount)}</span>
            {pkg && !custom && (
              <button type="button" onClick={openSlider} className="shrink-0 whitespace-nowrap text-[12.5px] font-semibold text-[#00afdb] underline underline-offset-2 hover:text-[#00374a]">Change amount</button>
            )}
          </div>
          <p className="text-[13.5px] text-[#5a6b72] mt-3 leading-relaxed">
            {giftValueLine(choice)} {VOUCHER_VALIDITY_LABEL}.
          </p>
          {byValue && (
            <div className="mt-4">
              <input type="range" aria-label="Voucher value" min={0} max={AMOUNTS.length - 1} step={1} value={idx} onChange={(e) => slide(Number(e.target.value))} className="w-full accent-[#00afdb] cursor-pointer" />
              <div className="flex justify-between text-[12px] text-[#9aa6ac] mt-1">
                <span>{money(AMOUNTS[0])}</span><span>{money(AMOUNTS[AMOUNTS.length - 1])}</span>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Buyer */}
      <div className="border-t border-[#f3ede2] pt-5">
        <p className="text-[13px] text-[#8a9aa0] mb-3">Your details: where we&apos;ll send the confirmation.</p>
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className={label}>Your name</label><input className={input} value={buyerName} onChange={(e) => setBuyerName(e.target.value)} placeholder="Your name" autoComplete="name" /></div>
          <div><label className={label}>Your email</label><input className={input} type="email" value={buyerEmail} onChange={(e) => setBuyerEmail(e.target.value)} placeholder="you@email.com" autoComplete="email" /></div>
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
            <div><label className={label}>Recipient phone</label><input className={input} type="tel" value={recipientPhone} onChange={(e) => setRecipientPhone(e.target.value)} placeholder="+49 ..." /></div>
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
      <button onClick={submit} disabled={busy || !ready} className="w-full px-7 py-4 rounded-full text-[15px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] disabled:opacity-60 transition-all">
        {busy ? "Ordering..." : ready ? `Order a ${money(amount)} voucher` : "Choose the voucher above first"}
      </button>
    </div>
  );
}

function StepHead({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="flex items-start gap-3 mb-3">
      <span className="shrink-0 inline-grid place-items-center w-7 h-7 rounded-full text-[13px] font-black text-white" style={{ background: "linear-gradient(135deg,#ffc42e,#f47b20)" }} aria-hidden>{n}</span>
      <div className="min-w-0">
        <p className="text-[15.5px] font-extrabold text-[#00374a] leading-7">{title}</p>
        {hint && <p className="text-[12.5px] text-[#6a7a80] leading-snug">{hint}</p>}
      </div>
    </div>
  );
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" aria-pressed={on} onClick={onClick}
      className={`min-h-[44px] px-4 py-2 rounded-full text-[14px] font-semibold transition-colors border ${on ? "bg-[#00afdb] text-white border-[#00afdb]" : "bg-white text-[#00374a] border-[#dde6e9] hover:border-[#00afdb]"}`}>
      {children}
    </button>
  );
}
