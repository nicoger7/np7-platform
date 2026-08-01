"use client";

import { useEffect, useState } from "react";

type Item = {
  key: string; label: string; where: string; present: boolean;
  blocks: string[]; degrades: string[]; dueDate: string | null; daysLeft: number | null; overdue: boolean;
};
type Readiness = { startDate: string | null; daysToStart: number | null; items: Item[]; blockingMissing: number; softMissing: number; inherited: { packingList: string | null; preTripNote: string | null } };

/**
 * What this edition still needs before its scheduled mails go out.
 *
 * Reads the SAME requirements the cron enforces, so this panel is not a
 * description of the rules — it is the rules. A red row here is a mail that
 * will actually be held back tonight.
 */
type Hold = { id: string; template: string; label: string; bookingId: string; missing: string[]; daysLate: number | null };

export function MailReadiness({ editionId, onInherited }: { editionId: string; onInherited?: (v: { packingList: string | null; preTripNote: string | null }) => void }) {
  const [r, setR] = useState<Readiness | null>(null);
  const [err, setErr] = useState(false);
  const [holds, setHolds] = useState<Hold[]>([]);
  const [contentReady, setContentReady] = useState(false);
  const [sending, setSending] = useState(false);

  const loadHolds = () =>
    fetch(`/api/admin/editions/${editionId}/held-mails`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => { if (d) { setHolds(d.holds ?? []); setContentReady(!!d.contentReady); } })
      .catch(() => {});

  useEffect(() => { loadHolds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editionId]);

  async function sendHeld() {
    const late = holds[0]?.daysLate;
    const msg = `Send ${holds.length} held email${holds.length > 1 ? "s" : ""} now?` +
      (late ? `\n\nThey are ${late} day${late > 1 ? "s" : ""} later than scheduled — guests get this now rather than when the pipeline intended.` : "");
    if (!confirm(msg)) return;
    setSending(true);
    const res = await fetch(`/api/admin/editions/${editionId}/held-mails`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ holdIds: holds.map((h) => h.id) }),
    });
    const j = await res.json().catch(() => ({}));
    setSending(false);
    if (!res.ok) { alert(j.error || "Could not send."); return; }
    alert(`${j.sent} sent${j.failed ? `, ${j.failed} failed` : ""}.`);
    loadHolds();
  }

  useEffect(() => {
    let alive = true;
    fetch(`/api/admin/editions/${editionId}/readiness`)
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then((d) => { if (alive) { setR(d); onInherited?.(d.inherited ?? { packingList: null, preTripNote: null }); } })
      .catch(() => { if (alive) setErr(true); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editionId]);

  if (err) return null;
  if (!r) return <p className="text-xs admin-faint">Checking mail readiness…</p>;

  const due = (i: Item) => {
    if (i.present || i.daysLeft == null) return null;
    if (i.daysLeft < 0) return <span className="text-red-400 font-bold">overdue by {Math.abs(i.daysLeft)}d</span>;
    if (i.daysLeft <= 7) return <span className="text-amber-400 font-bold">due in {i.daysLeft}d</span>;
    return <span className="admin-faint">due in {i.daysLeft}d</span>;
  };

  return (
    <div className="rounded-xl p-4" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h3 className="text-sm font-bold admin-heading">Mail readiness</h3>
        {r.daysToStart != null && (
          <span className="text-[11px] admin-faint">{r.daysToStart > 0 ? `starts in ${r.daysToStart}d` : "under way"}</span>
        )}
      </div>
      <p className="text-xs admin-faint mb-3">
        {r.blockingMissing > 0
          ? `${r.blockingMissing} mail${r.blockingMissing > 1 ? "s" : ""} will be held back until this is filled in.`
          : "Everything the scheduled mails need is in place."}
      </p>

      {holds.length > 0 && (
        <div className="rounded-lg p-3 mb-3" style={{ border: "1px solid rgba(245,158,11,0.35)", backgroundColor: "rgba(245,158,11,0.07)" }}>
          <p className="text-[13px] font-bold text-amber-500">
            {holds.length} email{holds.length > 1 ? "s" : ""} held back
            {holds[0]?.daysLate ? ` · ${holds[0].daysLate}d past their send date` : ""}
          </p>
          <p className="text-[11.5px] admin-muted mt-0.5">
            {holds[0]?.label} — waiting on {[...new Set(holds.flatMap((h) => h.missing))].join(", ")}.
            {" "}The send window has closed, so these will never go out on their own.
          </p>
          {contentReady ? (
            <button onClick={sendHeld} disabled={sending}
              className="mt-2 px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white transition-colors">
              {sending ? "Sending…" : `Send ${holds.length} held email${holds.length > 1 ? "s" : ""} now`}
            </button>
          ) : (
            <p className="text-[11.5px] admin-faint mt-1.5">Fill in what&apos;s missing below and this becomes a send button.</p>
          )}
        </div>
      )}

      <div className="space-y-2">
        {r.items.map((i) => (
          <div key={i.key} className="flex items-start gap-2.5">
            <span className={`mt-0.5 text-xs ${i.present ? "text-green-400" : i.blocks.length ? "text-red-400" : "text-amber-400"}`}>
              {i.present ? "✓" : i.blocks.length ? "✕" : "!"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] admin-heading font-semibold">
                {i.label}
                {!i.present && <span className="ml-2 text-[11px] font-normal">{due(i)}</span>}
              </p>
              {!i.present && (
                <p className="text-[11px] admin-faint">
                  {i.blocks.length > 0
                    ? <>Holds back: <b className="admin-muted">{i.blocks.join(", ")}</b>. </>
                    : i.degrades.length > 0
                      ? <>{i.degrades.join(", ")} will send without it. </>
                      : null}
                  {i.where}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
