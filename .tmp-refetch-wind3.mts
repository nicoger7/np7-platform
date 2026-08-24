import { createClient } from "@supabase/supabase-js";
import { fetchWindStatsBoth } from "./src/lib/wind-stats";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
const { data: rows } = await db.from("destinations").select("id,slug,lat,lng,wind_stats").not("lat", "is", null).order("slug");

for (const d of rows ?? []) {
  const prevSource = String((d.wind_stats as { source?: string } | null)?.source ?? "");
  const primary = prevSource.includes("accelerated") ? "accelerated" as const : "standard" as const;
  let done = false;
  for (let attempt = 1; attempt <= 3 && !done; attempt++) {
    try {
      const stats = await fetchWindStatsBoth(Number(d.lat), Number(d.lng), primary);
      await db.from("destinations").update({ wind_stats: stats }).eq("id", d.id);
      const best = Math.max(...stats.months.map((m) => m.dayPct ?? 0));
      const aug = stats.months.find((m) => m.m === 8);
      console.log(`${d.slug}: ok (${primary}) — Aug ${aug?.dayPct}% Tage · bester Monat ${best}%${best < 40 ? " → BLIND, Chart versteckt" : ""}`);
      done = true;
    } catch {
      console.log(`${d.slug}: Versuch ${attempt} fehlgeschlagen — warte 75s`);
      await new Promise((r) => setTimeout(r, 75_000));
    }
  }
  await new Promise((r) => setTimeout(r, 15_000));
}
console.log("FERTIG");
