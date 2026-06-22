"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Lightweight WYSIWYG editor for email bodies — write formatted text without
 * touching HTML. Produces semantic HTML (p / strong / em / a / ul / ol / li);
 * the email renderer inlines the email-safe styles on send + in the preview.
 * A "Source" toggle stays available for power edits.
 */
export function RichTextEditor({
  value,
  onChange,
  vars = [],
  placeholder = "Write your message…",
  seamless = false,
  minHeight = 300,
}: {
  value: string;
  onChange: (html: string) => void;
  vars?: [string, string][];
  placeholder?: string;
  /** Drop the outer border/radius so it blends into a surrounding frame (e.g. the email canvas). */
  seamless?: boolean;
  /** Min height of the editable area in px. */
  minHeight?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const last = useRef<string>("");
  const [source, setSource] = useState(false);
  // Our own undo/redo history (snapshots of the HTML). execCommand("undo") is
  // unreliable and can bubble to the browser (reopening tabs), so we never use it.
  const hist = useRef<string[]>([]);
  const ptr = useRef<number>(-1);

  // Seed the undo baseline once on mount (covers a brand-new, empty editor).
  useEffect(() => {
    if (hist.current.length === 0) { hist.current = [value || ""]; ptr.current = 0; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync external value into the editable area without clobbering the caret. An
  // external change (e.g. loading a template) resets the undo history to it.
  useEffect(() => {
    if (source) return;
    const el = ref.current;
    if (el && value !== last.current && value !== el.innerHTML) {
      el.innerHTML = value || "";
      last.current = value;
      hist.current = [value || ""];
      ptr.current = 0;
    }
  }, [value, source]);

  function record(html: string) {
    if (hist.current[ptr.current] === html) return;
    hist.current.splice(ptr.current + 1); // drop any redo branch
    hist.current.push(html);
    ptr.current = hist.current.length - 1;
  }
  function emit() {
    const el = ref.current;
    if (!el) return;
    last.current = el.innerHTML;
    record(el.innerHTML);
    onChange(el.innerHTML);
  }
  function applyHistory(html: string) {
    const el = ref.current;
    if (el) el.innerHTML = html;
    last.current = html;
    onChange(html);
  }
  function undo() {
    if (ptr.current <= 0) return;
    ptr.current -= 1;
    applyHistory(hist.current[ptr.current]);
  }
  function redo() {
    if (ptr.current >= hist.current.length - 1) return;
    ptr.current += 1;
    applyHistory(hist.current[ptr.current]);
  }
  function cmd(command: string, arg?: string) {
    ref.current?.focus();
    document.execCommand(command, false, arg);
    emit();
  }
  function addLink() {
    const url = window.prompt("Link to (https://… or a {{variable}})");
    if (url) cmd("createLink", url);
  }
  function insertButton() {
    const label = window.prompt("Button text", "View my trip");
    if (!label) return;
    const url = window.prompt("Button links to (https://… or a {{variable}})", "{{bookingLink}}");
    if (!url) return;
    ref.current?.focus();
    // A pill-style CTA — inline styles so it survives email clients as-is.
    document.execCommand(
      "insertHTML",
      false,
      `<p style="margin:20px 0;"><a href="${url}" style="display:inline-block;background:#00afdb;color:#ffffff;font-weight:700;text-decoration:none;border-radius:999px;padding:13px 28px;">${label.replace(/</g, "&lt;")}</a></p><p>&nbsp;</p>`
    );
    emit();
  }
  function insertVar(token: string) {
    ref.current?.focus();
    document.execCommand("insertText", false, `{{${token}}}`);
    emit();
  }

  const btn = "h-7 min-w-7 px-1.5 grid place-items-center rounded-md text-[13px] admin-muted hover:text-[var(--admin-accent)] hover:bg-[var(--admin-surface-hover)] transition-colors";
  const sep = <span className="mx-1 w-px h-4 self-center shrink-0" style={{ background: "var(--admin-border)" }} />;

  return (
    <div className={seamless ? "overflow-hidden" : "rounded-lg overflow-hidden"} style={seamless ? undefined : { border: "1px solid var(--admin-border)" }}>
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 sticky top-0 z-10" style={{ borderBottom: "1px solid var(--admin-border)", background: "var(--admin-surface)" }}>
        <button type="button" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={undo} title="Undo" aria-label="Undo">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-1" /></svg>
        </button>
        <button type="button" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={redo} title="Redo" aria-label="Redo">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 14 5-5-5-5" /><path d="M20 9H9a5 5 0 0 0 0 10h1" /></svg>
        </button>
        {sep}
        <button type="button" className={`${btn} font-bold`} onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("bold")} title="Bold">B</button>
        <button type="button" className={`${btn} italic`} onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("italic")} title="Italic">I</button>
        <button type="button" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={addLink} title="Add link" aria-label="Add link">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" /><path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" /></svg>
        </button>
        {sep}
        <button type="button" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("formatBlock", "h2")} title="Heading">H</button>
        <button type="button" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("insertUnorderedList")} title="Bulleted list" aria-label="Bulleted list">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /></svg>
        </button>
        <button type="button" className={btn} onMouseDown={(e) => e.preventDefault()} onClick={() => cmd("insertOrderedList")} title="Numbered list">1.</button>
        {sep}
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={insertButton} title="Insert a call-to-action button"
          className="h-7 px-2 rounded-md text-[11px] font-bold admin-muted hover:text-[var(--admin-accent)] hover:bg-[var(--admin-surface-hover)] transition-colors">+ Button</button>
        {vars.length > 0 && sep}
        {vars.map(([token, label]) => (
          <button key={token} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => insertVar(token)} title={`Insert {{${token}}}`}
            className="h-7 px-2 rounded-md text-[11px] font-semibold admin-muted hover:text-[var(--admin-accent)] hover:bg-[var(--admin-surface-hover)] transition-colors">+ {label}</button>
        ))}
        <button type="button" onClick={() => { setSource((s) => !s); }} className="ml-auto h-7 px-2 rounded-md text-[11px] font-semibold admin-faint hover:text-[var(--admin-accent)] transition-colors" title="Toggle HTML source">
          {source ? "Editor" : "Source"}
        </button>
      </div>

      {source ? (
        <textarea
          value={value}
          onChange={(e) => { last.current = e.target.value; onChange(e.target.value); }}
          className={`block w-full resize-y p-4 font-mono text-xs outline-none ${seamless ? "" : "max-h-[460px]"}`}
          style={{ background: "#fff", color: "#33434a", minHeight }}
        />
      ) : (
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={emit}
          onBlur={emit}
          data-placeholder={placeholder}
          className={`rte overflow-y-auto text-sm leading-relaxed outline-none ${seamless ? "px-8 py-7" : "p-4 max-h-[460px]"}`}
          style={{ background: "#fff", color: "#33434a", minHeight }}
        />
      )}
      <style>{`
        .rte p { margin: 0 0 12px; }
        .rte a { color: #00afdb; text-decoration: underline; }
        .rte ul, .rte ol { margin: 0 0 12px; padding-left: 22px; }
        .rte h2 { margin: 16px 0 8px; font-size: 18px; font-weight: 800; color: #00374a; }
        .rte:empty:before { content: attr(data-placeholder); color: #9aa6ac; }
      `}</style>
    </div>
  );
}
