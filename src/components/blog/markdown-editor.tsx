"use client";

import { useRef, useState } from "react";
import ImagePickerModal from "@/components/image-picker-modal";
import { PostBody } from "@/components/blog/post-body";

/**
 * The magazine content editor: a Markdown textarea with a formatting toolbar, a
 * Write ⇄ Preview toggle that renders the EXACT public `PostBody`, and an
 * "insert photo" button that drops `![](url)` from the media library at the
 * caret. Everything writes plain Markdown back through `onChange`, so the stored
 * content is unchanged — this is purely a nicer way to author it.
 */
export function MarkdownEditor({
  value,
  onChange,
  rows = 22,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  rows?: number;
  placeholder?: string;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<"write" | "preview">("write");
  const [picker, setPicker] = useState(false);

  function restore(selStart: number, selEnd: number) {
    requestAnimationFrame(() => {
      const ta = ref.current;
      if (!ta) return;
      ta.focus();
      ta.setSelectionRange(selStart, selEnd);
    });
  }

  /** Wrap the selection (or a placeholder) in `token` on both sides. */
  function wrap(token: string, placeholder: string) {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = value.slice(start, end) || placeholder;
    const next = value.slice(0, start) + token + sel + token + value.slice(end);
    onChange(next);
    restore(start + token.length, start + token.length + sel.length);
  }

  /** Insert a [label](url) link, selecting the url so it's easy to paste over. */
  function link() {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const label = value.slice(start, end) || "link text";
    const inserted = `[${label}](url)`;
    const next = value.slice(0, start) + inserted + value.slice(end);
    onChange(next);
    const urlStart = start + 1 + label.length + 2;
    restore(urlStart, urlStart + 3);
  }

  /** Prefix every line touched by the selection (headings, quotes, bullet/numbered lists). */
  function linePrefix(prefix: string, numbered = false) {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const lineStart = value.lastIndexOf("\n", start - 1) + 1;
    let lineEnd = value.indexOf("\n", end);
    if (lineEnd === -1) lineEnd = value.length;
    const lines = value.slice(lineStart, lineEnd).split("\n");
    const out = lines
      .map((ln, i) => {
        const p = numbered ? `${i + 1}. ` : prefix;
        return ln.startsWith(p) ? ln : p + ln.replace(/^(#{1,3}\s|>\s?|[-*]\s|\d+[.)]\s)/, "");
      })
      .join("\n");
    const next = value.slice(0, lineStart) + out + value.slice(lineEnd);
    onChange(next);
    restore(lineStart, lineStart + out.length);
  }

  /** Drop a block (image, divider) on its own line, padded by blank lines. */
  function insertBlock(md: string) {
    const ta = ref.current;
    const start = ta ? ta.selectionStart : value.length;
    const end = ta ? ta.selectionEnd : value.length;
    const before = value.slice(0, start);
    const after = value.slice(end);
    const nb = before && !before.endsWith("\n\n") ? (before.endsWith("\n") ? "\n" : "\n\n") : "";
    const na = after && !after.startsWith("\n\n") ? (after.startsWith("\n") ? "\n" : "\n\n") : "";
    const next = before + nb + md + na + after;
    onChange(next);
    const caret = before.length + nb.length + md.length;
    restore(caret, caret);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!(e.metaKey || e.ctrlKey)) return;
    const k = e.key.toLowerCase();
    if (k === "b") { e.preventDefault(); wrap("**", "bold text"); }
    else if (k === "i") { e.preventDefault(); wrap("*", "italic text"); }
    else if (k === "k") { e.preventDefault(); link(); }
  }

  const btn =
    "h-8 min-w-8 px-2 grid place-items-center rounded-md text-[12.5px] font-bold admin-muted hover:admin-heading hover:bg-[var(--admin-surface-hover)] transition-colors";

  return (
    <div className="admin-border border rounded-xl overflow-hidden admin-surface">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 border-b admin-border flex-wrap">
        <button type="button" title="Bold (⌘B)" className={`${btn} font-black`} onClick={() => wrap("**", "bold text")}>B</button>
        <button type="button" title="Italic (⌘I)" className={`${btn} italic`} onClick={() => wrap("*", "italic text")}>I</button>
        <span className="w-px h-5 bg-[var(--admin-border)] mx-1" />
        <button type="button" title="Heading" className={btn} onClick={() => linePrefix("## ")}>H2</button>
        <button type="button" title="Subheading" className={btn} onClick={() => linePrefix("### ")}>H3</button>
        <span className="w-px h-5 bg-[var(--admin-border)] mx-1" />
        <button type="button" title="Link (⌘K)" className={btn} onClick={link}>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" /></svg>
        </button>
        <button type="button" title="Bullet list" className={btn} onClick={() => linePrefix("- ")}>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 6h13M8 12h13M8 18h13" /><circle cx="3.5" cy="6" r="1.2" fill="currentColor" stroke="none" /><circle cx="3.5" cy="12" r="1.2" fill="currentColor" stroke="none" /><circle cx="3.5" cy="18" r="1.2" fill="currentColor" stroke="none" /></svg>
        </button>
        <button type="button" title="Numbered list" className={btn} onClick={() => linePrefix("", true)}>1.</button>
        <button type="button" title="Quote" className={btn} onClick={() => linePrefix("> ")}>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h4v6c0 2.2-1.8 4-4 4v-2c1.1 0 2-.9 2-2H7V7zm8 0h4v6c0 2.2-1.8 4-4 4v-2c1.1 0 2-.9 2-2h-2V7z" /></svg>
        </button>
        <button type="button" title="Divider" className={btn} onClick={() => insertBlock("---")}>―</button>
        <span className="w-px h-5 bg-[var(--admin-border)] mx-1" />
        <button type="button" title="Insert photo from library" className={`${btn} gap-1.5 !px-2.5 text-[#0aa3c7]`} onClick={() => setPicker(true)}>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="9" cy="9" r="2" /><path d="M21 15l-5-5L5 21" /></svg>
          Photo
        </button>

        {/* Write / Preview toggle */}
        <div className="ml-auto flex items-center gap-0.5 p-0.5 rounded-lg" style={{ backgroundColor: "var(--admin-bg)" }}>
          {(["write", "preview"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`px-3 py-1 rounded-md text-[12px] font-bold capitalize transition-colors ${mode === m ? "bg-[#0aa3c7] text-white" : "admin-muted hover:admin-heading"}`}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {mode === "write" ? (
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          rows={rows}
          placeholder={placeholder}
          className="admin-input w-full px-4 py-3 text-sm outline-none resize-y leading-relaxed bg-transparent border-0 block"
        />
      ) : (
        <div className="bg-[#fff7ec] px-5 sm:px-8 py-6 min-h-[300px] max-h-[70vh] overflow-auto">
          {value.trim() ? (
            <PostBody content={value} />
          ) : (
            <p className="text-[15px] text-[#8a9aa0] italic">Nothing to preview yet — write something in the Write tab.</p>
          )}
        </div>
      )}

      {picker && (
        <ImagePickerModal
          onSelect={(url) => {
            insertBlock(`![](${url})`);
            setPicker(false);
          }}
          onClose={() => setPicker(false)}
        />
      )}
    </div>
  );
}
