import { NextRequest } from "next/server";
import { requireTeamApi } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";
import { getSurvey, surveyInviteVars } from "@/lib/surveys";
import { renderTemplate } from "@/lib/email/templates";
import { requireAdminGate } from "@/lib/admin-auth";
import { publicOrigin } from "@/lib/public-origin";
// GET /api/admin/surveys/:id/email-preview — the invite email exactly as it
// will send, built through the same vars builder the real send uses. The
// buttons link to the team-only /survey/preview-… page so they're clickable.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const denied = await requireAdminGate();
  if (denied) return denied;
  const auth = await requireTeamApi();
  if (!auth.ok) return auth.res;
  const { id } = await params;

  const survey = await getSurvey(id);
  if (!survey) return new Response("Survey not found", { status: 404 });

  const origin = publicOrigin();
  const vars = surveyInviteVars(survey, "Nico", `${origin}/survey/preview-${id}`);

  // same copy override + header image the real send would pick up
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: override } = await db.from("email_templates").select("*").eq("template_key", "survey_invite").maybeSingle();
  const useOverride = override && override.active !== false ? override : null;

  const built = renderTemplate("survey_invite", vars, useOverride, "experience", useOverride?.header_image || undefined, useOverride?.header_position ?? undefined);

  // ?meta=1 → just the subject and the inbox preview line. They live outside the
  // rendered body, so the iframe alone never showed them — you were composing an
  // email without being able to read the two lines everyone sees first.
  if (new URL(request.url).searchParams.get("meta") === "1") {
    const preheader = built.html.match(/<div[^>]*style="[^"]*display:\s*none[^"]*"[^>]*>([\s\S]*?)<\/div>/i)?.[1]?.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/gi, " ").trim() ?? "";
    return Response.json({ subject: built.subject, preheader });
  }

  return new Response(built.html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" },
  });
}
