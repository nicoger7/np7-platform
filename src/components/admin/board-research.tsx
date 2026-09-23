"use client";

import { useState } from "react";
import { boardSearchQuery, type BoardResearch, type PdBoard } from "@/lib/board-measurements";
import { Card, Chip, Empty, Fact, Icon, InfoTip, SaveNote, btnPrimary, btnPrimaryStyle, btnSecondary, btnSecondaryStyle, type Tone } from "@/components/admin/pd-ui";

/**
 * The Research tab: what the web says about this board.
 *
 * One button runs Claude's web search (see the research route) and the result
 * stays on the board until the next run. Without a key the tab is still useful:
 * the search links underneath open Google, YouTube and the forums with the
 * board's name already typed in.
 */

const LINK_TONE: Record<BoardResearch["links"][number]["kind"], Tone> = {
  official: "violet", review: "teal", video: "pink", forum: "amber", shop: "slate", other: "slate",
};
const CONFIDENCE: Record<BoardResearch["confidence"], { label: string; tone: Tone }> = {
  exact: { label: "Exact match", tone: "green" },
  close: { label: "Close match", tone: "amber" },
  unsure: { label: "Not sure it is this board", tone: "red" },
};

/** The board fields a published spec may fill, and only when they are empty. */
const FILLABLE: { spec: keyof BoardResearch["specs"]; field: keyof PdBoard; label: string }[] = [
  { spec: "length_cm", field: "length_cm", label: "Length" },
  { spec: "width_cm", field: "max_width_cm", label: "Max width" },
  { spec: "volume_l", field: "volume_l", label: "Volume" },
  { spec: "weight_kg", field: "weight_kg", label: "Weight" },
  { spec: "tail_width_cm", field: "tail_width_cm", label: "Tail width" },
  { spec: "fin_box", field: "fin_box", label: "Fin box" },
  { spec: "construction", field: "construction", label: "Construction" },
];

function host(url: string | null): string | null {
  if (!url) return null;
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return null; }
}

function Source({ url }: { url: string | null }) {
  const h = host(url);
  if (!url || !h) return null;
  return (
    <a href={url} target="_blank" rel="noreferrer" className="text-[11px] admin-faint hover:text-[var(--admin-accent)] whitespace-nowrap">
      {h}
    </a>
  );
}

export function BoardResearchTab({ board, onChanged }: { board: PdBoard; onChanged: () => void }) {
  const [research, setResearch] = useState<BoardResearch | null>(board.research ?? null);
  const [at, setAt] = useState<string | null>(board.research_at ?? null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [filling, setFilling] = useState(false);
  const query = boardSearchQuery(board);

  async function run() {
    setBusy(true); setMsg("");
    const res = await fetch(`/api/admin/product-dev/boards/${board.id}/research`, { method: "POST" });
    const j = await res.json().catch(() => ({}));
    setBusy(false);
    if (j.needsKey) { setMsg(j.message); return; }
    if (!res.ok) { setMsg(j.error ?? "The search failed."); return; }
    setResearch(j.research); setAt(j.research_at); onChanged();
  }

  const fill = research
    ? FILLABLE.filter((f) => research.specs[f.spec] != null && (board[f.field] == null || board[f.field] === ""))
    : [];

  async function fillEmpty() {
    if (!research || !fill.length) return;
    setFilling(true); setMsg("");
    const patch = Object.fromEntries(fill.map((f) => [f.field, research.specs[f.spec]]));
    const res = await fetch(`/api/admin/product-dev/boards/${board.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch),
    });
    setFilling(false);
    if (res.ok) { setMsg("Saved"); onChanged(); setTimeout(() => setMsg(""), 2000); }
    else setMsg((await res.json().catch(() => ({}))).error ?? "Couldn't fill those fields.");
  }

  const searchLinks = [
    { label: "Google", href: `https://www.google.com/search?q=${encodeURIComponent(`${query} windsurf review`)}` },
    { label: "YouTube", href: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${query} windsurf`)}` },
    { label: "Forums", href: `https://www.google.com/search?q=${encodeURIComponent(`${query} forum OR seabreeze OR reddit`)}` },
    { label: "Specs", href: `https://www.google.com/search?q=${encodeURIComponent(`${query} specs length width volume`)}` },
  ];

  const header = (
    <div className="flex flex-wrap items-center gap-2 mb-5">
      <button onClick={run} disabled={busy} className={btnPrimary} style={btnPrimaryStyle}>
        <Icon name="search" className="w-4 h-4" />{busy ? "Searching the web… (up to a minute)" : research ? "Search again" : "Search the web"}
      </button>
      <span className="text-xs admin-faint">or look yourself:</span>
      {searchLinks.map((l) => (
        <a key={l.label} href={l.href} target="_blank" rel="noreferrer" className={btnSecondary} style={btnSecondaryStyle}>{l.label}</a>
      ))}
      <InfoTip align="right">
        Search the web asks Claude to find the official page, the published specs of this size, and what testers and riders say,
        each point with its source. One run costs a few cents and takes up to a minute. It needs PD_ANTHROPIC_API_KEY in Vercel.
      </InfoTip>
      <span className="ml-auto"><SaveNote msg={msg === "Saved" ? msg : ""} /></span>
    </div>
  );

  return (
    <div>
      {header}
      {msg && msg !== "Saved" && <p className="mb-4 text-xs text-amber-600 leading-relaxed">{msg}</p>}

      {!research ? (
        <Empty icon="search" tone="teal" title="Nothing looked up yet">
          Search the web finds the official specs, the pros and cons people report, and the links, all in one place.
        </Empty>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px] gap-5">
          <div className="space-y-5 min-w-0">
            <Card title={research.identified_as} icon="search" tone="teal"
              subtitle={at ? `Looked up ${new Date(at).toLocaleDateString("de-DE", { day: "2-digit", month: "short", year: "numeric" })}${research.meta ? ` · ${research.meta.searches} searches` : ""}` : undefined}
              actions={<Chip tone={CONFIDENCE[research.confidence].tone} dot>{CONFIDENCE[research.confidence].label}</Chip>}>
              <p className="text-sm admin-heading leading-relaxed">{research.summary}</p>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <Card title="Good" icon="check" tone="green" subtitle={`${research.pros.length} point${research.pros.length === 1 ? "" : "s"}`}>
                {research.pros.length === 0 ? <p className="text-xs admin-faint">Nothing reported.</p> : (
                  <ul className="space-y-2.5">
                    {research.pros.map((p, i) => (
                      <li key={i} className="flex gap-2 text-sm admin-heading leading-snug">
                        <span className="w-1.5 h-1.5 mt-1.5 rounded-full shrink-0 bg-green-600" />
                        <span className="flex-1">{p.point} <Source url={p.source_url} /></span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card title="Not so good" icon="alert" tone="orange" subtitle={`${research.cons.length} point${research.cons.length === 1 ? "" : "s"}`}>
                {research.cons.length === 0 ? <p className="text-xs admin-faint">Nothing reported.</p> : (
                  <ul className="space-y-2.5">
                    {research.cons.map((p, i) => (
                      <li key={i} className="flex gap-2 text-sm admin-heading leading-snug">
                        <span className="w-1.5 h-1.5 mt-1.5 rounded-full shrink-0 bg-orange-500" />
                        <span className="flex-1">{p.point} <Source url={p.source_url} /></span>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            {research.voices.length > 0 && (
              <Card title="What people say" icon="note" tone="amber">
                <ul className="space-y-3">
                  {research.voices.map((v, i) => (
                    <li key={i} className="text-sm leading-snug">
                      <span className="font-semibold admin-heading">{v.who}: </span>
                      <span className="admin-muted">{v.said}</span> <Source url={v.source_url} />
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {research.rd_notes.length > 0 && (
              <Card title="For the design team" icon="ruler" tone="violet">
                <ul className="space-y-1.5">
                  {research.rd_notes.map((n, i) => (
                    <li key={i} className="flex gap-2 text-sm admin-heading leading-snug">
                      <span className="w-1.5 h-1.5 mt-1.5 rounded-full shrink-0" style={{ backgroundColor: "var(--admin-accent)" }} />{n}
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>

          <div className="space-y-5 min-w-0">
            <Card title="Published specs" icon="tag" tone="sky"
              subtitle={host(research.specs.source_url) ? `from ${host(research.specs.source_url)}` : "as published"}>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                <Fact label="Length" value={research.specs.length_cm != null ? `${research.specs.length_cm} cm` : null} />
                <Fact label="Width" value={research.specs.width_cm != null ? `${research.specs.width_cm} cm` : null} />
                <Fact label="Volume" value={research.specs.volume_l != null ? `${research.specs.volume_l} l` : null} />
                <Fact label="Weight" value={research.specs.weight_kg != null ? `${research.specs.weight_kg} kg` : null} />
                <Fact label="Tail width" value={research.specs.tail_width_cm != null ? `${research.specs.tail_width_cm} cm` : null} />
                <Fact label="Fin box" value={research.specs.fin_box} />
                <Fact label="Construction" value={research.specs.construction} />
                <Fact label="Sails" value={research.specs.sail_range} />
              </dl>
              {fill.length > 0 && (
                <div className="mt-4 pt-3" style={{ borderTop: "1px solid var(--admin-border)" }}>
                  <button onClick={fillEmpty} disabled={filling} className={btnSecondary} style={btnSecondaryStyle}>
                    <Icon name="check" className="w-4 h-4" />{filling ? "Saving…" : `Copy ${fill.length} into empty fields`}
                  </button>
                  <p className="text-[11px] admin-faint mt-1.5">{fill.map((f) => f.label).join(", ")}. Fields you filled in stay as they are.</p>
                </div>
              )}
            </Card>

            <Card title="Links" icon="layers" tone="slate" subtitle={`${research.links.length} found`}>
              <ul className="space-y-2">
                {research.links.map((l, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Chip tone={LINK_TONE[l.kind] ?? "slate"}>{l.kind}</Chip>
                    <a href={l.url} target="_blank" rel="noreferrer" className="text-xs admin-heading hover:text-[var(--admin-accent)] leading-snug min-w-0 break-words">
                      {l.title}
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
