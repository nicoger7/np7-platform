import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase";

/**
 * Member submits a note about a spot in a magazine spotguide. Logged-in only.
 * Lands as a "pending" note for the team to moderate (see /admin/blog/notes).
 */
export async function POST(request: NextRequest) {
  const user = await getPortalUser({ allowPreview: false }).catch(() => null);
  if (!user) return NextResponse.json({ error: "Please log in to add a note." }, { status: 401 });

  let body: { slug?: string; spotName?: string; body?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const slug = (body.slug ?? "").trim();
  const spotName = (body.spotName ?? "").trim();
  const text = (body.body ?? "").trim();
  if (!slug || !spotName) return NextResponse.json({ error: "Missing spot." }, { status: 400 });
  if (text.length < 4) return NextResponse.json({ error: "Please write a little more." }, { status: 400 });
  if (text.length > 1200) return NextResponse.json({ error: "That's a bit long — keep it under 1200 characters." }, { status: 400 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: post } = await db.from("exp_blog_posts").select("id").eq("slug", slug).maybeSingle();
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });

  const firstName = (user.name ?? "").split(" ")[0] || "Member";
  const { error } = await db.from("exp_blog_spot_notes").insert({
    blog_post_id: post.id,
    spot_name: spotName,
    contact_id: user.contactId,
    author_name: firstName,
    body: text,
    status: "pending",
  });
  if (error) return NextResponse.json({ error: "Could not save your note. Please try again." }, { status: 500 });

  return NextResponse.json({ ok: true });
}
