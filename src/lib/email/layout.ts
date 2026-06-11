const LOGO = "https://qfdqigumjadvrocxjolx.supabase.co/storage/v1/object/public/assets/logos/np7-experience-logo.png";

/** Branded, email-client-safe (table + inline-style) HTML shell. */
export function emailLayout(opts: { preheader?: string; bodyHtml: string }): string {
  const { preheader = "", bodyHtml } = opts;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"></head>
<body style="margin:0;padding:0;background:#eef3f4;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
<span style="display:none!important;opacity:0;color:#eef3f4;height:0;width:0;overflow:hidden;">${esc(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef3f4;"><tr><td align="center" style="padding:28px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 8px 30px rgba(0,55,74,0.08);">
  <tr><td align="center" style="background:#ffffff;padding:26px 24px 8px;"><img src="${LOGO}" alt="NP7 Experience" width="150" style="display:block;width:150px;max-width:60%;height:auto;"></td></tr>
  <tr><td style="padding:14px 32px 32px;color:#33434a;font-size:15px;line-height:1.6;">${bodyHtml}</td></tr>
  <tr><td style="background:#00374a;padding:22px 32px;color:#9fb3bb;font-size:12px;line-height:1.6;">
    <strong style="color:#cfe0e5;">NP7 GmbH</strong> · Germany · hello@np-seven.com<br>
    Premium watersports travel with Nico Prien (GER-7).
  </td></tr>
</table>
<div style="color:#9aa6ac;font-size:11px;padding:16px 8px 0;">© 2026 NP7 GmbH</div>
</td></tr></table></body></html>`;
}

/** A table-based button that survives Outlook etc. */
export function emailButton(label: string, href: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:22px 0;"><tr>
<td align="center" bgcolor="#00afdb" style="border-radius:999px;">
<a href="${href}" target="_blank" style="display:inline-block;padding:14px 30px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">${esc(label)}</a>
</td></tr></table>`;
}

export function esc(s: string): string {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}
