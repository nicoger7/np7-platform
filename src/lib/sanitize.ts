import sanitizeHtml from "sanitize-html";

/**
 * The one allowlist sanitizer for author-supplied HTML.
 *
 * Two surfaces store HTML written by a person and hand it to
 * dangerouslySetInnerHTML: Academy lesson bodies (exp_learning_lessons.body)
 * and waiver wording (exp_experiences.waiver_text). Both were rendered raw.
 *
 * "Only staff can write these" is not a defence. A staff account is exactly
 * what phishing takes, the waiver renders on a MEMBER-facing page, and an admin
 * origin that renders unfiltered HTML turns any one compromised author into
 * script running in every colleague's admin session. Before this, that script
 * could also read the Supabase refresh tokens the account switcher cached in
 * localStorage — see lib/admin-accounts.
 *
 * Allowlist, not denylist: anything not named here is dropped. Denylists lose,
 * because they have to enumerate every payload and the payloads keep coming.
 *
 * Sanitize on WRITE (so bad markup never lands in the database) and again on
 * READ (so anything already stored, or written by a path added later, is still
 * neutralised). Neither pass alone is enough — write-only leaves history
 * dangerous, read-only leaves the payload sitting in the row.
 *
 * NOT used for transactional email templates: those have their own vocabulary
 * (tables, inline styles for clients that support nothing else) and would need
 * their own allowlist and their own rendering tests.
 */

/** Hosts whose iframes may survive. Matches lib/learning videoEmbedSrc(), which
 *  is what the editor's video button produces. */
const VIDEO_HOSTS = ["www.youtube-nocookie.com", "www.youtube.com", "youtube.com", "player.vimeo.com"];

const COMMON: sanitizeHtml.IOptions = {
  // Attributes are namespaced per tag on purpose. A global allowance is how
  // `onerror` gets in.
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    img: ["src", "alt", "title", "width", "height"],
    iframe: ["src", "title", "width", "height", "allow", "allowfullscreen", "frameborder"],
  },
  // No `style` anywhere. Inline CSS can position an invisible element over a
  // real control (clickjacking) and is not needed — both surfaces carry their
  // own scoped stylesheet. No `class`/`id` either: author markup must not be
  // able to borrow or collide with application styling.
  allowedSchemes: ["http", "https", "mailto", "tel"],
  // Deliberately NOT `data:` on images: a data: URI can carry an SVG, and an
  // SVG can carry script.
  allowedSchemesByTag: { img: ["http", "https"] },
  allowedSchemesAppliedToAttributes: ["href", "src"],
  allowProtocolRelative: false,
  // Drop the element AND its contents — otherwise `<script>alert(1)</script>`
  // leaves `alert(1)` as visible text in a legal document.
  nonTextTags: ["script", "style", "textarea", "option", "noscript"],
  disallowedTagsMode: "discard",
  transformTags: {
    // Any link that opens a new tab gets noopener: without it the opened page
    // can reach back through window.opener and navigate this one.
    a: (tagName, attribs) => {
      const out: Record<string, string> = { ...attribs };
      if (out.target === "_blank") out.rel = "noopener noreferrer";
      return { tagName, attribs: out };
    },
  },
};

/**
 * Academy lesson bodies. The richest vocabulary: the editor emits headings,
 * lists, links, images, tables and video embeds, and lesson-body.tsx already
 * has styling for every one of them.
 */
export function sanitizeLessonHtml(dirty: string | null | undefined): string {
  if (!dirty) return "";
  return sanitizeHtml(dirty, {
    ...COMMON,
    allowedTags: [
      "p", "br", "hr",
      "strong", "b", "em", "i", "u", "s", "code", "pre",
      "h2", "h3", "h4",
      "ul", "ol", "li",
      "a", "img", "iframe",
      "blockquote",
      "table", "thead", "tbody", "tr", "td", "th",
    ],
    allowedIframeHostnames: VIDEO_HOSTS,
    allowIframeRelativeUrls: false,
    // A rejected host loses its src but leaves <iframe></iframe> behind, which
    // renders as an empty box. Drop the element instead — the security property
    // is already satisfied by then; this is about not leaving litter in a lesson.
    exclusiveFilter: (frame) => frame.tag === "iframe" && !frame.attribs.src,
  });
}

/**
 * Waiver wording. Narrower on purpose — this is a legal document a member signs,
 * so it is prose and headings. No images, no iframes, no tables: nothing that
 * could load a remote resource, frame another page, or lay content out to
 * mislead about what is being agreed to.
 */
export function sanitizeWaiverHtml(dirty: string | null | undefined): string {
  if (!dirty) return "";
  return sanitizeHtml(dirty, {
    ...COMMON,
    allowedTags: [
      "p", "br", "hr",
      "strong", "b", "em", "i", "u",
      "h2", "h3", "h4",
      "ul", "ol", "li",
      "a",
      "blockquote",
    ],
  });
}
