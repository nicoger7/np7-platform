"use client";

import { Carousel } from "./carousel";
import { useSelectedEdition } from "./selected-edition";

export type Guide = { name: string; role: string; bio: string; image: string; whatsapp?: string | null };

function waHref(v: string): string {
  const t = v.trim();
  if (/^https?:\/\//i.test(t)) return t;
  return `https://wa.me/${t.replace(/[^\d]/g, "")}`;
}

/**
 * The coaches for the week the visitor has selected in the booking block.
 * Teams differ per week (a coach might only be on Week I + II), so this follows
 * the shared selection rather than being stuck on the default week.
 */
export function CrewCarousel({
  coachesByEdition, fallback, weekLabels,
}: {
  coachesByEdition: Record<string, Guide[]>;
  fallback: Guide[];
  weekLabels: Record<string, string>;
}) {
  const { id } = useSelectedEdition();
  const hasOwnCrew = !!(id && coachesByEdition[id]?.length);
  const list = hasOwnCrew ? coachesByEdition[id!] : fallback;
  const label = id ? weekLabels[id] : undefined;
  const multiWeek = Object.keys(weekLabels).length > 1;

  return (
    <>
      {/* Only claim "for Week X" when that week genuinely has its own assigned
          crew — the fallback is another week's team, and naming the selected
          week over it would misattribute coaches on a booking surface. */}
      {multiWeek && label && hasOwnCrew && (
        <p className="text-[13.5px] text-[#5a6b72] -mt-5 mb-6">
          Your coaches for <span className="font-bold text-[#00374a]">{label}</span>
          <span className="text-[#9aa6ac]"> · pick another week above to see its team</span>
        </p>
      )}
      <Carousel label="Coaches">
        {list.map((c) => (
          <article key={c.name} className="snap-start shrink-0 w-[280px] sm:w-[320px] bg-white rounded-3xl overflow-hidden border border-[#ebebeb]">
            {/* portrait-friendly crop: faces sit in the upper third, so anchor
                the photo near the top instead of dead-centre (was cutting heads off) */}
            <div className="h-[240px] bg-cover bg-[50%_22%]" style={{ backgroundImage: `url('${c.image}')` }} />
            <div className="p-5">
              <h3 className="text-lg font-extrabold text-[#00374a]">{c.name}</h3>
              <p className="text-[11px] font-bold tracking-wide uppercase text-[#00afdb] mb-2.5">{c.role}</p>
              <p className="text-[13.5px] text-[#6a7a80] leading-relaxed">{c.bio}</p>
              {c.whatsapp && (
                <a href={waHref(c.whatsapp)} target="_blank" rel="noopener" className="inline-flex items-center gap-1.5 mt-3 text-[13px] font-bold text-[#1aa851] hover:underline">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.946C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.51 5.26l-.999 3.648 3.978-1.205zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.074-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" /></svg>
                  Chat on WhatsApp
                </a>
              )}
            </div>
          </article>
        ))}
      </Carousel>
    </>
  );
}
