import Link from "next/link";

/**
 * Experience ⇄ Hardware segmented switch — the toggle between NP7's two worlds.
 * `active` highlights the current sub-site. Styled to read on dark/translucent
 * headers (over the hero and the frosted ocean bar alike).
 */
export function BrandSwitch({ active }: { active: "experience" | "hardware" }) {
  return (
    <div className="flex items-center gap-0.5 bg-white/10 rounded-full p-0.5 backdrop-blur-md border border-white/15">
      <Link
        href="/experience"
        aria-current={active === "experience" ? "page" : undefined}
        className={`px-3.5 sm:px-4 py-1.5 rounded-full text-[11.5px] font-bold transition-colors ${
          active === "experience"
            ? "bg-white text-[#00374a]"
            : "text-white/70 hover:text-white"
        }`}
      >
        Experience
      </Link>
      <Link
        href="/hardware"
        aria-current={active === "hardware" ? "page" : undefined}
        className={`px-3.5 sm:px-4 py-1.5 rounded-full text-[11.5px] font-bold transition-colors ${
          active === "hardware"
            ? "bg-white text-[#00374a]"
            : "text-white/70 hover:text-white"
        }`}
      >
        Hardware
      </Link>
    </div>
  );
}
