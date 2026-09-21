import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/**
 * /whatsapp — a short link that opens a chat with NP7.
 *
 * It exists so print can carry it. A wa.me URL with a raw phone number in it is
 * unreadable on a flyer and unchangeable once the flyer is printed; this is a
 * line anyone can type, and the number behind it stays editable in the admin
 * (Nico, 21 Sep 2026: "np-seven.com/whatsapp (which links to our business
 * whatsapp? you have to make that link)").
 *
 * The number is the Experience division's own phone from company settings, the
 * same one that prints on every invoice, so there is no second place to keep in
 * step. WhatsApp wants digits only: no +, no spaces, no dashes.
 *
 * With no number configured it lands on the contact section rather than a
 * broken wa.me link, because a dead link on a printed flyer is forever.
 */
export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.np-seven.com";

export async function GET(req: Request) {
  let phone: string | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const { data } = await db.from("company_settings").select("phone").eq("division", "experience").maybeSingle();
    phone = data?.phone ?? null;
  } catch {
    phone = null;
  }

  const digits = String(phone ?? "").replace(/\D/g, "");
  if (!digits) return NextResponse.redirect(`${SITE}/experience#experiences`, 302);

  /* An opening line, so the first thing we see is what they are asking about
     rather than a bare "hi". `text` may be overridden per campaign:
     /whatsapp?text=... lets a flyer, an ad and a mail be told apart. */
  const url = new URL(req.url);
  const text = url.searchParams.get("text")?.slice(0, 300)
    || "Hi NP7! I'd like to know more about your 2027 windsurf weeks.";

  return NextResponse.redirect(`https://wa.me/${digits}?text=${encodeURIComponent(text)}`, 302);
}
