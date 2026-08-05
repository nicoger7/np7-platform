"use client";

import { useState } from "react";

/**
 * What did we actually agree with this supplier?
 *
 * §651h(3) BGB says a guest can walk away free when unavoidable extraordinary
 * circumstances at the destination wreck the trip, and we refund everything.
 * That duty is ours and it cannot be contracted away. What CAN be negotiated is
 * whether the hotel then keeps our room money — and if it does, the entire
 * refund comes out of NP7.
 *
 * So the exposure isn't in the law. It's in each supplier contract, one at a
 * time, and it comes down to two things: how late we can cancel rooms for free,
 * and whether their force-majeure clause lets go when ours has to. Neither was
 * written down anywhere, which meant the answer lived with whoever last spoke
 * to the hotel.
 *
 * The ask is printed here rather than remembered, because this conversation
 * happens once a season with six different people.
 */

export type VendorTerms = {
  cancel_free_until_days: number | null;
  force_majeure_mirrored: boolean | null;
  terms_status: string | null;
  terms_note: string | null;
  terms_checked_at: string | null;
};

const STATUSES: { key: string; label: string; hint: string }[] = [
  { key: "todo", label: "To do", hint: "We know we need to raise it" },
  { key: "requested", label: "Asked", hint: "Raised with them, waiting" },
  { key: "agreed", label: "Agreed", hint: "It's in the contract" },
  { key: "refused", label: "Refused", hint: "They said no — price the trip accordingly" },
];

const ASK = `If a guest cancels because of unavoidable, extraordinary circumstances at or near the destination — war, epidemic, natural disaster, or anything that stops people getting there — German package-travel law (§651h(3) BGB) requires us to refund them in full and forbids us charging a cancellation fee.

We're asking for the same release from you: where that happens, we can cancel the corresponding rooms without charge, and any prepayment is returned or carried to the following season.

Separately: what is the latest we can cancel or reduce rooms free of charge?`;

export function VendorTerms({
  value, onChange, labelClass, inputClass,
}: {
  value: VendorTerms;
  onChange: (patch: Partial<VendorTerms>) => void;
  labelClass: string;
  inputClass: string;
}) {
  const [copied, setCopied] = useState(false);

  // The risk read, in one line, before any of the fields.
  const risk =
    value.force_majeure_mirrored === true
      ? { tone: "good", text: "Back-to-back — a force-majeure refund doesn't land on NP7." }
      : value.force_majeure_mirrored === false
      ? { tone: "bad", text: "Not mirrored — if a guest cancels under §651h(3), NP7 pays the refund AND the rooms. Price it in, or shorten how early we commit." }
      : { tone: "warn", text: "Nobody has asked. Until someone does, assume NP7 carries the whole force-majeure refund for this supplier." };

  const toneClass =
    risk.tone === "good" ? "text-green-400" : risk.tone === "bad" ? "text-red-400" : "text-amber-500";

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
      <div className="px-4 py-3" style={{ backgroundColor: "var(--admin-surface)", borderBottom: "1px solid var(--admin-border)" }}>
        <p className="text-[10px] font-bold tracking-[0.12em] uppercase admin-faint">Cancellation terms with this supplier</p>
        <p className={`text-[12.5px] font-semibold mt-1 ${toneClass}`}>{risk.text}</p>
      </div>

      <div className="p-4 space-y-4">
        <div>
          <label className={labelClass}>Where it stands</label>
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => {
              const on = value.terms_status === s.key;
              return (
                <button key={s.key} type="button" title={s.hint}
                  onClick={() => onChange({ terms_status: on ? null : s.key })}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-bold transition-colors ${
                    on ? "bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)]" : "admin-muted hover:admin-heading"
                  }`}
                  style={on ? undefined : { border: "1px solid var(--admin-border)" }}>
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="sm:col-span-1">
            <label className={labelClass}>Force majeure mirrored?</label>
            <select className={inputClass}
              value={value.force_majeure_mirrored === null || value.force_majeure_mirrored === undefined ? "" : String(value.force_majeure_mirrored)}
              onChange={(e) => onChange({ force_majeure_mirrored: e.target.value === "" ? null : e.target.value === "true" })}>
              <option value="">Not asked</option>
              <option value="true">Yes — they release us too</option>
              <option value="false">No — we carry it</option>
            </select>
          </div>
          <div className="sm:col-span-1">
            <label className={labelClass}>Free cancellation until</label>
            <div className="flex items-center gap-2">
              <input type="number" min={0} className={inputClass}
                value={value.cancel_free_until_days ?? ""}
                onChange={(e) => onChange({ cancel_free_until_days: e.target.value === "" ? null : Number(e.target.value) })}
                placeholder="—" />
              <span className="text-[12px] admin-faint whitespace-nowrap">days before</span>
            </div>
          </div>
          <div className="sm:col-span-1">
            <label className={labelClass}>Last checked</label>
            <input type="date" className={inputClass}
              value={value.terms_checked_at ?? ""}
              onChange={(e) => onChange({ terms_checked_at: e.target.value || null })} />
          </div>
        </div>

        <div>
          <label className={labelClass}>What they actually said</label>
          <textarea className={`${inputClass} min-h-[70px] resize-y`}
            value={value.terms_note ?? ""}
            onChange={(e) => onChange({ terms_note: e.target.value || null })}
            placeholder="Clause number, who agreed it, any deadline — enough that the next person doesn't have to ask again." />
        </div>

        {/* The ask, ready to paste. Written out because this conversation happens
            once a season with six different suppliers and nobody remembers the
            paragraph number. */}
        <details className="rounded-lg" style={{ border: "1px solid var(--admin-border)" }}>
          <summary className="list-none cursor-pointer select-none px-3 py-2.5 text-[12.5px] font-bold admin-heading">
            What to ask them ↓
          </summary>
          <div className="px-3 pb-3">
            <p className="text-[12px] admin-muted whitespace-pre-line leading-relaxed rounded-lg p-3" style={{ backgroundColor: "var(--admin-bg)" }}>{ASK}</p>
            <div className="flex items-center gap-3 mt-2">
              <button type="button"
                onClick={() => { navigator.clipboard?.writeText(ASK); setCopied(true); setTimeout(() => setCopied(false), 1800); }}
                className="px-3 py-1.5 rounded-lg text-[12px] font-bold admin-muted hover:admin-heading transition-colors"
                style={{ border: "1px solid var(--admin-border)" }}>
                {copied ? "Copied" : "Copy"}
              </button>
              <span className="text-[11px] admin-faint">
                Also worth doing: don&apos;t prepay a supplier before our own free-cancellation
                date with them has passed — that timing costs nothing and removes most of the risk.
              </span>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}

/** The one-glance state for the vendors list. */
export function VendorTermsBadge({ v }: { v: Partial<VendorTerms> }) {
  if (v.force_majeure_mirrored === true) {
    return <Badge tone="good" text={v.cancel_free_until_days != null ? `covered · −${v.cancel_free_until_days}d` : "covered"} />;
  }
  if (v.force_majeure_mirrored === false) return <Badge tone="bad" text="we carry it" />;
  if (v.terms_status === "requested") return <Badge tone="warn" text="asked" />;
  if (v.terms_status === "todo") return <Badge tone="warn" text="to do" />;
  return <Badge tone="mute" text="not asked" />;
}

function Badge({ tone, text }: { tone: "good" | "bad" | "warn" | "mute"; text: string }) {
  const c =
    tone === "good" ? "bg-green-500/15 text-green-400"
      : tone === "bad" ? "bg-red-500/15 text-red-400"
      : tone === "warn" ? "bg-amber-500/15 text-amber-500"
      : "admin-surface admin-faint";
  return <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${c}`}>{text}</span>;
}
