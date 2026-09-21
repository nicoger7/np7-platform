import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

/**
 * /whatsapp — a short link that opens a chat with NP7.
 *
 * It exists so print can carry it. A wa.me URL with a raw phone number in it is
 * unreadable on a flyer and, once printed, unchangeable; this is a line anyone
 * can type, and the number behind it stays editable in the admin (Nico, 21 Sep
 * 2026: "np-seven.com/whatsapp (which links to our business whatsapp? you have
 * to make that link)").
 *
 * IT IS THE SAME NUMBER THE WEBSITE ALREADY PUBLISHES. NP7 publishes exactly
 * one WhatsApp, the one on a coach's card in the crew section — Simona's today
 * (Nico, 22 Sep 2026: "the one we put for simona on front end"). Reading that
 * row rather than keeping a second copy means the flyer, the crew card and the
 * short link can never drift apart, and changing it is the edit the team
 * already knows how to make: Admin → Coaches → WhatsApp.
 *
 * Deliberately NOT the company phone on the invoices. That is a landline-style
 * contact number and nothing says WhatsApp answers on it.
 *
 * With nothing set it lands on the experiences list rather than a broken wa.me
 * link, because a dead link on a printed flyer is forever.
 */
export const dynamic = "force-dynamic";

const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://www.np-seven.com";

/** A stored link may be a full URL, a bare wa.me path or just digits. */
function waUrl(raw: string, text: string): string | null {
  const s = raw.trim();
  const digits = s.replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  /* An opening line, so the first thing we see is what they are asking about
     rather than a bare "hi". `text` may be overridden per campaign:
     /whatsapp?text=... lets a flyer, an ad and a mail be told apart. */
  const text = url.searchParams.get("text")?.slice(0, 300)
    || "Hi NP7! I'd like to know more about your 2027 windsurf weeks.";

  let link: string | null = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const db = createAdminClient() as any;
    const { data } = await db
      .from("exp_coaches")
      .select("name,whatsapp_link")
      .not("whatsapp_link", "is", null)
      .order("created_at")
      .limit(1);
    link = data?.[0]?.whatsapp_link ?? null;
  } catch {
    link = null;
  }

  const target = link ? waUrl(link, text) : null;
  return NextResponse.redirect(target ?? `${SITE}/experience#experiences`, 302);
}
