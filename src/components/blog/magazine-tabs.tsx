import Link from "next/link";

/**
 * The one tab bar shared by the Spotguide product and the magazine sections, so
 * switching between them keeps the pills in exactly the same place (no jump).
 * "Spotguide" points at the interactive product; the rest are magazine routes.
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
    <div className="inline-flex items-center gap-1 p-1 rounded-full bg-white/10 backdrop-blur-sm">
      {TABS.map((t) => {
        const on = active === t.key;
        return (
          <Link key={t.key} href={t.href} scroll={false}
            className={`px-4 sm:px-5 py-2 rounded-full text-[13px] font-bold transition-colors ${on ? "" : "text-white/70 hover:text-white"}`}
            style={on ? { backgroundColor: accent, color: onAccent } : undefined}>
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
