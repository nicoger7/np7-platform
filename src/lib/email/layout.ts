const STORAGE = "https://qfdqigumjadvrocxjolx.supabase.co/storage/v1/object/public/assets";
const LOGOS = `${STORAGE}/logos`;

export type Division = "experience" | "hardware";

/** The header image used when a template doesn't set its own — shown in the
 *  editor so it's always clear what the blank "default" will render. At send
 *  time an experience's own hero photo can override this per division. */
export const DEFAULT_HEADER_IMAGE: Record<Division, string | null> = {
  experience: `${STORAGE}/hero/windsurf-hero-poster.jpg`,
  hardware: null,
};

/** Per-division email theming: a hero header image, the brand "sun → sea" colour
 *  fade, the logo, button colour, footer + contact address. Card stays light
 *  (email-safe). */
const THEMES: Record<Division, {
  logo: string; logoLight: string; logoAlt: string; logoW: number;
  accent: string; accentText: string;
  gradient: string; hero: string | null;
  headerBg: string; headerFade: string;
  footerBg: string; footerText: string; footerStrong: string; tagline: string;
  contactEmail: string;
}> = {
  experience: {
    logo: `${LOGOS}/np7-experience-logo.png`, logoLight: `${LOGOS}/np7-experience-logo.png`, logoAlt: "NP7 Experience", logoW: 168,
    accent: "#00afdb", accentText: "#ffffff",
    gradient: "linear-gradient(90deg,#ffc42e 0%,#f47b20 48%,#00afdb 100%)",
    hero: `${STORAGE}/hero/windsurf-hero-poster.jpg`,
    headerBg: "#00374a", headerFade: "rgba(0,40,58,0.82)",
    footerBg: "#00374a", footerText: "#9fb3bb", footerStrong: "#cfe0e5",
    tagline: "Premium watersports travel with Nico Prien (GER-7).",
    contactEmail: "experience@np-seven.com",
  },
  hardware: {
    logo: `${LOGOS}/np7-logo.png`, logoLight: `${LOGOS}/np7-logo.png`, logoAlt: "NP7 Hardware", logoW: 92,
    accent: "#c6ff3a", accentText: "#0a0a0c",
    gradient: "linear-gradient(90deg,#c6ff3a 0%,#7bdb1e 50%,#ff2e88 100%)",
    hero: null,
    headerBg: "#0c0c0e", headerFade: "rgba(8,8,12,0.85)",
    footerBg: "#0c0c0e", footerText: "#8d8d8d", footerStrong: "#c6ff3a",
    tagline: "Custom windsurf boards & fins — shaped on the bench, finished by hand.",
    contactEmail: "hardware@np-seven.com",
  },
};

/** Per-division sender + reply-to. The np-seven.com domain is verified in Resend, so
 *  any address on it can SEND; for replies to actually arrive, a real inbox/forward must
 *  exist for the reply-to address. Env vars override the defaults if ever needed. */
export const SENDERS: Record<Division, { from: string; replyTo: string }> = {
  experience: {
    from: process.env.EMAIL_FROM_EXPERIENCE || "NP7 Experience <experience@np-seven.com>",
    replyTo: process.env.EMAIL_REPLY_TO_EXPERIENCE || "experience@np-seven.com",
  },
  hardware: {
    from: process.env.EMAIL_FROM_HARDWARE || "NP7 Hardware <hardware@np-seven.com>",
    replyTo: process.env.EMAIL_REPLY_TO_HARDWARE || "hardware@np-seven.com",
  },
};

/**
 * Branded, email-client-safe (table + inline-style) HTML shell, per division.
 * Header = a hero photo (per-template override via `headerImage`, else the
 * division default) + the brand colour-fade bar + the logo. Footer carries the
 * division contact address. Pass `headerImage: null` to drop the photo.
 */
export function emailLayout(opts: { division?: Division; preheader?: string; headerImage?: string | null; headerPosition?: number | null; bodyHtml: string }): string {
  const { division = "experience", preheader = "", headerImage, headerPosition, bodyHtml: rawBody } = opts;
  const t = THEMES[division];
  const hero = headerImage === undefined ? t.hero : headerImage;
  const posY = Math.min(100, Math.max(0, headerPosition ?? 50)); // vertical focal point %
  const bodyHtml = normalizeEmailBody(rawBody, division);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#eef3f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<span style="display:none!important;opacity:0;color:#eef3f4;height:0;width:0;overflow:hidden;">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef3f4;"><tr><td align="center" style="padding:28px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 30px rgba(0,55,74,0.08);">
  ${hero ? `
  <tr><td background="${hero}" bgcolor="${t.headerBg}" style="background-image:url('${hero}');background-size:cover;background-position:center ${posY}%;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:56px 24px 30px;background:linear-gradient(180deg,rgba(0,28,40,0.04) 0%,rgba(0,28,40,0.40) 52%,${t.headerFade} 100%);">
      <img src="${t.logoLight}" alt="${esc(t.logoAlt)}" width="${t.logoW}" style="display:block;width:${t.logoW}px;max-width:64%;height:auto;margin:0 auto;filter:drop-shadow(0 2px 10px rgba(0,0,0,0.45));">
    </td></tr></table>
  </td></tr>
  <tr><td bgcolor="${t.accent}" height="4" style="height:4px;line-height:4px;font-size:0;background:${t.accent};background-image:${t.gradient};">&nbsp;</td></tr>
  ` : `
  <tr><td bgcolor="${t.accent}" height="5" style="height:5px;line-height:5px;font-size:0;background:${t.accent};background-image:${t.gradient};">&nbsp;</td></tr>
  <tr><td align="center" style="background:#ffffff;padding:26px 24px 8px;"><img src="${t.logo}" alt="${esc(t.logoAlt)}" width="${t.logoW}" style="display:block;width:${t.logoW}px;max-width:60%;height:auto;"></td></tr>
  `}
  <tr><td style="padding:26px 32px 30px;color:#33434a;font-size:15px;line-height:1.6;">${bodyHtml}</td></tr>
  <tr><td style="background:${t.footerBg};padding:22px 32px;color:${t.footerText};font-size:12px;line-height:1.6;">
    <strong style="color:${t.footerStrong};">NP7 GmbH</strong> · Germany · ${t.contactEmail}<br>
    ${esc(t.tagline)}
  </td></tr>
</table>
<div style="color:#9aa6ac;font-size:11px;padding:16px 8px 0;">© 2026 NP7 GmbH</div>
</td></tr></table></body></html>`;
}

/** The resolved header/footer "chrome" for a division — so the admin can render
 *  the branded frame around an editable body (edit-in-place), matching the real
 *  email. `headerImage` undefined → the division default; null → no hero. */
export function emailChrome(division: Division = "experience", headerImage?: string | null) {
  const t = THEMES[division];
  const hero = headerImage === undefined ? t.hero : (headerImage || null);
  return {
    hero, logo: t.logoLight, logoAlt: t.logoAlt, logoW: t.logoW,
    accent: t.accent, gradient: t.gradient, headerBg: t.headerBg, headerFade: t.headerFade,
    footerBg: t.footerBg, footerText: t.footerText, footerStrong: t.footerStrong,
    tagline: t.tagline, contactEmail: t.contactEmail,
  };
}

/** A table-based button that survives Outlook etc., themed per division. */
export function emailButton(label: string, href: string, division: Division = "experience"): string {
  const t = THEMES[division];
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;"><tr>
<td align="center" bgcolor="${t.accent}" style="border-radius:999px;">
<a href="${href}" target="_blank" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:700;color:${t.accentText};text-decoration:none;border-radius:999px;">${esc(label)}</a>
</td></tr></table>`;
}

export function esc(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

/**
 * Make body HTML email-client-safe by inlining styles on the common tags the
 * WYSIWYG editor produces (p, a, ul/ol/li, strong/b, h2/h3). Idempotent: tags
 * that already carry a `style=` are left alone, so the existing inline-styled
 * default bodies pass through unchanged.
 */
export function normalizeEmailBody(html: string, division: Division = "experience"): string {
  const link = division === "hardware" ? "#0a8f00" : "#00afdb";
  const styles: Record<string, string> = {
    p: "margin:0 0 14px;",
    a: `color:${link};text-decoration:underline;`,
    ul: "margin:0 0 14px;padding-left:22px;",
    ol: "margin:0 0 14px;padding-left:22px;",
    li: "margin:0 0 6px;",
    h2: "margin:18px 0 10px;font-size:19px;line-height:1.3;color:#00374a;font-weight:800;",
    h3: "margin:16px 0 8px;font-size:16px;line-height:1.3;color:#00374a;font-weight:700;",
    blockquote: "margin:0 0 14px;padding:8px 16px;border-left:3px solid #d7e3e7;color:#5a6b72;",
  };
  let out = html;
  for (const [tag, style] of Object.entries(styles)) {
    // add the style only to opening tags that don't already have one
    out = out.replace(new RegExp(`<${tag}(?![a-z0-9])((?:\\s+(?!style=)[a-z-]+="[^"]*")*)\\s*>`, "gi"), `<${tag}$1 style="${style}">`);
  }
  return out;
}
