import { createClient } from "@supabase/supabase-js";
import { fetchWindStatsBoth } from "./src/lib/wind-stats";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const FAILED = ["bonaire","vasiliki-bay-z67l","viana-do-castelo","emerald-sea","alacati","volosko","laghi-alimini-xz0x","paracas-bay-jkdk","norway-sandefjord-gtdo","tarifa","brouwersdam","ringkobing","tenerife","outer-banks"];

const { data: rows } = await db.from("destinations").select("id,slug,lat,lng,wind_stats").in("slug", FAILED);
console.log("Warte 90s auf Rate-Limit-Reset…");
await new Promise((r) => setTimeout(r, 90_000));

for (const d of rows ?? []) {
  const prevSource = String((d.wind_stats as { source?: string } | null)?.source ?? "");
  const primary = prevSource.includes("accelerated") ? "accelerated" as const : "standard" as const;
  let done = false;
  for (let attempt = 1; attempt <= 3 && !done; attempt++) {
    try {
      const stats = await fetchWindStatsBoth(Number(d.lat), Number(d.lng), primary);
      await db.from("destinations").update({ wind_stats: stats }).eq("id", d.id);
      const aug = stats.months.find((m) => m.m === 8);
      console.log(`${d.slug}: ok (${primary}) — Aug Stunden ${aug?.pct["4"]}% → Tage ${aug?.dayPct}%`);
      done = true;
    } catch {
      console.log(`${d.slug}: Versuch ${attempt} fehlgeschlagen — warte 60s`);
      await new Promise((r) => setTimeout(r, 60_000));
    }
  }
  await new Promise((r) => setTimeout(r, 15_000));
}
console.log("FERTIG");
