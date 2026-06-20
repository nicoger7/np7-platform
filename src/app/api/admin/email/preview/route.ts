import { NextRequest, NextResponse } from "next/server";
import { emailLayout, esc, type Division } from "@/lib/email/layout";
import { TEMPLATES } from "@/lib/email/templates";

/**
 * POST /api/admin/email/preview  { body?, subject?, division?, templateKey? }
 * Renders the branded, division-themed email HTML for a live editor preview.
 * Sample data is filled into {{variables}} so the team sees a realistic email.
 * Admin-only (enforced by middleware). Returns { html, subject }.
 */
const SAMPLE: Record<string, string> = {
  firstName: "Nico",
  experienceTitle: "NP7 Bonaire WindWeek",
  editionLabel: "Week 1",
  dates: "30 Nov – 6 Dec 2026",
  packageName: "Full Package",
  total: "€2,700",
  deposit: "300",
  balance: "€2,400",
  activationLink: "#",
  bookingLink: "#",
  whatsappLink: "#",
  reviewLink: "#",
  addonLabel: "Private coaching session",
  addonPrice: "€250",
};

/** Replace {{var}} tokens with sample values; unknown tokens are shown verbatim. */
function interpolate(s: string): string {
  return s.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => (k in SAMPLE ? esc(SAMPLE[k]) : `{{${k}}}`));
}

export async function POST(req: NextRequest) {
  let payload: { body?: string; subject?: string; division?: string; templateKey?: string } = {};
  try {
    payload = await req.json();
  } catch {
    /* empty body → placeholder preview */
  }

  const division: Division = payload.division === "hardware" ? "hardware" : "experience";
  const body = typeof payload.body === "string" ? payload.body : "";
  const subject = typeof payload.subject === "string" ? payload.subject : "";
  const templateKey = typeof payload.templateKey === "string" ? payload.templateKey : "";

  let html: string;
  let subjectOut = subject ? interpolate(subject) : "";

  if (body.trim()) {
    // Editing a custom body → wrap it in the live division-themed shell.
    html = emailLayout({ division, bodyHtml: interpolate(body) });
  } else if (templateKey && TEMPLATES[templateKey]) {
    // No custom body yet → preview the built-in code default for this template.
    const built = TEMPLATES[templateKey](SAMPLE);
    html = built.html;
    if (!subjectOut) subjectOut = built.subject;
  } else {
    html = emailLayout({
      division,
      bodyHtml: `<p style="margin:0;color:#90a0a8;">Start typing the email body to see a live preview…</p>`,
    });
  }

  return NextResponse.json({ html, subject: subjectOut });
}
