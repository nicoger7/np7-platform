"use client";

/**
 * Payments. One page, because bank and payments are one thing.
 *
 * Nico, 2026-09-13: "bank and payments are one thing basically. From now on
 * payments can pretty much only be via the bank (with that little back-door)."
 *
 * The page opens on the feed: every movement Qonto and Stripe saw, and the
 * one question per row, whose money is this. Connecting a credit to an
 * invoice is what books a payment; placing a debit on a cost line is what
 * makes a cost real. Nothing is booked without a click.
 *
 * Beside the feed, three views of what was written down by hand:
 *   Unverified  rows typed since the NP7 GmbH switch (2026-08-04) that the
 *               feed has not been asked about yet. Each carries the feed's
 *               best guess; "This is it" adopts the row onto the movement,
 *               no new money, and "Mark off-bank" says it never will be.
 *   Off-bank    money the feed will never show, each row with its reason.
 *   Legacy      everything paid before the switch. History: kept for the
 *               booking balances, out of every total here, never a to-do.
 *
 * The free-form "New Payment" form is gone. It was the door the €6,210
 * double entry came through. The only way to add money that is not in the
 * feed is the off-bank door, and it needs a reason.
 */
import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { BankFeed, type FeedView } from "./bank-feed";
import { BookedPayments, type BookedView } from "./booked-payments";
import { OffBankForm } from "./off-bank-form";

type View = FeedView | BookedView;

const FEED_VIEWS: { key: FeedView; label: string }[] = [
  { key: "unmatched", label: "To match" },
  { key: "matched", label: "Connected" },
  { key: "ignored", label: "Set aside" },
  { key: "all", label: "All" },
];
const BOOKED_VIEWS: { key: BookedView; label: string }[] = [
  { key: "unverified", label: "Unverified" },
  { key: "off_bank", label: "Off-bank" },
  { key: "legacy", label: "Legacy" },
];
const isView = (v: string | null): v is View =>
  [...FEED_VIEWS, ...BOOKED_VIEWS].some((x) => x.key === v);
const isFeedView = (v: View): v is FeedView => FEED_VIEWS.some((x) => x.key === v);

export default function PaymentsPage() {
  // useSearchParams wants a Suspense boundary above it.
  return (
    <Suspense fallback={<div className="py-12 text-center text-sm admin-faint">Loading…</div>}>
      <PaymentsInner />
    </Suspense>
  );
}

function PaymentsInner() {
  const params = useSearchParams();
  const initial = params.get("view");
  const [view, setView] = useState<View>(isView(initial) ? initial : "unmatched");
  const [offBankOpen, setOffBankOpen] = useState(false);
  /* What the last off-bank payment did beyond landing: the real invoice it
     issued and mailed to the guest, the request opened for the rest. */
  const [note, setNote] = useState<string | null>(null);
  const [unverifiedCount, setUnverifiedCount] = useState<number | null>(null);
  const [bump, setBump] = useState(0);

  /* The to-do count on the Unverified pill, so the feed views say how much
     hand-typed money is still undecided without opening the view. Allocation
     pairs are not counted: they are not money arriving. */
  const countUnverified = useCallback(() => {
    fetch("/api/admin/payments?provenance=unverified&suggest=1")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (j && Array.isArray(j.rows)) setUnverifiedCount(j.rows.length); })
      .catch(() => {});
  }, []);
  useEffect(() => { countUnverified(); }, [countUnverified, bump]);

  const choose = (v: View) => {
    setView(v);
    // The address says which view is open, so a link from a booking row
    // ("disconnect it on the Payments page") lands on the right list.
    try {
      const url = new URL(window.location.href);
      if (v === "unmatched") url.searchParams.delete("view"); else url.searchParams.set("view", v);
      window.history.replaceState(null, "", url.toString());
    } catch { /* not in a browser */ }
  };

  const pill = (key: View, label: string, badge?: number | null) => (
    <button key={key} onClick={() => choose(key)} data-on={view === key ? "true" : "false"}>
      {label}
      {badge != null && badge > 0 && (
        <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[9px] font-bold bg-amber-500/20 text-amber-500">{badge}</span>
      )}
    </button>
  );

  return (
    <div className="fin">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-5">
        <div>
          <h1 className="fin-hero mb-1">Payments</h1>
          <p className="fin-sub">
            The bank, straight from Qonto and Stripe, and what it has been booked as. This is the whole NP7 account,
            so most of it is not Experience money. Money that is not in the feed goes through the off-bank door and needs a reason.
          </p>
        </div>
        <button
          onClick={() => setOffBankOpen((o) => !o)}
          className="shrink-0 px-4 py-2 text-sm font-bold rounded-lg bg-amber-500/15 text-amber-500 hover:bg-amber-500/25 transition-colors"
          style={{ border: "1px solid rgba(245,158,11,.4)" }}
          title="Cash, wired to Surfcenter, offset: money the feed will never show"
        >
          {offBankOpen ? "Close" : "Record an off-bank payment"}
        </button>
      </div>

      {offBankOpen && (
        <OffBankForm
          onDone={(promotionNote) => {
            setOffBankOpen(false);
            setNote(promotionNote ? `Recorded. ${promotionNote}` : null);
            setBump((n) => n + 1);
            if (view !== "off_bank") choose("off_bank");
          }}
          onCancel={() => setOffBankOpen(false)}
        />
      )}

      {note && <div className="mb-4 text-sm text-green-600">{note}</div>}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="fin-seg inline-flex">
          {FEED_VIEWS.map((v) => pill(v.key, v.label))}
        </div>
        <div className="fin-seg inline-flex">
          {BOOKED_VIEWS.map((v) => pill(v.key, v.label, v.key === "unverified" ? unverifiedCount : null))}
        </div>
      </div>

      {isFeedView(view) ? (
        <BankFeed key={`${view}:${bump}`} view={view} />
      ) : (
        <BookedPayments key={`${view}:${bump}`} view={view} onChanged={() => setBump((n) => n + 1)} />
      )}
    </div>
  );
}
