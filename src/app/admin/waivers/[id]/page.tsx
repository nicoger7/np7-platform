import Link from "next/link";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase";
import { sanitizeWaiverHtml } from "@/lib/sanitize";

export const dynamic = "force-dynamic";
export const metadata = { title: "Signed waiver — NP7 Admin" };

/**
 * One signed waiver, in full.
 *
 * A waiver is only worth having if you can produce it later, and until now the
 * signature existed solely as a base64 blob on a row nobody could open. This
 * shows the four things that make it evidence: who typed their name, when, from
 * where, and — for signatures taken after we started archiving it — the exact
 * wording they were shown. Older rows have no archived text; the page says so
 * rather than implying the current wording is what they saw.
 */
export default async function AdminWaiverPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = createAdminClient() as any;
  const { data: w } = await db
    .from("exp_waiver_signatures")
    .select("*, exp_bookings(id, name, exp_experiences(title), exp_editions(date_start, date_end)), contacts(name, email)")
    .eq("id", id)
    .maybeSingle();
  if (!w) notFound();

  const when = w.signed_at ?? w.created_at;
  const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString("en-GB", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");
  const facts: [string, string][] = [
    ["Signed by", w.signed_name || w.full_name || w.contacts?.name || "—"],
    ["Email", w.contacts?.email || "—"],
    ["Signed at", fmt(when)],
    ["Version", w.version != null ? `v${w.version}` : "—"],
    ["IP address", w.ip || w.ip_address || "—"],
    ["Browser", w.user_agent || "—"],
    ["Document SHA-256", w.document_sha256 || "not fingerprinted (signed before migration 136)"],
  ];

  return (
    <div className="max-w-[820px]">
      <Link href="/admin/waivers" className="inline-flex items-center gap-1.5 text-xs font-semibold admin-muted hover:text-[var(--admin-accent)] transition-colors mb-1">
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
        All waivers
      </Link>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-bold admin-heading mb-1">Signed waiver</h1>
        {/* The document itself — what you'd actually attach to an email or hand
            to a lawyer. Older signatures have no PDF and say so. */}
        {w.document_url ? (
          <a href={w.document_url} target="_blank" rel="noopener noreferrer"
            className="shrink-0 text-[13px] font-bold px-4 py-2 rounded-lg bg-[#0aa3c7] text-white">
            Download PDF ↗
          </a>
        ) : (
          <span className="shrink-0 text-[12px] admin-faint max-w-[26ch] text-right">
            No PDF — signed before the document was generated.
          </span>
        )}
      </div>
      <p className="text-sm admin-muted mb-5">
        {w.exp_bookings?.exp_experiences?.title ?? "Trip"}
        {w.exp_bookings?.id && <> · <Link href={`/admin/bookings/${w.exp_bookings.id}`} className="text-[#0aa3c7] hover:underline">open the booking →</Link></>}
      </p>

      <div className="rounded-xl p-5 mb-4" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-[10px] font-bold tracking-[0.12em] uppercase admin-faint">{k}</dt>
              <dd className="text-[13.5px] admin-heading break-words">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="rounded-xl p-5 mb-4" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
        <h2 className="text-sm font-bold admin-heading mb-3">Signature</h2>
        {w.signature_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={w.signature_image} alt="Signature" className="max-w-full bg-white rounded-lg p-3" style={{ border: "1px solid var(--admin-border)" }} />
        ) : (
          <p className="text-xs admin-faint">Typed name only — no drawn signature was captured.</p>
        )}
      </div>

      <div className="rounded-xl p-5" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
        <h2 className="text-sm font-bold admin-heading mb-3">What they agreed to</h2>
        {/* The archived snapshot of what this person signed. It was stored before
            renderWaiver sanitized, so filter it on the way to the screen too — an
            old row must not be able to run script in an admin session. */}
        {w.waiver_text ? (
          <div className="admin-heading text-[13.5px] leading-relaxed max-h-[520px] overflow-y-auto rounded-lg bg-white text-[#0a2a33] p-4" style={{ border: "1px solid var(--admin-border)" }}
            dangerouslySetInnerHTML={{ __html: sanitizeWaiverHtml(w.waiver_text) }} />
        ) : (
          <p className="text-xs text-amber-500">
            Not archived for this signature — it was signed before we started storing the wording.
            The version above ({w.version != null ? `v${w.version}` : "unknown"}) is the only record of which text was shown.
          </p>
        )}
      </div>
    </div>
  );
}
