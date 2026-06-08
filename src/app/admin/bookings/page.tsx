"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { SortableHeader } from "@/components/sortable-header";
import { ColumnToggle, ColumnDef, buildGridTemplate, loadVisibleColumns } from "@/components/column-toggle";

interface Booking {
  id: string;
  name: string;
  status: string;
  experience: { id: string; title: string; location: string; date_start: string } | null;
  package: { id: string; name: string } | null;
  contact: { id: string; name: string; email: string; phone: string } | null;
  agreed_price: number | null;
  fly_in: string | null;
  fly_out: string | null;
  total_paid: number;
  outstanding: number;
  downpayment_received: boolean;
  final_payment_received: boolean;
  wa_group: boolean;
  created_at: string;
}

const STATUSES = [
  { value: "lead", label: "Lead", color: "bg-gray-500" },
  { value: "interested", label: "Interested", color: "bg-yellow-500" },
  { value: "enquiring", label: "Enquiring", color: "bg-blue-400" },
  { value: "ready_to_book", label: "Ready to Book", color: "bg-orange-500" },
  { value: "payment_pending", label: "Payment Pending", color: "bg-amber-600" },
  { value: "downpayment_paid", label: "Downpayment Paid", color: "bg-green-500" },
  { value: "create_invoice", label: "Create Invoice", color: "bg-orange-400" },
  { value: "paid", label: "Paid", color: "bg-green-600" },
  { value: "contact_by_phone", label: "Contact by Phone", color: "bg-pink-500" },
  { value: "confirmed", label: "Confirmed", color: "bg-blue-600" },
  { value: "attended", label: "Attended", color: "bg-gray-400" },
  { value: "lost", label: "Lost", color: "bg-red-500" },
];

type ViewMode = "table" | "pipeline";
type SortDir = "asc" | "desc" | null;

const COLUMNS: ColumnDef[] = [
  { key: "name", label: "Name", width: "1fr", required: true },
  { key: "experience", label: "Experience", width: "140px" },
  { key: "status", label: "Status", width: "120px" },
  { key: "fly_in", label: "Fly In", width: "100px" },
  { key: "fly_out", label: "Fly Out", width: "100px" },
  { key: "agreed_price", label: "Price", width: "100px" },
  { key: "outstanding", label: "Outstanding", width: "100px" },
];

const STORAGE_KEY = "np7-bookings-columns";

function StatusBadge({ status }: { status: string }) {
  const s = STATUSES.find((x) => x.value === status);
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

export default function BookingsPage() {
  const router = useRouter();
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("table");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterExperience, setFilterExperience] = useState<string>("");
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
    if (filterStatus && b.status !== filterStatus) return false;
    if (filterExperience && b.experience?.id !== filterExperience) return false;
    return true;
  });

  const sorted = sortKey && sortDir
    ? [...filtered].sort((a, b) => {
        let aVal: unknown;
        let bVal: unknown;
        if (sortKey === "experience") {
          aVal = a.experience?.title;
          bVal = b.experience?.title;
        } else {
          aVal = a[sortKey as keyof Booking];
          bVal = b[sortKey as keyof Booking];
        }
        return compareValues(aVal, bVal, sortDir);
      })
    : filtered;

  // Pipeline view groups
  const pipelineGroups = STATUSES.filter(
    (s) => !["attended", "lost"].includes(s.value)
  ).map((s) => ({
    ...s,
    bookings: filtered.filter((b) => b.status === s.value),
  }));

  const gridTemplate = buildGridTemplate(COLUMNS, visibleColumns);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Bookings</h1>
          <p className="text-sm admin-muted">
            {bookings.length} booking{bookings.length !== 1 ? "s" : ""} across all experiences
          </p>
        </div>
        <div className="flex items-center gap-3">
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
            className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 text-white text-sm font-bold rounded-lg transition-colors"
            onClick={() => { /* TODO: open new booking modal */ }}
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
      ) : bookings.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm admin-faint">No bookings yet</p>
          <p className="text-xs admin-faint mt-1">Run the migration first, then bookings will appear here</p>
        </div>
      ) : view === "table" ? (
        /* ── Table view ── */
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
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
              onClick={() => router.push(`/admin/bookings/${b.id}`)}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              {/* name — required */}
              <div className="min-w-0">
                <div className="text-sm font-medium admin-heading truncate">{b.name}</div>
                {b.contact && <div className="text-xs admin-faint truncate">{b.contact.email}</div>}
              </div>
              {visibleColumns.has("experience") && (
                <span className="text-xs admin-muted truncate self-center">{b.experience?.title || "—"}</span>
              )}
              {visibleColumns.has("status") && (
                <span className="self-center"><StatusBadge status={b.status} /></span>
              )}
              {visibleColumns.has("fly_in") && (
                <span className="text-xs admin-muted self-center">{formatDate(b.fly_in)}</span>
              )}
              {visibleColumns.has("fly_out") && (
                <span className="text-xs admin-muted self-center">{formatDate(b.fly_out)}</span>
              )}
              {visibleColumns.has("agreed_price") && (
                <span className="text-xs admin-muted self-center">
                  {b.agreed_price ? `€${Number(b.agreed_price).toLocaleString()}` : "—"}
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
            </div>
          ))}
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
                      onClick={() => router.push(`/admin/bookings/${b.id}`)}
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
    </div>
  );
}
