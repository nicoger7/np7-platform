import Link from "next/link";

/**
 * The one tab bar shared by the Spotguide product and the magazine sections, so
 * switching between them keeps the pills in exactly the same place (no jump).
 * "Spotguide" points at the interactive product; the rest are magazine routes.
 *
 * On a phone it is a full-width segmented bar (Nico, 6 Oct 2026). As an
 * inline pill row it ran about 20 px wider than a 375 px screen and "All
 * stories" was cut off at the edge. Full width with tighter padding fits all
 * four at 360 px and up; below that the bar scrolls sideways rather than
 * clipping, and no label ever wraps onto two lines. From sm up it is the
 * inline row it always was.
 */
export type MagazineTab = "spotguide" | "gear" | "technique" | "all";

const TABS: { key: MagazineTab; label: string; href: string }[] = [
  { key: "spotguide", label: "Spotguide", href: "/spotguide" },
  { key: "gear", label: "Gear", href: "/blog/gear" },
  { key: "technique", label: "Technique", href: "/blog/technique" },
  { key: "all", label: "All stories", href: "/blog" },
];

export function MagazineTabs({ active, accent, onAccent }: { active: MagazineTab; accent: string; onAccent: string }) {
  return (
    <div className="flex w-full max-w-full sm:inline-flex sm:w-auto items-center gap-1 p-1 rounded-full bg-white/10 backdrop-blur-sm overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
      {TABS.map((t) => {
        const on = active === t.key;
        return (
          <Link key={t.key} href={t.href} scroll={false}
            className={`flex-1 sm:flex-none text-center whitespace-nowrap px-2 sm:px-5 py-2 rounded-full text-[12.5px] sm:text-[13px] font-bold transition-colors ${on ? "" : "text-white/70 hover:text-white"}`}
            style={on ? { backgroundColor: accent, color: onAccent } : undefined}>
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
