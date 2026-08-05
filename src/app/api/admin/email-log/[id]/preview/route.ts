import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { renderTemplate, TEMPLATES } from "@/lib/email/templates";
import { resolveHeaderImage } from "@/lib/email/header-image";

// (Auth enforced by middleware, like the email-log list.)

/**
 * Stand-ins for vars a row didn't log.
 *
 * These must never look like real data. The first version filled firstName with
 * "Nico" and every un-logged preview then opened with a warm, entirely
 * plausible "Hey Nico 🤙" — including on 74 magic-link mails sent to other
 * people. The small banner above it was no defence: what the eye reads is the
 * greeting, and it looks exactly like proof that the wrong name went out.
 *
 * So placeholders are written in brackets. A preview that says "[first name]"
 * is obviously a preview; one that says "Nico" is an accusation.
 */
const SAMPLE: Record<string, string> = {
  firstName: "[first name]",
  experienceTitle: "[experience]",
  editionLabel: "[week]",
  dates: "[trip dates]",
  packageName: "[package]",
  total: "[total]",
  balance: "[balance]",
  amount: "[amount]",
  reference: "[reference]",
  addonLabel: "[add-on]",
  addonPrice: "[price]",
  surveyTitle: "[survey]",
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

  /**
   * Before falling back to a placeholder, recover what we can for real.
   *
   * Every row carries who it went to, so the greeting — the one line a reader
   * actually checks — can be the recipient's own name even on rows sent before
   * vars were logged. That turns an old preview from fiction into something
   * approximately true, which is the whole point of being able to open it.
   */
  const recovered: Record<string, string> = {};
  if (!logged?.firstName) {
    const { data: c } = row.contact_id
      ? await db.from("contacts").select("name").eq("id", row.contact_id).maybeSingle()
      : await db.from("contacts").select("name").ilike("email", row.to_email ?? "").is("archived_at", null).limit(1).maybeSingle();
    const first = String(c?.name ?? "").trim().split(" ")[0];
    if (first) recovered.firstName = first;
  }

  const vars = { ...SAMPLE, ...recovered, ...(logged ?? {}) };
  try {
    // Resolve the header exactly as the send did — from THIS row's booking, so a
    // trip mail previews with its week's hero. Passing only the template image
    // here made every trip email look like it went out with the house banner.
    const { headerImage, headerPosition } = await resolveHeaderImage({
      bookingId: row.booking_id, division: "experience", override: useOverride,
    });
    const built = renderTemplate(key, vars, useOverride, "experience", headerImage, headerPosition);
    // Say which it is, and say it in the reader's terms. "Sample data" did not
    // stop the greeting being read as real.
    const banner = logged
      ? ""
      : note(
          recovered.firstName
            ? `Reconstructed preview — this mail was sent before we logged its contents. The name is ${recovered.firstName}&rsquo;s, taken from the contact; anything in [brackets] is a placeholder, not what was sent.`
            : "Reconstructed preview — this mail was sent before we logged its contents. Everything in [brackets] is a placeholder, not what was sent."
        );
    return htmlRes(banner + built.html);
  } catch (e) {
    return htmlRes(note(`Couldn't render preview: ${(e as Error).message}`), 500);
  }
}
