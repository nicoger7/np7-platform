"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  audienceList,
  recipientLine,
  silentReason,
  willSend,
  type MailAudience,
} from "@/lib/email/mail-warning";

export type { MailAudience };

/**
 * ONE dialog for "this will email someone".
 *
 * Nico's rule, 14 Sep 2026: "for every action we take in admin, whenever an
 * action sends a mail we should first get a warning and get asked". Before
 * this, Send on an invoice asked nothing at all, confirming an add-on asked
 * nothing at all, and the confirms that did exist talked about the money or the
 * voucher and never mentioned that a guest gets written to. His team is
 * growing, and nobody should learn afterwards that a guest was mailed.
 *
 * Deliberately one component rather than a dialog per button: the wording then
 * cannot drift, and the next sender gets the warning by writing three lines.
 *
 * Every panel answers the same three questions in the same order:
 *   WHO it writes to (name and address, or "12 secured guests")
 *   WHAT mail
 *   whether anything is ATTACHED
 *
 * When nothing would actually go out, it says so plainly and still lets the
 * click through: confirming an add-on while the lifecycle pipeline is paused is
 * a normal day, not an incident.
 */
export type MailAsk = {
  /** The action in the imperative, e.g. "Send invoice NP7-XP-2026-0042". */
  title: string;
  /** The mail itself, in the guest's terms: "Invoice", "Pre-trip info". */
  mail: string;
  /** Who it reaches. An array covers a mail that goes to two people at once. */
  to: MailAudience | MailAudience[];
  /** A file riding along, named: "the invoice PDF". */
  attachment?: string | null;
  /** What the click does BESIDES mailing, when that also matters. */
  also?: string | null;
  /** A sentence that goes INTO the mail (the add-on decline reason). */
  reason?: {
    label: string;
    placeholder?: string;
    initial?: string;
    /** Blocks the confirm button until it is filled. */
    required?: boolean;
  };
  /** Button label. Defaults to "Send" when mail leaves, "Continue" when not. */
  confirmLabel?: string;
  /** Red button for a send that cannot be walked back (a cancellation notice). */
  tone?: "normal" | "danger";
};

export type MailAskResult = { reason: string };

/**
 * Ask, then act.
 *
 *   const { ask, dialog } = useMailConfirm();
 *   const go = await ask({ title: "…", mail: "…", to: { kind: "person", … } });
 *   if (!go) return;
 *   …then render {dialog} once, anywhere in the component.
 *
 * Shaped as a promise on purpose: it drops straight into the `if (!confirm(…))
 * return;` call sites it replaces, so adopting it never means restructuring the
 * handler around a callback.
 */
export function useMailConfirm() {
  const [ask_, setAsk] = useState<MailAsk | null>(null);
  const resolver = useRef<((v: MailAskResult | null) => void) | null>(null);

  const ask = useCallback((next: MailAsk) => {
    // A second ask while one is open would strand the first promise forever.
    resolver.current?.(null);
    setAsk(next);
    return new Promise<MailAskResult | null>((resolve) => { resolver.current = resolve; });
  }, []);

  const settle = useCallback((v: MailAskResult | null) => {
    const r = resolver.current;
    resolver.current = null;
    setAsk(null);
    r?.(v);
  }, []);

  const dialog = ask_ ? <MailConfirmDialog ask={ask_} onSettle={settle} /> : null;
  return { ask, dialog };
}

function MailConfirmDialog({ ask, onSettle }: { ask: MailAsk; onSettle: (v: MailAskResult | null) => void }) {
  const [reason, setReason] = useState(ask.reason?.initial ?? "");

  // Escape cancels, as it did for the window.confirm this replaces. Without it
  // a dialog you opened by mistake can only be dismissed with the mouse.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onSettle(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSettle]);

  const sends = willSend(ask.to);
  const silent = silentReason(ask.to);
  const blocked = !!ask.reason?.required && reason.trim().length < 3;
  const label = ask.confirmLabel ?? (sends ? "Send" : "Continue");

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4"
      onClick={() => onSettle(null)}>
      <div className="w-full max-w-[460px] rounded-2xl p-5" onClick={(e) => e.stopPropagation()}
        role="dialog" aria-modal="true" aria-labelledby="mail-confirm-title"
        style={{ backgroundColor: "var(--admin-sidebar)", border: "1px solid var(--admin-border)" }}>
        <h2 id="mail-confirm-title" className="text-[16px] font-bold admin-heading">{ask.title}</h2>

        {sends ? (
          <>
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] mt-3 mb-1.5" style={{ color: "var(--admin-accent)" }}>
              This sends email
            </p>
            <div className="rounded-xl px-3.5 py-3 space-y-2" style={{ backgroundColor: "var(--admin-surface)" }}>
              <Row label="Writes to">
                {audienceList(ask.to).map((a, i) => (
                  <span key={i} className="block">{recipientLine(a)}</span>
                ))}
              </Row>
              <Row label="Sends">{ask.mail}</Row>
              {ask.attachment ? <Row label="Attached">{ask.attachment}</Row> : null}
            </div>
          </>
        ) : (
          <div className="rounded-xl px-3.5 py-3 mt-3 text-[12.5px] admin-muted" style={{ backgroundColor: "var(--admin-surface)" }}>
            <b className="admin-heading">No email goes out.</b> {silent}.
          </div>
        )}

        {ask.also && <p className="text-[12.5px] admin-muted mt-3">{ask.also}</p>}

        {ask.reason && (
          <div className="mt-3.5">
            <label className="text-[11px] font-bold uppercase tracking-[0.1em] admin-faint">
              {ask.reason.label}{ask.reason.required && <span className="text-red-400"> *</span>}
            </label>
            <textarea autoFocus rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
              placeholder={ask.reason.placeholder}
              className="w-full mt-1.5 px-3 py-2 rounded-lg text-[13px] admin-input border resize-y"
              style={{ borderColor: "var(--admin-border)" }} />
          </div>
        )}

        <div className="flex items-center justify-end gap-3 mt-4">
          <button type="button" onClick={() => onSettle(null)} className="px-3 py-2 text-sm admin-muted">Cancel</button>
          <button type="button" disabled={blocked}
            title={blocked ? "Write the sentence the guest reads" : undefined}
            onClick={() => onSettle({ reason: reason.trim() })}
            className={`px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-40 transition-colors ${
              ask.tone === "danger"
                ? "bg-red-500 hover:bg-red-600 text-white"
                : "bg-[var(--admin-accent)] hover:opacity-90 text-[var(--admin-accent-contrast)]"
            }`}>
            {label}
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 text-[12.5px]">
      <span className="shrink-0 w-[68px] admin-faint">{label}</span>
      <span className="flex-1 min-w-0 admin-heading font-medium break-words">{children}</span>
    </div>
  );
}
