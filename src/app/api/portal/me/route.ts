import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";

// Lightweight identity + prefill for logged-in members (used by the reserve form).
export async function GET() {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ loggedIn: false });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data } = await db.from("contacts").select("name, email, phone, country, avatar_url").eq("id", user.contactId).maybeSingle();
  const [firstName, ...rest] = (data?.name ?? user.name ?? "").split(" ");
  return NextResponse.json({
    loggedIn: true,
    firstName: firstName ?? "",
    lastName: rest.join(" "),
    email: data?.email ?? user.email,
    phone: data?.phone ?? "",
    country: data?.country ?? "",
    avatarUrl: data?.avatar_url ?? null,
  });
}
