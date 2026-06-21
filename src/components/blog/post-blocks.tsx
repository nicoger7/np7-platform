import {
  type BlogTemplate,
  type WorldTheme,
  type TemplateData,
  type TemplateField,
  fieldsForSlot,
  fieldHasValue,
  asText,
  asList,
  asPairs,
  asFeatures,
  asSteps,
  asProsCons,
  asSpots,
  asOptions,
  asMatrix,
  matrixHasValue,
  type Option,
  type ComparisonMatrix,
} from "@/lib/blog-templates";
import { SpotsAccordion, type SpotNote } from "./spots-accordion";
import { SpotsMap } from "./spots-map";

/** Keys handled by the dedicated CTA band, not the generic block loop. */
const CTA_KEYS = new Set(["ctaUrl", "ctaLabel"]);

/**
 * Renders the body-slot structured fields of a template, in declared order,
 * each as a consistently styled block. Combined with the markdown body and the
 * facts strip, this is what makes every post of a kind look the same.
 */
export function PostBlocks({
  template,
  theme,
  data,
  slug,
  notesBySpot,
}: {
  template: BlogTemplate;
  theme: WorldTheme;
  data: TemplateData;
  slug?: string;
  notesBySpot?: Record<string, SpotNote[]>;
}) {
  const blocks = fieldsForSlot(template, "body").filter(
    (f) => !CTA_KEYS.has(f.key) && fieldHasValue(f, data)
  );
  if (blocks.length === 0) return null;
  return (
    <div className="space-y-10">
      {blocks.map((f) => (
        <Block key={f.key} field={f} theme={theme} data={data} slug={slug} notesBySpot={notesBySpot} />
      ))}
    </div>
  );
}

function SectionHeading({ children, accent }: { children: React.ReactNode; accent: string }) {
  return (
    <h2 className="flex items-center gap-2.5 text-[13px] font-bold uppercase tracking-[0.14em] text-[#00374a] mb-4">
      <span className="inline-block w-6 h-[3px] rounded-full" style={{ backgroundColor: accent }} />
      {children}
    </h2>
  );
}

function Block({ field, theme, data, slug, notesBySpot }: { field: TemplateField; theme: WorldTheme; data: TemplateData; slug?: string; notesBySpot?: Record<string, SpotNote[]> }) {
  const accent = theme.accent;
  const v = data[field.key];

  switch (field.kind) {
    case "textarea":
      return (
        <section>
          <SectionHeading accent={accent}>{field.label}</SectionHeading>
          <p className="text-[16px] sm:text-[17px] text-[#5a6b72] leading-relaxed whitespace-pre-line">{asText(v)}</p>
        </section>
      );

    case "callout":
      return (
        <section>
          <div
            className="rounded-2xl p-6 sm:p-7 border-l-4"
            style={{ backgroundColor: `${accent}12`, borderColor: accent }}
          >
            <div className="text-[11px] font-bold uppercase tracking-[0.14em] mb-2" style={{ color: accent }}>
              {field.label}
            </div>
            <p className="text-[17px] sm:text-[19px] font-medium italic text-[#00374a]/90 leading-relaxed whitespace-pre-line">
              {asText(v)}
            </p>
          </div>
        </section>
      );

    case "list": {
      const items = asList(v);
      const style = field.listStyle ?? "bullet";
      return (
        <section>
          <SectionHeading accent={accent}>{field.label}</SectionHeading>
          <ul className="space-y-2.5">
            {items.map((item, i) => (
              <li key={i} className="flex items-start gap-3 text-[16px] sm:text-[17px] text-[#5a6b72] leading-relaxed">
                <ListMark style={style} accent={accent} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>
      );
    }

    case "proscons": {
      const { pros, cons } = asProsCons(v);
      return (
        <section className="grid sm:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-[#d8ecdd] bg-[#f3fbf5] p-6">
            <div className="flex items-center gap-2 text-[13px] font-extrabold text-[#1f9e57] mb-3">
              <Plus /> Pros
            </div>
            <ul className="space-y-2">
              {pros.map((p, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[15px] text-[#3e5a48] leading-relaxed">
                  <Check className="text-[#1f9e57]" /> <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-[#f0dcdc] bg-[#fdf4f4] p-6">
            <div className="flex items-center gap-2 text-[13px] font-extrabold text-[#d2564f] mb-3">
              <Minus /> Cons
            </div>
            <ul className="space-y-2">
              {cons.map((c, i) => (
                <li key={i} className="flex items-start gap-2.5 text-[15px] text-[#6a4a48] leading-relaxed">
                  <Minus className="text-[#d2564f]" /> <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      );
    }

    case "pairs": {
      const pairs = asPairs(v);
      return (
        <section>
          <SectionHeading accent={accent}>{field.label}</SectionHeading>
          <dl className="rounded-2xl border border-[#ece3d3] overflow-hidden">
            {pairs.map((p, i) => (
              <div
                key={i}
                className={`flex items-center justify-between gap-4 px-5 py-3.5 ${i % 2 === 0 ? "bg-[#fdfaf3]" : "bg-white"}`}
              >
                <dt className="text-[14px] font-semibold text-[#6a7a80]">{p.label}</dt>
                <dd className="text-[15px] font-extrabold text-[#00374a] text-right">{p.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      );
    }

    case "features": {
      const features = asFeatures(v);
      return (
        <section>
          <SectionHeading accent={accent}>{field.label}</SectionHeading>
          <div className="grid sm:grid-cols-2 gap-4">
            {features.map((f, i) => (
              <div key={i} className="rounded-2xl border border-[#ece3d3] bg-white p-6">
                <div
                  className="w-9 h-9 rounded-xl grid place-items-center text-[15px] font-black mb-3"
                  style={{ backgroundColor: `${accent}1a`, color: accent }}
                >
                  {i + 1}
                </div>
                <h3 className="text-[17px] font-extrabold text-[#00374a] mb-1.5">{f.title}</h3>
                <p className="text-[14.5px] text-[#6a7a80] leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </section>
      );
    }

    case "steps": {
      const steps = asSteps(v);
      return (
        <section>
          <SectionHeading accent={accent}>{field.label}</SectionHeading>
          <ol className="space-y-6">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-4">
                <span
                  className="shrink-0 grid place-items-center w-9 h-9 rounded-full text-[15px] font-black"
                  style={{ backgroundColor: accent, color: theme.accentInk }}
                >
                  {i + 1}
                </span>
                <div className="pt-1 min-w-0 flex-1">
                  {s.title && <h3 className="text-[17px] font-extrabold text-[#00374a] mb-1">{s.title}</h3>}
                  {s.description && <p className="text-[15.5px] text-[#5a6b72] leading-relaxed whitespace-pre-line">{s.description}</p>}
                  {s.image && (
                    <figure className="mt-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={s.image} alt={s.title || `Step ${i + 1}`} className="w-full rounded-xl border border-[#ece3d3]" loading="lazy" />
                    </figure>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>
      );
    }

    case "youtube": {
      const id = youtubeId(asText(v));
      if (!id) return null;
      return (
        <section>
          <SectionHeading accent={accent}>{field.label}</SectionHeading>
          <div className="relative w-full rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: "16 / 9" }}>
            <iframe
              className="absolute inset-0 w-full h-full"
              src={`https://www.youtube-nocookie.com/embed/${id}`}
              title={field.label}
              loading="lazy"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </section>
      );
    }

    case "image": {
      const src = asText(v);
      if (!src) return null;
      return (
        <figure className="py-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt={field.label} className="w-full rounded-2xl" loading="lazy" />
        </figure>
      );
    }

    case "spots": {
      const spots = asSpots(v);
      if (spots.length === 0) return null;
      return (
        <section>
          <SectionHeading accent={accent}>
            {field.label}
            <span className="ml-1 text-[#9aa6ac]">· {spots.length}</span>
          </SectionHeading>
          <div className="mb-5">
            <SpotsMap spots={spots} accent={accent} accentInk={theme.accentInk} />
          </div>
          <SpotsAccordion spots={spots} accent={accent} slug={slug} notesBySpot={notesBySpot} />
        </section>
      );
    }

    case "options": {
      const options = asOptions(v);
      if (options.length === 0) return null;
      return (
        <section>
          <SectionHeading accent={accent}>{field.label}</SectionHeading>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {options.map((o, i) => <OptionCard key={i} option={o} />)}
          </div>
        </section>
      );
    }

    case "matrix": {
      const m = asMatrix(v);
      if (!matrixHasValue(m)) return null;
      return (
        <section>
          <SectionHeading accent={accent}>{field.label}</SectionHeading>
          <ComparisonTable matrix={m} accent={accent} />
        </section>
      );
    }

    default:
      return null;
  }
}

function OptionCard({ option }: { option: Option }) {
  return (
    <article className="rounded-2xl border border-[#ece3d3] bg-white overflow-hidden flex flex-col">
      {option.image && (
        <div className="relative h-36 bg-[#e9eef0]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={option.image} alt={option.name} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
        </div>
      )}
      <div className="p-5 flex-1">
        <h3 className="text-[18px] font-extrabold text-[#00374a]">{option.name}</h3>
        {option.bestFor && <p className="text-[13px] text-[#6a7a80] mt-1 mb-3">{option.bestFor}</p>}
        {option.pros.length > 0 && (
          <ul className="space-y-1.5 mb-3">
            {option.pros.map((p, i) => (
              <li key={i} className="flex items-start gap-2 text-[13.5px] text-[#3e5a48] leading-snug"><Check className="text-[#1f9e57]" /> <span>{p}</span></li>
            ))}
          </ul>
        )}
        {option.cons.length > 0 && (
          <ul className="space-y-1.5">
            {option.cons.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-[13.5px] text-[#6a4a48] leading-snug"><Minus className="text-[#d2564f]" /> <span>{c}</span></li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

function ComparisonTable({ matrix, accent }: { matrix: ComparisonMatrix; accent: string }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-[#ece3d3]">
      <table className="w-full border-collapse text-left min-w-[480px]">
        <thead>
          <tr>
            <th className="px-4 py-3 bg-[#fdfaf3] text-[12px] font-bold uppercase tracking-[0.08em] text-[#9aa6ac] sticky left-0" />
            {matrix.columns.map((c, i) => (
              <th key={i} className="px-4 py-3 text-[13px] font-extrabold text-white text-center" style={{ backgroundColor: accent }}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((r, ri) => (
            <tr key={ri} className={ri % 2 === 0 ? "bg-white" : "bg-[#fdfaf3]"}>
              <th className="px-4 py-3 text-[13px] font-bold text-[#00374a] whitespace-nowrap">{r.label}</th>
              {matrix.columns.map((_, ci) => (
                <td key={ci} className="px-4 py-3 text-[13.5px] text-[#5a6b72] text-center">{r.values[ci] || "—"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ---- small inline marks ---- */

function ListMark({ style, accent }: { style: "check" | "warn" | "bullet"; accent: string }) {
  if (style === "check") return <Check className="mt-1 text-[#1f9e57]" />;
  if (style === "warn") return <Warn className="mt-0.5 text-[#e0922a]" />;
  return <span className="mt-2 shrink-0 w-1.5 h-1.5 rounded-full" style={{ backgroundColor: accent }} />;
}
function Check({ className = "" }: { className?: string }) {
  return (
    <svg className={`shrink-0 w-[18px] h-[18px] ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5" /></svg>
  );
}
function Warn({ className = "" }: { className?: string }) {
  return (
    <svg className={`shrink-0 w-[18px] h-[18px] ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 9v4M12 17h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /></svg>
  );
}
function Plus() {
  return <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
}
function Minus({ className = "" }: { className?: string }) {
  return <svg className={`shrink-0 w-[18px] h-[18px] ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden="true"><path d="M5 12h14" /></svg>;
}

function youtubeId(url: string): string | null {
  if (!url) return null;
  const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([A-Za-z0-9_-]{11})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(url)) return url;
  return null;
}
