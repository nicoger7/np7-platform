import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
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

  if (!user) {
    return <>{children}</>;
  }

  return <AdminShell user={user}>{children}</AdminShell>;
}
