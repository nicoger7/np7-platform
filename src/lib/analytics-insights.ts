/**
 * Turn the raw behaviour aggregates into a short, prioritised, plain-English
 * "what to improve" list — the layer the team actually acts on. Pure + testable;
 * no thresholds fire on thin data, so it stays quiet until there's signal.
 *
 * Each insight is tagged by area (Website / Experiences / Products) and severity,
 * with a one-line action you can do something with.
 */

export type InsightArea = "Website" | "Experiences" | "Products";
export type InsightSeverity = "high" | "medium" | "low";
export type Insight = {
  id: string;
  area: InsightArea;
  severity: InsightSeverity;
  title: string;
  action: string;
  metric: string;
};

type TargetStat = { target: string; path: string; count: number };

export type InsightsInput = {
  totals?: { sessions: number; bounceRate: number };
  funnel?: { expViews: number; reserveStart: number; register: number };
  exitPages?: { path: string; sessions: number }[];
  behaviour?: {
    clicks: number; deadClicks: number; rageClicks: number;
    topClicked: TargetStat[]; topDead: TargetStat[]; topRage: TargetStat[];
  };
  experiences?: { slug: string; views: number; reserves: number; rate: number }[];
  interest?: { kind: string; key: string; views: number; avgSeconds: number; scrollPct: number; reserves: number; frustration: number }[];
  dropoffs?: { path: string; sessions: number; avgSeconds: number; scrollPct: number; frustration: number }[];
};

function areaForPath(path: string): InsightArea {
  if (path.startsWith("/experience")) return "Experiences";
  if (path.startsWith("/hardware")) return "Products";
  return "Website";
}

// Destinations + experiences both belong to the Experiences world; hardware = Products.
function areaForKind(kind: string): InsightArea {
  return kind === "Product" ? "Products" : "Experiences";
}

export function deriveInsights(d: InsightsInput): Insight[] {
  const out: Insight[] = [];
  const b = d.behaviour;

  // Dead clicks — "they try to click but can't". The clearest fix-list.
  for (const t of (b?.topDead ?? []).slice(0, 5)) {
    if (t.count < 3) continue;
    out.push({
      id: `dead:${t.path}:${t.target}`,
      area: areaForPath(t.path),
      severity: t.count >= 10 ? "high" : "medium",
      title: `“${t.target}” looks clickable but does nothing`,
      action: `On ${t.path}, visitors keep clicking this and nothing happens — make it a real link/button, or restyle it so it doesn't invite clicks.`,
      metric: `${t.count} dead clicks`,
    });
  }

  // Rage clicks — frustration / broken control.
  for (const t of (b?.topRage ?? []).slice(0, 4)) {
    if (t.count < 2) continue;
    out.push({
      id: `rage:${t.path}:${t.target}`,
      area: areaForPath(t.path),
      severity: "high",
      title: `People rage-click “${t.target}”`,
      action: `On ${t.path}, visitors click this over and over in frustration — it's likely broken, slow or unresponsive. Test it on a real device.`,
      metric: `${t.count} rage clicks`,
    });
  }

  // Per-experience conversion — which trips sell, which don't.
  const exps = (d.experiences ?? []).filter((e) => e.views >= 5);
  if (exps.length >= 2) {
    const byRate = [...exps].sort((a, b) => b.rate - a.rate);
    const best = byRate[0];
    const worst = byRate[byRate.length - 1];
    if (best.rate > 0) {
      out.push({
        id: "exp:best",
        area: "Experiences",
        severity: "low",
        title: `${best.slug} converts best`,
        action: `${best.rate}% of people who view ${best.slug} start reserving — study what that page does well (photos, pitch, pricing clarity) and copy it to the others.`,
        metric: `${best.rate}% view→reserve`,
      });
    }
    if (worst.slug !== best.slug && worst.rate * 2 < best.rate) {
      out.push({
        id: "exp:worst",
        area: "Experiences",
        severity: "medium",
        title: `${worst.slug} barely converts`,
        action: `Only ${worst.rate}% of ${worst.slug} viewers start reserving (vs ${best.rate}% on ${best.slug}). Review its photos, pricing and CTA against the best page.`,
        metric: `${worst.rate}% view→reserve`,
      });
    }
  }

  // Overall trip funnel.
  if (d.funnel && d.funnel.expViews >= 20) {
    const rate = Math.round((d.funnel.reserveStart / d.funnel.expViews) * 100);
    if (rate < 15) {
      out.push({
        id: "funnel:view-reserve",
        area: "Experiences",
        severity: "high",
        title: `Few trip viewers start reserving`,
        action: `Only ${rate}% of people who view a trip click reserve. Strengthen the reserve CTA and the above-the-fold pitch so the next step is obvious.`,
        metric: `${rate}% view→reserve`,
      });
    }
  }

  // High bounce.
  if (d.totals && d.totals.sessions >= 30 && d.totals.bounceRate >= 60) {
    out.push({
      id: "bounce",
      area: "Website",
      severity: "medium",
      title: `High bounce rate`,
      action: `${d.totals.bounceRate}% of sessions leave after a single page. Make sure your top entry pages load fast and the next step is obvious above the fold.`,
      metric: `${d.totals.bounceRate}% bounce`,
    });
  }

  // What draws interest — the most-viewed / most-engaged experience, destination or product.
  if (d.interest?.length) {
    const top = d.interest[0];
    if (top.views >= 10) {
      out.push({
        id: "interest:top",
        area: areaForKind(top.kind),
        severity: "low",
        title: `Most interest: ${top.key}`,
        action: `${top.kind.toLowerCase()} “${top.key}” draws the most attention — ${top.views} views, ~${top.avgSeconds}s on the page, ${top.scrollPct}% scroll deep. Lead with it and keep its content the strongest.`,
        metric: `${top.views} views · ~${top.avgSeconds}s`,
      });
    }
    // interest without conversion — demand is there but nobody reserves.
    for (const i of d.interest.filter((x) => x.kind === "Experience" && x.views >= 10 && x.reserves === 0).slice(0, 2)) {
      out.push({
        id: `interest:noconv:${i.key}`,
        area: "Experiences",
        severity: "medium",
        title: `${i.key}: interest but zero reserves`,
        action: `${i.views} people looked at ${i.key} and read it (~${i.avgSeconds}s) but none started reserving. The demand is there — check pricing clarity, available dates and the reserve CTA.`,
        metric: `${i.views} views · 0 reserves`,
      });
    }
    // where they linger longest (strong engagement worth capitalising on).
    const longest = [...d.interest].filter((x) => x.views >= 5).sort((a, b) => b.avgSeconds - a.avgSeconds)[0];
    if (longest && longest.key !== top.key && longest.avgSeconds >= 45) {
      out.push({
        id: `interest:dwell:${longest.key}`,
        area: areaForKind(longest.kind),
        severity: "low",
        title: `People linger longest on ${longest.key}`,
        action: `Visitors spend ~${longest.avgSeconds}s on ${longest.key} — strong engagement. Make the reserve / next step unmissable for these readers.`,
        metric: `~${longest.avgSeconds}s avg`,
      });
    }
  }

  // Biggest drop-off + WHY — where visits end, and the likely reason.
  if (d.dropoffs?.length && d.totals?.sessions) {
    const t = d.dropoffs[0];
    const share = Math.round((t.sessions / d.totals.sessions) * 100);
    if (share >= 15) {
      let why: string;
      if (t.frustration > 0) why = `${t.frustration} rage/dead clicks happen here — something's broken. Fix that first.`;
      else if (t.avgSeconds > 0 && t.avgSeconds < 10 && t.scrollPct < 30) why = `they leave in ~${t.avgSeconds}s without scrolling — the top of the page isn't landing (weak hero, unclear value, or slow load).`;
      else if (t.scrollPct < 30) why = `most don't scroll past the first screen — the opening isn't pulling them in.`;
      else why = `they engage (~${t.avgSeconds}s, ${t.scrollPct}% scroll deep) then leave — likely price, dates, or a missing next step.`;
      out.push({
        id: `dropoff:${t.path}`,
        area: areaForPath(t.path),
        severity: "high",
        title: `Biggest drop-off: ${t.path}`,
        action: `${share}% of sessions end here — ${why}`,
        metric: `${share}% of exits · ~${t.avgSeconds}s`,
      });
    }
  }

  const rank: Record<InsightSeverity, number> = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}
