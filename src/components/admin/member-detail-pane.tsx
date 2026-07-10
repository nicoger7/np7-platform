"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AdminMemberLevel } from "@/components/admin/admin-member-level";
import { SpotguideTrust } from "@/components/admin/spotguide-trust";
import { MemberPortalPreview } from "@/components/admin/member-portal-preview";

interface MemberData {
  contact: { id: string; name: string; email: string | null; phone: string | null; country: string | null; level: string | null; auth_user_id?: string | null };
  bookings: { id: string; name: string | null; status: string | null; agreed_price: number | null; created_at: string; exp_experiences: { title: string } | null; exp_editions: { label: string | null; year: number | null } | null }[];
  payments: { id: string; amount: number | null; direction: string | null; status: string | null; type: string | null; date: string | null; reference: string | null }[];
  emails: { template_key: string; subject: string | null; status: string | null; to_email?: string | null; provider_id?: string | null; sent_at: string | null; created_at: string }[];
  documents: { id: string; type: string; invoice_number: string | null; amount: number | null; currency: string; issued_at: string; status: string }[];
  reviews: { id: string; rating: number | null; quote: string | null; status: string; photo_url: string | null }[];
  gallery: string[];
  canSeeMoney?: boolean;
}

const money = (n: number | null | undefined) => (n != null ? `€${Number(n).toLocaleString("en-US")}` : "—");
const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "—");

function Panel({ title, count, children }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <div className="rounded-xl p-5" style={{ backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
      <h2 className="text-sm font-bold admin-heading mb-3">{title}{count != null && <span className="admin-faint font-normal"> ({count})</span>}</h2>
      {children}
    </div>
  );
}

/**
 * The member detail body — used as the right pane of the Member Management split
 * view and (via the /admin/members/[id] redirect) for deep links. `onBack` shows
 * a mobile back affordance; on desktop the list rail stays visible so it's hidden.
 */
export function MemberDetailPane({ contactId, initialTab = "overview", onBack }: { contactId: string; initialTab?: "overview" | "level"; onBack?: () => void }) {
  const [d, setD] = useState<MemberData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "level" | "preview" | "emails">(initialTab);

  // Refetch when the selected member changes (split view swaps contactId in place).
  useEffect(() => {
    let alive = true;
    setLoading(true); setD(null);
    fetch(`/api/admin/members/${contactId}`).then((r) => r.json()).then((x) => { if (alive) { setD(x.error ? null : x); setLoading(false); } });
    return () => { alive = false; };
  }, [contactId]);
  // Follow the parent's Level-view toggle.
  useEffect(() => { setTab(initialTab); }, [initialTab]);

  // Carry the origin so a booking/contact's "back" returns here, not to a list.
  const from = encodeURIComponent(`/admin/members?id=${contactId}`);

  if (loading) return <div className="flex items-center justify-center h-64"><p className="text-sm admin-faint">Loading…</p></div>;
  if (!d) return <div className="py-16 text-center"><p className="text-sm admin-faint">Member not found</p></div>;
  const c = d.contact;

  return (
    <div>
      <div className="mb-6">
        {onBack && (
          <button onClick={onBack} className="inline-flex items-center gap-1 text-xs admin-faint hover:admin-heading mb-1.5">← All members</button>
        )}
        <div className="flex items-center gap-3 mt-1">
          <h1 className="text-2xl font-bold admin-heading">{c.name}</h1>
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${c.auth_user_id ? "bg-green-500/15 text-green-400" : "bg-gray-500/15 text-gray-400"}`}>{c.auth_user_id ? "Member" : "Guest"}</span>
        </div>
        <p className="text-sm admin-muted mt-0.5">{[c.email, c.phone, c.country, c.level].filter(Boolean).join(" · ") || "—"}</p>
        <Link href={`/admin/contacts/${c.id}?from=${from}`} className="text-xs text-[#0aa3c7] hover:underline">Edit contact →</Link>
      </div>

      <div className="flex items-center gap-1 mb-5 border-b" style={{ borderColor: "var(--admin-border)" }}>
        {([["overview", "Overview"], ["level", "Level & skills"], ["emails", "Emails"], ["preview", "Member view"]] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className="relative px-3 py-2 text-sm font-semibold transition-colors"
            style={{ color: tab === key ? "var(--admin-text)" : "var(--admin-text-muted)" }}
          >
            {label}
            {tab === key && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full" style={{ backgroundColor: "var(--admin-accent)" }} />}
          </button>
        ))}
      </div>

      {tab === "preview" ? (
        <MemberPortalPreview contactId={c.id} />
      ) : tab === "level" ? (
        <div className="space-y-4">
          <Panel title="Level & skills">
            <AdminMemberLevel contactId={c.id} />
          </Panel>
          <Panel title="Spotguide trust">
            <SpotguideTrust contactId={c.id} />
          </Panel>
        </div>
      ) : tab === "emails" ? (
        <Panel title="Emails to this member" count={d.emails.length}>
          {d.emails.length === 0 ? <p className="text-xs admin-faint">No emails to this member yet.</p> : (
            <div className="divide-y" style={{ borderColor: "var(--admin-border)" }}>
              {d.emails.map((e, i) => (
                <div key={i} className="flex items-center gap-3 py-2">
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm admin-heading truncate">{e.subject || (e.template_key || "").replace(/_/g, " ")}</span>
                    <span className="block text-[11px] admin-faint truncate">{(e.template_key || "").replace(/_/g, " ")}{e.to_email ? ` · ${e.to_email}` : ""}</span>
                  </span>
                  <span className={`text-xs w-20 text-right ${e.status === "sent" ? "text-green-400" : e.status === "failed" ? "text-red-400" : "admin-faint"}`}>{e.status === "sent" ? "sent ✓" : e.status}</span>
                  <span className="admin-faint text-xs w-20 text-right">{fmtDate(e.sent_at || e.created_at)}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] admin-faint mt-3 leading-relaxed">&ldquo;Sent&rdquo; means our email provider (Resend) <strong>accepted</strong> the message — it&rsquo;s not a delivery or read receipt. Check the Resend dashboard for delivery/bounce status.</p>
        </Panel>
      ) : (
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Panel title="Bookings" count={d.bookings.length}>
          {d.bookings.length === 0 ? <p className="text-xs admin-faint">No bookings.</p> : (
            <div className="space-y-1.5">
              {d.bookings.map((b) => (
                <Link key={b.id} href={`/admin/bookings/${b.id}?from=${from}`} className="flex items-center gap-3 text-xs py-1.5 px-2 -mx-2 rounded-lg hover:bg-[var(--admin-surface-hover)]">
                  <span className="flex-1 admin-heading truncate">{b.exp_experiences?.title || b.name || "—"} <span className="admin-faint">· {b.exp_editions?.label || b.exp_editions?.year || ""}</span></span>
                  <span className="admin-muted w-24 text-right">{(b.status || "—").replace(/_/g, " ")}</span>
                  <span className="admin-muted w-16 text-right">{money(b.agreed_price)}</span>
                </Link>
              ))}
            </div>
          )}
        </Panel>

        {d.canSeeMoney !== false && (<>
        <Panel title="Payments" count={d.payments.length}>
          {d.payments.length === 0 ? <p className="text-xs admin-faint">No payments.</p> : (
            <div className="space-y-1">
              {d.payments.map((p) => (
                <div key={p.id} className="flex items-center gap-3 text-xs py-1">
                  <span className="flex-1 admin-muted truncate">{(p.type || "—").replace(/_/g, " ")}{p.reference ? ` · ${p.reference}` : ""}</span>
                  <span className={`w-16 text-right ${p.status === "paid" ? "text-green-400" : "admin-faint"}`}>{p.status}</span>
                  <span className="admin-muted w-16 text-right">{money(p.amount)}</span>
                  <span className="admin-faint w-16 text-right">{fmtDate(p.date)}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Documents" count={d.documents.length}>
          {d.documents.length === 0 ? <p className="text-xs admin-faint">No documents.</p> : (
            <div className="space-y-1">
              {d.documents.map((doc) => (
                <div key={doc.id} className="flex items-center gap-3 text-xs py-1">
                  <span className="flex-1 admin-muted truncate">{doc.type.replace(/_/g, " ")}{doc.invoice_number ? ` · ${doc.invoice_number}` : ""}</span>
                  <span className="admin-muted w-16 text-right">{money(doc.amount)}</span>
                  <span className="admin-faint w-20 text-right">{fmtDate(doc.issued_at)}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
        </>)}

        <Panel title="Emails" count={d.emails.length}>
          {d.emails.length === 0 ? <p className="text-xs admin-faint">No emails.</p> : (
            <div className="space-y-1">
              {d.emails.map((e, i) => (
                <div key={i} className="flex items-center gap-3 text-xs py-1">
                  <span className="flex-1 admin-muted truncate">{(e.template_key || "").replace(/_/g, " ")}</span>
                  <span className={`w-14 text-right ${e.status === "sent" ? "text-green-400" : e.status === "failed" ? "text-red-400" : "admin-faint"}`}>{e.status}</span>
                  <span className="admin-faint w-16 text-right">{fmtDate(e.sent_at || e.created_at)}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        {d.reviews.length > 0 && (
          <Panel title="Reviews" count={d.reviews.length}>
            <div className="space-y-1.5">
              {d.reviews.map((r) => (
                <div key={r.id} className="text-xs py-1">
                  <span className="text-[#ffc42e]">{"★".repeat(Math.max(1, Math.min(5, r.rating || 5)))}</span>
                  <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] uppercase ${r.status === "approved" ? "bg-green-500/15 text-green-400" : "admin-surface admin-faint"}`}>{r.status}</span>
                  {r.quote && <p className="admin-muted mt-0.5 truncate">“{r.quote}”</p>}
                </div>
              ))}
            </div>
          </Panel>
        )}

        <Panel title="Trip photos" count={d.gallery.length}>
          {d.gallery.length === 0 ? <p className="text-xs admin-faint">No photos uploaded for their trips yet.</p> : (
            <div className="grid grid-cols-4 gap-1.5">
              {d.gallery.slice(0, 12).map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt="" className="aspect-square object-cover rounded-lg" />
              ))}
            </div>
          )}
        </Panel>

        <div className="rounded-xl p-5" style={{ backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
          <div className="flex items-center gap-2 mb-1">
            <h2 className="text-sm font-bold admin-heading">Activity log</h2>
            <span className="text-[8px] font-bold tracking-wider px-1.5 py-0.5 rounded uppercase" style={{ border: "1px solid var(--admin-border)", color: "var(--admin-text-muted)" }}>WIP</span>
          </div>
          <p className="text-xs admin-faint">A unified timeline of logins, emails, payments and changes is coming.</p>
        </div>
      </div>
      )}
    </div>
  );
}
