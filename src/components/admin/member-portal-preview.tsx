"use client";

import { useEffect, useState } from "react";
import { CHIP_CLASS, type StatusChip } from "@/lib/portal-status";
import { initialsFrom } from "@/lib/member-profile";

type Trip = {
  id: string; title: string; dateLabel: string; pkgName: string | null; priceLabel: string | null;
  statusLabel: string; statusTone: StatusChip["tone"]; tile: string | null;
};
type Preview = {
  member: { name: string | null; firstName: string; handle: string | null; avatarUrl: string | null; level: string | null; city: string | null; hasLogin: boolean };
  trips: Trip[];
  bannerImage: string | null;
};

/**
 * A read-only render of the member's own portal home (/account) — the trips they
 * see, with their tiles, statuses and profile header — shown inside admin so the
 * team can preview exactly what a member sees. Reuses the live portal data.
 */
export function MemberPortalPreview({ contactId }: { contactId: string }) {
  const [d, setD] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true); setD(null);
    fetch(`/api/admin/members/${contactId}/portal-preview`).then((r) => r.json()).then((x) => { if (alive) { setD(x.error ? null : x); setLoading(false); } });
    return () => { alive = false; };
  }, [contactId]);

  if (loading) return <p className="text-sm admin-faint py-8 text-center">Loading their view…</p>;
  if (!d) return <p className="text-sm admin-faint py-8 text-center">Couldn&apos;t load the member view.</p>;
  const m = d.member;

  return (
    <div>
      <p className="text-xs admin-faint mb-3">
        A read-only preview of what <strong className="admin-muted">{m.name || "this member"}</strong> sees on their member home.
        {!m.hasLogin && <span className="text-amber-500"> · This contact has no login yet (Guest).</span>}
      </p>

      {/* Portal frame — the member's own cream palette, isolated from admin theming. */}
      <div className="rounded-2xl overflow-hidden border" style={{ borderColor: "var(--admin-border)" }}>
        <div className="bg-[#fff7ec] p-5 sm:p-6" style={{ colorScheme: "light" }}>
          {/* banner */}
          <div className="relative rounded-2xl overflow-hidden bg-[#00374a] min-h-[140px] flex items-end p-5"
            style={d.bannerImage ? { backgroundImage: `linear-gradient(180deg, rgba(0,55,74,.15), rgba(0,55,74,.78)), url('${d.bannerImage}')`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
            <div>
              <h2 className="text-2xl font-black tracking-[-0.02em] text-white">Hey {m.firstName}</h2>
              <p className="text-[13px] text-white/75 mt-0.5">Welcome to your NP7 home — your trips, your gear and everything in between.</p>
            </div>
          </div>

          {/* profile mini-card */}
          <div className="mt-4 bg-white rounded-2xl border border-[#f0e6d6] p-4 flex items-center gap-3">
            {m.avatarUrl
              ? <span className="w-12 h-12 rounded-full bg-cover bg-center shrink-0" style={{ backgroundImage: `url('${m.avatarUrl}')` }} />
              : <span className="w-12 h-12 rounded-full bg-[#e8f6fb] text-[#00748f] grid place-items-center text-[15px] font-bold shrink-0">{initialsFrom(m.name)}</span>}
            <div className="min-w-0">
              <p className="text-[15px] font-extrabold text-[#00374a] truncate">{m.name || "Member"}</p>
              <p className="text-[12.5px] text-[#8a9aa0] truncate">
                {m.handle ? `@${m.handle}` : "no handle"}
                {m.level ? ` · ${m.level}` : ""}{m.city ? ` · ${m.city}` : ""}
              </p>
            </div>
          </div>

          {/* trips */}
          <p className="text-[11px] font-bold tracking-[0.18em] uppercase text-[#9aa6ac] mt-5 mb-2.5">
            {d.trips.length ? `Your ${d.trips.length > 1 ? "trips" : "next trip"}` : "Your trips"}
          </p>
          {d.trips.length === 0 ? (
            <div className="bg-white rounded-2xl border border-[#f0e6d6] p-6 text-center">
              <p className="text-[14px] font-bold text-[#00374a]">No trips booked yet</p>
              <p className="text-[12.5px] text-[#6a7a80] mt-0.5">They&apos;d see a prompt to explore experiences.</p>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {d.trips.map((t) => (
                <div key={t.id} className="bg-white rounded-2xl border border-[#f0e6d6] overflow-hidden">
                  <div className="relative aspect-[16/9] grid place-items-center bg-cover bg-center bg-[#e8f1f3]"
                    style={t.tile ? { backgroundImage: `url('${t.tile}')` } : undefined}>
                    {!t.tile && (
                      <svg className="w-8 h-8 text-[#b9cdd3]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" /></svg>
                    )}
                    <span className={`absolute top-2.5 right-2.5 inline-block px-2.5 py-1 rounded-full text-[10px] font-bold shadow-sm ${CHIP_CLASS[t.statusTone]}`}>{t.statusLabel}</span>
                  </div>
                  <div className="p-4">
                    <p className="text-[15px] font-extrabold text-[#00374a] leading-tight">{t.title}</p>
                    <p className="text-[12.5px] text-[#6a7a80] mt-0.5">{t.dateLabel}</p>
                    {t.pkgName && <p className="text-[12px] text-[#9aa6ac] mt-1">{t.pkgName}</p>}
                    <div className="flex items-center justify-between mt-3 pt-3 border-t border-[#f3ede2]">
                      <span className="text-[13px] font-bold text-[#00374a]">{t.priceLabel ?? ""}</span>
                      <span className="text-[11.5px] font-bold text-[#00afdb]">Manage trip →</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
