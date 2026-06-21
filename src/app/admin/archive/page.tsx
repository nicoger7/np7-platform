"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type Item = { id: string; title: string; subtitle: string; archivedAt: string | null; href: string | null };
type Group = { key: string; label: string; items: Item[] };

function fmt(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function ArchivePage() {
  const [groups, setGroups] = useState<Group[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string>("");
  const [msg, setMsg] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/admin/archive").then((r) => r.json()).then((d) => {
      setGroups(d.groups ?? []); setTotal(d.total ?? 0);
    }).finally(() => setLoading(false));
  }, []);
  useEffect(load, [load]);

  async function restore(entity: string, item: Item) {
    setBusy(item.id);
    const res = await fetch("/api/admin/archive", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity, id: item.id, action: "restore" }),
    });
    setBusy("");
    if (res.ok) { setMsg(`Restored "${item.title}"`); setTimeout(() => setMsg(""), 2500); load(); }
    else { const j = await res.json().catch(() => ({})); setMsg(j.error || "Couldn't restore."); setTimeout(() => setMsg(""), 3500); }
  }

  async function purge(entity: string, item: Item) {
    if (!confirm(`Permanently delete "${item.title}"?\n\nThis cannot be undone.`)) return;
    setBusy(item.id);
    const res = await fetch("/api/admin/archive/purge", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ entity, id: item.id }),
    });
    setBusy("");
    if (res.ok) { setMsg(`Permanently deleted "${item.title}"`); setTimeout(() => setMsg(""), 2500); load(); }
    else {
      const j = await res.json().catch(() => ({}));
      setMsg(res.status === 403 || res.status === 401 ? "Only an owner can permanently delete." : (j.error || "Couldn't delete."));
      setTimeout(() => setMsg(""), 3500);
    }
  }

  return (
    <div className="max-w-[900px]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading">Archive</h1>
          <p className="text-sm admin-muted mt-0.5">Deleted items land here first. Restore them, or — owner only — delete them for good.</p>
        </div>
        {total > 0 && <span className="text-[13px] admin-faint">{total} archived item{total === 1 ? "" : "s"}</span>}
      </div>

      {msg && <div className="mb-4 text-[13px] font-semibold text-[var(--admin-accent)]">{msg}</div>}

      {loading ? (
        <p className="text-sm admin-faint">Loading…</p>
      ) : total === 0 ? (
        <div className="admin-card p-10 text-center">
          <p className="text-sm admin-heading font-bold mb-1">Nothing archived</p>
          <p className="text-xs admin-faint max-w-sm mx-auto">When you delete an experience, contact, package and so on, it&apos;s moved here instead of being destroyed — so you can always get it back.</p>
        </div>
      ) : (
        <div className="space-y-7">
          {groups.map((g) => (
            <div key={g.key}>
              <h2 className="text-[11px] font-bold tracking-[0.14em] uppercase admin-faint mb-2.5">{g.label} ({g.items.length})</h2>
              <div className="grid gap-2">
                {g.items.map((item) => (
                  <div key={item.id} className="admin-card px-5 py-3.5 flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {item.href
                          ? <Link href={item.href} className="font-semibold admin-heading truncate hover:text-[var(--admin-accent)]">{item.title}</Link>
                          : <span className="font-semibold admin-heading truncate">{item.title}</span>}
                      </div>
                      <span className="text-xs admin-faint">{item.subtitle ? `${item.subtitle} · ` : ""}archived {fmt(item.archivedAt)}</span>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <button onClick={() => restore(g.key, item)} disabled={busy === item.id} className="text-[12px] font-bold text-[var(--admin-accent)] hover:underline disabled:opacity-50">Restore</button>
                      <button onClick={() => purge(g.key, item)} disabled={busy === item.id} className="text-[12px] font-semibold text-red-400 hover:text-red-500 disabled:opacity-50">Delete forever</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
