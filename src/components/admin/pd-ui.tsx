"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { PdKind, PdStatus } from "@/lib/product-dev";
import { boardTitle, type BoardOrigin } from "@/lib/board-measurements";

/**
 * The Product Development look: one small kit every PD page is built from.
 *
 * Written after "I'm overwhelmed, tidy up all of the pages" (Nico, 2026-09-23).
 * Two rules come out of that sentence and everything here serves them:
 *
 *   * Colour carries meaning, and only one meaning per hue on a page: a fin is
 *     always teal, tooling is always amber, a competitor's board is always
 *     orange. You learn it once and stop reading labels.
 *   * Explanations are one line. The paragraph that used to sit above every
 *     table lives behind a small (i) instead, still one click away.
 */

// ─── Tones ───────────────────────────────────────────────────────────────────
// [light theme, dark theme]. Read through the .pd-tone class in globals.css,
// which turns them into var(--tone), var(--tone-bg) and var(--tone-line).

export type Tone =
  | "slate" | "blue" | "sky" | "teal" | "green" | "lime" | "amber"
  | "orange" | "red" | "pink" | "violet" | "indigo";

export const TONES: Record<Tone, readonly [string, string]> = {
  slate: ["#475569", "#cbd5e1"],
  blue: ["#1d4ed8", "#93c5fd"],
  sky: ["#0369a1", "#7dd3fc"],
  teal: ["#0f766e", "#5eead4"],
  green: ["#15803d", "#86efac"],
  lime: ["#4d7c0f", "#bef264"],
  amber: ["#b45309", "#fcd34d"],
  orange: ["#c2410c", "#fdba74"],
  red: ["#b91c1c", "#fca5a5"],
  pink: ["#be185d", "#f9a8d4"],
  violet: ["#6d28d9", "#c4b5fd"],
  indigo: ["#4338ca", "#a5b4fc"],
};

export function toneVars(t: Tone): CSSProperties {
  const [l, d] = TONES[t] ?? TONES.slate;
  return { "--tone-l": l, "--tone-d": d } as CSSProperties;
}

// ─── What each value looks like ──────────────────────────────────────────────

export type IconName =
  | "fin" | "board" | "foil" | "box" | "overview" | "mold" | "layers" | "steps" | "ruler" | "plan"
  | "cut" | "camera" | "note" | "folder" | "upload" | "plus" | "edit" | "archive" | "search" | "x"
  | "info" | "back" | "tag" | "fabric" | "calendar" | "flame" | "press" | "clock" | "alert" | "image"
  | "compare" | "check" | "chevron" | "paste" | "mic";

export const KIND_META: Record<PdKind, { label: string; tone: Tone; icon: IconName }> = {
  fin: { label: "Fin", tone: "teal", icon: "fin" },
  board: { label: "Board", tone: "sky", icon: "board" },
  foil: { label: "Foil", tone: "indigo", icon: "foil" },
  accessory: { label: "Accessory", tone: "slate", icon: "box" },
};

/** The pipeline, left to right. Shelved sits outside it. */
export const STATUS_STEPS: PdStatus[] = ["concept", "in_development", "tooling", "pilot", "production"];

export const STATUS_META: Record<PdStatus, { label: string; tone: Tone }> = {
  concept: { label: "Concept", tone: "slate" },
  in_development: { label: "In development", tone: "blue" },
  tooling: { label: "Tooling", tone: "amber" },
  pilot: { label: "Pilot", tone: "violet" },
  production: { label: "Production", tone: "green" },
  shelved: { label: "Shelved", tone: "slate" },
};

export const ORIGIN_META: Record<BoardOrigin, { label: string; short: string; tone: Tone }> = {
  own: { label: "Our production board", short: "Ours", tone: "green" },
  prototype: { label: "Our prototype", short: "Prototype", tone: "violet" },
  competitor: { label: "Competitor board", short: "Competitor", tone: "orange" },
  reference: { label: "Reference / borrowed", short: "Reference", tone: "slate" },
};

export const MOLD_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  planned: { label: "Planned", tone: "slate" },
  ordered: { label: "Ordered", tone: "amber" },
  in_use: { label: "In use", tone: "green" },
  shipped: { label: "Shipped", tone: "blue" },
  retired: { label: "Retired", tone: "slate" },
};

export const MOLD_KIND_META: Record<string, { label: string; tone: Tone }> = {
  blade: { label: "Blade", tone: "teal" },
  base: { label: "Base", tone: "sky" },
  shell: { label: "Shell", tone: "indigo" },
  insert: { label: "Insert", tone: "pink" },
  trim_jig: { label: "Trim jig", tone: "slate" },
};

export const METHOD_META: Record<string, { label: string; tone: Tone }> = {
  cnc_cut: { label: "CNC cut", tone: "sky" },
  prepreg_press: { label: "Prepreg press", tone: "violet" },
  wet_layup: { label: "Wet lay-up", tone: "teal" },
  infusion: { label: "Infusion", tone: "blue" },
  bonding: { label: "Bonding", tone: "amber" },
  finishing: { label: "Finishing", tone: "pink" },
  qc: { label: "QC", tone: "green" },
};

/** Tones handed out in order to things that have no meaning of their own
 *  (constructions, stacks), so neighbours never share a colour. */
export const SEQUENCE_TONES: Tone[] = ["violet", "teal", "amber", "sky", "pink", "lime", "orange", "indigo"];

// ─── Icons ───────────────────────────────────────────────────────────────────

const PATHS: Record<IconName, string[]> = {
  fin: ["M5 5h10c.6 5.6-2.2 11.2-7.2 15C8 14.8 7 9.9 5 5Z"],
  board: ["M2.5 12c0-2.6 4.4-4.6 10.2-4.6 5 0 8.8 2 8.8 4.6s-3.8 4.6-8.8 4.6C6.9 16.6 2.5 14.6 2.5 12Z", "M6.5 12h11"],
  foil: ["M12 3v12.5", "M4.5 15.5c2.6 1.6 12.4 1.6 15 0", "M9.5 20h5"],
  box: ["M12 3 4 7v10l8 4 8-4V7l-8-4Z", "M4 7l8 4 8-4", "M12 11v10"],
  overview: ["M4 4h7v7H4z", "M13 4h7v4h-7z", "M13 10h7v10h-7z", "M4 13h7v7H4z"],
  mold: ["M3 6.5h18v4.5H3z", "M3 13h18v4.5H3z", "M7.5 11v2", "M16.5 11v2"],
  layers: ["M12 3 3 7.5l9 4.5 9-4.5L12 3Z", "M3 12l9 4.5 9-4.5", "M3 16.5 12 21l9-4.5"],
  steps: ["M9.5 6H20", "M9.5 12H20", "M9.5 18H20", "M4.5 5v2", "M4 11h1.5l-1.5 2h1.5", "M4 17h1.5v2H4"],
  ruler: ["M3 16 16 3l5 5L8 21Z", "M7.5 11.5l2 2", "M10.5 8.5l2 2", "M13.5 5.5l2 2"],
  plan: ["M2.5 12c3.2-5.2 15.8-5.2 19 0-3.2 5.2-15.8 5.2-19 0Z", "M2.5 12h19"],
  cut: ["M4 8h3", "M10.5 8h3", "M17 8h3", "M4 16h3", "M10.5 16h3", "M17 16h3", "M4 8v8", "M20 8v8"],
  camera: ["M4 8h3l2-3h6l2 3h3v11H4z", "M12 16.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z"],
  note: ["M5 4h14v11.5L14.5 20H5z", "M14.5 20v-4.5H19", "M8.5 9h7", "M8.5 12.5h4"],
  folder: ["M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"],
  upload: ["M12 15.5V4", "M7 8.5 12 4l5 4.5", "M4 20h16"],
  plus: ["M12 5v14", "M5 12h14"],
  edit: ["M4 20h4L19 9l-4-4L4 16z", "M13.5 6.5l4 4"],
  archive: ["M3.5 5h17v4h-17z", "M5.5 9v10h13V9", "M10 13h4"],
  search: ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z", "M20 20l-4-4"],
  x: ["M6 6l12 12", "M18 6 6 18"],
  info: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 11v5", "M12 7.6v.4"],
  back: ["M15 6l-6 6 6 6"],
  chevron: ["M9 6l6 6-6 6"],
  tag: ["M3 12V4h8l9 9-8 8-9-9Z", "M7.5 7.5v.01"],
  fabric: ["M4 4h16v16H4z", "M4 9.3h16", "M4 14.7h16", "M9.3 4v16", "M14.7 4v16"],
  calendar: ["M4 6h16v14H4z", "M4 10h16", "M8 3v4", "M16 3v4"],
  flame: ["M12 3c.8 3.6 5 5.4 5 10a5 5 0 0 1-10 0c0-2.6 1.6-3.8 2-6 .9 1 1.6 1.8 2.6 2.2C12 7.4 11.6 5.2 12 3Z"],
  press: ["M12 3v8", "M8.5 7.5 12 11l3.5-3.5", "M4 14h16v6H4z"],
  clock: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 7.5V12l3 2"],
  alert: ["M12 4 2.5 20h19L12 4Z", "M12 10v4.5", "M12 17.2v.3"],
  image: ["M4 5h16v14H4z", "M4 16l5-5 4 4 2.5-2.5L20 17", "M15 9v.01"],
  compare: ["M4 5h7v14H4z", "M13 5h7v14h-7z"],
  check: ["M5 12.5l4.5 4.5L19 7.5"],
  paste: ["M9 4h6v3H9z", "M7 5.5H5.5V20h13V5.5H17", "M9 12h6", "M9 15.5h4"],
  mic: ["M12 3a3 3 0 0 0-3 3v5a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z", "M5.5 11a6.5 6.5 0 0 0 13 0", "M12 17.5V21"],
};

export function Icon({ name, className = "w-4 h-4", style, strokeWidth = 1.8 }: {
  name: IconName; className?: string; style?: CSSProperties; strokeWidth?: number;
}) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden>
      {PATHS[name].map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

/** A tinted square with an icon in it: the colour key of a section. */
export function IconTile({ icon, tone, size = "md" }: { icon: IconName; tone: Tone; size?: "sm" | "md" | "lg" }) {
  const box = size === "lg" ? "w-12 h-12 rounded-2xl" : size === "sm" ? "w-6 h-6 rounded-md" : "w-8 h-8 rounded-lg";
  const ico = size === "lg" ? "w-6 h-6" : size === "sm" ? "w-3.5 h-3.5" : "w-[18px] h-[18px]";
  return (
    <span className={`pd-tone ${box} shrink-0 inline-flex items-center justify-center`}
      style={{ ...toneVars(tone), backgroundColor: "var(--tone-bg)", color: "var(--tone)" }}>
      <Icon name={icon} className={ico} />
    </span>
  );
}

// ─── Chips ───────────────────────────────────────────────────────────────────

export function Chip({ tone = "slate", icon, dot, children, title, className = "", solid }: {
  tone?: Tone; icon?: IconName; dot?: boolean; children: ReactNode; title?: string; className?: string;
  /** Filled rather than tinted, for the one thing on a card that must stand out. */
  solid?: boolean;
}) {
  return (
    <span title={title}
      className={`pd-tone inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-4 whitespace-nowrap ${className}`}
      style={{
        ...toneVars(tone),
        color: solid ? "var(--admin-surface)" : "var(--tone)",
        backgroundColor: solid ? "var(--tone)" : "var(--tone-bg)",
      }}>
      {dot && <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: solid ? "var(--admin-surface)" : "var(--tone)" }} />}
      {icon && <Icon name={icon} className="w-3 h-3" strokeWidth={2.2} />}
      {children}
    </span>
  );
}

/** A plain, uncoloured chip, for facts that are not a category (brand, box type). */
export function Tag({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <span title={title} className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium leading-4 admin-muted whitespace-nowrap"
      style={{ border: "1px solid var(--admin-border)" }}>
      {children}
    </span>
  );
}

export function KindChip({ kind }: { kind: PdKind }) {
  const m = KIND_META[kind] ?? KIND_META.accessory;
  return <Chip tone={m.tone} icon={m.icon}>{m.label}</Chip>;
}

export function StatusChip({ status }: { status: PdStatus }) {
  const m = STATUS_META[status] ?? { label: status, tone: "slate" as Tone };
  return <Chip tone={m.tone} dot className={status === "shelved" ? "opacity-60" : ""}>{m.label}</Chip>;
}

export function OriginChip({ origin }: { origin: BoardOrigin }) {
  const m = ORIGIN_META[origin] ?? { short: origin, label: origin, tone: "slate" as Tone };
  return <Chip tone={m.tone} dot title={m.label}>{m.short}</Chip>;
}

/**
 * A select that looks like the chip it sets. Changing a mold from Ordered to In
 * use is one click on the colour itself, not a trip to a form.
 */
export function ChipSelect<T extends string>({ value, options, meta, onChange, title, disabled }: {
  value: T; options: readonly T[]; meta: Record<string, { label: string; tone: Tone }>;
  onChange: (v: T) => void; title?: string; disabled?: boolean;
}) {
  const m = meta[value] ?? { label: value, tone: "slate" as Tone };
  // The chip is what you see, at its own width; an invisible native select on
  // top takes the click, so the phone still gets its own picker.
  return (
    <span className="relative inline-flex rounded-full focus-within:ring-2 focus-within:ring-[var(--admin-accent-weak)]" title={title}>
      <Chip tone={m.tone} dot>
        {m.label}
        {!disabled && <Icon name="chevron" className="w-3 h-3 rotate-90 -mr-0.5" strokeWidth={2.4} />}
      </Chip>
      <select value={value} disabled={disabled} aria-label={title} onChange={(e) => onChange(e.target.value as T)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-default">
        {options.map((o) => <option key={o} value={o}>{meta[o]?.label ?? o}</option>)}
      </select>
    </span>
  );
}

/** Where a project stands, as five segments filled up to its stage. */
export function StatusTrack({ status, className = "" }: { status: PdStatus; className?: string }) {
  const at = STATUS_STEPS.indexOf(status);
  const tone = STATUS_META[status]?.tone ?? "slate";
  return (
    <span className={`pd-tone inline-flex items-center gap-[3px] ${className}`} style={toneVars(tone)}
      title={status === "shelved" ? "Shelved" : `${STATUS_META[status]?.label}: stage ${at + 1} of ${STATUS_STEPS.length}`}>
      {STATUS_STEPS.map((s, i) => (
        <span key={s} className="h-1.5 w-4 rounded-full"
          style={{ backgroundColor: i <= at ? "var(--tone)" : "var(--admin-border-strong)", opacity: i <= at ? 1 : 0.55 }} />
      ))}
    </span>
  );
}

/**
 * A board's name the way it is asked for: year, brand, model, size. A part
 * read out of the old typed name is underlined dotted and says so on hover,
 * until it is saved in its own field.
 */
export function BoardName({ board, className = "" }: {
  board: Parameters<typeof boardTitle>[0]; className?: string;
}) {
  const t = boardTitle(board);
  if (!t.year && !t.brand && !t.model && !t.size) return <span className={className}>{board.name}</span>;
  const guess = { textDecoration: "underline dotted", textUnderlineOffset: "4px", textDecorationThickness: "1px" } as CSSProperties;
  const why = "Read from the typed name. Set it on Overview, Edit details.";
  return (
    <span className={`inline-flex flex-wrap items-baseline gap-x-[0.3em] ${className}`}>
      {t.year && <span className="admin-muted tabular-nums">{t.year}</span>}
      {t.brand && <span>{t.brand}</span>}
      {t.model && <span className="font-medium" style={t.guessed.model ? guess : undefined} title={t.guessed.model ? why : undefined}>{t.model}</span>}
      {t.size && (
        <span className="pd-tone tabular-nums" title={t.guessed.size ? why : "Size"}
          style={{ ...toneVars("sky"), color: "var(--tone)", ...(t.guessed.size ? guess : {}) }}>
          {t.size}
        </span>
      )}
    </span>
  );
}

// ─── Page furniture ──────────────────────────────────────────────────────────

export type StatItem = { label: string; value: ReactNode; icon?: IconName; tone?: Tone; onClick?: () => void; title?: string };

export function Stats({ items, className = "" }: { items: StatItem[]; className?: string }) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {items.map((s) => {
        const body = (
          <>
            {s.icon && <IconTile icon={s.icon} tone={s.tone ?? "slate"} size="sm" />}
            <span className="text-sm font-bold admin-heading tabular-nums">{s.value}</span>
            <span className="text-xs admin-muted">{s.label}</span>
          </>
        );
        const cls = "flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-xl";
        const style = { border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" };
        return s.onClick ? (
          <button key={s.label} onClick={s.onClick} title={s.title}
            className={`${cls} transition-colors hover:bg-[var(--admin-surface-hover)]`} style={style}>{body}</button>
        ) : (
          <span key={s.label} title={s.title} className={cls} style={style}>{body}</span>
        );
      })}
    </div>
  );
}

export function PageHeader({ back, thumb, title, subtitle, chips, actions, stats }: {
  back?: { href: string; label: string };
  thumb?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  chips?: ReactNode;
  actions?: ReactNode;
  stats?: StatItem[];
}) {
  return (
    <header className="mb-5">
      {back && (
        <Link href={back.href} className="inline-flex items-center gap-1 text-xs font-medium admin-faint hover:text-[var(--admin-accent)] transition-colors mb-3">
          <Icon name="back" className="w-3.5 h-3.5" strokeWidth={2.2} />{back.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {thumb && <div className="shrink-0">{thumb}</div>}
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold admin-heading leading-tight">{title}</h1>
          {subtitle && <p className="text-sm admin-muted mt-0.5">{subtitle}</p>}
          {chips && <div className="flex flex-wrap items-center gap-1.5 mt-2">{chips}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 sm:shrink-0">{actions}</div>}
      </div>
      {stats && stats.length > 0 && <Stats items={stats} className="mt-4" />}
    </header>
  );
}

export type TabDef<K extends string> = { key: K; label: string; icon?: IconName; tone?: Tone; count?: number | null };

/** The tab bar: one colour per tab, the same colour its section cards use. */
export function Tabs<K extends string>({ tabs, active, onChange }: { tabs: TabDef<K>[]; active: K; onChange: (k: K) => void }) {
  return (
    <div className="mb-6 overflow-x-auto">
      <div role="tablist" className="inline-flex gap-1 p-1 rounded-xl"
        style={{ backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
        {tabs.map((t) => {
          const on = t.key === active;
          return (
            <button key={t.key} role="tab" aria-selected={on} onClick={() => onChange(t.key)}
              className={`pd-tone flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition-colors ${
                on ? "admin-heading" : "admin-muted hover:bg-[var(--admin-surface-hover)]"}`}
              style={{ ...toneVars(t.tone ?? "slate"), ...(on ? { backgroundColor: "var(--tone-bg)" } : {}) }}>
              {t.icon && <Icon name={t.icon} className="w-4 h-4" style={{ color: "var(--tone)" }} />}
              {t.label}
              {t.count != null && t.count > 0 && (
                <span className="text-[10px] font-bold tabular-nums px-1.5 rounded-full leading-4"
                  style={on ? { backgroundColor: "var(--tone)", color: "var(--admin-surface)" } : { backgroundColor: "var(--admin-border)" }}>
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** A section: a tinted icon, a title, one line of subtitle, the rest behind (i). */
export function Card({ title, icon, tone = "slate", subtitle, info, actions, children, flush, className = "", id }: {
  title?: ReactNode; icon?: IconName; tone?: Tone; subtitle?: ReactNode; info?: ReactNode;
  actions?: ReactNode; children?: ReactNode; flush?: boolean; className?: string; id?: string;
}) {
  return (
    <section id={id} className={`rounded-2xl ${className}`}
      style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
      {(title || actions) && (
        <div className="flex items-center gap-3 px-4 py-3" style={children != null ? { borderBottom: "1px solid var(--admin-border)" } : undefined}>
          {icon && <IconTile icon={icon} tone={tone} />}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h2 className="text-sm font-bold admin-heading truncate">{title}</h2>
              {info && <InfoTip>{info}</InfoTip>}
            </div>
            {subtitle && <p className="text-xs admin-faint truncate">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
        </div>
      )}
      {children != null && <div className={flush ? "" : "p-4"}>{children}</div>}
    </section>
  );
}

/** The (i): where the explanation paragraphs went. Click, not hover, so it works on a phone. */
export function InfoTip({ children, align = "left", label = "More about this" }: { children: ReactNode; align?: "left" | "right"; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);
  return (
    <span ref={ref} className="relative inline-flex">
      <button type="button" onClick={() => setOpen(!open)} aria-label={label} aria-expanded={open}
        className="inline-flex items-center justify-center w-4 h-4 rounded-full transition-colors"
        style={{ color: open ? "var(--admin-accent)" : "var(--admin-text-faint)" }}>
        <Icon name="info" className="w-4 h-4" />
      </button>
      {open && (
        <span role="dialog"
          className="absolute z-50 top-6 w-[300px] sm:w-[360px] rounded-xl p-3.5 text-xs leading-relaxed font-normal normal-case tracking-normal admin-muted block"
          style={{
            [align === "right" ? "right" : "left"]: -8,
            backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border-strong)", boxShadow: "var(--admin-shadow)",
          }}>
          {children}
        </span>
      )}
    </span>
  );
}

export function Empty({ icon, tone = "slate", title, children, action }: {
  icon: IconName; tone?: Tone; title: ReactNode; children?: ReactNode; action?: ReactNode;
}) {
  return (
    <div className="py-12 px-6 flex flex-col items-center text-center rounded-2xl"
      style={{ border: "1px dashed var(--admin-border-strong)" }}>
      <IconTile icon={icon} tone={tone} size="lg" />
      <p className="text-sm font-semibold admin-heading mt-3">{title}</p>
      {children && <p className="text-xs admin-faint mt-1 max-w-sm leading-relaxed">{children}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ─── Controls ────────────────────────────────────────────────────────────────

export const inputCls = "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none transition-colors";
export const labelCls = "block text-xs font-medium admin-muted mb-1";

const BTN = "inline-flex items-center justify-center gap-1.5 rounded-lg text-sm font-semibold whitespace-nowrap transition disabled:opacity-40 disabled:cursor-default";
export const btnPrimary = `${BTN} px-3.5 py-2 hover:brightness-110`;
export const btnPrimaryStyle: CSSProperties = { backgroundColor: "var(--admin-accent)", color: "var(--admin-accent-contrast)" };
export const btnSecondary = `${BTN} px-3 py-2 admin-heading hover:bg-[var(--admin-surface-hover)]`;
export const btnSecondaryStyle: CSSProperties = { border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" };
export const btnSmall = `${BTN} px-2.5 py-1 text-xs admin-muted hover:text-[var(--admin-accent)] hover:bg-[var(--admin-surface-hover)]`;

export function SearchBox({ value, onChange, placeholder = "Search…" }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <label className="relative block w-full max-w-xs">
      <Icon name="search" className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 admin-faint pointer-events-none" />
      <input className={`${inputCls} pl-9`} placeholder={placeholder} value={value} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

/** Filter pills with counts. Only values that exist are offered. */
export function FilterPills<K extends string>({ options, value, onChange }: {
  options: { key: K; label: string; count: number; tone?: Tone; icon?: IconName }[];
  value: K; onChange: (k: K) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = o.key === value;
        return (
          <button key={o.key} onClick={() => onChange(o.key)} aria-pressed={on}
            className="pd-tone inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold rounded-full transition-colors"
            style={{
              ...toneVars(o.tone ?? "slate"),
              ...(on
                ? { backgroundColor: "var(--tone-bg)", color: "var(--tone)", border: "1px solid var(--tone-line)" }
                : { border: "1px solid var(--admin-border)", color: "var(--admin-text-muted)" }),
            }}>
            {o.icon && <Icon name={o.icon} className="w-3.5 h-3.5" style={{ color: "var(--tone)" }} />}
            {o.label}
            <span className="tabular-nums" style={{ opacity: 0.6 }}>{o.count}</span>
          </button>
        );
      })}
    </div>
  );
}

/** "+ Add" that becomes a one-line input: Enter adds, Escape cancels. */
export function AddInline({ label, placeholder, onAdd, disabled }: {
  label: string; placeholder: string; onAdd: (value: string) => Promise<boolean> | boolean | void; disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    const v = value.trim();
    if (!v) return;
    setBusy(true);
    const ok = await onAdd(v);
    setBusy(false);
    if (ok !== false) { setValue(""); setOpen(false); }
  }
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} disabled={disabled} className={btnSmall}>
        <Icon name="plus" className="w-3.5 h-3.5" strokeWidth={2.2} />{label}
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <input autoFocus value={value} placeholder={placeholder} disabled={busy}
        className="px-2 py-1 text-xs admin-input border rounded-md w-40"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); if (e.key === "Escape") { setOpen(false); setValue(""); } }} />
      <button onClick={submit} disabled={busy || !value.trim()} className={btnSmall} title="Add">
        <Icon name="check" className="w-3.5 h-3.5" strokeWidth={2.4} />
      </button>
      <button onClick={() => { setOpen(false); setValue(""); }} className={btnSmall} title="Cancel">
        <Icon name="x" className="w-3.5 h-3.5" strokeWidth={2.2} />
      </button>
    </span>
  );
}

/** A label-over-value pair for read views. */
export function Fact({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
  const empty = value == null || value === "";
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium admin-faint">{label}</dt>
      <dd className={`text-sm font-semibold tabular-nums truncate ${empty ? "admin-faint" : tone ? "pd-tone" : "admin-heading"}`}
        style={tone && !empty ? { ...toneVars(tone), color: "var(--tone)" } : undefined}>
        {empty ? "-" : value}
      </dd>
      {hint && <p className="text-[10px] admin-faint truncate">{hint}</p>}
    </div>
  );
}

/** Save / error feedback that disappears on its own. */
export function SaveNote({ msg }: { msg: string }) {
  if (!msg) return null;
  const ok = msg === "Saved" || msg === "Saved.";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${ok ? "text-green-600" : "text-red-500"}`}>
      {ok && <Icon name="check" className="w-3.5 h-3.5" strokeWidth={2.4} />}{msg}
    </span>
  );
}
