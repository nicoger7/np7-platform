import { createAdminClient } from "./supabase";
import { NextResponse } from "next/server";

// Verify the request has a valid Supabase auth session
// Returns the admin client if authorized, or an error response
export async function withAdminAuth() {
  // For now, use the service role client directly.
  // When Supabase Auth is wired up, this will verify the JWT
  // from the request headers and check team_members table.
  try {
    const client = createAdminClient();
    return { client, error: null };
  } catch {
    return {
      client: null,
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
}
