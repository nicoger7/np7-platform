"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

/**
 * The duplicate review queue.
 *
 * Candidates are matched by name (email matching was measured first: 2 groups
 * in 14,723 contacts — useless), the survivor defaults to the account row, and
 * nothing merges without a click per pair. A wrong merge entangles two real
 * people's history, so this errs hard toward showing everything and deciding
 * nothing.
 */

type Member = {
  id: string; name: string | null; email: string | null; email2: string | null;
  phone: string | null; country: string | null; createdAt: string; source: string | null;
  hasAccount: boolean; bookings: number; maillist: boolean;
};
type Group = { key: string; members: Member[]; suggestedSurvivor: string };

const fmt = (d: string) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

export default function DuplicatesPage() {
  const [groups, setGroups] = useState<Group[] | null>(null);
  const [survivor, setSurvivor] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<Record<string, string>>({});

  const load = useCallback(() => {
    fetch("/api/admin/contacts/duplicates")
      .then((r) => r.json())
      .then((d) => {
        setGroups(d.groups ?? []);
        const s: Record<string, string> = {};
        for (const g of (d.groups ?? []) as Group[]) s[g.key] = g.suggestedSurvivor;
        setSurvivor((prev) => ({ ...s, ...prev }));
      })
      .catch(() => setGroups([]));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function merge(g: Group, mergedId: string) {
    const survivorId = survivor[g.key] ?? g.suggestedSurvivor;
    const surv = g.members.find((m) => m.id === survivorId);
    const dupe = g.members.find((m) => m.id === mergedId);
    if (!surv || !dupe) return;
    if (!confirm(`Merge "${dupe.name ?? dupe.email}" into "${surv.name ?? surv.email}"?\n\nEverything moves to the surviving record — bookings, payments, mail history — and every email address is kept. The duplicate is archived, not deleted.`)) return;
    setBusy(mergedId);
    setMsg((p) => ({ ...p, [g.key]: "" }));
    try {
      const r = await fetch("/api/admin/contacts/duplicates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ survivorId, mergedId }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setMsg((p) => ({ ...p, [g.key]: j.error ?? "Merge failed." })); return; }
      setMsg((p) => ({ ...p, [g.key]: "Merged." }));
      load();
    } catch {
      setMsg((p) => ({ ...p, [g.key]: "Merge failed." }));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="p-6 sm:p-8 max-w-[1000px] mx-auto">
      <div className="mb-1 flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold admin-heading">Duplicate contacts</h1>
        {groups && <span className="text-sm admin-faint">{groups.length} group{groups.length === 1 ? "" : "s"}</span>}
      </div>
      <p className="text-sm admin-muted max-w-[68ch] mb-6">
        Same person, several records — matched by name, since the same guest rarely re-books with the same
        email. Pick who survives (the member-account row is pre-picked; it always has priority), then merge
        the others into it. Bookings, payments and mail history move; every email address is kept on the
        surviving record; the duplicate is archived, never deleted.
      </p>

      {!groups ? (
        <p className="text-sm admin-faint">Looking for duplicates…</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-green-500">No duplicate candidates. Clean.</p>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => {
            const chosen = survivor[g.key] ?? g.suggestedSurvivor;
            return (
              <div key={g.key} className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
                <div className="px-4 py-2.5 flex items-center gap-3" style={{ borderBottom: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface-hover)" }}>
                  <span className="flex-1 text-[13.5px] font-bold admin-heading capitalize">{g.key}</span>
                  <span className="text-[11.5px] admin-faint">{g.members.length} records</span>
                  {msg[g.key] && (
                    <span className={`text-[12px] font-semibold ${msg[g.key] === "Merged." ? "text-green-500" : "text-red-400"}`}>{msg[g.key]}</span>
                  )}
                </div>

                {g.members.map((m, i) => {
                  const isSurvivor = m.id === chosen;
                  return (
                    <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-[13px]"
                      style={{ borderTop: i ? "1px solid var(--admin-border)" : undefined }}>
                      <label className="flex items-center gap-2 shrink-0 cursor-pointer" title="Survives — everything merges into this record">
                        <input type="radio" name={`surv-${g.key}`} checked={isSurvivor}
                          onChange={() => setSurvivor((p) => ({ ...p, [g.key]: m.id }))}
                          className="accent-[var(--admin-accent)]" />
                        <span className="text-[11px] font-bold admin-faint w-14">{isSurvivor ? "keeps all" : ""}</span>
                      </label>

                      <span className="flex-1 min-w-0">
                        <span className="flex items-center gap-2 flex-wrap">
                          <Link href={`/admin/contacts?open=${m.id}`} className="font-semibold admin-heading hover:text-[#0aa3c7] truncate">{m.name ?? "—"}</Link>
                          {m.hasAccount && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-green-500/15 text-green-500">account</span>}
                          {m.maillist && <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded admin-surface admin-faint">maillist</span>}
                        </span>
                        <span className="block text-[11.5px] admin-faint truncate">
                          {[m.email, m.email2, m.phone, m.country].filter(Boolean).join(" · ") || "no contact details"}
                        </span>
                      </span>

                      <span className="shrink-0 text-right text-[11.5px] admin-faint w-28">
                        <span className={`block ${m.bookings > 0 ? "admin-heading font-semibold" : ""}`}>{m.bookings} booking{m.bookings === 1 ? "" : "s"}</span>
                        <span className="block">{fmt(m.createdAt)}</span>
                      </span>

                      {!isSurvivor && (
                        <button onClick={() => merge(g, m.id)} disabled={busy === m.id}
                          className="shrink-0 text-[12px] font-bold px-3 py-1.5 rounded-lg text-[#0aa3c7] hover:bg-[var(--admin-surface-hover)] disabled:opacity-50 transition-colors"
                          style={{ border: "1px solid var(--admin-border)" }}>
                          {busy === m.id ? "Merging…" : "Merge into survivor"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}

      <p className="text-xs admin-faint mt-5 max-w-[64ch]">
        Records that can&apos;t be told apart by a human stay here untouched — same name is not proof of same
        person. A merge is logged with a full snapshot, so it can be unpicked by hand if one ever turns out wrong.
      </p>
    </div>
  );
}
