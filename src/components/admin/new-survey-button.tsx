"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Creates a draft survey and jumps to its editor. */
export function NewSurveyButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function create() {
    setBusy(true); setErr("");
    try {
      const res = await fetch("/api/admin/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Your dream windsurf holiday" }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.survey?.id) {
        router.refresh(); // invalidate the list's client cache so it's fresh on return
        router.push(`/admin/surveys/${j.survey.id}`);
      } else {
        setErr(j.error || "Couldn't create the survey. Is migration 078 applied?");
        setBusy(false);
      }
    } catch {
      setErr("Network error — please try again.");
      setBusy(false);
    }
  }

  return (
    <div className="shrink-0 text-right">
      <button onClick={create} disabled={busy} className="rounded-full bg-[#0aa3c7] text-white text-[13.5px] font-bold px-5 py-2.5 hover:bg-[#0891b2] disabled:opacity-50 transition-colors">
        {busy ? "Creating…" : "+ New survey"}
      </button>
      {err && <p className="text-[12px] text-[#c0392b] font-semibold mt-1.5 max-w-[220px]">{err}</p>}
    </div>
  );
}
