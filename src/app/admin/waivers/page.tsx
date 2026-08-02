import Link from "next/link";
import { createAdminClient } from "@/lib/supabase";
import { editionLabel } from "@/lib/edition-label";

export const dynamic = "force-dynamic";

type Sig = {
  id: string;
  booking_id: string;
  signed_name: string | null;
  signed_at: string | null;
  version: number | null;
  exp_bookings: {
    name: string | null;
    status: string | null;
    contacts: { name: string | null } | null;
    exp_experiences: { title: string | null } | null;
    exp_editions: { label: string | null; year: number | null; date_start: string | null; date_end: string | null } | null;
  } | null;
};

type Pending = {
  id: string;
  name: string | null;
  status: string | null;
  contacts: { name: string | null } | null;
  exp_experiences: { title: string | null } | null;
  exp_editions: { label: string | null; year: number | null; date_start: string | null } | null;
};

const fmt = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";

export default async function AdminWaiversPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;

  const { data: sigsRaw } = await db
    .from("exp_waiver_signatures")
    .select("id, booking_id, signed_name, signed_at, version, exp_bookings(name, status, contacts(name), exp_experiences(title), exp_editions(label, year, date_start, date_end))")
    .order("signed_at", { ascending: false });
  const sigs = (sigsRaw ?? []) as Sig[];
  const signedBookingIds = new Set(sigs.map((s) => s.booking_id));

  // Pending = bookings for upcoming editions (real bookings, not raw leads) with no signature.
  const today = new Date().toISOString().slice(0, 10);
  const { data: upcomingRaw } = await db
    .from("exp_bookings")
    .select("id, name, status, contacts(name), exp_experiences(title), exp_editions!inner(label, year, date_start)")
    .gte("exp_editions.date_start", today)
    // Only secured bookings (confirmed onward) need a waiver — exclude every
    // pre-deposit + dead status, across both the lean and legacy pipelines.
    .not("status", "in", '("lead","reserved","registered","interested","enquiring","contact_by_phone","ready_to_book","payment_pending","cancelled","lost")');
  const pending = ((upcomingRaw ?? []) as Pending[]).filter((b) => !signedBookingIds.has(b.id));

  const who = (c: { name: string | null } | null, fallback: string | null) => c?.name || fallback || "—";

  return (
    <div className="p-6 sm:p-8 max-w-[1000px] mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold admin-heading mb-1">Waivers</h1>
        <p className="text-sm admin-muted">Participation waivers signed in the member area, and who still needs to sign before their trip.</p>
      </div>

      {/* Pending */}
      <section className="mb-8">
        <h2 className="text-xs font-bold uppercase tracking-wide admin-faint mb-3">Awaiting signature · {pending.length}</h2>
        {pending.length === 0 ? (
          <div className="rounded-xl p-5 text-sm admin-faint" style={{ border: "1px solid var(--admin-border)" }}>Everyone with an upcoming trip has signed. 🎉</div>
        ) : (
          <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
            {pending.map((b, i) => (
              <Link key={b.id} href={`/admin/bookings/${b.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--admin-surface-hover)] transition-colors" style={i ? { borderTop: "1px solid var(--admin-border)" } : undefined}>
                <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
                <span className="text-sm font-semibold admin-heading flex-1 truncate">{who(b.contacts, b.name)}</span>
                <span className="text-xs admin-muted truncate hidden sm:block">{b.exp_experiences?.title ?? "—"}</span>
                <span className="text-xs admin-faint shrink-0">{editionLabel(b.exp_editions)} · {fmt(b.exp_editions?.date_start)}</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Signed */}
      <section>
        <h2 className="text-xs font-bold uppercase tracking-wide admin-faint mb-3">Signed · {sigs.length}</h2>
        {sigs.length === 0 ? (
          <div className="rounded-xl p-5 text-sm admin-faint" style={{ border: "1px solid var(--admin-border)" }}>No waivers signed yet.</div>
        ) : (
          <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
            {sigs.map((s, i) => (
              <Link key={s.booking_id} href={`/admin/waivers/${s.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-[var(--admin-surface-hover)] transition-colors" style={i ? { borderTop: "1px solid var(--admin-border)" } : undefined}>
                <span className="w-5 h-5 rounded-full bg-green-500/15 text-green-500 grid place-items-center text-[11px] font-bold shrink-0">✓</span>
                <span className="text-sm font-semibold admin-heading flex-1 truncate">{s.signed_name || who(s.exp_bookings?.contacts ?? null, s.exp_bookings?.name ?? null)}</span>
                <span className="text-xs admin-muted truncate hidden sm:block">{s.exp_bookings?.exp_experiences?.title ?? "—"}</span>
                <span className="text-xs admin-faint shrink-0">signed {fmt(s.signed_at)}{s.version ? ` · v${s.version}` : ""}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
