const STORAGE = "https://qfdqigumjadvrocxjolx.supabase.co/storage/v1/object/public/assets";
const LOGOS = `${STORAGE}/logos`;

export type Division = "experience" | "hardware";

/** The header image used when a template doesn't set its own — shown in the
 *  editor so it's always clear what the blank "default" will render. At send
 *  time an experience's own hero photo can override this per division. */
export const DEFAULT_HEADER_IMAGE: Record<Division, string | null> = {
  experience: `${STORAGE}/photos/hero-bg.jpg`,
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
    hero: `${STORAGE}/photos/hero-bg.jpg`,
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
export function emailLayout(opts: { division?: Division; preheader?: string; headerImage?: string | null; bodyHtml: string }): string {
  const { division = "experience", preheader = "", headerImage, bodyHtml } = opts;
  const t = THEMES[division];
  const hero = headerImage === undefined ? t.hero : headerImage;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#eef3f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<span style="display:none!important;opacity:0;color:#eef3f4;height:0;width:0;overflow:hidden;">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef3f4;"><tr><td align="center" style="padding:28px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 30px rgba(0,55,74,0.08);">
  ${hero ? `
  <tr><td background="${hero}" bgcolor="${t.headerBg}" style="background-image:url('${hero}');background-size:cover;background-position:center;">
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
