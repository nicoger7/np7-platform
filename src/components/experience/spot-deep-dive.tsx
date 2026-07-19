import { SpotsList } from "@/components/spotguide/spots-list";
import { SpotguideProvider } from "@/components/spotguide/spotguide-provider";
import { getPortalUser } from "@/lib/auth";
import type { SpotguideDestination } from "@/lib/spotguide-data";

/**
 * The Spotguide deep-dive shown INSIDE the trip page's overlay (server-rendered,
 * passed as children to TripOverlay). Real spot knowledge — the spots with wind
 * stats, ratings and rider credits — without ever leaving the booking flow.
 * The full Spotguide stays one (new-tab) link away for the truly curious.
 */
export async function SpotDeepDive({ d }: { d: SpotguideDestination }) {
  // SpotsList's interactive bits (ratings, forecast votes) need the provider.
  const user = await getPortalUser().catch(() => null);
  return (
    <div>
      {/* hero strip */}
      {d.hero_image && (
        <div className="relative h-44 sm:h-60 bg-cover bg-center" style={{ backgroundImage: `url('${d.hero_image}')` }}>
          <div className="absolute inset-0 bg-gradient-to-t from-[#fff7ec] via-transparent to-transparent" />
        </div>
      )}

      <div className="px-6 sm:px-10 pt-6 pb-4">
        <p className="text-[11px] font-black uppercase tracking-[0.2em] text-[#b0791e]">The spot · from our Spotguide</p>
        <h2 className="text-3xl sm:text-5xl font-black tracking-[-0.03em] text-[#00374a] mt-2">{d.name}</h2>
        {(d.region || d.country) && (
          <p className="text-[13.5px] font-semibold text-[#6a7a80] mt-1">{[d.region, d.country].filter(Boolean).join(", ")}</p>
        )}
        {(d.tagline || d.intro) && (
          <p className="text-[15px] text-[#4a5a60] leading-relaxed mt-4 max-w-[680px] whitespace-pre-line">{d.intro || d.tagline}</p>
        )}
      </div>

      {/* the spots — the same rows the public Spotguide shows: wind stats,
          ratings, rider confirmations */}
      {d.spots.length > 0 && (
        <div className="px-4 sm:px-10 pb-4">
          <h3 className="px-2 sm:px-0 text-[13px] font-black uppercase tracking-[0.14em] text-[#9aa6ac] mb-3">The spots <span className="text-[#c3b9a6]">({d.spots.length})</span></h3>
          <SpotguideProvider destId={d.id} initialLoggedIn={!!user}>
            <SpotsList spots={d.spots} />
          </SpotguideProvider>
        </div>
      )}

      {/* the full guide stays reachable — in a NEW TAB, so the trip stays open */}
      {d.slug && (
        <p className="px-6 sm:px-10 pt-2 text-center text-[12.5px] text-[#9a8a6a]">
          Want the full guide — map, forecasts, member tips?{" "}
          <a href={`/spotguide/${d.slug}`} target="_blank" rel="noopener" className="font-bold text-[#0a7f9e] hover:underline">Open the Spotguide in a new tab ↗</a>
        </p>
      )}
    </div>
  );
}
