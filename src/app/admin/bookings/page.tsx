"use client";

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SortableHeader } from "@/components/sortable-header";
import { ColumnToggle, ColumnDef, buildGridTemplate, loadVisibleColumns } from "@/components/column-toggle";
import { NewBookingModal } from "@/components/new-booking-modal";
import { normalizeBookingStatus } from "@/lib/types";
import { editionLabel, editionSortKey } from "@/lib/edition-label";
import { BookingDetailPane } from "./[id]/page";

interface Booking {
  id: string;
  name: string;
  status: string;
  experience: { id: string; title: string; location: string } | null;
  edition: { id: string; year: number; label: string | null; date_end: string | null } | null;
  package: { id: string; name: string } | null;
  contact: { id: string; name: string; email: string; phone: string } | null;
  agreed_price: number | null;
  fly_in: string | null;
  fly_out: string | null;
  traveling_with: string | null;
  total_paid: number;
  outstanding: number;
  downpayment_received: boolean;
  downpayment_invoice_sent: boolean;
  final_payment_received: boolean;
  final_invoice_sent: boolean;
  final_invoice_due: string | null;
  wa_group: boolean;
  notes: string | null;
  created_at: string;
}

// Lean self-serve pipeline. Payment progress (Stripe deposit → downpayment →
// full) lives on the booking + Payments page, not as columns here.
const STATUSES = [
  { value: "lead", label: "Lead", color: "bg-gray-500" },
  // Derived: a lead that's gone quiet (no movement for FOLLOW_UP_DAYS) — chase it.
  { value: "follow_up", label: "Follow-up", color: "bg-amber-400" },
  { value: "reserved", label: "Reserved", color: "bg-amber-500" },
  // Derived: reserved but the down-payment is past its DOWNPAYMENT_DAYS window, unpaid.
  { value: "payment_due", label: "Payment due", color: "bg-orange-500" },
  { value: "confirmed", label: "Confirmed", color: "bg-blue-500" },
  { value: "paid", label: "Fully paid", color: "bg-green-600" },
  { value: "attended", label: "Attended", color: "bg-gray-400" },
  { value: "lost", label: "Lost", color: "bg-red-500" },
  // Derived (not a DB value): a 'lead' whose edition already ended, or an unpaid
  // booking past the downpayment deadline + grace — the spot is no longer held.
  // Kept out of the active funnel; see effStatus().
  { value: "expired", label: "Expired", color: "bg-gray-500/60" },
];

// A lead idle this long → "follow-up"; a reserved spot unpaid this long → "payment due".
const FOLLOW_UP_DAYS = 14;
const DOWNPAYMENT_DAYS = 14;
// Chase window after the missed downpayment. Past due + grace the booking drops
// out of the active funnel as "expired" — the spot is no longer held for them
// (mark it Lost, or record the payment if it turns up and it un-expires).
const RELEASE_GRACE_DAYS = 7;
const daysSince = (iso: string | null) => (iso ? (Date.now() - Date.parse(iso)) / 86_400_000 : 0);

// Pipeline ordering — most-advanced first; dead/expired sink to the bottom.
const STATUS_RANK: Record<string, number> = { attended: 5, paid: 4, confirmed: 3, payment_due: 2, reserved: 2, lead: 1, follow_up: 1, expired: 0, lost: -1 };

// A lead whose trip is already over → treat as "expired" in the view only
// (the row stays status='lead' in the DB).
function isExpiredLead(b: Booking): boolean {
  if (normalizeBookingStatus(b.status) !== "lead") return false;
  const end = b.edition?.date_end;
  return !!end && new Date(end) < new Date();
}
// View-only overlays on the real DB status (no migration): a stale lead →
// "follow-up", an overdue down-payment → "payment due", and past the grace
// window → "expired" (spot no longer held; sinks out of the active funnel).
function effStatus(b: Booking): string {
  const s = normalizeBookingStatus(b.status);
  const unpaidPast = (days: number) => !b.downpayment_received && daysSince(b.created_at) > days;
  if (s === "lead") {
    if (isExpiredLead(b)) return "expired";
    if (unpaidPast(DOWNPAYMENT_DAYS + RELEASE_GRACE_DAYS)) return "expired";
    if (unpaidPast(DOWNPAYMENT_DAYS)) return "payment_due";
    if (daysSince(b.created_at) > FOLLOW_UP_DAYS) return "follow_up";
    return "lead";
  }
  if (s === "reserved" && unpaidPast(DOWNPAYMENT_DAYS + RELEASE_GRACE_DAYS)) return "expired";
  if (s === "reserved" && unpaidPast(DOWNPAYMENT_DAYS)) return "payment_due";
  return s;
}

type ViewMode = "table" | "pipeline";
type SortDir = "asc" | "desc" | null;

const COLUMNS: ColumnDef[] = [
  { key: "name", label: "Name", width: "1fr", required: true },
  { key: "contact", label: "Contact", width: "150px", defaultHidden: true },
  { key: "experience", label: "Experience", width: "140px" },
  { key: "edition", label: "Edition", width: "110px", defaultHidden: true },
  { key: "package", label: "Package", width: "140px", defaultHidden: true },
  { key: "status", label: "Status", width: "120px" },
  { key: "fly_in", label: "Fly In", width: "100px" },
  { key: "fly_out", label: "Fly Out", width: "100px" },
  { key: "traveling_with", label: "Traveling With", width: "130px", defaultHidden: true },
  { key: "agreed_price", label: "Price", width: "100px" },
  { key: "total_paid", label: "Paid", width: "100px", defaultHidden: true },
  { key: "outstanding", label: "Outstanding", width: "100px" },
  { key: "downpayment_received", label: "Downpmt", width: "90px", defaultHidden: true },
  { key: "downpayment_invoice_sent", label: "DP Invoice", width: "90px", defaultHidden: true },
  { key: "final_payment_received", label: "Final Pmt", width: "90px", defaultHidden: true },
  { key: "final_invoice_sent", label: "Final Inv", width: "90px", defaultHidden: true },
  { key: "final_invoice_due", label: "Final Due", width: "100px", defaultHidden: true },
  { key: "wa_group", label: "WA Group", width: "90px", defaultHidden: true },
  { key: "notes", label: "Notes", width: "180px", defaultHidden: true },
  { key: "created_at", label: "Created", width: "100px", defaultHidden: true },
];

const STORAGE_KEY = "np7-bookings-columns";

function StatusBadge({ status }: { status: string }) {
  // Accept either a derived value (e.g. "expired") or a raw DB status.
  const s = STATUSES.find((x) => x.value === status) ?? STATUSES.find((x) => x.value === normalizeBookingStatus(status));
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span className={`w-2 h-2 rounded-full ${s?.color || "bg-gray-500"}`} />
      <span className="admin-muted">{s?.label || status}</span>
    </span>
  );
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Check({ v }: { v: boolean }) {
  return v
    ? <span className="text-green-400 text-xs font-bold">✓</span>
    : <span className="admin-faint text-xs">—</span>;
}

function compareValues(a: unknown, b: unknown, dir: "asc" | "desc"): number {
  if (a == null && b == null) return 0;
  if (a == null) return dir === "asc" ? 1 : -1;
  if (b == null) return dir === "asc" ? -1 : 1;
  const aNum = Number(a);
  const bNum = Number(b);
  if (!isNaN(aNum) && !isNaN(bNum)) return dir === "asc" ? aNum - bNum : bNum - aNum;
  const cmp = String(a).localeCompare(String(b));
  return dir === "asc" ? cmp : -cmp;
}

function BookingsInner() {
  const router = useRouter();
  const params = useSearchParams();
  const selectedId = params.get("id");
  const select = (bid: string) => router.push(`/admin/bookings?id=${bid}`, { scroll: false });
  const clearSelection = () => {
    const sp = new URLSearchParams(params.toString());
    sp.delete("id");
    router.push(`/admin/bookings${sp.toString() ? `?${sp}` : ""}`, { scroll: false });
  };
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("table");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterExperience, setFilterExperience] = useState<string>("");
  const [showNew, setShowNew] = useState(false);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    () => loadVisibleColumns(STORAGE_KEY, COLUMNS)
  );

  useEffect(() => {
    fetch("/api/admin/bookings")
      .then((r) => r.json())
      .then((d) => {
        setBookings(d.bookings || []);
        setLoading(false);
      });
  }, []);

  function handleSort(key: string) {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") { setSortKey(null); setSortDir(null); }
      else setSortDir("asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const experiences = Array.from(
    new Map(
      bookings.filter((b) => b.experience).map((b) => [b.experience!.id, b.experience!])
    ).values()
  );

  const filtered = bookings.filter((b) => {
    if (filterStatus && effStatus(b) !== filterStatus) return false;
    if (filterExperience && b.experience?.id !== filterExperience) return false;
    return true;
  });

  const rank = (b: Booking) => STATUS_RANK[effStatus(b)] ?? 0;
  const sorted = sortKey && sortDir
    ? [...filtered].sort((a, b) => {
        if (sortKey === "status") {
          const d = rank(a) - rank(b);
          return sortDir === "asc" ? d : -d;
        }
        let aVal: unknown;
        let bVal: unknown;
        if (sortKey === "experience") {
          aVal = a.experience?.title;
          bVal = b.experience?.title;
        } else if (sortKey === "contact") {
          aVal = a.contact?.name;
          bVal = b.contact?.name;
        } else if (sortKey === "package") {
          aVal = a.package?.name;
          bVal = b.package?.name;
        } else if (sortKey === "edition") {
          // Jahr zuerst — "Week I" allein wäre über Jahre hinweg mehrdeutig
          aVal = editionSortKey(a.edition);
          bVal = editionSortKey(b.edition);
        } else {
          aVal = a[sortKey as keyof Booking];
          bVal = b[sortKey as keyof Booking];
        }
        return compareValues(aVal, bVal, sortDir);
      })
    // Default order: highest pipeline status up, then most-recently created.
    : [...filtered].sort((a, b) => rank(b) - rank(a) || (b.created_at || "").localeCompare(a.created_at || ""));

  // Pipeline view groups
  const pipelineGroups = STATUSES.filter(
    (s) => !["attended", "lost", "expired"].includes(s.value)
  ).map((s) => ({
    ...s,
    bookings: filtered.filter((b) => effStatus(b) === s.value),
  }));

  const gridTemplate = buildGridTemplate(COLUMNS, visibleColumns);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Bookings</h1>
          <p className="text-sm admin-muted">
            {bookings.length} booking{bookings.length !== 1 ? "s" : ""} across all experiences
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Column toggle — only for table view */}
          {view === "table" && (
            <ColumnToggle
              columns={COLUMNS}
              visible={visibleColumns}
              onChange={setVisibleColumns}
              storageKey={STORAGE_KEY}
            />
          )}

          {/* View toggle */}
          <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
            <button
              onClick={() => setView("table")}
              className="px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                backgroundColor: view === "table" ? "var(--admin-active)" : "transparent",
                color: view === "table" ? "var(--admin-text)" : "var(--admin-text-faint)",
              }}
            >
              Table
            </button>
            <button
              onClick={() => setView("pipeline")}
              className="px-3 py-1.5 text-xs font-medium transition-colors"
              style={{
                backgroundColor: view === "pipeline" ? "var(--admin-active)" : "transparent",
                color: view === "pipeline" ? "var(--admin-text)" : "var(--admin-text-faint)",
                borderLeft: "1px solid var(--admin-border)",
              }}
            >
              Pipeline
            </button>
          </div>

          <button
            className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors"
            onClick={() => setShowNew(true)}
          >
            New Booking
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="admin-input text-sm px-3 py-1.5 rounded-lg">
          <option value="">All Statuses</option>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>

        {experiences.length > 1 && (
          <select value={filterExperience} onChange={(e) => setFilterExperience(e.target.value)} className="admin-input text-sm px-3 py-1.5 rounded-lg">
            <option value="">All Experiences</option>
            {experiences.map((exp) => (
              <option key={exp.id} value={exp.id}>{exp.title}</option>
            ))}
          </select>
        )}

        {(filterStatus || filterExperience) && (
          <button
            onClick={() => { setFilterStatus(""); setFilterExperience(""); }}
            className="text-xs admin-faint hover:admin-muted transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading...</div>
      ) : selectedId ? (
        /* ── A booking is selected → back button + compact rail + detail ── */
        <>
          <button onClick={clearSelection} className="mb-4 inline-flex items-center gap-1.5 text-sm admin-faint hover:admin-muted transition-colors">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M11 18l-6-6 6-6" /></svg>
            All bookings
          </button>
          <div className="lg:flex lg:gap-6 lg:items-start">
          <aside className="hidden lg:flex flex-col gap-1.5 lg:w-[320px] lg:shrink-0 lg:sticky lg:top-0 lg:max-h-[calc(100vh-11rem)] lg:overflow-y-auto lg:-mr-1 lg:pr-1">
            {sorted.map((b) => {
              const active = b.id === selectedId;
              return (
                <div key={b.id} onClick={() => select(b.id)} className="cursor-pointer rounded-xl border px-3.5 py-3 transition-colors"
                  style={active ? { backgroundColor: "var(--admin-accent-weak)", borderColor: "var(--admin-accent)" } : { backgroundColor: "var(--admin-surface)", borderColor: "var(--admin-border)" }}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium admin-heading truncate flex-1">{b.contact?.name || b.name}</span>
                    <StatusBadge status={effStatus(b)} />
                  </div>
                  <p className="text-xs admin-faint truncate mt-0.5">{b.experience?.title || "—"}{b.edition ? ` · ${editionLabel(b.edition)}` : ""}</p>
                </div>
              );
            })}
          </aside>
          <section className="flex-1 min-w-0">
            <BookingDetailPane bookingId={selectedId} onBack={clearSelection} />
          </section>
          </div>
        </>
      ) : bookings.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm admin-faint">No bookings yet</p>
          <p className="text-xs admin-faint mt-1">Run the migration first, then bookings will appear here</p>
        </div>
      ) : view === "table" ? (
        /* ── Table view ── (scrolls horizontally on narrow screens) */
        <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
        <div className="rounded-xl overflow-hidden min-w-[760px]" style={{ border: "1px solid var(--admin-border)" }}>
          {/* Header */}
          <div
            className="grid gap-3 px-5 py-3 admin-surface"
            style={{ gridTemplateColumns: gridTemplate, borderBottom: "1px solid var(--admin-border)" }}
          >
            {COLUMNS.filter((c) => c.required || visibleColumns.has(c.key)).map((col) => (
              <SortableHeader
                key={col.key}
                label={col.label}
                sortKey={col.key}
                currentSort={sortKey}
                currentDir={sortDir}
                onSort={handleSort}
              />
            ))}
          </div>

          {/* Rows */}
          {sorted.map((b) => (
            <div
              key={b.id}
              className="grid gap-3 px-5 py-3 transition-colors cursor-pointer"
              style={{ gridTemplateColumns: gridTemplate, borderBottom: "1px solid var(--admin-border)" }}
              onClick={() => select(b.id)}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              {/* name — required */}
              <div className="min-w-0">
                <div className="text-sm font-medium admin-heading truncate">{b.name}</div>
                {b.contact && <div className="text-xs admin-faint truncate">{b.contact.email}</div>}
              </div>
              {visibleColumns.has("contact") && (
                <span className="text-xs admin-muted truncate self-center">{b.contact?.name || "—"}</span>
              )}
              {visibleColumns.has("experience") && (
                <span className="text-xs admin-muted truncate self-center">{b.experience?.title || "—"}</span>
              )}
              {visibleColumns.has("edition") && (
                <span className="text-xs admin-muted truncate self-center">
                  {b.edition ? (b.edition.label ? `${b.edition.label} · ${b.edition.year}` : b.edition.year) : "—"}
                </span>
              )}
              {visibleColumns.has("package") && (
                <span className="text-xs admin-muted truncate self-center">{b.package?.name || "—"}</span>
              )}
              {visibleColumns.has("status") && (
                <span className="self-center"><StatusBadge status={effStatus(b)} /></span>
              )}
              {visibleColumns.has("fly_in") && (
                <span className="text-xs admin-muted self-center">{formatDate(b.fly_in)}</span>
              )}
              {visibleColumns.has("fly_out") && (
                <span className="text-xs admin-muted self-center">{formatDate(b.fly_out)}</span>
              )}
              {visibleColumns.has("traveling_with") && (
                <span className="text-xs admin-muted truncate self-center">{b.traveling_with || "—"}</span>
              )}
              {visibleColumns.has("agreed_price") && (
                <span className="text-xs admin-muted self-center">
                  {b.agreed_price ? `€${Number(b.agreed_price).toLocaleString()}` : "—"}
                </span>
              )}
              {visibleColumns.has("total_paid") && (
                <span className="text-xs admin-muted self-center">
                  {b.total_paid ? `€${Number(b.total_paid).toLocaleString()}` : "—"}
                </span>
              )}
              {visibleColumns.has("outstanding") && (
                <span className={`text-xs self-center font-medium ${b.outstanding > 0 ? "text-amber-400" : "text-green-400"}`}>
                  {b.outstanding > 0
                    ? `€${b.outstanding.toLocaleString()}`
                    : b.agreed_price
                    ? "✓ Paid"
                    : "—"}
                </span>
              )}
              {visibleColumns.has("downpayment_received") && (
                <span className="self-center"><Check v={b.downpayment_received} /></span>
              )}
              {visibleColumns.has("downpayment_invoice_sent") && (
                <span className="self-center"><Check v={b.downpayment_invoice_sent} /></span>
              )}
              {visibleColumns.has("final_payment_received") && (
                <span className="self-center"><Check v={b.final_payment_received} /></span>
              )}
              {visibleColumns.has("final_invoice_sent") && (
                <span className="self-center"><Check v={b.final_invoice_sent} /></span>
              )}
              {visibleColumns.has("final_invoice_due") && (
                <span className="text-xs admin-muted self-center">{formatDate(b.final_invoice_due)}</span>
              )}
              {visibleColumns.has("wa_group") && (
                <span className="self-center"><Check v={b.wa_group} /></span>
              )}
              {visibleColumns.has("notes") && (
                <span className="text-xs admin-faint truncate self-center" title={b.notes || ""}>{b.notes || "—"}</span>
              )}
              {visibleColumns.has("created_at") && (
                <span className="text-xs admin-faint self-center">{formatDate(b.created_at)}</span>
              )}
            </div>
          ))}
        </div>
        </div>
      ) : (
        /* ── Pipeline (Kanban) view ── */
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-3 min-w-max">
            {pipelineGroups.map((group) => (
              <div
                key={group.value}
                className="w-[260px] flex-shrink-0 rounded-xl overflow-hidden"
                style={{ border: "1px solid var(--admin-border)" }}
              >
                <div className="px-4 py-3 admin-surface flex items-center justify-between" style={{ borderBottom: "1px solid var(--admin-border)" }}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${group.color}`} />
                    <span className="text-xs font-bold admin-heading">{group.label}</span>
                  </div>
                  <span className="text-[10px] admin-faint font-medium">{group.bookings.length}</span>
                </div>

                <div className="p-2 space-y-2 min-h-[100px]">
                  {group.bookings.map((b) => (
                    <div
                      key={b.id}
                      className="p-3 rounded-lg admin-surface cursor-pointer transition-colors"
                      style={{ border: "1px solid var(--admin-border)" }}
                      onClick={() => select(b.id)}
                      onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--admin-text-faint)")}
                      onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--admin-border)")}
                    >
                      <div className="text-sm font-medium admin-heading truncate mb-1">{b.name}</div>
                      {b.experience && (
                        <div className="text-[11px] admin-faint truncate mb-2">{b.experience.title}</div>
                      )}
                      <div className="flex items-center justify-between">
                        {b.agreed_price ? (
                          <span className="text-[11px] admin-muted">€{Number(b.agreed_price).toLocaleString()}</span>
                        ) : <span />}
                        {b.fly_in && (
                          <span className="text-[10px] admin-faint">{formatDate(b.fly_in)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {showNew && <NewBookingModal onClose={() => setShowNew(false)} />}
    </div>
  );
}

export default function BookingsPage() {
  return (
    <Suspense fallback={<div className="py-12 text-center text-sm admin-faint">Loading…</div>}>
      <BookingsInner />
    </Suspense>
  );
}
