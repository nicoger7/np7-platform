// QA / iteration page for the auto-branded experience tiles (BrandedTile).
// Not linked anywhere; safe to keep for tweaking. 404s in production if the
// experience surface is hidden. Delete once the feature is live + tuned.
import { BrandedTile } from "@/components/experience/branded-tile";
import { placeFromLocation, flagFromLocation } from "@/lib/experience-tile";

const NICO = "/coaches/nico.png";

const SAMPLES = [
  { location: "Alacati, Turkey", photo: "https://surfcenter-experience.com/wp-content/uploads/2025/03/21-e1741705621400.jpg", date: "17 Aug – 23 Aug 2026", price: "€1,890", spots: null as number | null, title: "NP7 Experience Alacati", desc: "Meltemi wind, flat water, and a week of pure freestyle and freeride. One…" },
  { location: "Bonaire, Caribbean", photo: "https://surfcenter-experience.com/wp-content/uploads/2025/11/Balz_Muller-5.jpg", date: "30 Nov – 6 Dec 2026", price: "€2,890", spots: 1, title: "NP7 Experience Bonaire", desc: "Trade winds, warm water, and the most consistent spot in the…" },
  { location: "Lake Garda, Italy", photo: "https://surfcenter-experience.com/wp-content/uploads/2025/04/4-5-may-768x576.jpg", date: "26 May – 31 May 2026", price: "€1,490", spots: 6, title: "NP7 Experience Lake Garda", desc: "Six days riding the Ora wind on one of Europe's most scenic lakes. Dail…" },
  { location: "Tenerife, Spain", photo: "https://surfcenter-experience.com/wp-content/uploads/2025/01/53724070151_54cd73586b_k-1536x1024.jpg", date: "Dates coming soon", price: "€3,120", spots: 4, title: "NP7 Experience Tenerife", desc: "Wave and freeride clinic on Tenerife. Atlantic swells and consistent trad…" },
];

export default function TilePreviewPage() {
  return (
    <div className="min-h-screen bg-[#0a5a78] p-8">
      <div className="max-w-[1000px] mx-auto">
        <h1 className="text-white text-xl font-bold mb-6">Tile preview (auto-branded) — for tweaking</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          {SAMPLES.map((s) => (
            <div key={s.location} className="group block bg-white rounded-[18px] overflow-hidden shadow-[0_24px_50px_rgba(0,20,30,0.28)]">
              <div className="relative h-[210px] bg-[#e9eef0] overflow-hidden">
                <BrandedTile
                  photo={s.photo}
                  place={placeFromLocation(s.location).toUpperCase()}
                  flag={flagFromLocation(s.location)}
                  coachName="Nico Prien"
                  coachCutout={NICO}
                />
                {typeof s.spots === "number" && (
                  <span className={`absolute top-3 left-3 z-20 text-[11px] font-bold px-3 py-1.5 rounded-full backdrop-blur-md ${s.spots > 0 ? "bg-white/85 text-[#00374a]" : "bg-[#f47b20] text-white"}`}>
                    {s.spots > 0 ? `${s.spots} spots left` : "Fully booked"}
                  </span>
                )}
              </div>
              <div className="p-6">
                <p className="text-[12px] font-semibold text-[#00afdb] mb-1.5">{s.date}</p>
                <h3 className="text-xl font-extrabold tracking-[-0.02em] text-[#00374a] mb-2.5">{s.title}</h3>
                <p className="text-[14px] text-[#6a7a80] leading-relaxed line-clamp-2 mb-4">{s.desc}</p>
                <div className="flex items-center justify-between pt-3 border-t border-[#f0f0f0]">
                  <span className="text-[15px] font-bold text-[#00374a]">from {s.price}</span>
                  <span className="inline-flex items-center gap-1.5 text-[12px] font-bold text-[#00afdb]">View trip →</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
