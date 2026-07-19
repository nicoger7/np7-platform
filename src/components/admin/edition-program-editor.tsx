"use client";

import { useEffect, useState } from "react";

type Day = { title: string; description: string };

/**
 * Optional per-WEEK day-by-day. Off = this week inherits the experience's program
 * (the normal case). On = this week runs its own schedule, which the public trip
 * page shows whenever that week is selected.
 */
export function EditionProgramEditor({ editionId, fallback }: { editionId: string; fallback: Day[] }) {
  const [days, setDays] = useState<Day[] | null>(null); // null = inherit
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setLoading(true); setSaved(false);
    fetch(`/api/admin/editions/${editionId}`)
      .then((r) => r.json())
      .then((d) => setDays(Array.isArray(d?.daily_program) && d.daily_program.length ? d.daily_program : null))
      .catch(() => setDays(null))
      .finally(() => setLoading(false));
  }, [editionId]);

  async function save(next: Day[] | null) {
    setSaving(true); setSaved(false); setError("");
    try {
      const res = await fetch(`/api/admin/editions/${editionId}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daily_program: next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j.error || `Save failed (${res.status}) — your changes are NOT stored yet.`);
        return;
      }
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch {
      setError("Save failed (network) — your changes are NOT stored yet.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <p className="text-xs admin-faint">Loading this week&apos;s program…</p>;

  const custom = days !== null;
  const list = days ?? fallback;

  return (
    <div>
      <label className="flex items-start gap-3 cursor-pointer select-none max-w-[520px]">
        <input type="checkbox" checked={custom} className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--admin-accent)]"
          onChange={(e) => {
            // switching on seeds from the experience program so you edit, not retype
            const next = e.target.checked ? fallback.map((d) => ({ ...d })) : null;
            setDays(next); save(next);
          }} />
        <span>
          <span className="block text-[13px] font-bold admin-heading">This week runs its own day-by-day</span>
          <span className="block text-xs admin-faint mt-0.5 leading-relaxed">
            Off — inherits the experience&apos;s program (what most weeks do). On — seeded from it, then edit freely; only this week changes.
          </span>
        </span>
      </label>

      {custom && (
        <div className="mt-4 space-y-3">
          {list.map((d, i) => (
            <div key={i} className="admin-surface admin-border border rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[11px] font-bold uppercase tracking-wide admin-faint">Day {i + 1}</span>
                <button type="button" onClick={() => setDays(list.filter((_, j) => j !== i))}
                  className="ml-auto text-[11px] font-semibold text-[#c0392b] hover:underline">Remove</button>
              </div>
              <input value={d.title} placeholder="Title (e.g. Yacht trip + afternoon ride)"
                onChange={(e) => setDays(list.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))}
                className="admin-input w-full px-3 py-2 rounded-lg border text-sm outline-none mb-2" />
              <textarea value={d.description} rows={2} placeholder="What happens that day"
                onChange={(e) => setDays(list.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))}
                className="admin-input w-full px-3 py-2 rounded-lg border text-sm outline-none resize-y" />
            </div>
          ))}
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setDays([...list, { title: "", description: "" }])}
              className="text-[12.5px] font-semibold text-[var(--admin-accent)] hover:underline">+ Add day</button>
            <button type="button" disabled={saving} onClick={() => save(list)}
              className="ml-auto rounded-lg bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)] text-sm font-semibold px-4 py-2 disabled:opacity-50">
              {saving ? "Saving…" : "Save this week's program"}
            </button>
          </div>
        </div>
      )}
      {saved && <p className="text-[12px] font-semibold text-green-500 mt-2">Saved</p>}
      {error && <p className="text-[12px] font-semibold text-red-400 mt-2">{error}</p>}
    </div>
  );
}
