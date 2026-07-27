import React from "react";
import { cdnImage } from "@/lib/img";
import { ZoomImage } from "@/components/blog/zoom-image";

/**
 * Minimal markdown renderer for blog posts. Supports the subset documented in
 * the admin editor hint: ## / ### headings, **bold**, *italic*, `code`,
 * [link](url), ![image](url) on its own line, - / 1. lists, > quotes and ---
 * dividers. Builds React elements only — raw HTML in the content is rendered as
 * text, so posts can't inject script. Body typography is intentionally uniform
 * across all templates/worlds; accent variation lives in the post chrome.
 */

type Block =
  | { type: "h2" | "h3"; text: string }
  | { type: "p" | "quote"; lines: string[] }
  | { type: "ul" | "ol"; items: string[] }
  | { type: "img"; alt: string; src: string }
  | { type: "hr" };

const STRUCTURAL = /^(#{1,3}\s|>\s?|[-*]\s|\d+[.)]\s|!\[|-{3,}$|\*{3,}$)/;

function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const t = lines[i].trim();
    if (!t) { i++; continue; }
    if (/^(-{3,}|\*{3,})$/.test(t)) { blocks.push({ type: "hr" }); i++; continue; }
    const img = t.match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
    if (img) { blocks.push({ type: "img", alt: img[1], src: img[2] }); i++; continue; }
    const h = t.match(/^(#{1,3})\s+(.*)$/);
    if (h) { blocks.push({ type: h[1].length >= 3 ? "h3" : "h2", text: h[2] }); i++; continue; }
    if (/^>\s?/.test(t)) {
      const ql: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) { ql.push(lines[i].trim().replace(/^>\s?/, "")); i++; }
      blocks.push({ type: "quote", lines: ql });
      continue;
    }
    if (/^[-*]\s+/.test(t)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^[-*]\s+/, "")); i++; }
      blocks.push({ type: "ul", items });
      continue;
    }
    if (/^\d+[.)]\s+/.test(t)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^\d+[.)]\s+/, "")); i++; }
      blocks.push({ type: "ol", items });
      continue;
    }
    const pl: string[] = [];
    while (i < lines.length) {
      const cur = lines[i].trim();
      if (!cur || STRUCTURAL.test(cur)) break;
      pl.push(cur);
      i++;
    }
    blocks.push({ type: "p", lines: pl });
  }
  return blocks;
}

function safeHref(href: string): string | null {
  if (/^(https?:\/\/|mailto:|\/|#)/i.test(href)) return href;
  return null;
}

const INLINE = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\)/g;

function parseInline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let last = 0;
  let k = 0;
  let m: RegExpExecArray | null;
  INLINE.lastIndex = 0;
  while ((m = INLINE.exec(text))) {
    if (m.index > last) nodes.push(text.slice(last, m.index));
    if (m[1] != null) {
      nodes.push(<strong key={k++} className="font-bold text-[#00374a]">{m[1]}</strong>);
    } else if (m[2] != null) {
      nodes.push(<em key={k++}>{m[2]}</em>);
    } else if (m[3] != null) {
      nodes.push(<code key={k++} className="font-mono text-[14px] text-[#00374a] bg-[#00374a]/[0.06] rounded px-1.5 py-0.5">{m[3]}</code>);
    } else if (m[4] != null) {
      const href = safeHref(m[5]);
      if (href) {
        const external = /^https?:\/\//i.test(href);
        nodes.push(
          <a
            key={k++}
            href={href}
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className="text-[#00afdb] font-semibold underline underline-offset-2 decoration-[#00afdb]/40 hover:decoration-[#00afdb] transition-colors"
          >
            {m[4]}
          </a>
        );
      } else {
        nodes.push(m[4]);
      }
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function joinLines(lines: string[]): React.ReactNode[] {
  return lines.flatMap((line, i) =>
    i === 0 ? parseInline(line) : [<br key={`br-${i}`} />, ...parseInline(line)]
  );
}

export function PostBody({ content }: { content: string }) {
  const blocks = parseBlocks(content);
  return (
    <div className="space-y-5">
      {blocks.map((b, i) => {
        switch (b.type) {
          case "h2":
            return <h2 key={i} className="text-2xl sm:text-[28px] font-black tracking-[-0.02em] text-[#00374a] pt-5">{parseInline(b.text)}</h2>;
          case "h3":
            return <h3 key={i} className="text-xl font-extrabold tracking-[-0.01em] text-[#00374a] pt-3">{parseInline(b.text)}</h3>;
          case "p":
            return <p key={i} className="text-[16px] sm:text-[17px] text-[#5a6b72] leading-relaxed">{joinLines(b.lines)}</p>;
          case "quote":
            return (
              <blockquote key={i} className="border-l-[3px] border-[#00afdb] pl-5 py-1 text-[17px] sm:text-[19px] font-medium italic text-[#00374a]/85 leading-relaxed">
                {joinLines(b.lines)}
              </blockquote>
            );
          case "ul":
            return (
              <ul key={i} className="list-disc pl-6 space-y-1.5 text-[16px] sm:text-[17px] text-[#5a6b72] leading-relaxed marker:text-[#00afdb]">
                {b.items.map((item, j) => <li key={j}>{parseInline(item)}</li>)}
              </ul>
            );
          case "ol":
            return (
              <ol key={i} className="list-decimal pl-6 space-y-1.5 text-[16px] sm:text-[17px] text-[#5a6b72] leading-relaxed marker:text-[#00afdb] marker:font-bold">
                {b.items.map((item, j) => <li key={j}>{parseInline(item)}</li>)}
              </ol>
            );
          case "img":
            return (
              <figure key={i} className="py-2">
                <ZoomImage src={cdnImage(b.src, { width: 1100 })} zoomSrc={cdnImage(b.src, { width: 2000 })} alt={b.alt} />
                {b.alt && <figcaption className="text-[12px] text-[#8a9aa0] text-center mt-2.5">{b.alt}</figcaption>}
              </figure>
            );
          case "hr":
            return <hr key={i} className="border-[#e8e0d0] my-4" />;
        }
      })}
    </div>
  );
}

/** Split markdown into a free teaser (first N paragraphs) and the gated rest. */
export function splitForTeaser(content: string, paragraphs = 2): { teaser: string; hasMore: boolean } {
  const norm = content.replace(/\r\n/g, "\n").trim();
  if (!norm) return { teaser: "", hasMore: false };
  const chunks = norm.split(/\n\s*\n/);
  if (chunks.length <= paragraphs) return { teaser: norm, hasMore: false };
  return { teaser: chunks.slice(0, paragraphs).join("\n\n"), hasMore: true };
}
