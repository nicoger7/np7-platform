import { createClient } from "@/lib/supabase/server";
import { getActiveTeamMember } from "@/lib/admin-auth";
import AdminShell from "./admin-shell";

export const metadata = {
  title: "NP7 Admin",
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

  return <AdminShell user={user!} accessLevel={member.accessLevel}>{children}</AdminShell>;
}
