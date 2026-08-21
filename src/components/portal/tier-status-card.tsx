import type { MemberTier } from "@/lib/member-tier";
import { TIER_STEPS, TIER_PERKS } from "@/lib/tier-config";

/**
 * The loyalty ladder as a first-class profile card — the banner chip's hover
 * popover made the status easy to miss; here a member can always read where
 * they stand, what it earns them, and what keeps it alive.
 */
export function TierStatusCard({ tier }: { tier: MemberTier | null }) {
  const fmtN = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(2));
  const fill = (i: number) => {
    if (!tier) return 0;
    const step = TIER_STEPS[i];
    if (tier.trips >= step.min) return 100;
    const prevMin = i > 0 ? TIER_STEPS[i - 1].min : 0;
    if (tier.trips >= prevMin) return Math.round(((tier.trips - prevMin) / (step.min - prevMin)) * 100);
    return 0;
  };
  const chipTone =
    tier?.key === "legend" ? "bg-gradient-to-r from-[#f47b20] to-[#ffc42e] text-[#3d2202]"
    : tier?.key === "crew" ? "bg-[#ffc42e] text-[#4a3403]"
    : "bg-[#e8f6fb] text-[#01576f]";

  return (
    <section className="bg-white rounded-2xl border border-[#f0e6d6] p-6 mb-6">
      <div className="flex items-center justify-between gap-3 mb-1.5">
        <h2 className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#00afdb]">Your NP7 status</h2>
        {tier && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-extrabold tracking-[0.12em] uppercase ${chipTone}`}>
            ★ {tier.label}
          </span>
        )}
      </div>
      <p className="text-[13.5px] text-[#6a7a80] mb-5 leading-relaxed">
        {tier
          ? <>{fmtN(tier.trips)} trip{tier.trips === 1 ? "" : "s"} ridden{tier.toNext ? <> — <b className="text-[#00374a]">{fmtN(tier.toNext)} more to {tier.nextLabel}</b></> : " — top tier"}. A full week counts 1, a clinic 0.25.</>
          : <>Ride your first week and the ladder starts — every finished trip counts.</>}
      </p>

      <div className="flex gap-2 mb-2">
        {TIER_STEPS.map((s, i) => (
          <div key={s.key} className="flex-1">
            <div className="h-2 rounded-full bg-[#eef3f4] overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${fill(i)}%`, background: "linear-gradient(90deg,#ffc42e,#f47b20)" }} />
            </div>
            <div className={`mt-1.5 text-[10px] font-extrabold tracking-[0.14em] uppercase ${tier?.key === s.key ? "text-[#c47a10]" : tier && tier.trips >= s.min ? "text-[#00374a]" : "text-[#b6c2c8]"}`}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      {tier && (
        <>
          {tier.validUntil && (
            <p className="text-[12px] text-[#9aa6ac] mb-4">
              {tier.label} status valid until {new Date(tier.validUntil + "T00:00:00Z").toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })} — your next trip extends it.
            </p>
          )}
          <div className="pt-4 border-t border-[#f3ede2]">
            <p className="text-[12px] font-bold tracking-[0.08em] uppercase text-[#9aa6ac] mb-2">Your {tier.label} perks</p>
            <ul className="space-y-1">
              {TIER_PERKS[tier.key].map((p) => (
                <li key={p} className="text-[13.5px] text-[#00374a] flex gap-2"><span className="text-[#00afdb] font-bold">✓</span>{p}</li>
              ))}
            </ul>
            {tier.nextLabel && (
              <p className="text-[12.5px] text-[#9aa6ac] mt-2.5">
                {tier.nextLabel} adds: {TIER_PERKS[tier.nextLabel.toLowerCase() as "crew" | "legend"].filter((p) => !TIER_PERKS[tier.key].includes(p)).join(" · ")}
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}
