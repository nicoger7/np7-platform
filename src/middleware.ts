import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { canAccess, normalizeLevel } from "@/lib/access";

/** Active team member behind a session email + their access level (service role). */
async function teamMemberFor(email: string | undefined): Promise<{ active: boolean; level: ReturnType<typeof normalizeLevel> } | null> {
  if (!email) return null;
  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
  // select("*") so a not-yet-migrated access_level column can't error the query.
  const { data } = await admin.from("team_members").select("*").ilike("email", email).maybeSingle();
  if (!data) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { active: (data as any).active !== false, level: normalizeLevel((data as any).access_level) };
}

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // ── Remember the active sub-site so the member portal keeps that section's
  //    header. Public Experience/Hardware pages need no auth, so set the cookie
  //    and return early (skips the Supabase round-trip on every page view). ──
  if (!path.startsWith("/admin") && !path.startsWith("/account") && !path.startsWith("/api")) {
    // The shared magazine/about pages carry the world they were opened from via
    // ?from= (the header links set it) — persist it so posts/internal nav inherit it.
    const from = request.nextUrl.searchParams.get("from");
    const section =
      path.startsWith("/hardware") ? "hardware"
      : path.startsWith("/experience") ? "experience"
      : (path.startsWith("/blog") || path.startsWith("/about")) && (from === "hardware" || from === "experience") ? from
      : null;
    const res = NextResponse.next({ request });
    if (section && request.cookies.get("np7_section")?.value !== section) {
      res.cookies.set("np7_section", section, { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax" });
    }
    return res; // public pages — no auth round-trip
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

  // ── Admin (pages + API): require an active team member, gated by access level ──
  if (isAdminApi || (isAdminPage && !isAdminLogin)) {
    if (!user) {
      return isAdminApi
        ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        : redirect("/admin/login");
    }
    const member = await teamMemberFor(user.email);
    if (!member || !member.active) {
      // A logged-in non-team account hitting /admin should land on the team
      // login (so they can sign in with a team account), NOT the member portal.
      return isAdminApi
        ? NextResponse.json({ error: "Forbidden" }, { status: 403 })
        : redirect("/admin/login");
    }
    // Owner-only sections (finance, settings, team/payroll) → managers bounce home.
    if (!canAccess(member.level, path)) {
      return isAdminApi
        ? NextResponse.json({ error: "Forbidden" }, { status: 403 })
        : redirect("/admin");
    }
  }

  if (isAdminLogin && user) {
    const member = await teamMemberFor(user.email);
    if (member && member.active) return redirect("/admin");
  }

  // ── Member portal: require any authenticated user ──
  if (isAccount && !isAccountAuth && !user) {
    return redirect("/account/login");
  }
  if (path === "/account/login" && user) {
    return redirect("/account");
  }

  // ── Member-portal theming context ──
  // Trip-side pages (trips, progress, a trip) live in the Experience world; the
  // shop pages (gear, cart) in Hardware. Visiting one updates the persistent
  // section so the neutral pages (home, profile, vouchers, account) follow.
  if (isAccount && !isAccountAuth) {
    const section =
      path.startsWith("/account/gear") || path.startsWith("/account/cart") ? "hardware"
      : path.startsWith("/account/trips") || path.startsWith("/account/level") || path.startsWith("/account/bookings") ? "experience"
      : null;
    if (section && request.cookies.get("np7_section")?.value !== section) {
      supabaseResponse.cookies.set("np7_section", section, { path: "/", maxAge: 60 * 60 * 24 * 30, sameSite: "lax" });
    }
  }

  return supabaseResponse;
}

export const config = {
  matcher: ["/admin/:path*", "/api/admin/:path*", "/account/:path*", "/experience/:path*", "/hardware/:path*", "/blog/:path*", "/about/:path*"],
};
