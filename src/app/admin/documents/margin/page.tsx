"use client";

/**
 * Margenermittlung: one row per trip, for the tax practice.
 *
 * § 25 Abs. 5 requires records per trip showing the Entgelt, the
 * Reisevorleistungen, the Bemessungsgrundlage and the split between taxable and
 * tax free, and lexoffice cannot produce any of it: Lexware says its software
 * has no way to represent margin taxation, and there is no category and no tax
 * key for § 25 in it. This list is the only place that record can come from.
 *
 * The screen leads with what is NOT yet known, and that is deliberate. Nearly
 * every cost line is still unsorted, and a page that showed a confident margin
 * on top of unsorted costs would be showing a number that is too big, and a tax
 * bill with it. So the unsorted pile is the first thing on the page, sorting it
 * is the first thing you can do, and every trip that still holds one says
 * provisional.
 */

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type Trip = {
  editionId: string;
  trip: string;
  editionLabel: string | null;
  place: string | null;
  dateStart: string | null;
  dateEnd: string | null;
  territory: "DRITTLAND" | "EU" | "UNKLAR";
  territoryReason: string;
  travellers: number;
  entgelt: number;
  received: number;
  reisevorleistungen: number;
  vorleistungenEstimated: number;
  ownService: number;
  unclassified: number;
  unclassifiedCount: number;
  bruttomarge: number;
  steuerfrei: number;
  steuerpflichtigBrutto: number;
  bemessungsgrundlage: number;
  umsatzsteuer: number;
  provisional: boolean;
  notes: string[];
};

type Totals = {
  entgelt: number; reisevorleistungen: number; steuerfrei: number;
  steuerpflichtigBrutto: number; bemessungsgrundlage: number; umsatzsteuer: number;
  unklarMarge: number; negativeMarge: number; unclassifiedCosts: number; provisionalTrips: number;
};

type Cost = {
  id: string;
  item: string;
  notes: string | null;
  date: string | null;
  actual_amount: number | null;
  estimated_amount: number | null;
  exp_experiences: { title?: string } | null;
  exp_editions: { label?: string; date_start?: string } | null;
};

const eur = (n: number) =>
  n.toLocaleString("de-DE", { style: "currency", currency: "EUR", minimumFractionDigits: 2 });

const TERRITORY_COLOR: Record<string, string> = {
  DRITTLAND: "var(--admin-accent)",
  EU: "var(--admin-heading, inherit)",
  UNKLAR: "#b45309",
};

const BUCKETS: { key: string; label: string; blurb: string }[] = [
  { key: "travel_input", label: "Reisevorleistung", blurb: "Bought from a third party, delivered straight to the guest. Reduces the margin." },
  { key: "own_service", label: "Eigenleistung", blurb: "NP7 does it itself. Does not reduce the margin." },
  { key: "overhead", label: "Gemeinkosten", blurb: "Belongs to no trip. Stays out of the margin." },
];

export default function MarginPage() {
  const year = new Date().getFullYear();
  const [selectedYear, setSelectedYear] = useState(year);
  const [tick, setTick] = useState(0);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [costs, setCosts] = useState<Cost[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [openTrip, setOpenTrip] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [recRes, costRes] = await Promise.all([
        fetch(`/api/admin/documents/margin?year=${selectedYear}`),
        fetch(`/api/admin/documents/margin?costs=unclassified`),
      ]);
      const rec = await recRes.json().catch(() => ({ error: "The margin record could not be read" }));
      const cst = await costRes.json().catch(() => ({ costs: [] }));
      if (cancelled) return;
      if (rec.error) setErr(rec.error);
      else {
        setErr(null);
        setTrips(rec.trips ?? []);
        setTotals(rec.totals ?? null);
      }
      setCosts(cst.costs ?? []);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedYear, tick]);

  const toggle = useCallback((id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const classify = async (bucket: string) => {
    if (!picked.size) return;
    setSaving(true);
    await fetch("/api/admin/documents/margin", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ costIds: [...picked], marginClass: bucket }),
    });
    setPicked(new Set());
    setSaving(false);
    setLoading(true);
    setTick((t) => t + 1);
  };

  const costValue = (c: Cost) => Number(c.actual_amount ?? c.estimated_amount ?? 0);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold admin-heading">Margenermittlung</h1>
          <p className="text-sm admin-muted mt-0.5 max-w-2xl">
            One row per trip: Entgelt, Reisevorleistungen, Bemessungsgrundlage and the split between taxable and tax
            free. § 25 Abs. 5 requires it and lexoffice cannot produce it, so this list is where it comes from.
          </p>
        </div>
        <div className="flex gap-2">
          <select
            value={selectedYear}
            onChange={(e) => {
              setLoading(true);
              setSelectedYear(Number(e.target.value));
            }}
            className="px-3 py-2 text-sm rounded-lg admin-heading"
            style={{ border: "1px solid var(--admin-border)", background: "transparent" }}
          >
            {[year + 1, year, year - 1, year - 2].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <a
            href={`/api/admin/documents/margin?year=${selectedYear}&format=csv`}
            className="px-4 py-2 text-sm font-bold rounded-lg admin-muted hover:admin-heading"
            style={{ border: "1px solid var(--admin-border)" }}
          >
            Export CSV
          </a>
          <Link
            href="/admin/documents"
            className="px-4 py-2 text-sm font-bold rounded-lg admin-muted hover:admin-heading"
            style={{ border: "1px solid var(--admin-border)" }}
          >
            Invoices
          </Link>
        </div>
      </div>

      {err && (
        <div className="rounded-xl p-4 mb-5 text-sm" style={{ border: "1px solid #b45309", color: "#b45309" }}>
          {err}
        </div>
      )}

      {/* What is not known yet, first. */}
      {costs.length > 0 && (
        <div className="rounded-xl admin-tablecard mb-6" style={{ border: "1px solid #b45309" }}>
          <div className="px-4 py-3" style={{ borderBottom: "1px solid var(--admin-border)" }}>
            <p className="text-sm font-bold admin-heading">
              {costs.length} cost line{costs.length === 1 ? "" : "s"} have not been sorted yet
            </p>
            <p className="text-xs admin-muted mt-1 max-w-3xl">
              Only a Reisevorleistung reduces the margin. Until each line is sorted, every margin below is too big and
              so is the tax on it, which is why those trips read provisional. Sorting is the whole job: pick the lines,
              press the bucket.
            </p>
          </div>

          {picked.size > 0 && (
            <div
              className="px-4 py-3 flex flex-wrap items-center gap-2"
              style={{ borderBottom: "1px solid var(--admin-border)" }}
            >
              <span className="text-sm font-bold admin-heading mr-2">{picked.size} selected</span>
              {BUCKETS.map((b) => (
                <button
                  key={b.key}
                  disabled={saving}
                  onClick={() => classify(b.key)}
                  title={b.blurb}
                  className="px-3 py-1.5 text-xs font-bold rounded-lg disabled:opacity-40"
                  style={{ backgroundColor: "var(--admin-accent)", color: "var(--admin-accent-contrast)" }}
                >
                  {b.label}
                </button>
              ))}
              <button
                onClick={() => setPicked(new Set())}
                className="px-3 py-1.5 text-xs font-bold rounded-lg admin-muted hover:admin-heading"
                style={{ border: "1px solid var(--admin-border)" }}
              >
                Clear
              </button>
            </div>
          )}

          <div className="max-h-[22rem] overflow-y-auto">
            {costs.map((c) => (
              <label
                key={c.id}
                className="px-4 py-2 flex items-center gap-3 text-sm cursor-pointer"
                style={{ borderBottom: "1px solid var(--admin-border)" }}
              >
                <input type="checkbox" checked={picked.has(c.id)} onChange={() => toggle(c.id)} />
                <span className="admin-heading flex-1 min-w-0 truncate">{c.item}</span>
                <span className="admin-faint text-xs truncate max-w-[14rem]">
                  {c.exp_experiences?.title ?? "no trip"}
                  {c.exp_editions?.label ? ` · ${c.exp_editions.label}` : ""}
                </span>
                <span className="tabular-nums admin-muted">{eur(costValue(c))}</span>
                {c.actual_amount == null && <span className="text-xs admin-faint">estimate</span>}
              </label>
            ))}
          </div>
        </div>
      )}

      {/* The record */}
      <div className="rounded-xl admin-tablecard overflow-x-auto" style={{ border: "1px solid var(--admin-border)" }}>
        {loading && <div className="px-4 py-6 text-sm admin-muted">Loading…</div>}
        {!loading && trips.length === 0 && (
          <div className="px-4 py-6 text-sm admin-muted">No trip was performed in {selectedYear}.</div>
        )}
        {!loading && trips.length > 0 && (
          <table className="w-full text-sm" style={{ minWidth: "60rem" }}>
            <thead>
              <tr className="text-xs uppercase tracking-wide admin-muted text-left">
                <th className="px-4 py-3 font-bold">Reise</th>
                <th className="px-3 py-3 font-bold">Gebiet</th>
                <th className="px-3 py-3 font-bold text-right">Reisende</th>
                <th className="px-3 py-3 font-bold text-right">Entgelt</th>
                <th className="px-3 py-3 font-bold text-right">Reisevorleistungen</th>
                <th className="px-3 py-3 font-bold text-right">Bruttomarge</th>
                <th className="px-3 py-3 font-bold text-right">steuerfrei</th>
                <th className="px-3 py-3 font-bold text-right">Bemessungsgrundlage</th>
                <th className="px-3 py-3 font-bold text-right">USt 19%</th>
              </tr>
            </thead>
            <tbody>
              {trips.map((t) => (
                <tr
                  key={t.editionId}
                  onClick={() => setOpenTrip(openTrip === t.editionId ? null : t.editionId)}
                  className="cursor-pointer"
                  style={{ borderTop: "1px solid var(--admin-border)" }}
                >
                  <td className="px-4 py-3">
                    <div className="font-bold admin-heading">
                      {t.trip}
                      {t.editionLabel ? ` · ${t.editionLabel}` : ""}
                    </div>
                    <div className="text-xs admin-faint">
                      {t.place ?? "no destination"}
                      {t.dateEnd ? ` · bis ${t.dateEnd}` : ""}
                      {t.provisional ? " · vorläufig" : ""}
                    </div>
                    {openTrip === t.editionId &&
                      t.notes.map((n, i) => (
                        <p key={i} className="text-xs admin-muted mt-1 max-w-xl">
                          {n}
                        </p>
                      ))}
                  </td>
                  <td className="px-3 py-3 font-bold text-xs" style={{ color: TERRITORY_COLOR[t.territory] }}>
                    {t.territory}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums admin-muted">{t.travellers}</td>
                  <td className="px-3 py-3 text-right tabular-nums admin-heading">{eur(t.entgelt)}</td>
                  <td className="px-3 py-3 text-right tabular-nums admin-muted">
                    {eur(t.reisevorleistungen)}
                    {t.unclassifiedCount > 0 && (
                      <div className="text-xs" style={{ color: "#b45309" }}>
                        +{eur(t.unclassified)} unsorted
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums admin-heading">{eur(t.bruttomarge)}</td>
                  <td className="px-3 py-3 text-right tabular-nums admin-muted">{eur(t.steuerfrei)}</td>
                  <td className="px-3 py-3 text-right tabular-nums admin-muted">{eur(t.bemessungsgrundlage)}</td>
                  <td className="px-3 py-3 text-right tabular-nums font-bold admin-heading">{eur(t.umsatzsteuer)}</td>
                </tr>
              ))}
              {totals && (
                <tr style={{ borderTop: "2px solid var(--admin-border)" }}>
                  <td className="px-4 py-3 font-bold admin-heading">Summe</td>
                  <td />
                  <td />
                  <td className="px-3 py-3 text-right tabular-nums font-bold admin-heading">{eur(totals.entgelt)}</td>
                  <td className="px-3 py-3 text-right tabular-nums font-bold admin-heading">{eur(totals.reisevorleistungen)}</td>
                  <td className="px-3 py-3 text-right tabular-nums font-bold admin-heading">
                    {eur(totals.entgelt - totals.reisevorleistungen)}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums font-bold admin-heading">{eur(totals.steuerfrei)}</td>
                  <td className="px-3 py-3 text-right tabular-nums font-bold admin-heading">{eur(totals.bemessungsgrundlage)}</td>
                  <td className="px-3 py-3 text-right tabular-nums font-bold admin-heading">{eur(totals.umsatzsteuer)}</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {totals && !loading && (
        <div className="mt-4 text-xs admin-muted space-y-1 max-w-3xl">
          <p>
            No netting of negative against positive margins (§ 25 Abs. 5). Not included above:{" "}
            {eur(Math.abs(totals.negativeMarge))} of losses on individual trips.
          </p>
          {totals.unklarMarge > 0 && (
            <p style={{ color: "#b45309" }}>
              {eur(totals.unklarMarge)} of margin sits on trips where third country or EU has not been ruled, so it is
              in neither column. Third-country margin is tax free and EU margin is taxed the month the money arrives, so
              this is the difference between owing nothing and owing {eur(totals.unklarMarge / 1.19 * 0.19)}.
            </p>
          )}
          {totals.provisionalTrips > 0 && (
            <p>
              {totals.provisionalTrips} trip{totals.provisionalTrips === 1 ? " is" : "s are"} provisional: an estimate,
              an unsorted cost or an unruled territory is still in there. The accounting plan asks for a report after
              each trip once the last supplier invoice has landed, which is when a provisional margin becomes the real
              one.
            </p>
          )}
          <p>
            The tax practice makes the call on third country against EU, on whether the coaches are an own service, and
            on the Storno cases. This page supplies the figures, not the ruling.
          </p>
        </div>
      )}
    </div>
  );
}
