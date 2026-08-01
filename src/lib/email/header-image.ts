import "server-only";
import { createAdminClient } from "@/lib/supabase";
import type { Division } from "./layout";

/**
 * Which photo sits at the top of an email.
 *
 * Most specific wins: this week's hero, else the experience's, else the one set
 * on the template, else the division default (applied downstream in
 * emailLayout). A Turkey guest should see Turkey, not the house banner.
 *
 * This lived inline in sendEmail, which meant the email-log preview — a
 * re-render, since the log stores variables and not the sent HTML — resolved
 * nothing and always showed the house banner. So every trip mail *looked*
 * unbranded in the log while the real send was correctly branded. One function
 * now, used by both, so the preview can't drift from reality again.
 */
export async function resolveHeaderImage(opts: {
  bookingId?: string | null;
  experienceId?: string | null;
  division?: Division;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  override?: any;
}): Promise<{ headerImage?: string; headerPosition?: number }> {
  const { bookingId, division = "experience", override } = opts;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  let headerImage: string | undefined;
  let expId = opts.experienceId || undefined;
  let editionId: string | undefined;

  if (bookingId) {
    const { data: bk } = await db
      .from("exp_bookings").select("experience_id, edition_id").eq("id", bookingId).maybeSingle();
    if (!expId) expId = bk?.experience_id || undefined;
    editionId = bk?.edition_id || undefined;
  }

  // Per-edition hero (migration 047) — only when that week opts into emails.
  // select("*") so a not-yet-migrated column can't error the query.
  if (editionId) {
    const { data: ed } = await db.from("exp_editions").select("*").eq("id", editionId).maybeSingle();
    if (ed?.hero_image && ed.hero_in_emails !== false) headerImage = ed.hero_image;
  }

  if (!headerImage && expId) {
    const { data: content } = await db
      .from("exp_content").select("hero_image").eq("experience_id", expId).maybeSingle();
    headerImage = content?.hero_image || undefined;
    if (!headerImage) {
      const { data: exp } = await db
        .from("exp_experiences").select("hero_image").eq("id", expId).maybeSingle();
      headerImage = exp?.hero_image || undefined;
    }
  }

  // Per-division template image + focal point (migration 046).
  const hw = division === "hardware";
  const ovImage = hw ? override?.header_image_hardware : override?.header_image;
  const headerPosition: number | undefined =
    (hw ? override?.header_position_hardware : override?.header_position) ?? undefined;
  if (!headerImage) headerImage = ovImage || undefined;

  return { headerImage, headerPosition };
}
