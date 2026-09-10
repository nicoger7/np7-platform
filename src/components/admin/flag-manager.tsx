"use client";

import { useState } from "react";
import ImagePickerModal from "@/components/image-picker-modal";
import { BUNDLED_FLAGS, flagSrc } from "@/lib/experience-tile";

export type CustomFlag = { id: string; code: string; name: string; src: string | null; keywords: string[] | null };

/**
 * Add a flag without asking a developer.
 *
 * Nico: "how can i add new flags without speaking to you? straight from the
 * system?" A flag used to be two commits — an SVG in /public/flags and a
 * keyword in a hardcoded list — which is exactly why he had to ask. Here it is
 * a picture from the media library plus the words it should answer to.
 *
 * The keywords are the part that does the work, and the field says so: they are
 * matched against an experience's free-text location, so "tenerife, canary" is
 * what makes a Tenerife week fly this flag on its tile, in the promo studio and
 * on the public site. When several flags match, the one whose word appears
 * earliest in the location wins — locations are written narrow to broad, so
 * that is the specific one.
 *
 * The nine bundled flags are listed too, greyed and unmanageable. They cannot
 * be edited from here (they are files in the repo), but leaving them out made
 * the dialog look like the whole flag set was three rows.
 */
export default function FlagManager({
  flags, onClose, onChanged,
}: {
  flags: CustomFlag[];
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}) {
  const [name, setName] = useState("");
  const [src, setSrc] = useState<string | null>(null);
  const [keywords, setKeywords] = useState("");
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/promo/flags", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, src, keywords }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Could not save that flag.");
      setName(""); setSrc(null); setKeywords("");
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const save = async (f: CustomFlag, patch: Record<string, unknown>) => {
    await fetch(`/api/admin/promo/flags/${f.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    }).catch(() => {});
    await onChanged();
  };

  const remove = async (f: CustomFlag) => {
    if (!confirm(`Retire the ${f.name} flag? Posters that already use it keep it; it stops being offered and stops matching new trips.`)) return;
    await fetch(`/api/admin/promo/flags/${f.id}`, { method: "DELETE" }).catch(() => {});
    await onChanged();
  };

  const field = { background: "var(--admin-input-bg,#fff)", border: "1px solid var(--admin-border,#ddd)", color: "var(--admin-text,#111)" };

  return (
    <div className="fixed inset-0 z-[90] flex" style={{ background: "rgba(4,20,26,0.62)" }} onClick={onClose}>
      <div
        className="m-auto w-[min(720px,94vw)] max-h-[88vh] flex flex-col rounded-2xl overflow-hidden"
        style={{ background: "var(--admin-bg,#fff)", border: "1px solid var(--admin-border,#ddd)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: "1px solid var(--admin-border,#ddd)" }}>
          <h2 className="text-base font-bold" style={{ color: "var(--admin-text,#111)" }}>Flags</h2>
          <button onClick={onClose} className="ml-auto px-3 py-1.5 rounded-lg text-xs font-bold"
            style={{ border: "1px solid var(--admin-border,#ddd)", color: "var(--admin-text-muted,#666)" }}>Close</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5">
          {/* -- add ------------------------------------------------------- */}
          <div className="rounded-xl p-4 flex flex-col gap-3"
            style={{ background: "var(--admin-surface,#fff)", border: "1px solid var(--admin-border,#ddd)" }}>
            <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--admin-text-muted,#666)" }}>Add a flag</span>
            <div className="flex flex-wrap items-center gap-3">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name, e.g. South Africa"
                className="px-3 py-1.5 rounded-lg text-sm flex-1 min-w-[180px]" style={field} />
              <button onClick={() => setPicking(true)} className="px-3 py-1.5 rounded-lg text-xs font-bold"
                style={{ border: "1px solid var(--admin-border,#ddd)", color: "var(--admin-text,#111)" }}>
                {src ? "Change image…" : "Choose image…"}
              </button>
              {src && <span className="w-12 h-8 rounded overflow-hidden" style={{ border: "1px solid var(--admin-border,#ddd)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt="" className="w-full h-full object-cover" />
              </span>}
            </div>
            <input value={keywords} onChange={(e) => setKeywords(e.target.value)}
              placeholder="Words in the location it should match, e.g. langebaan, cape town, south africa"
              className="px-3 py-1.5 rounded-lg text-sm w-full" style={field} />
            <div className="flex items-center gap-3">
              <span className="text-[11px] flex-1" style={{ color: "var(--admin-text-muted,#666)" }}>
                Matched against a trip&apos;s location text. The word that appears EARLIEST wins, so &ldquo;Langebaan, South Africa&rdquo; flies a Langebaan flag if one exists and the South African one otherwise.
              </span>
              <button onClick={add} disabled={busy || !name.trim() || !src}
                className="px-4 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-40"
                style={{ background: "var(--admin-accent,#00afdb)" }}>
                {busy ? "Adding…" : "Add flag"}
              </button>
            </div>
            {error && <span className="text-[11px] font-semibold" style={{ color: "#e05a3a" }}>{error}</span>}
          </div>

          {/* -- yours ------------------------------------------------------ */}
          {flags.length > 0 && (
            <div className="flex flex-col gap-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--admin-text-muted,#666)" }}>Added here</span>
              {flags.map((f) => (
                <div key={f.id} className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl"
                  style={{ background: "var(--admin-surface,#fff)", border: "1px solid var(--admin-border,#ddd)" }}>
                  <span className="w-10 h-7 rounded overflow-hidden shrink-0" style={{ border: "1px solid var(--admin-border,#ddd)" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={f.src ?? flagSrc(f.code)} alt="" className="w-full h-full object-cover" />
                  </span>
                  <input defaultValue={f.name}
                    onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== f.name) save(f, { name: v }); }}
                    className="px-2 py-1 rounded text-[13px] font-semibold w-40" style={field} />
                  <input defaultValue={(f.keywords ?? []).join(", ")}
                    onBlur={(e) => { const v = e.target.value; if (v !== (f.keywords ?? []).join(", ")) save(f, { keywords: v }); }}
                    placeholder="keywords"
                    className="px-2 py-1 rounded text-[12px] flex-1 min-w-[160px]" style={field} />
                  <button onClick={() => remove(f)} className="px-2 py-1 rounded text-xs hover:bg-red-500/10 hover:text-red-500"
                    style={{ color: "var(--admin-text-muted,#666)" }} title="Retire">✕</button>
                </div>
              ))}
            </div>
          )}

          {/* -- bundled ---------------------------------------------------- */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "var(--admin-text-muted,#666)" }}>
              Built in — edit these by adding a flag above with the same words
            </span>
            <div className="flex flex-wrap gap-2">
              {BUNDLED_FLAGS.map((f) => (
                <span key={f.code} className="flex items-center gap-2 px-2 py-1 rounded-lg text-[12px]"
                  style={{ border: "1px solid var(--admin-border,#ddd)", color: "var(--admin-text-muted,#666)" }}>
                  <span className="w-6 h-4 rounded-sm overflow-hidden" style={{ border: "1px solid var(--admin-border,#ddd)" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={flagSrc(f.code)} alt="" className="w-full h-full object-cover" />
                  </span>
                  {f.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {picking && (
        <ImagePickerModal
          defaultFolder="flags"
          onSelect={(url) => { setSrc(url); setPicking(false); }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}
