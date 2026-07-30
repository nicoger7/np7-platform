"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { hasAuthCookie } from "@/lib/has-auth-cookie";

/**
 * Members-only strip at the very bottom of the spotguide index: rider-proposed
 * areas still collecting their 3 confirms. Anonymous visitors get nothing
 * (the API 401s); the guide itself stays clean of unverified places.
 */
type Proposed = { id: string; name: string; slug: string | null; region: string | null; country: string | null; confirms: number; spots: number; mine: boolean };

export function ProposedAreas({ accent = "#00afdb", section = "experience" }: { accent?: string; section?: string }) {
  const [items, setItems] = useState<Proposed[]>([]);

  useEffect(() => {
    // The endpoint 401s for anonymous visitors, who are almost everyone here —
    // don't spend a server invocation to be told that.
    if (!hasAuthCookie()) return;
    fetch("/api/portal/spotguide/proposed")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setItems(d?.proposed ?? []))
      .catch(() => {});
  }, []);

  if (items.length === 0) return null;

  return (
    <section className="mt-12 rounded-2xl border-2 border-dashed border-[#e2d0a8] bg-[#fdf8ee] p-5 sm:p-6">
      <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[#b0791e]">Proposed by riders — help make them official</p>
      <p className="text-[13px] text-[#6a7a80] mt-1.5">New areas members added. Know one? Open it and confirm — <b>3 rider confirms</b> (or one verified spot) put it in the guide.</p>
      <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((p) => (
          // proposed areas live on their own members-only, uncached route —
          // /spotguide/[slug] is prerendered and cannot resolve a viewer
          <Link key={p.id} href={`/spotguide/proposed/${p.slug}?from=${section}`}
            className="group rounded-xl border border-[#ece3d3] bg-white px-4 py-3 hover:-translate-y-0.5 hover:shadow-[0_10px_26px_rgba(120,90,20,0.10)] transition-all">
            <p className="text-[15px] font-extrabold text-[#00374a] group-hover:underline">{p.name}</p>
            <p className="text-[12px] text-[#8a7a58]">{[p.region, p.country].filter(Boolean).join(", ") || "—"}</p>
            <p className="text-[12px] font-bold mt-1.5" style={{ color: accent }}>
              {p.confirms}/3 confirms · {p.spots} spot{p.spots === 1 ? "" : "s"}{p.mine ? " · yours" : ""}
            </p>
          </Link>
        ))}
      </div>
    </section>
  );
}
