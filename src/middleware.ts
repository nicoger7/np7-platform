import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

/** Verify a session email belongs to an active team member (service role). */
async function isTeamMember(email: string | undefined): Promise<boolean> {
  if (!email) return false;
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  const { data } = await admin.from("team_members").select("id, active").eq("email", email).maybeSingle();
  return !!data && data.active !== false;
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // ── Remember the active sub-site so the member portal keeps that section's
  //    header. Public Experience/Hardware pages need no auth, so set the cookie
  //    and return early (skips the Supabase round-trip on every page view). ──
  if (!path.startsWith("/admin") && !path.startsWith("/account") && !path.startsWith("/api")) {
    const section = path.startsWith("/hardware") ? "hardware" : path.startsWith("/experience") ? "experience" : null;
    if (section) {
      const res = NextResponse.next({ request });
      if (request.cookies.get("np7_section")?.value !== section) {
        res.cookies.set("np7_section", section, { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax" });
      }
      return res;
    }
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const isAdminApi = path.startsWith("/api/admin");
  const isAdminPage = path.startsWith("/admin");
  const isAdminLogin = path === "/admin/login";
  const isAccount = path.startsWith("/account");
  const isAccountAuth = path === "/account/login" || path.startsWith("/account/auth");

  const redirect = (pathname: string) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    url.search = "";
    return NextResponse.redirect(url);
  };

  // ── Admin (pages + API): require an active team member ──
  if (isAdminApi || (isAdminPage && !isAdminLogin)) {
    if (!user) {
      return isAdminApi
        ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        : redirect("/admin/login");
    }
    if (!(await isTeamMember(user.email))) {
      // A logged-in non-team account hitting /admin should land on the team
      // login (so they can sign in with a team account), NOT the member portal.
      return isAdminApi
        ? NextResponse.json({ error: "Forbidden" }, { status: 403 })
        : redirect("/admin/login");
    }
  }

  if (isAdminLogin && user && (await isTeamMember(user.email))) {
    return redirect("/admin");
  }

  // ── Member portal: require any authenticated user ──
  if (isAccount && !isAccountAuth && !user) {
    return redirect("/account/login");
  }
  if (path === "/account/login" && user) {
    return redirect("/account");
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/account/:path*", "/experience/:path*", "/hardware/:path*"],
};
