import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { rateLimited, LIMITS } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email/send";
import { newsletterConfirmUrl } from "@/lib/email/newsletter";

/**
 * "Catch the next wave" — the newsletter signup, which until now was scenery.
 *
 * The block on /experience was four lines of markup: a <form> with no action,
 * no method and no handler, inside a server component, wrapping an <input> with
 * no `name`. Pressing Subscribe did a native GET to /experience, the address
 * never left the browser, and the page reloaded looking like it had worked.
 * Every address anyone ever typed there is gone, and nobody could have known,
 * because there was no error to see.
 *
 * DOUBLE OPT-IN, deliberately. NP7 is a German company and a newsletter needs
 * consent it can prove (§7 UWG, and Art. 7(1) GDPR puts the burden of proof on
 * the controller). Typing an address into a box proves only that somebody typed
 * it, and anybody can type anybody's. So this records nothing but a pending
 * contact and emails a confirmation; `marketing_opt_in` is set only when the
 * owner of the address confirms, and `marketing_opt_in_at` is the date that
 * stands up if it is ever questioned.
 *
 * The response is deliberately the same whether or not the address is already
 * on the list: telling a stranger "that one is already subscribed" turns the
 * form into a way to check who is a customer.
 */

type Body = { email?: string };

const ok = () =>
  NextResponse.json({ ok: true, message: "Almost there. Check your inbox and confirm the link we just sent." });

function bad(msg: string, status = 400) {
  return NextResponse.json({ error: msg }, { status });
}

export async function POST(request: NextRequest) {
  const tooMany = await rateLimited(request, { name: "newsletter", policy: LIMITS.write });
  if (tooMany) return tooMany;

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return bad("Invalid request");
  }

  const email = (body.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad("Please enter a valid email address.");

  const db = createAdminClient() as unknown as {
    from: (t: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      select: (s: string) => any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      insert: (v: Record<string, unknown>) => any;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: (v: Record<string, unknown>) => any;
    };
  };

  /* Reuse by email, oldest wins, then create. Case-insensitive and LIMITED,
     never `.eq(...).maybeSingle()`: that throws when one address has two
     contacts, which really happens here (see the note in week-interest). */
  const { data: found } = await db
    .from("contacts")
    .select("id,marketing_opt_in,archived_at")
    .ilike("email", email)
    .order("created_at", { ascending: true })
    .limit(1);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const existing = ((found ?? []) as any[])[0];

  let contactId: string | undefined = existing?.id;
  if (!contactId) {
    const { data: created, error } = await db
      .from("contacts")
      .insert({ email, source: "newsletter", tags: ["maillist"] })
      .select("id")
      .single();
    if (error) return bad("Could not save your address. Please try again.", 500);
    contactId = created.id;
  }

  // Already confirmed: say the same thing, send nothing. Re-confirming an
  // active subscriber is a mail they did not ask for.
  if (existing?.marketing_opt_in === true && !existing?.archived_at) return ok();

  await sendEmail({
    to: email,
    templateKey: "newsletter_confirm",
    contactId,
    // One confirmation per address per day, however many times they press it.
    dedupeKey: `newsletter_confirm:${contactId}:${new Date().toISOString().slice(0, 10)}`,
    vars: { confirmLink: newsletterConfirmUrl(contactId!) },
  });

  return ok();
}
