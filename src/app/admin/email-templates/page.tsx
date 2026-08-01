import { redirect } from "next/navigation";

/**
 * Emails and Email Templates were the same object split across two nav entries:
 * one listed what the system can send, the other edited the wording. Clicking a
 * card hopped you between them, which is why "back" appeared to land in the
 * wrong place — you really were on the other page.
 *
 * They are one page now. This keeps old links and bookmarks working.
 */
export default async function EmailTemplatesRedirect({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string }>;
}) {
  const { edit } = await searchParams;
  redirect(edit ? `/admin/emails/${edit}` : "/admin/emails");
}
