import {
  type BlogTemplate,
  type WorldTheme,
  type TemplateData,
  fieldsForSlot,
  fieldHasValue,
  asText,
  asNumber,
} from "@/lib/blog-templates";
import { BlogIcon } from "./blog-icons";

/**
 * The key-facts strip: a horizontal stat bar directly under the hero. Every
 * template fills it with its signature facts (rating, season, difficulty, …)
 * but the treatment is identical, so the blog reads consistently throughout.
 */
export function PostFacts({
  template,
  theme,
  data,
}: {
  template: BlogTemplate;
  theme: WorldTheme;
  data: TemplateData;
}) {
  const facts = fieldsForSlot(template, "facts").filter((f) => fieldHasValue(f, data));
  if (facts.length === 0) return null;

  return (
    <div className="-mt-8 sm:-mt-10 relative z-10 mb-12">
      <div className="bg-white rounded-2xl border border-[#ece3d3] shadow-[0_18px_44px_rgba(0,55,74,0.10)] overflow-hidden">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:flex lg:items-stretch divide-x divide-y sm:divide-y-0 divide-[#f0e9da]">
          {facts.map((f) => (
            <div key={f.key} className="flex-1 min-w-0 px-5 py-4 flex items-start gap-3">
              <span
                className="shrink-0 mt-0.5 grid place-items-center w-8 h-8 rounded-lg"
                style={{ backgroundColor: `${theme.accent}1a`, color: theme.accent }}
              >
                <BlogIcon name={f.factIcon ?? "tag"} className="w-[18px] h-[18px]" />
              </span>
              <div className="min-w-0">
                <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-[#9aa6ac]">{f.label}</div>
                {f.kind === "rating" ? (
                  <Stars value={asNumber(data[f.key])} accent={theme.accent} />
                ) : (
                  <div className="text-[15px] font-extrabold text-[#00374a] leading-tight mt-0.5 truncate">
                    {asText(data[f.key])}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stars({ value, accent }: { value: number; accent: string }) {
  const rounded = Math.round(value * 2) / 2;
  return (
    <div className="flex items-center gap-1 mt-1">
      <div className="flex items-center gap-0.5">
        {[1, 2, 3, 4, 5].map((n) => {
          const fill = rounded >= n ? 1 : rounded >= n - 0.5 ? 0.5 : 0;
          return (
            <span key={n} className="relative inline-block w-[15px] h-[15px]">
              <Star className="absolute inset-0 text-[#e3dccd]" />
              {fill > 0 && (
                <span className="absolute inset-0 overflow-hidden" style={{ width: fill === 0.5 ? "50%" : "100%" }}>
                  <Star className="w-[15px] h-[15px]" style={{ color: accent }} />
                </span>
              )}
            </span>
          );
        })}
      </div>
      <span className="text-[13px] font-extrabold text-[#00374a] ml-1">{value.toFixed(1)}</span>
    </div>
  );
}

function Star({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} style={style} aria-hidden="true">
      <path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8 6.8 19.3l1-5.8L3.6 9.6l5.8-.8L12 3.5z" />
    </svg>
  );
}
