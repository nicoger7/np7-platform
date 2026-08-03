"use client";

import { useCallback, useEffect, useState } from "react";
import type { ExperienceReport } from "@/lib/go-live";
import { GoLiveList } from "@/components/admin/go-live-checklist";

/**
 * What still stands between each trip and being sold.
 *
 * The old dashboard widget only listed experiences already public or already
 * dated, so everything actually being prepared was invisible until it was too
 * late to matter. Drafts are in; weeks that already ran are not.
 */
export default function GoLivePage() {
  const [data, setData] = useState<ExperienceReport[] | null>(null);
  // ?open=<experienceId> — the dashboard links straight at one trip, so land
  // with that card already expanded rather than on a list to hunt through.
  const [openId, setOpenId] = useState<string | null>(null);
  useEffect(() => { setOpenId(new URLSearchParams(window.location.search).get("open")); }, []);

  const load = useCallback(() => {
    fetch("/api/admin/go-live")
      .then((r) => r.json())
      .then((d) => setData(d.experiences ?? []))
      .catch(() => setData([]));
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 sm:p-8 max-w-[1000px] mx-auto">
      <h1 className="text-2xl font-bold admin-heading mb-1">Ready to sell?</h1>
      {!data ? <p className="text-sm admin-faint mt-4">Checking every trip…</p> : <GoLiveList reports={data} onRefresh={load} openId={openId} />}
    </div>
  );
}
