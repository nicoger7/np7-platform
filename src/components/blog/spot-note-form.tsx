"use client";

import { useEffect, useState } from "react";
import { AuthModal } from "@/components/shared/auth-modal";
import { GUIDE_NOTE_SCOPE } from "@/lib/blog-templates";

/**
 * "Add a tip" affordance. Under a spot (spotName = the spot) or at guide level
 * (spotName = GUIDE_NOTE_SCOPE). Logged-in members get a small note form
 * (submits to /api/portal/spot-notes, lands as pending for review); logged-out
 * visitors get a prompt that opens the free signup popup.
 */
export function SpotNoteForm({ slug, spotName, accent }: { slug: string; spotName: string; accent: string }) {
  const isGuide = spotName === GUIDE_NOTE_SCOPE;
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [openForm, setOpenForm] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/portal/me")
      .then((r) => r.json())
      .then((d) => setLoggedIn(!!d.loggedIn))
      .catch(() => setLoggedIn(false));
  }, []);

  async function submit() {
    setBusy(true);
    setError("");
    const res = await fetch("/api/portal/spot-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug, spotName, body: text }),
    });
    if (res.ok) {
      setDone(true);
      setText("");
      setOpenForm(false);
    } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error ?? "Could not submit.");
    }
    setBusy(false);
  }

  if (done) return <p className="mt-4 text-[13px] font-semibold" style={{ color: accent }}>Thanks — your note is in for review. 🤙</p>;
  if (loggedIn === null) return null;

  if (!loggedIn) {
    return (
      <>
        <button onClick={() => setAuthOpen(true)} className="mt-4 text-[13px] font-bold transition-opacity hover:opacity-70" style={{ color: accent }}>
          {isGuide ? "+ Log in to share a tip" : "+ Been here? Log in to add a local tip"}
        </button>
        {authOpen && (
          <AuthModal
            source="spot_note"
            initialMode="register"
            title={isGuide ? "Share your tip" : "Add your local knowledge"}
            subtitle="Log in or join (free) to share a tip"
            onClose={() => setAuthOpen(false)}
            onLoggedIn={() => { setAuthOpen(false); setLoggedIn(true); setOpenForm(true); }}
          />
        )}
      </>
    );
  }

  if (!openForm) {
    return (
      <button onClick={() => setOpenForm(true)} className="mt-4 text-[13px] font-bold transition-opacity hover:opacity-70" style={{ color: accent }}>
        {isGuide ? "+ Add a tip" : "+ Add a local tip"}
      </button>
    );
  }

  return (
    <div className="mt-4">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        maxLength={1200}
        placeholder={isGuide ? "Share a tip about this guide — what worked for you, a gotcha, a related drill…" : "Share a tip about this spot — best wind, hazards, where to launch…"}
        className="w-full px-3.5 py-2.5 rounded-lg border border-[#dde6e9] text-[14px] text-[#00374a] outline-none focus:border-[#9aa6ac]"
      />
      {error && <p className="text-[12px] text-red-500 mt-1">{error}</p>}
      <div className="flex items-center gap-3 mt-2">
        <button onClick={submit} disabled={busy || text.trim().length < 4} className="px-4 py-2 rounded-full text-[13px] font-bold text-white disabled:opacity-50 transition-opacity" style={{ backgroundColor: accent }}>
          {busy ? "Sending…" : "Submit note"}
        </button>
        <button onClick={() => { setOpenForm(false); setText(""); }} className="text-[13px] font-semibold text-[#6a7a80]">Cancel</button>
        <span className="ml-auto text-[11px] text-[#9aa6ac]">Reviewed before it appears</span>
      </div>
    </div>
  );
}
