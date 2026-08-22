"use client";

import { useEffect, useState, useCallback } from "react";

/**
 * Tier perks — the loyalty discounts, managed without SQL.
 * A rule = experience + tier + %; narrow it to one edition or override one
 * package (a package rule beats an edition rule beats the experience rule).
 * Display and booking price share one resolver, so what's listed here is
 * exactly what a member pays.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Rule = any;
type Exp = { id: string; title: string };

export default function PerksPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [experiences, setExperiences] = useState<Exp[]>([]);
  const [editions, setEditions] = useState<{ id: string; label: string | null; year: number | null; experience_id: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  // form
  const [expId, setExpId] = useState("");
  const [tier, setTier] = useState("crew");
  const [value, setValue] = useState("5");
  const [edId, setEdId] = useState("");

  const load = useCallback(async () => {
    const [r, e, ed] = await Promise.all([
      fetch("/api/admin/tier-perks").then((x) => x.json()).catch(() => null),
      fetch("/api/admin/experiences").then((x) => x.json()).catch(() => null),
      fetch("/api/admin/editions").then((x) => x.json()).catch(() => []),
    ]);
    if (r?.rules) setRules(r.rules);
    const list = Array.isArray(e) ? e : e?.experiences ?? [];
    setExperiences(list.map((x: Exp) => ({ id: x.id, title: x.title })));
    const eds = Array.isArray(ed) ? ed : ed?.editions ?? [];
    setEditions(eds);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function add() {
    setErr("");
    const r = await fetch("/api/admin/tier-perks", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ experienceId: expId, tier, value: Number(value), editionId: edId || undefined }),
    }).then((x) => x.json()).catch(() => null);
    if (r?.id) { setEdId(""); load(); } else setErr(r?.error || "Could not save.");
  }

  async function toggle(rule: Rule) {
    await fetch("/api/admin/tier-perks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: rule.id, active: !rule.active }) });
    load();
  }
  async function remove(rule: Rule) {
    if (!confirm("Delete this perk rule? Members lose the discount immediately.")) return;
    await fetch(`/api/admin/tier-perks?id=${rule.id}`, { method: "DELETE" });
    load();
  }

  const scopeOf = (r: Rule) =>
    r.exp_packages?.name ? `Package: ${r.exp_packages.name}`
    : r.exp_editions ? `${r.exp_editions.label ?? "Edition"} ${r.exp_editions.year ?? ""}`.trim()
    : "whole experience";

  return (
    <div className="p-4 sm:p-6 max-w-[900px]">
      <h1 className="text-xl font-bold admin-heading mb-1">Tier perks</h1>
      <p className="text-[13px] admin-faint mb-5">The loyalty discounts. A rule = experience + tier + % — optionally narrowed to one edition. A more specific rule wins; launch price and tier discount stack additively.</p>

      {/* add form */}
      <div className="rounded-xl p-4 mb-5 flex flex-wrap items-end gap-3" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
        <label className="text-xs admin-muted">Experience
          <select value={expId} onChange={(e) => { setExpId(e.target.value); setEdId(""); }} className="block mt-1 admin-input border rounded-lg px-2 py-1.5 text-sm" style={{ borderColor: "var(--admin-border)" }}>
            <option value="">Choose…</option>
            {experiences.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
          </select>
        </label>
        <label className="text-xs admin-muted">Tier
          <select value={tier} onChange={(e) => setTier(e.target.value)} className="block mt-1 admin-input border rounded-lg px-2 py-1.5 text-sm" style={{ borderColor: "var(--admin-border)" }}>
            <option value="crew">Crew</option>
            <option value="legend">Legend</option>
          </select>
        </label>
        <label className="text-xs admin-muted">% off
          <input type="number" min={0} max={99} value={value} onChange={(e) => setValue(e.target.value)} className="block mt-1 w-20 admin-input border rounded-lg px-2 py-1.5 text-sm" style={{ borderColor: "var(--admin-border)" }} />
        </label>
        <label className="text-xs admin-muted">Only this edition (optional)
          <select value={edId} onChange={(e) => setEdId(e.target.value)} disabled={!expId} className="block mt-1 admin-input border rounded-lg px-2 py-1.5 text-sm disabled:opacity-40" style={{ borderColor: "var(--admin-border)" }}>
            <option value="">Whole experience</option>
            {editions.filter((ed) => ed.experience_id === expId).map((ed) => <option key={ed.id} value={ed.id}>{ed.label ?? "Edition"} {ed.year ?? ""}</option>)}
          </select>
        </label>
        <button onClick={add} disabled={!expId} className="px-4 py-2 rounded-lg text-sm font-bold disabled:opacity-40" style={{ backgroundColor: "var(--admin-accent)", color: "var(--admin-accent-contrast)" }}>Add rule</button>
        {err && <span className="text-xs text-red-400">{err}</span>}
      </div>

      {/* rules */}
      {loading ? <p className="text-xs admin-faint">Loading…</p> : rules.length === 0 ? (
        <p className="text-sm admin-faint">No perk rules yet.</p>
      ) : (
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
          {rules.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-3" style={{ borderBottom: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)", opacity: r.active ? 1 : 0.5 }}>
              <span className="text-sm font-semibold admin-heading min-w-0 flex-1 truncate">{r.exp_experiences?.title ?? "?"}</span>
              <span className="text-[10.5px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full" style={{ backgroundColor: r.tier === "legend" ? "rgba(244,123,32,0.18)" : "rgba(255,196,46,0.22)", color: r.tier === "legend" ? "#f47b20" : "#b97608" }}>{r.tier}</span>
              <span className="text-sm font-bold admin-heading">−{Number(r.value)}%</span>
              <span className="text-xs admin-faint">{scopeOf(r)}</span>
              <button onClick={() => toggle(r)} className="text-xs px-2 py-1 rounded" style={{ color: "var(--admin-accent)", backgroundColor: "var(--admin-accent-weak)" }}>{r.active ? "Pause" : "Activate"}</button>
              <button onClick={() => remove(r)} className="text-xs text-red-400/60 hover:text-red-400">Delete</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
