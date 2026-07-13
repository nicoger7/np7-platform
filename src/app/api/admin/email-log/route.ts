import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";

// (Auth enforced by middleware.)
export async function GET() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data } = await admin
    .from("email_log")
    .select("id, template_key, to_email, subject, status, error, created_at, sent_at, opened_at, last_event")
    .order("created_at", { ascending: false })
    .limit(200);
  return NextResponse.json({ rows: data ?? [] });
}
