import type { Viewport } from "next";
import { createClient } from "@/lib/supabase/server";
import { getActiveTeamMember, getEffectiveAccess } from "@/lib/admin-auth";
import AdminShell from "./admin-shell";

export const metadata = {
  title: "NP7 Admin",
  // Separate home-screen app for the team — own manifest (start_url /admin) and
  // its own icon, distinct from the member app installed from the public site.
  manifest: "/manifest.admin.webmanifest",
  appleWebApp: { capable: true, title: "NP7 Admin", statusBarStyle: "black-translucent" as const },
  icons: { apple: "/icons/admin-apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Show the admin chrome only to active team members. A merely-authenticated
  // account (e.g. a member-portal user, or a stale session) landing on
  // /admin/login must see just the login form — not the full navigation.
  const member = user ? await getActiveTeamMember(user) : null;
  if (!member) {
    return <>{children}</>;
  }
  const access = await getEffectiveAccess(member);

  return <AdminShell user={user!} access={access}>{children}</AdminShell>;
}
