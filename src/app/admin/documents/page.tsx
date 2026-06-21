"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { DIVISIONS, DOCUMENT_TYPES, formatMoney, type Division, type DocumentType } from "@/lib/invoices/types";

interface DocumentRow {
  id: string;
  booking_id: string | null;
  contact_id: string | null;
  division: Division;
  type: DocumentType;
  invoice_number: string | null;
  title: string | null;
  amount: number | null;
  currency: string;
  status: "issued" | "void";
  issued_at: string;
  signedUrl: string | null;
  // joined
  booking_name?: string | null;
  contact_name?: string | null;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function labelType(t: DocumentType) {
  return t.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<DocumentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDivision, setFilterDivision] = useState<Division | "">("");
  const [filterType, setFilterType] = useState<DocumentType | "">("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const fetchDocs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterDivision) params.set("division", filterDivision);
    if (filterType) params.set("type", filterType);
    if (filterFrom) params.set("from", filterFrom);
    if (filterTo) params.set("to", filterTo);
    const res = await fetch(`/api/admin/documents?${params}`);
    if (res.ok) {
      const data = await res.json();
      setDocs(data.documents || []);
    }
    setLoading(false);
  }, [filterDivision, filterType, filterFrom, filterTo]);

  useEffect(() => { fetchDocs(); }, [fetchDocs]);

  async function handleVoid(id: string) {
    if (!confirm("Void this document? This cannot be undone.")) return;
    const res = await fetch(`/api/admin/documents/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "void" }),
    });
    if (res.ok) fetchDocs();
  }

  const inputClass =
    "px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading">Finance Documents</h1>
          <p className="text-sm admin-muted mt-0.5">{docs.length} document{docs.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <select
          className={inputClass}
          value={filterDivision}
          onChange={(e) => setFilterDivision(e.target.value as Division | "")}
        >
          <option value="">All divisions</option>
          {DIVISIONS.map((d) => (
            <option key={d} value={d} className="capitalize">{d}</option>
          ))}
        </select>

        <select
          className={inputClass}
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as DocumentType | "")}
        >
          <option value="">All types</option>
          {DOCUMENT_TYPES.map((t) => (
            <option key={t} value={t}>{labelType(t)}</option>
          ))}
        </select>

        <div className="flex items-center gap-2">
          <label className="text-xs admin-faint">From</label>
          <input
            type="date"
            className={inputClass}
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs admin-faint">To</label>
          <input
            type="date"
            className={inputClass}
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
          />
        </div>
        {(filterDivision || filterType || filterFrom || filterTo) && (
          <button
            onClick={() => { setFilterDivision(""); setFilterType(""); setFilterFrom(""); setFilterTo(""); }}
            className="px-3 py-2 text-xs admin-muted rounded-lg transition-colors"
            style={{ border: "1px solid var(--admin-border)" }}
          >
            Clear
          </button>
        )}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading...</div>
      ) : docs.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm admin-faint">No documents found</p>
        </div>
      ) : (
        <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
          {/* Header */}
          <div
            className="grid gap-3 px-5 py-3 admin-surface"
            style={{
              gridTemplateColumns: "130px 1fr 160px 100px 90px 80px 70px 70px",
              borderBottom: "1px solid var(--admin-border)",
            }}
          >
            {["Invoice #", "Title / Booking", "Contact", "Type", "Amount", "Date", "Status", ""].map((h) => (
              <span key={h} className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">{h}</span>
            ))}
          </div>

          {/* Rows */}
          {docs.map((doc) => (
            <div
              key={doc.id}
              className="grid gap-3 px-5 py-3 transition-colors"
              style={{
                gridTemplateColumns: "130px 1fr 160px 100px 90px 80px 70px 70px",
                borderBottom: "1px solid var(--admin-border)",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <span className="text-xs font-mono admin-muted self-center truncate">
                {doc.invoice_number || "—"}
              </span>
              <div className="min-w-0 self-center">
                <div className="text-sm font-medium admin-heading truncate">{doc.title || labelType(doc.type)}</div>
                {doc.booking_id && (
                  <Link
                    href={`/admin/bookings/${doc.booking_id}`}
                    className="text-xs admin-faint hover:text-[#0aa3c7] truncate block"
                  >
                    {doc.booking_name || doc.booking_id}
                  </Link>
                )}
              </div>
              <span className="text-xs admin-muted self-center truncate">
                {doc.contact_id ? (
                  <Link href={`/admin/contacts/${doc.contact_id}`} className="hover:text-[#0aa3c7]">
                    {doc.contact_name || doc.contact_id}
                  </Link>
                ) : "—"}
              </span>
              <span className="text-xs admin-muted self-center capitalize">{labelType(doc.type)}</span>
              <span className="text-sm font-medium admin-heading self-center">
                {formatMoney(doc.amount, doc.currency)}
              </span>
              <span className="text-xs admin-faint self-center">{fmtDate(doc.issued_at)}</span>
              <span className="self-center">
                <span
                  className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                    doc.status === "void"
                      ? "bg-red-500/15 text-red-400"
                      : "bg-green-500/15 text-green-400"
                  }`}
                >
                  {doc.status}
                </span>
              </span>
              <div className="self-center flex items-center gap-2">
                {doc.signedUrl && (
                  <a
                    href={doc.signedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-[#0aa3c7] hover:text-[#0aa3c7]/80 transition-colors"
                  >
                    PDF
                  </a>
                )}
                {doc.status !== "void" && (
                  <button
                    onClick={() => handleVoid(doc.id)}
                    className="text-xs text-red-400/50 hover:text-red-400 transition-colors"
                  >
                    Void
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
