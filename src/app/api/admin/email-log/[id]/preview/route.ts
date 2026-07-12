import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { renderTemplate, TEMPLATES } from "@/lib/email/templates";

// (Auth enforced by middleware, like the email-log list.)

// Sample values behind any vars a row didn't log (older rows have none at all
// — those render as an "approximate" preview with fully sample data).
const SAMPLE: Record<string, string> = {
  firstName: "Nico",
  experienceTitle: "NP7 Experience Bonaire",
  editionLabel: "Week 1",
  dates: "30 Nov – 6 Dec 2026",
  packageName: "Full Package",
  total: "€2,700",
  balance: "€2,400",
  amount: "€2,445",
  reference: "NP7-A1B2C3",
  addonLabel: "Private coaching session",
  addonPrice: "€250",
  surveyTitle: "NP7 Experience Tenerife 2027",
  activationLink: "#", bookingLink: "#", whatsappLink: "#", reviewLink: "#", surveyLink: "#", joinLink: "#",
};

const page = (inner: string) => `<!doctype html><html><body style="margin:0">${inner}</body></html>`;
const note = (text: string) =>
  `<div style="font-family:system-ui,sans-serif;font-size:11px;color:#8a6d1a;background:#fdf6e3;border-bottom:1px solid #f0e0b0;padding:6px 12px;">${text}</div>`;
const htmlRes = (body: string, status = 200) =>
  new Response(page(body), { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });

// GET /api/admin/email-log/:id/preview — re-render what this email looked like.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { data: row } = await db.from("email_log").select("*").eq("id", id).maybeSingle();
  if (!row) return htmlRes(note("Log entry not found."), 404);

  const key: string = row.template_key ?? "";
  if (!TEMPLATES[key]) {
    return htmlRes(note(`No preview available — unknown template “${key || "—"}”.`));
  }

  // same override the send used (edited copy / header image)
  const { data: override } = await db.from("email_templates").select("*").eq("template_key", key).maybeSingle();
  const useOverride = override && override.active !== false ? override : null;

  const logged = (row.vars ?? null) as Record<string, string> | null;
  const vars = { ...SAMPLE, ...(logged ?? {}) };
  try {
    const built = renderTemplate(key, vars, useOverride, "experience", useOverride?.header_image || undefined, useOverride?.header_position ?? undefined);
    const banner = logged ? "" : note("Approximate preview — sent before variable logging, shown with sample data.");
    return htmlRes(banner + built.html);
  } catch (e) {
    return htmlRes(note(`Couldn't render preview: ${(e as Error).message}`), 500);
  }
}
