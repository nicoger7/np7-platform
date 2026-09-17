import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { requireTeamMember } from "@/lib/admin-auth";
import { renderTemplate, TEMPLATES } from "@/lib/email/templates";
import { resolveHeaderImage } from "@/lib/email/header-image";
import { nextStepsVars } from "@/lib/email/next-steps";
import { resolveEditionContent, timingAnchor, MAIL_REQUIREMENTS, CONTENT_LABELS, type ContentKey } from "@/lib/email/readiness";
import { MANUAL_CONDITIONAL } from "@/lib/email/manual-eligibility";

export const dynamic = "force-dynamic";

/**
 * GET /api/admin/editions/:id/mailing/preview?key=<templateKey>
 *
 * What this week's mail will look like, BEFORE anyone is sent it.
 *
 * The Mailing tab could send a mail but never show one, so the only way to see
 * the WhatsApp mail for OBX Wind was to send it, or to send yourself a test and
 * go and find it in an inbox. The Email Log could preview, but only mail that
 * had already gone.
 *
 * Built the way the real send builds it: this week's trip title, dates, notes,
 * packing list, group link and next steps, the edited wording from Emails, and
 * this week's header photo. What is personal to one guest is shown in
 * [brackets], the rule the Email Log preview learned the hard way: a preview
 * reading "Hey Nico" looks like proof the wrong name went out, one reading
 * "[first name]" is obviously a preview.
 */

const page = (inner: string) => `<!doctype html><html><head><meta charset="utf-8"></head><body style="margin:0">${inner}</body></html>`;
const note = (text: string, tone: "info" | "warn" = "info") =>
  `<div style="font-family:system-ui,sans-serif;font-size:11px;line-height:1.45;color:${tone === "warn" ? "#8a3a12" : "#5a6b72"};background:${tone === "warn" ? "#fdeee3" : "#eef3f4"};border-bottom:1px solid ${tone === "warn" ? "#f0c9ae" : "#dde6e9"};padding:6px 12px;">${text}</div>`;
const htmlRes = (body: string, status = 200) =>
  new Response(page(body), { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireTeamMember();
  if (denied) return denied;
  const { id } = await params;
  const key = request.nextUrl.searchParams.get("key") ?? "";

  if (!TEMPLATES[key] || (!timingAnchor(key) && !MANUAL_CONDITIONAL[key])) {
    return htmlRes(note(`No preview for "${key || "?"}". It isn't one of this week's scheduled mails.`, "warn"), 404);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { values } = await resolveEditionContent(id);
  const { data: ed } = await db
    .from("exp_editions")
    .select("kind, date_start, date_end, whatsapp_group_link, mail_skip, experience_id, exp_experiences(title)")
    .eq("id", id)
    .maybeSingle();
  if (!ed) return htmlRes(note("This week was not found.", "warn"), 404);

  const { data: firstBooking } = await db.from("exp_bookings").select("id").eq("edition_id", id).limit(1).maybeSingle();
  const origin = process.env.NEXT_PUBLIC_SITE_URL || "https://www.np-seven.com";
  const fmt = (x: string) => new Date(x).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const s = ed.date_start as string | null;
  const e = ed.date_end as string | null;
  const dates = s ? (e ? `${fmt(s)} – ${fmt(e)} ${new Date(e).getFullYear()}` : `${fmt(s)} ${new Date(s).getFullYear()}`) : undefined;
  const nextSteps = await nextStepsVars({ experienceId: ed.experience_id ?? null, editionId: id, origin }).catch(() => ({}));

  const vars: Record<string, string | undefined> = {
    firstName: "[first name]",
    experienceTitle: ed.exp_experiences?.title ?? "[experience]",
    dates,
    preTripNote: values.preTripNote ?? undefined,
    finalDetailsNote: values.finalDetailsNote ?? undefined,
    packingList: values.packingList ?? undefined,
    whatsappLink: ed.whatsapp_group_link ?? values.whatsappLink ?? undefined,
    startDate: s ?? undefined,
    event: ed.kind === "event" ? "yes" : undefined,
    // Per-guest amounts only exist per guest.
    balance: "[balance]",
    downpayment: "[downpayment]",
    amount: "[amount]",
    dueDate: "[due date]",
    bookingLink: `${origin}/account`,
    tripLink: `${origin}/account`,
    waiverLink: `${origin}/account`,
    ...(nextSteps as Record<string, string | undefined>),
  };

  const { data: override } = await db.from("email_templates").select("*").eq("template_key", key).maybeSingle();
  const useOverride = override && override.active !== false ? override : null;

  // Say, above the mail, anything that means it will NOT go out as shown.
  const banners: string[] = [note("Preview with this week&rsquo;s content. Anything in [brackets] is filled in per guest.")];
  if (((ed.mail_skip ?? []) as string[]).includes(key)) banners.push(note("Switched off for this week: this mail will not be sent.", "warn"));
  if (override?.enabled === false) banners.push(note("Switched off in Emails for every week: this mail will not be sent.", "warn"));
  const missing = (MAIL_REQUIREMENTS[key]?.blocking ?? []).filter((k) => !values[k as ContentKey]);
  if (missing.length) {
    banners.push(note(`Held back until filled in: ${missing.map((k) => CONTENT_LABELS[k as ContentKey]?.label ?? k).join(", ")}.`, "warn"));
  }

  try {
    const { headerImage, headerPosition } = await resolveHeaderImage({
      bookingId: firstBooking?.id ?? null, experienceId: ed.experience_id ?? null, division: "experience", override: useOverride,
    });
    const built = renderTemplate(key, vars, useOverride, "experience", headerImage, headerPosition);
    const subject = `<div style="font-family:system-ui,sans-serif;font-size:12px;color:#1d2b30;background:#fff;border-bottom:1px solid #dde6e9;padding:8px 12px;"><b>Subject:</b> ${built.subject.replace(/</g, "&lt;")}</div>`;
    return htmlRes(banners.join("") + subject + built.html);
  } catch (err) {
    return htmlRes(note(`Couldn't render this preview: ${(err as Error).message}`, "warn"), 500);
  }
}
