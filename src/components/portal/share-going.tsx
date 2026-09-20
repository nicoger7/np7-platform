"use client";

import { useState } from "react";
import { ShareSheet } from "./share-sheet";

/**
 * "I'm going" — the share card for the trip a rider has just booked, rather
 * than the one they have come home from.
 *
 * Nico, 20 Sep 2026: people should get a share-ready screen saying they are
 * signed up and taking part. The moment someone books is the moment they most
 * want to tell people, and every telling is how the next rider hears of NP7.
 * It is the same generator and the same sheet as the post-trip card, so there
 * is one card design to keep: the trip's own cover photo, its name and dates,
 * and a caption they can rewrite.
 */
export function ShareGoing({ coverImage, title, sub, label = "Share that you're going" }: {
  coverImage: string | null;
  title: string;
  sub?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  if (!coverImage) return null; // no photo, no card worth posting
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full bg-white/90 hover:bg-white text-[#00374a] text-[13px] font-bold px-4 py-2 shadow-sm transition-colors"
      >
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 12v7a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-7M12 15V3M8 7l4-4 4 4" />
        </svg>
        {label}
      </button>
      {open && (
        <ShareSheet
          photo={coverImage}
          trip={{ title, sub }}
          defaultCaption="I'm in 🤙"
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
