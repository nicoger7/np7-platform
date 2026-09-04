import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { cronAuthorized } from "@/lib/cron-auth";
import { sendCampaignChunk } from "@/lib/email/campaign";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Sends the campaigns that have come due.
 *
 * Scheduling used to be a person holding a button: the composer looped
 * sendCampaignChunk in the browser until it was finished, so "Sunday 09:00"
 * meant somebody being awake on Sunday. This is that loop, moved to a cron.
 *
 * The claim is the whole safety story. Two cron runs can overlap (a long send
 * plus the next hour's tick), and a newsletter sent twice to eleven thousand
 * people is not something you can take back. So a run only proceeds if it can
 * personally flip the row out of 'scheduled', and the update is verified rather
 * than assumed: over on the NP7 Windsurfing publisher a status transition that
 * failed silently left a row claimed and the restart re-fired it 57 times for
 * one post. Same shape of bug, same cost, so it is checked here.
 *
 * Underneath, sendCampaignChunk is already idempotent: it claims each recipient
 * with a dedupe insert into email_log, so even a double-run cannot double-mail
 * a person. The claim protects the campaign's status and the mail quota; the
 * dedupe protects the reader.
 */

/** A run that has not written a heartbeat in this long is presumed dead and its
 *  campaign may be reclaimed. Comfortably longer than one full function slot. */
const STALE_MS = 20 * 60 * 1000;

/** Stop chunking with room to spare inside maxDuration, so the function returns
 *  cleanly and the next tick resumes rather than being killed mid-flight. */
const BUDGET_MS = 240 * 1000;

export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const startedAt = Date.now();
  const nowIso = new Date().toISOString();
  const staleBefore = new Date(Date.now() - STALE_MS).toISOString();

  // Due, plus anything left claimed by a run that died. Oldest first, so a
  // backlog drains in the order it was scheduled.
  const { data: due, error } = await db
    .from("email_campaigns")
    .select("id,name,status,scheduled_at,updated_at")
    .in("status", ["scheduled", "sending"])
    .lte("scheduled_at", nowIso)
    .is("archived_at", null)
    .order("scheduled_at", { ascending: true })
    .limit(10);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results: { id: string; name: string; outcome: string; sent?: number; failed?: number; remaining?: number }[] = [];

  for (const c of (due ?? []) as { id: string; name: string; status: string; updated_at: string }[]) {
    if (Date.now() - startedAt > BUDGET_MS) {
      results.push({ id: c.id, name: c.name, outcome: "deferred to next tick" });
      continue;
    }

    // A 'sending' row is only ours if its previous owner has gone quiet.
    if (c.status === "sending" && c.updated_at > staleBefore) {
      results.push({ id: c.id, name: c.name, outcome: "in flight elsewhere" });
      continue;
    }

    // The claim. Conditioned on the status we just read, so if another run beat
    // us to it between the select and here, this updates nothing and we skip.
    const { data: claimed } = await db
      .from("email_campaigns")
      .update({ status: "sending", updated_at: new Date().toISOString() })
      .eq("id", c.id)
      .eq("status", c.status)
      .select("id")
      .maybeSingle();
    if (!claimed) {
      results.push({ id: c.id, name: c.name, outcome: "claimed by another run" });
      continue;
    }

    let sent = 0;
    let failed = 0;
    let remaining = -1;
    try {
      // sendCampaignChunk marks the campaign 'sent' itself once nothing is
      // left, and each call rewrites updated_at, which is the heartbeat.
      for (;;) {
        const r = await sendCampaignChunk(c.id, 600);
        sent += r.sent;
        failed += r.failed;
        remaining = r.remaining;
        if (r.done || Date.now() - startedAt > BUDGET_MS) break;
      }
      results.push({
        id: c.id, name: c.name, sent, failed, remaining,
        outcome: remaining === 0 ? "sent" : "partial, resumes next tick",
      });
    } catch (e) {
      // Left as 'sending' on purpose. The heartbeat stops, STALE_MS passes, and
      // a later tick reclaims it and carries on from where the dedupe left off.
      // Flipping it back to 'scheduled' here would race a run that is merely
      // slow rather than dead.
      results.push({
        id: c.id, name: c.name, sent, failed,
        outcome: `error, will retry after ${STALE_MS / 60000} min: ${e instanceof Error ? e.message : String(e)}`,
      });
    }
  }

  return NextResponse.json({ checked: (due ?? []).length, results });
}
