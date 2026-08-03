"use client";

import { videoEmbedSrc } from "@/lib/learning";

/**
 * Rendering what the author wrote.
 *
 * The body is HTML from the shared rich-text editor, so it arrives with the
 * editor's own markup vocabulary (p / h2 / ul / a) plus whatever an author
 * pasted — images, and the odd table. The scoped style block below is what
 * makes that readable on a phone at the beach: images never overflow, headings
 * have air, and links carry the admin accent instead of browser blue.
 */
export function LessonBody({ html }: { html: string }) {
  return (
    <>
      <div className="lesson-body admin-heading" dangerouslySetInnerHTML={{ __html: html }} />
      <style>{`
        .lesson-body { font-size: 15px; line-height: 1.7; }
        .lesson-body p { margin: 0 0 14px; }
        .lesson-body h2 { margin: 26px 0 10px; font-size: 17px; font-weight: 800; letter-spacing: -0.01em; }
        .lesson-body h3 { margin: 20px 0 8px; font-size: 15px; font-weight: 700; }
        .lesson-body ul, .lesson-body ol { margin: 0 0 14px; padding-left: 22px; }
        .lesson-body li { margin: 0 0 6px; }
        .lesson-body a { color: var(--admin-accent); text-decoration: underline; }
        .lesson-body strong { font-weight: 700; }
        .lesson-body img { max-width: 100%; height: auto; border-radius: 10px; margin: 6px 0 16px; display: block; }
        .lesson-body iframe { max-width: 100%; border: 0; border-radius: 10px; aspect-ratio: 16/9; width: 100%; margin: 6px 0 16px; }
        .lesson-body blockquote { margin: 0 0 14px; padding-left: 14px; border-left: 3px solid var(--admin-accent); color: var(--admin-text-muted); }
        .lesson-body code { font-size: 13px; padding: 1px 5px; border-radius: 5px; background: var(--admin-active); }
        /* A pasted table shouldn't be able to push the page sideways. */
        .lesson-body table { display: block; overflow-x: auto; max-width: 100%; border-collapse: collapse; margin: 0 0 14px; }
        .lesson-body td, .lesson-body th { border: 1px solid var(--admin-border); padding: 6px 10px; text-align: left; }
      `}</style>
    </>
  );
}

/** A pasted YouTube/Vimeo link as a 16:9 embed. Renders nothing if the link is
 *  neither — an unplayable black box teaches nobody anything. */
export function VideoEmbed({ url }: { url: string | null | undefined }) {
  const src = videoEmbedSrc(url);
  if (!src) return null;
  return (
    <div className="mb-6 rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)", aspectRatio: "16 / 9" }}>
      <iframe
        src={src}
        title="Lesson video"
        className="w-full h-full"
        style={{ border: 0 }}
        allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
      />
    </div>
  );
}
