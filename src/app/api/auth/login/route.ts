import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export async function POST(request: NextRequest) {
  try {
  const { email, password } = await request.json();

  if (!email || !password) {
    return NextResponse.json(
      { error: "Email and password required" },
      { status: 400 }
    );
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json(
      { error: "Server config error: Supabase URL or anon key not set" },
      { status: 500 }
    );
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Server config error: SUPABASE_SERVICE_ROLE_KEY not set in .env.local" },
      { status: 500 }
    );
  }

  const supabase = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  // Check if user is a team member
  const adminClient = createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const { data: member, error: memberError } = await adminClient
    .from("team_members")
    .select("*")
    .eq("auth_user_id", data.user.id)
    .eq("active", true)
    .single();

  if (memberError || !member) {
    console.error("Team member lookup failed:", memberError, "user_id:", data.user.id);
    return NextResponse.json(
      { error: memberError?.message || "Not authorized. Team members only." },
      { status: 403 }
    );
  }

  // Set the session token as an httpOnly cookie
  const response = NextResponse.json({
    user: { id: data.user.id, email: data.user.email },
    member: { name: member.name, role: member.role },
  });

  response.cookies.set("sb-access-token", data.session.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });

  response.cookies.set("sb-refresh-token", data.session.refresh_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });

  return response;
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
