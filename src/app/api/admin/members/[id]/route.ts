import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { getMemoryPhotos } from "@/lib/portal-data";

// GET /api/admin/members/:id — aggregate everything for one member (id = contact id).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { id } = await params;

  const { data: contact, error } = await db.from("contacts").select("*").eq("id", id).maybeSingle();
  if (error || !contact) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const [bookingsRes, payments, emails, documents] = await Promise.all([
    db.from("exp_bookings")
      .select("id,name,status,agreed_price,edition_id,created_at,exp_experiences(title,slug),exp_editions(label,year,date_start)")
      .eq("contact_id", id).order("created_at", { ascending: false }),
    db.from("exp_payments").select("id,amount,direction,status,type,date,reference").eq("contact_id", id).order("date", { ascending: false }),
    db.from("email_log").select("template_key,subject,status,sent_at,created_at").eq("contact_id", id).order("created_at", { ascending: false }).limit(15),
    db.from("documents").select("id,type,invoice_number,amount,currency,issued_at,status").eq("contact_id", id).order("issued_at", { ascending: false }),
  ]);

  const bookings = bookingsRes.data ?? [];
  const bookingIds = bookings.map((b: { id: string }) => b.id);

  // Reviews submitted by this member (via their bookings).
  let reviews: unknown[] = [];
  if (bookingIds.length) {
    const { data } = await db.from("exp_reviews").select("id,rating,quote,status,photo_url,created_at").in("booking_id", bookingIds);
    reviews = data ?? [];
  }

  // Memory photos across the member's editions.
  const editionIds = Array.from(new Set(bookings.map((b: { edition_id: string | null }) => b.edition_id).filter(Boolean))) as string[];
  const gallery = (await Promise.all(editionIds.map((e) => getMemoryPhotos(e).catch(() => [])))).flat();

  return NextResponse.json({
    contact,
    bookings,
    payments: payments.data ?? [],
    emails: emails.data ?? [],
    documents: documents.data ?? [],
    reviews,
    gallery,
  });
}
