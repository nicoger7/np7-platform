import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export async function GET(request: NextRequest) {
  const accessToken = request.cookies.get("sb-access-token")?.value;

  if (!accessToken) {
    return NextResponse.json({ error: "Not logged in" }, { status: 401 });
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(accessToken);

  if (error || !user) {
    // Try to refresh
    const refreshToken = request.cookies.get("sb-refresh-token")?.value;
    if (!refreshToken) {
      return NextResponse.json({ error: "Session expired" }, { status: 401 });
    }

    const { data: refreshed, error: refreshError } =
      await supabase.auth.refreshSession({ refresh_token: refreshToken });

    if (refreshError || !refreshed.user) {
      return NextResponse.json({ error: "Session expired" }, { status: 401 });
    }

    // Get team member info
    const adminClient = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } }
    );

    const { data: member } = await adminClient
      .from("team_members")
      .select("*")
      .eq("auth_user_id", refreshed.user.id)
      .eq("active", true)
      .single();

    const response = NextResponse.json({
      user: { id: refreshed.user.id, email: refreshed.user.email },
      member: member
        ? { name: member.name, role: member.role }
        : null,
    });

    if (refreshed.session) {
      response.cookies.set(
        "sb-access-token",
        refreshed.session.access_token,
        {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge: 60 * 60 * 24 * 7,
        }
      );
    }

    return response;
  }

  // Get team member info
  const adminClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: member } = await adminClient
    .from("team_members")
    .select("*")
    .eq("auth_user_id", user.id)
    .eq("active", true)
    .single();

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    member: member ? { name: member.name, role: member.role } : null,
  });
}
