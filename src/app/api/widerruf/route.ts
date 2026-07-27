import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { sendEmail } from "@/lib/email/send";

/**
 * Online-Widerrufsfunktion (§ 356a BGB) — receives the consumer's withdrawal
 * statement from /widerruf. PUBLIC by design: the law forbids requiring a login.
 *
 * The insert is the legal act (its created_at = statutory date/time of receipt),
 * so a storage failure MUST surface to the consumer — no silent fail-open here.
 * The acknowledgment email (content + date + time, neutral wording) follows
 * immediately; its failure doesn't invalidate the received declaration.
 */

function clip(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

export async function POST(req: Request) {
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  // Honeypot: real visitors never fill this hidden field. Pretend success.
  if (clip(body.website, 10)) return NextResponse.json({ ok: true, receivedAt: new Date().toISOString() });

  const name = clip(body.name, 200);
  const contractRef = clip(body.contractRef, 200);
  const email = clip(body.email, 200);
  const note = clip(body.note, 1000);

  if (!name || !contractRef || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Bitte Name, Vertrags-/Bestellnummer und eine gültige E-Mail-Adresse angeben." }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data, error } = await db
    .from("withdrawal_requests")
    .insert({ name, contract_ref: contractRef, email, note: note || null })
    .select("id, created_at")
    .single();

  if (error || !data) {
    console.error("[widerruf] insert failed:", error?.message);
    return NextResponse.json(
      { error: "Ihr Widerruf konnte gerade nicht gespeichert werden. Bitte versuchen Sie es erneut oder senden Sie Ihren Widerruf per E-Mail an die im Impressum genannte Adresse." },
      { status: 500 }
    );
  }

  // § 356a Abs. 4: acknowledgment on a durable medium — content + date + time.
  const received = new Date(data.created_at);
  const fmtDate = received.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "Europe/Berlin" });
  const fmtTime = received.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });
  try {
    const res = await sendEmail({
      to: email,
      templateKey: "withdrawal_received",
      vars: { name, contractRef, note: note || undefined, receivedDate: fmtDate, receivedTime: fmtTime },
      dedupeKey: `widerruf:${data.id}`,
    });
    if (res.status === "sent") {
      await db.from("withdrawal_requests").update({ ack_sent_at: new Date().toISOString() }).eq("id", data.id);
    } else if (res.error) {
      console.error("[widerruf] acknowledgment not sent:", res.error);
    }
  } catch (e) {
    console.error("[widerruf] acknowledgment send threw:", e instanceof Error ? e.message : e);
  }

  return NextResponse.json({ ok: true, receivedAt: data.created_at });
}
