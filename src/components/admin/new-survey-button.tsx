"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Creates a draft survey and jumps to its editor. */
export function NewSurveyButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/surveys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Your dream windsurf holiday" }),
      });
      const j = await res.json().catch(() => ({}));
      if (res.ok && j.survey?.id) router.push(`/admin/surveys/${j.survey.id}`);
      else setBusy(false);
    } catch { setBusy(false); }
  }

  return (
    <button onClick={create} disabled={busy} className="shrink-0 rounded-full bg-[#0aa3c7] text-white text-[13.5px] font-bold px-5 py-2.5 hover:bg-[#0891b2] disabled:opacity-50 transition-colors">
      {busy ? "Creating…" : "+ New survey"}
    </button>
  );
}
