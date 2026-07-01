"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ImagePickerModal from "@/components/image-picker-modal";
import { parseCoords } from "@/lib/blog-templates";
import {
  LEVELS, SPOT_CRITERIA, CONDITIONS, INFRASTRUCTURE_TAGS,
  FORECAST_MODELS, FORECAST_TIER_LABEL, type ForecastTier,
  WIND_DIRECTIONS, WIND_QUALITY_META, type WindQuality,
  VERIFICATION_META, type Verification,
  type RatingSummary, type ForecastTally,
} from "@/lib/spotguide";
import { WindStatsChart } from "@/components/spotguide/wind-stats-chart";
import { PinPicker } from "@/components/spotguide/pin-picker";
import type { WindStats } from "@/lib/wind-stats";

/** Pull 12 monthly "% planing (4+ Bft)" values out of existing stats (for the
    manual editor to pre-fill). */
function monthlyFrom(ws: WindStats | null): number[] {
  const out = Array(12).fill(0);
  for (const m of ws?.months ?? []) if (m.m >= 1 && m.m <= 12) out[m.m - 1] = m.pct?.["4"] ?? 0;
  return out;
}

interface Spot {
  id: string; destination_id: string; name: string; slug: string | null;
  lat: number | null; lng: number | null; level: string | null;
  conditions: string[] | null; wind_window: Record<string, string> | null;
  infrastructure: string[] | null; np7_forecast_models: string[] | null;
  hero_image: string | null; gallery: string[] | null;
  summary: string | null; description: string | null;
  np7_ratings: Record<string, number> | null; source: string;
  status: string; verification: string;
  wind_stats: WindStats | null; wind_stats_at: string | null;
}
interface Dest { id: string; name: string; slug: string | null }

export default function SpotEditor({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [s, setS] = useState<Spot | null>(null);
  const [dest, setDest] = useState<Dest | null>(null);
  const [member, setMember] = useState<RatingSummary | null>(null);
  const [tally, setTally] = useState<ForecastTally[]>([]);
  const [confirms, setConfirms] = useState(0);
  const [coordsRaw, setCoordsRaw] = useState("");
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [picker, setPicker] = useState<null | "hero" | "gallery">(null);
  const [computing, setComputing] = useState(false);
  const [statsError, setStatsError] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [manual, setManual] = useState<number[]>(Array(12).fill(0));

  useEffect(() => {
    fetch(`/api/admin/spots/${id}`).then((r) => r.json()).then((x) => {
      if (x.spot) {
        setS({ ...x.spot, conditions: x.spot.conditions ?? [], infrastructure: x.spot.infrastructure ?? [], gallery: x.spot.gallery ?? [], np7_forecast_models: x.spot.np7_forecast_models ?? [], wind_window: x.spot.wind_window ?? {}, np7_ratings: x.spot.np7_ratings ?? {} });
        setDest(x.destination ?? null);
        setMember(x.memberRatings ?? null);
        setTally(x.forecastTally ?? []);
        setConfirms(x.confirms ?? 0);
        if (x.spot.lat != null && x.spot.lng != null) setCoordsRaw(`${x.spot.lat}, ${x.spot.lng}`);
      }
      setLoading(false);
    });
  }, [id]);

  function set<K extends keyof Spot>(k: K, v: Spot[K]) { setS((p) => (p ? { ...p, [k]: v } : p)); }

  async function save() {
    if (!s) return;
    const parsed = parseCoords(coordsRaw);
    await fetch(`/api/admin/spots/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...s, lat: parsed?.lat ?? null, lng: parsed?.lng ?? null }),
    });
    setSaved(true); setTimeout(() => setSaved(false), 2000);
  }
  async function remove() {
    if (!confirm("Delete this spot? This removes its ratings, votes and verifications too.")) return;
    await fetch(`/api/admin/spots/${id}`, { method: "DELETE" });
    router.push(dest ? `/admin/destinations/${dest.id}` : "/admin/destinations");
  }

  async function setStats(body: Record<string, unknown>) {
    setComputing(true); setStatsError("");
    const res = await fetch(`/api/admin/spots/${id}/wind-stats`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    setComputing(false);
    const j = await res.json().catch(() => ({}));
    if (res.ok) { setS((p) => (p ? { ...p, wind_stats: j.wind_stats, wind_stats_at: j.wind_stats_at } : p)); setManualMode(false); }
    else setStatsError(j.error ?? "Could not save.");
  }

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-sm admin-faint">Loading…</p></div>;
  if (!s) return <div className="py-16 text-center"><p className="text-sm admin-faint">Spot not found</p><p className="text-xs admin-faint mt-1">Run migration 062 if you just added it.</p></div>;

  const inputClass = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)]";
  const labelClass = "block text-xs font-medium admin-muted mb-1";
  const folder = s.slug ? `spots/${s.slug}` : dest?.slug ? `destinations/${dest.slug}` : undefined;
  const gallery = s.gallery ?? [];
  const conditions = s.conditions ?? [];
  const infra = s.infrastructure ?? [];
  const models = s.np7_forecast_models ?? [];
  const vmeta = VERIFICATION_META[(s.verification as Verification)] ?? VERIFICATION_META.np7;

  return (
    <div className="max-w-[760px]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="min-w-0">
          <Link href={dest ? `/admin/destinations/${dest.id}` : "/admin/destinations"} className="text-xs admin-faint hover:admin-heading">← {dest?.name ?? "Destinations"}</Link>
          <h1 className="text-2xl font-bold admin-heading mt-1 truncate">{s.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase" style={{ backgroundColor: `${vmeta.color}1f`, color: vmeta.color }}>{vmeta.short}</span>
            {s.source === "member" && <span className="text-[10px] admin-faint">member-submitted{confirms ? ` · ${confirms} confirm${confirms === 1 ? "" : "s"}` : ""}</span>}
          </div>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button onClick={remove} className="px-3 py-2 text-xs text-red-400/60 hover:text-red-400">Delete</button>
          <button onClick={save} className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg">{saved ? "Saved!" : "Save"}</button>
        </div>
      </div>

      <div className="space-y-6">
        {/* Identity */}
        <div className="grid grid-cols-2 gap-4">
          <div><label className={labelClass}>Spot name</label><input className={inputClass} value={s.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div><label className={labelClass}>Slug</label><input className={inputClass} value={s.slug ?? ""} onChange={(e) => set("slug", e.target.value)} placeholder="sotavento" /></div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Map coordinates</label>
            <input className={inputClass} value={coordsRaw} onChange={(e) => setCoordsRaw(e.target.value)} placeholder="28.0456, -14.3261" />
            <p className="text-[11px] admin-faint mt-1">Paste “lat, lng” from Google Maps, or drop the pin below. Moving it re-computes the wind stats (unless a manual override is set).</p>
            <div className="mt-2">
              <PinPicker
                value={parseCoords(coordsRaw)}
                onChange={(c) => setCoordsRaw(`${c.lat}, ${c.lng}`)}
                height={200}
              />
            </div>
          </div>
          <div>
            <label className={labelClass}>Level</label>
            <select className={inputClass} value={s.level ?? ""} onChange={(e) => set("level", e.target.value || null)}>
              <option value="">—</option>
              {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <p className="text-[11px] admin-faint mt-1">Synced with the member level system.</p>
          </div>
        </div>

        {/* Hero + gallery */}
        <div>
          <label className={labelClass}>Hero photo</label>
          {s.hero_image ? (
            <div className="flex items-center gap-3">
              <div className="w-40 aspect-[16/9] bg-cover bg-center rounded-lg" style={{ backgroundImage: `url('${s.hero_image}')`, border: "1px solid var(--admin-border)" }} />
              <button onClick={() => setPicker("hero")} className="text-xs text-[#0aa3c7] hover:underline">Change</button>
              <button onClick={() => set("hero_image", "")} className="text-xs admin-faint hover:text-red-400">Remove</button>
            </div>
          ) : <button onClick={() => setPicker("hero")} className={`${inputClass} text-left admin-muted max-w-[200px]`}>Pick hero photo…</button>}
        </div>
        <div>
          <label className={labelClass}>Gallery</label>
          <div className="grid grid-cols-5 gap-2">
            {gallery.map((url, i) => (
              <div key={i} className="relative group aspect-square rounded-lg overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="" className="w-full h-full object-cover" />
                <button onClick={() => set("gallery", gallery.filter((_, j) => j !== i))} className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 bg-black/60 text-white rounded w-5 h-5 text-xs">✕</button>
              </div>
            ))}
            <button onClick={() => setPicker("gallery")} className="aspect-square rounded-lg border-2 border-dashed grid place-items-center admin-faint hover:admin-heading" style={{ borderColor: "var(--admin-border)" }}>+</button>
          </div>
        </div>

        {/* Summary / description */}
        <div><label className={labelClass}>Summary</label><input className={inputClass} value={s.summary ?? ""} onChange={(e) => set("summary", e.target.value)} placeholder="One line — what this spot is about." /></div>
        <div><label className={labelClass}>Description</label><textarea className={`${inputClass} min-h-[100px] resize-y`} value={s.description ?? ""} onChange={(e) => set("description", e.target.value)} placeholder="What it's like on the water here…" /></div>

        {/* Conditions */}
        <div>
          <label className={labelClass}>Conditions <span className="admin-faint font-normal">(the water state)</span></label>
          <div className="flex flex-wrap gap-2">
            {CONDITIONS.map((c) => {
              const on = conditions.includes(c.key);
              return (
                <button key={c.key} onClick={() => set("conditions", on ? conditions.filter((x) => x !== c.key) : [...conditions, c.key])}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
                  style={on ? { backgroundColor: "var(--admin-accent)", color: "var(--admin-accent-contrast)" } : { border: "1px solid var(--admin-border)" }}>
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Wind window — the windrose */}
        <div>
          <label className={labelClass}>Wind window <span className="admin-faint font-normal">(which directions work — click to cycle)</span></label>
          <Windrose value={s.wind_window ?? {}} onChange={(w) => set("wind_window", w)} />
        </div>

        {/* Wind statistics — auto (Open-Meteo) OR manual (acceleration spots) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className={labelClass}>Wind statistics</label>
            <div className="flex items-center gap-2.5 text-xs font-bold">
              <button onClick={() => setStats({})} disabled={computing} className="text-[#0aa3c7] hover:underline disabled:opacity-50">{computing ? "…" : "Compute (auto)"}</button>
              <span className="admin-faint">·</span>
              <button onClick={() => { setManualMode((m) => !m); setManual(monthlyFrom(s.wind_stats)); }} className="text-[#0aa3c7] hover:underline">Manual</button>
              <span className="admin-faint">·</span>
              <button onClick={() => setStats({ mode: "off" })} disabled={computing} className="text-red-400/70 hover:text-red-400 disabled:opacity-50">Off</button>
            </div>
          </div>
          {statsError && <p className="text-[11px] text-red-400 mb-1">{statsError}</p>}

          {manualMode ? (
            <div className="rounded-xl p-4 space-y-2" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
              <p className="text-[11px] admin-muted">Enter % of days with <b>planing wind (Force 4+)</b> per month — use this for acceleration spots (Canaries, Tarifa…) where the models under-read.</p>
              <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5">
                {["J","F","M","A","M","J","J","A","S","O","N","D"].map((mo, i) => (
                  <div key={i} className="text-center">
                    <div className="text-[9px] admin-faint mb-0.5">{mo}</div>
                    <input type="number" min={0} max={100} value={manual[i] || ""} onChange={(e) => setManual((a) => a.map((v, j) => j === i ? Math.max(0, Math.min(100, +e.target.value || 0)) : v))}
                      className="w-full px-1 py-1 admin-input border rounded text-center text-[12px] focus:outline-none focus:border-[var(--admin-accent)]" />
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setStats({ mode: "manual", monthly: manual })} disabled={computing} className="px-3 py-1.5 rounded-lg text-xs font-bold bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)] disabled:opacity-50">Save manual stats</button>
                <button onClick={() => setManualMode(false)} className="px-3 py-1.5 text-xs admin-muted">Cancel</button>
              </div>
            </div>
          ) : s.wind_stats ? (
            <div className="rounded-xl p-4" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
              <WindStatsChart stats={s.wind_stats} />
              <p className="text-[10px] admin-faint mt-2">Updated {s.wind_stats_at ? new Date(s.wind_stats_at).toLocaleDateString() : "—"} · {s.wind_stats.source}</p>
            </div>
          ) : (
            <p className="text-[11px] admin-faint">Set coordinates + save, then <b>Compute</b> (Open-Meteo, free) — or enter <b>Manual</b> numbers for acceleration spots the models miss.</p>
          )}
        </div>

        {/* Forecast models */}
        <div>
          <label className={labelClass}>Best forecast model(s) <span className="admin-faint font-normal">— NP7 recommendation</span></label>
          <p className="text-[11px] admin-faint mb-2">Which forecast actually nails this spot. (In most wind apps you can pick the model to display.) Members vote their own favourite too — the tally shows below.</p>
          <div className="space-y-2">
            {(["global", "highres"] as ForecastTier[]).map((tier) => (
              <div key={tier}>
                <p className="text-[10px] uppercase tracking-wide admin-faint mb-1">{FORECAST_TIER_LABEL[tier]}</p>
                <div className="flex flex-wrap gap-1.5">
                  {FORECAST_MODELS.filter((m) => m.tier === tier).map((m) => {
                    const on = models.includes(m.id);
                    return (
                      <button key={m.id} title={m.note} onClick={() => set("np7_forecast_models", on ? models.filter((x) => x !== m.id) : [...models, m.id])}
                        className="px-2.5 py-1 rounded-full text-xs font-semibold transition-colors"
                        style={on ? { backgroundColor: "var(--admin-accent)", color: "var(--admin-accent-contrast)" } : { border: "1px solid var(--admin-border)" }}>
                        {m.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {tally.length > 0 && (
            <div className="mt-3 rounded-lg p-3" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
              <p className="text-[11px] font-bold admin-muted mb-1.5">Member votes</p>
              {tally.map((t) => (
                <div key={t.model} className="flex items-center gap-2 text-xs mb-1">
                  <span className="w-24 truncate admin-muted">{t.label}</span>
                  <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: "var(--admin-border)" }}>
                    <div className="h-full rounded-full" style={{ width: `${t.pct}%`, backgroundColor: "#1f9e57" }} />
                  </div>
                  <span className="admin-faint w-16 text-right">{t.votes} · {t.pct}%</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Infrastructure tags */}
        <div>
          <label className={labelClass}>Infrastructure</label>
          <div className="flex flex-wrap gap-2">
            {INFRASTRUCTURE_TAGS.map((tag) => {
              const on = infra.includes(tag);
              return (
                <button key={tag} onClick={() => set("infrastructure", on ? infra.filter((x) => x !== tag) : [...infra, tag])}
                  className="px-3 py-1.5 rounded-full text-xs font-semibold transition-colors"
                  style={on ? { backgroundColor: "var(--admin-accent)", color: "var(--admin-accent-contrast)" } : { border: "1px solid var(--admin-border)" }}>
                  {tag}
                </button>
              );
            })}
          </div>
        </div>

        {/* NP7 ratings */}
        <div className="rounded-xl p-4" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
          <h3 className="text-sm font-bold admin-heading mb-1">NP7 rating</h3>
          <p className="text-[11px] admin-faint mb-3">Your editorial rating — shown next to the member average.</p>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
            {SPOT_CRITERIA.map((c) => (
              <StarRow key={c.key} label={c.label} hint={c.hint}
                value={(s.np7_ratings ?? {})[c.key] ?? 0}
                memberAvg={member?.byCriterion[c.key]}
                onChange={(n) => set("np7_ratings", { ...(s.np7_ratings ?? {}), [c.key]: n })} />
            ))}
          </div>
          {member && member.count > 0 && (
            <p className="text-[11px] admin-faint mt-3">Members: {member.overall.toFixed(1)} ★ avg from {member.count} rating{member.count === 1 ? "" : "s"}.</p>
          )}
        </div>

        {/* Lifecycle */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Visibility</label>
            <select className={inputClass} value={s.status} onChange={(e) => set("status", e.target.value)}>
              {["draft", "published", "hidden"].map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
            <p className="text-[11px] admin-faint mt-1">Public when <b>published</b> + verified.</p>
          </div>
          <div>
            <label className={labelClass}>Verification</label>
            <select className={inputClass} value={s.verification} onChange={(e) => set("verification", e.target.value)}>
              {(["pending", "community", "np7"] as Verification[]).map((x) => <option key={x} value={x}>{VERIFICATION_META[x].short}</option>)}
            </select>
            <p className="text-[11px] admin-faint mt-1">Set <b>NP7 verified</b> when you’ve been here.</p>
          </div>
        </div>
      </div>

      {picker && (
        <ImagePickerModal
          defaultFolder={folder}
          onSelect={(url) => {
            if (picker === "hero") set("hero_image", url);
            else set("gallery", [...gallery, url]);
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

/* ---- inline controls ---- */

function StarRow({ label, hint, value, memberAvg, onChange }: { label: string; hint: string; value: number; memberAvg?: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1" title={hint}>
      <span className="text-xs admin-muted">{label}{memberAvg ? <span className="admin-faint"> · {memberAvg.toFixed(1)}♦</span> : null}</span>
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} onClick={() => onChange(n === value ? 0 : n)} className="text-lg leading-none" style={{ color: n <= value ? "#f5a623" : "var(--admin-border)" }}>★</button>
        ))}
      </div>
    </div>
  );
}

function Windrose({ value, onChange }: { value: Record<string, string>; onChange: (w: Record<string, string>) => void }) {
  const cycle: WindQuality[] = ["", "best", "good", "no"];
  function bump(dir: string) {
    const cur = (value[dir] ?? "") as WindQuality;
    const next = cycle[(cycle.indexOf(cur) + 1) % cycle.length];
    const w = { ...value };
    if (next) w[dir] = next; else delete w[dir];
    onChange(w);
  }
  // 3×3 grid: NW N NE / W · E / SW S SE
  const grid = [["NW", "N", "NE"], ["W", "", "E"], ["SW", "S", "SE"]];
  const colorFor = (q: string) => WIND_QUALITY_META.find((m) => m.id === q)?.color ?? "var(--admin-border)";
  return (
    <div className="flex items-center gap-5 flex-wrap">
      <div className="grid grid-cols-3 gap-1.5" style={{ width: 168 }}>
        {grid.flat().map((dir, i) =>
          dir === "" ? (
            <div key={i} className="aspect-square grid place-items-center text-[10px] admin-faint">↻</div>
          ) : (
            <button key={i} onClick={() => bump(dir)} className="aspect-square rounded-lg text-xs font-bold transition-colors grid place-items-center"
              style={{ backgroundColor: value[dir] ? `${colorFor(value[dir])}26` : "transparent", border: `1px solid ${value[dir] ? colorFor(value[dir]) : "var(--admin-border)"}`, color: value[dir] ? colorFor(value[dir]) : "var(--admin-muted)" }}>
              {dir}
            </button>
          )
        )}
      </div>
      <div className="text-xs space-y-1">
        {WIND_QUALITY_META.map((m) => (
          <div key={m.id} className="flex items-center gap-2"><span className="w-3 h-3 rounded-full" style={{ backgroundColor: m.color }} /><span className="admin-muted">{m.label}</span></div>
        ))}
        <p className="admin-faint text-[11px] pt-1">Click a direction to cycle.</p>
      </div>
    </div>
  );
}
