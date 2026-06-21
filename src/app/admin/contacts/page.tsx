"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { SortableHeader } from "@/components/sortable-header";
import { ColumnToggle, ColumnDef, buildGridTemplate, loadVisibleColumns } from "@/components/column-toggle";

interface Contact {
  id: string;
  name: string;
  email: string | null;
  email2: string | null;
  phone: string | null;
  country: string | null;
  discipline: string | null;
  level: string | null;
  level_notes: string | null;
  source: string | null;
  accepts_marketing: boolean;
  date_of_birth: string | null;
  tshirt_size: string | null;
  diet_allergies: string | null;
  experience_locations: string[] | null;
  interested_products: string[] | null;
  notes: string | null;
  ai_summary: string | null;
  chatwoot_contact_id: string | null;
  created_at: string;
}

function arr(x: string[] | null) {
  return x && x.length ? x.join(", ") : "—";
}
function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

type SortDir = "asc" | "desc" | null;

const COLUMNS: ColumnDef[] = [
  { key: "name", label: "Name", width: "1fr", required: true },
  { key: "email", label: "Email", width: "160px" },
  { key: "email2", label: "Email 2", width: "150px", defaultHidden: true },
  { key: "phone", label: "Phone", width: "120px", defaultHidden: true },
  { key: "country", label: "Country", width: "100px" },
  { key: "discipline", label: "Discipline", width: "100px", defaultHidden: true },
  { key: "source", label: "Source", width: "80px" },
  { key: "level", label: "Level", width: "80px" },
  { key: "level_notes", label: "Level Notes", width: "140px", defaultHidden: true },
  { key: "date_of_birth", label: "DOB", width: "100px", defaultHidden: true },
  { key: "tshirt_size", label: "T-Shirt", width: "70px", defaultHidden: true },
  { key: "diet_allergies", label: "Diet", width: "120px", defaultHidden: true },
  { key: "experience_locations", label: "Exp Locations", width: "140px", defaultHidden: true },
  { key: "interested_products", label: "Interested In", width: "140px", defaultHidden: true },
  { key: "notes", label: "Notes", width: "160px", defaultHidden: true },
  { key: "chatwoot_contact_id", label: "Chatwoot ID", width: "100px", defaultHidden: true },
  { key: "accepts_marketing", label: "Mktg", width: "80px" },
  { key: "created_at", label: "Created", width: "100px", defaultHidden: true },
  { key: "_actions", label: "", width: "50px", required: true },
];

const STORAGE_KEY = "np7-contacts-columns";

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    () => loadVisibleColumns(STORAGE_KEY, COLUMNS)
  );
  const pageSize = 100;

  const [newContact, setNewContact] = useState({
    name: "",
    email: "",
    phone: "",
    country: "",
    discipline: "",
    level: "",
    source: "",
    date_of_birth: "",
    accepts_marketing: false,
  });

  const fetchContacts = useCallback(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(pageSize));
    if (search) params.set("search", search);
    if (sortKey) {
      params.set("sort", sortKey);
      params.set("order", sortDir === "desc" ? "desc" : "asc");
    }
    fetch(`/api/admin/contacts?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setContacts(d.data || []);
        setTotalCount(d.count || 0);
        setLoading(false);
      });
  }, [page, search, sortKey, sortDir]);

  useEffect(() => {
    fetchContacts();
  }, [fetchContacts]);

  useEffect(() => {
    const timer = setTimeout(fetchContacts, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page]);

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

  async function handleCreate() {
    const res = await fetch("/api/admin/contacts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...newContact,
        date_of_birth: newContact.date_of_birth || null,
      }),
    });
    if (res.ok) {
      setShowNew(false);
      setNewContact({ name: "", email: "", phone: "", country: "", discipline: "", level: "", source: "", date_of_birth: "", accepts_marketing: false });
      fetchContacts();
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this contact?")) return;
    await fetch(`/api/admin/contacts/${id}`, { method: "DELETE" });
    fetchContacts();
  }

  const inputClass =
    "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[#0aa3c7] focus:ring-1 focus:ring-[#0aa3c7] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1";

  const gridTemplate = buildGridTemplate(COLUMNS, visibleColumns);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Contacts</h1>
          <p className="text-sm admin-muted">
            {totalCount} contact{totalCount !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ColumnToggle
            columns={COLUMNS}
            visible={visibleColumns}
            onChange={setVisibleColumns}
            storageKey={STORAGE_KEY}
          />
          <button
            onClick={() => setShowNew(!showNew)}
            className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 text-white text-sm font-bold rounded-lg transition-colors"
          >
            New Contact
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="flex items-center gap-3 mb-5">
        <input
          className={`${inputClass} max-w-sm`}
          placeholder="Search by name, email, or phone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* New contact form */}
      {showNew && (
        <div
          className="mb-6 p-5 rounded-xl"
          style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}
        >
          <h3 className="text-sm font-bold admin-heading mb-4">New Contact</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className={labelClass}>Name *</label>
              <input className={inputClass} value={newContact.name} onChange={(e) => setNewContact({ ...newContact, name: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>Email</label>
              <input className={inputClass} type="email" value={newContact.email} onChange={(e) => setNewContact({ ...newContact, email: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>Phone</label>
              <input className={inputClass} value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>Country</label>
              <input className={inputClass} value={newContact.country} onChange={(e) => setNewContact({ ...newContact, country: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>Source</label>
              <select className={inputClass} value={newContact.source} onChange={(e) => setNewContact({ ...newContact, source: e.target.value })}>
                <option value="">—</option>
                <option value="website">Website</option>
                <option value="instagram">Instagram</option>
                <option value="referral">Referral</option>
                <option value="facebook">Facebook</option>
                <option value="google">Google</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Date of Birth</label>
              <input className={inputClass} type="date" value={newContact.date_of_birth} onChange={(e) => setNewContact({ ...newContact, date_of_birth: e.target.value })} />
            </div>
            <div>
              <label className={labelClass}>Discipline</label>
              <select className={inputClass} value={newContact.discipline} onChange={(e) => setNewContact({ ...newContact, discipline: e.target.value })}>
                <option value="">—</option>
                <option>Windsurf</option>
                <option>Wingfoil</option>
                <option>Kitesurf</option>
                <option>Surf</option>
                <option>SUP</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Level</label>
              <select className={inputClass} value={newContact.level} onChange={(e) => setNewContact({ ...newContact, level: e.target.value })}>
                <option value="">—</option>
                <option>Beginner</option>
                <option>Intermediate</option>
                <option>Advanced</option>
                <option>Pro</option>
              </select>
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={newContact.accepts_marketing} onChange={(e) => setNewContact({ ...newContact, accepts_marketing: e.target.checked })} className="w-4 h-4 accent-[#0aa3c7]" />
                <span className="text-sm admin-muted">Accepts marketing</span>
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!newContact.name}
              className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-40 text-white text-sm font-bold rounded-lg transition-colors"
            >
              Create
            </button>
            <button
              onClick={() => setShowNew(false)}
              className="px-4 py-2 admin-muted text-sm rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading...</div>
      ) : contacts.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm admin-faint">No contacts found</p>
        </div>
      ) : (
        <>
          <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
            {/* Header */}
            <div
              className="grid gap-3 px-5 py-3 admin-surface"
              style={{ gridTemplateColumns: gridTemplate, borderBottom: "1px solid var(--admin-border)" }}
            >
              {COLUMNS.filter((c) => c.required || visibleColumns.has(c.key)).map((col) =>
                col.key === "_actions" ? (
                  <span key={col.key} />
                ) : (
                  <SortableHeader
                    key={col.key}
                    label={col.label}
                    sortKey={col.key}
                    currentSort={sortKey}
                    currentDir={sortDir}
                    onSort={handleSort}
                  />
                )
              )}
            </div>

            {/* Rows */}
            {contacts.map((c) => (
              <div
                key={c.id}
                className="grid gap-3 px-5 py-3 transition-colors"
                style={{ gridTemplateColumns: gridTemplate, borderBottom: "1px solid var(--admin-border)" }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
              >
                {/* name — required */}
                <Link href={`/admin/contacts/${c.id}`} className="text-sm font-medium admin-heading truncate hover:text-[#0aa3c7] transition-colors">
                  {c.name}
                </Link>
                {visibleColumns.has("email") && (
                  <span className="text-xs admin-muted self-center truncate">{c.email || "—"}</span>
                )}
                {visibleColumns.has("email2") && (
                  <span className="text-xs admin-muted self-center truncate">{c.email2 || "—"}</span>
                )}
                {visibleColumns.has("phone") && (
                  <span className="text-xs admin-muted self-center truncate">{c.phone || "—"}</span>
                )}
                {visibleColumns.has("country") && (
                  <span className="text-xs admin-muted self-center">{c.country || "—"}</span>
                )}
                {visibleColumns.has("discipline") && (
                  <span className="text-xs admin-muted self-center truncate">{c.discipline || "—"}</span>
                )}
                {visibleColumns.has("source") && (
                  <span className="text-xs admin-muted self-center capitalize">{c.source || "—"}</span>
                )}
                {visibleColumns.has("level") && (
                  <span className="text-xs admin-muted self-center">{c.level || "—"}</span>
                )}
                {visibleColumns.has("level_notes") && (
                  <span className="text-xs admin-faint self-center truncate" title={c.level_notes || ""}>{c.level_notes || "—"}</span>
                )}
                {visibleColumns.has("date_of_birth") && (
                  <span className="text-xs admin-muted self-center">{fmtDate(c.date_of_birth)}</span>
                )}
                {visibleColumns.has("tshirt_size") && (
                  <span className="text-xs admin-muted self-center uppercase">{c.tshirt_size || "—"}</span>
                )}
                {visibleColumns.has("diet_allergies") && (
                  <span className="text-xs admin-faint self-center truncate" title={c.diet_allergies || ""}>{c.diet_allergies || "—"}</span>
                )}
                {visibleColumns.has("experience_locations") && (
                  <span className="text-xs admin-muted self-center truncate">{arr(c.experience_locations)}</span>
                )}
                {visibleColumns.has("interested_products") && (
                  <span className="text-xs admin-muted self-center truncate">{arr(c.interested_products)}</span>
                )}
                {visibleColumns.has("notes") && (
                  <span className="text-xs admin-faint self-center truncate" title={c.notes || ""}>{c.notes || "—"}</span>
                )}
                {visibleColumns.has("chatwoot_contact_id") && (
                  <span className="text-xs admin-faint self-center truncate">{c.chatwoot_contact_id || "—"}</span>
                )}
                {visibleColumns.has("accepts_marketing") && (
                  <span className="self-center">
                    {c.accepts_marketing ? (
                      <span className="text-green-400 text-xs">&#10003;</span>
                    ) : (
                      <span className="admin-faint text-xs">—</span>
                    )}
                  </span>
                )}
                {visibleColumns.has("created_at") && (
                  <span className="text-xs admin-faint self-center">{fmtDate(c.created_at)}</span>
                )}
                {/* _actions — required */}
                <button
                  onClick={() => handleDelete(c.id)}
                  className="text-xs admin-faint hover:text-red-400 transition-colors self-center"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalCount > pageSize && (
            <div className="flex items-center justify-between mt-4 px-1">
              <span className="text-xs admin-muted">
                Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, totalCount)} of {totalCount}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-3 py-1.5 text-xs admin-muted rounded-lg transition-colors disabled:opacity-30"
                  style={{ border: "1px solid var(--admin-border)" }}
                >
                  ← Prev
                </button>
                <span className="px-3 py-1.5 text-xs admin-muted">
                  Page {page} of {Math.ceil(totalCount / pageSize)}
                </span>
                <button
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page * pageSize >= totalCount}
                  className="px-3 py-1.5 text-xs admin-muted rounded-lg transition-colors disabled:opacity-30"
                  style={{ border: "1px solid var(--admin-border)" }}
                >
                  Next →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
