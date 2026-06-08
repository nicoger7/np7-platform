"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface Contact {
  id: string;
  name: string;
  email: string | null;
  email2: string | null;
  phone: string | null;
  country: string | null;
  discipline: string | null;
  level: string | null;
  source: string | null;
  accepts_marketing: boolean;
  date_of_birth: string | null;
  experience_locations: string[] | null;
  interested_products: string[] | null;
  created_at: string;
}

export default function ContactsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
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

  useEffect(() => {
    fetchContacts();
  }, []);

  function fetchContacts() {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(pageSize));
    if (search) params.set("search", search);
    fetch(`/api/admin/contacts?${params}`)
      .then((r) => r.json())
      .then((d) => {
        setContacts(d.data || []);
        setTotalCount(d.count || 0);
        setLoading(false);
      });
  }

  useEffect(() => {
    const timer = setTimeout(fetchContacts, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, page]);

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

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Contacts</h1>
          <p className="text-sm admin-muted">
            {totalCount} contact{totalCount !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => setShowNew(!showNew)}
          className="px-4 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 text-white text-sm font-bold rounded-lg transition-colors"
        >
          New Contact
        </button>
      </div>

      {/* Search */}
      <div className="mb-5">
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
        <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
          <div
            className="grid grid-cols-[1fr_160px_100px_80px_80px_80px_50px] gap-3 px-5 py-3 admin-surface"
            style={{ borderBottom: "1px solid var(--admin-border)" }}
          >
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Name</span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Email</span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Country</span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Source</span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Level</span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Mktg</span>
            <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase"></span>
          </div>
          {contacts.map((c) => (
            <div
              key={c.id}
              className="grid grid-cols-[1fr_160px_100px_80px_80px_80px_50px] gap-3 px-5 py-3 transition-colors"
              style={{ borderBottom: "1px solid var(--admin-border)" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <Link href={`/admin/contacts/${c.id}`} className="text-sm font-medium admin-heading truncate hover:text-[#0aa3c7] transition-colors">
                {c.name}
              </Link>
              <span className="text-xs admin-muted self-center truncate">{c.email || "—"}</span>
              <span className="text-xs admin-muted self-center">{c.country || "—"}</span>
              <span className="text-xs admin-muted self-center capitalize">{c.source || "—"}</span>
              <span className="text-xs admin-muted self-center">{c.level || "—"}</span>
              <span className="self-center">
                {c.accepts_marketing ? (
                  <span className="text-green-400 text-xs">&#10003;</span>
                ) : (
                  <span className="admin-faint text-xs">—</span>
                )}
              </span>
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
      )}
    </div>
  );
}
