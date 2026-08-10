"use client";

import { useState } from "react";
import type { TripApplication, ApplicationStatus } from "@/lib/signature";
import { mutate, reportFailure } from "@/lib/mutate";

type App = TripApplication & { playbackUrl: string | null };

const STATUSES: ApplicationStatus[] = ["new", "shortlisted", "accepted", "declined"];
const STATUS_CLS: Record<ApplicationStatus, string> = {
  new: "bg-[#eef3f4] text-[#5a6b72]",
  shortlisted: "bg-[#fff3df] text-[#9a6b16]",
  accepted: "bg-[#e1f5ee] text-[#0f6e56]",
  declined: "bg-[#fde7e3] text-[#a5432a]",
};
const fmt = (d: string) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—");
const waLink = (p: string) => `https://wa.me/${p.replace(/[^0-9]/g, "")}`;

export function ApplicationsReview({ initial }: { initial: App[] }) {
  const [apps, setApps] = useState<App[]>(initial);
  const [filter, setFilter] = useState<ApplicationStatus | "all">("all");

  const counts = STATUSES.reduce((m, s) => ({ ...m, [s]: apps.filter((a) => a.status === s).length }), {} as Record<string, number>);
  const shown = filter === "all" ? apps : apps.filter((a) => a.status === filter);

  // Optimistic, but only until the server disagrees. The old version painted
  // the new status and then swallowed the response entirely, so an accepted
  // applicant with vetting notes could revert on reload with nothing said.
  async function patch(id: string, body: { status?: ApplicationStatus; admin_notes?: string }) {
    const before = apps;
    setApps((prev) => prev.map((a) => (a.id === id ? { ...a, ...body } : a)));
    const r = await mutate(`/api/admin/signature/${id}`, { method: "PATCH", body });
    if (!r.ok) { setApps(before); reportFailure(r); }
  }
  async function archive(id: string) {
    if (!confirm("Archive this application?")) return;
    const before = apps;
    setApps((prev) => prev.filter((a) => a.id !== id));
    const r = await mutate(`/api/admin/signature/${id}`, { method: "DELETE" });
    if (!r.ok) { setApps(before); reportFailure(r); }
  }

  return (
    <div className="max-w-[820px]">
      <h1 className="text-2xl font-black tracking-[-0.02em] text-[#0a2a33] mb-1.5">Signature Trip applications</h1>
      <p className="text-[13.5px] text-[#6a7a80] mb-5 max-w-[560px]">People who applied for an invite-only trip via the public page — watch their pitch, shortlist, and reach out personally.</p>

      <div className="flex flex-wrap gap-1.5 mb-5">
        {(["all", ...STATUSES] as const).map((s) => {
          const on = filter === s;
          return (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3.5 py-1.5 rounded-full text-[12.5px] font-bold border capitalize transition-colors ${on ? "bg-[#0aa3c7] text-white border-[#0aa3c7]" : "bg-white text-[#3a4a50] border-[#e2e9ec] hover:border-[#0aa3c7]"}`}>
              {s}{s !== "all" ? ` ${counts[s] || 0}` : ` ${apps.length}`}
            </button>
          );
        })}
      </div>

      {shown.length === 0 ? (
        <div className="rounded-2xl border border-[#e7ddcb] bg-white p-10 text-center">
          <p className="text-[15px] font-bold text-[#0a2a33]">No applications{filter !== "all" ? ` (${filter})` : " yet"}</p>
          <p className="text-[13.5px] text-[#6a7a80] mt-1">They&apos;ll appear here as people apply at /signature.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((a) => (
            <div key={a.id} className="rounded-2xl border border-[#e7ddcb] bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[16px] font-black text-[#0a2a33]">{a.name}{a.level ? <span className="text-[13px] font-semibold text-[#9aa6ac]"> · {a.level}</span> : null}</p>
                  <p className="text-[13px] text-[#6a7a80] mt-0.5">
                    <a href={`mailto:${a.email}`} className="text-[#0aa3c7] font-semibold">{a.email}</a>
                    {a.phone ? <> · <a href={waLink(a.phone)} target="_blank" rel="noopener" className="text-[#1aa851] font-semibold">{a.phone}</a></> : null}
                    <span className="text-[#b6c2c7]"> · applied {fmt(a.created_at)}</span>
                  </p>
                </div>
                <span className={`shrink-0 text-[11px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${STATUS_CLS[a.status]}`}>{a.status}</span>
              </div>

              {/* the pitch */}
              <div className="mt-3">
                {a.media_key && a.playbackUrl ? (
                  a.media_type === "audio"
                    ? <audio src={a.playbackUrl} controls className="w-full" />
                    : <video src={a.playbackUrl} controls playsInline className="w-full max-h-[320px] rounded-xl bg-black" />
                ) : (
                  <p className="text-[13px] text-[#9aa6ac] italic">No pitch clip recorded.</p>
                )}
              </div>

              {a.wants && <p className="text-[13.5px] text-[#3a4a50] mt-3"><span className="text-[#9aa6ac] font-semibold">Wants:</span> {a.wants}</p>}
              {a.motivation && <p className="text-[13.5px] text-[#3a4a50] mt-1.5"><span className="text-[#9aa6ac] font-semibold">Note:</span> {a.motivation}</p>}

              {/* actions */}
              <div className="flex flex-wrap items-center gap-1.5 mt-4 pt-3.5 border-t border-[#f0e6d6]">
                {STATUSES.map((s) => (
                  <button key={s} onClick={() => patch(a.id, { status: s })}
                    className={`px-3 py-1.5 rounded-full text-[12px] font-bold capitalize transition-colors ${a.status === s ? "bg-[#00374a] text-white" : "bg-[#f4f7f8] text-[#5a6b72] hover:bg-[#e7edee]"}`}>
                    {s}
                  </button>
                ))}
                <button onClick={() => archive(a.id)} className="ml-auto text-[12px] font-bold text-[#b6c2c7] hover:text-[#c0392b]">Archive</button>
              </div>

              <textarea
                defaultValue={a.admin_notes ?? ""}
                onBlur={(e) => { if (e.target.value !== (a.admin_notes ?? "")) patch(a.id, { admin_notes: e.target.value }); }}
                placeholder="Private notes…"
                className="w-full mt-2.5 rounded-lg border border-[#e2e9ec] px-3 py-2 text-[13px] outline-none focus:border-[#0aa3c7] resize-y min-h-[40px]" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
