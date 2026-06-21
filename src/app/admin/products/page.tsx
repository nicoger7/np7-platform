"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { SortableHeader } from "@/components/sortable-header";
import { ColumnToggle, ColumnDef, buildGridTemplate, loadVisibleColumns } from "@/components/column-toggle";
import { RowActions } from "@/components/row-actions";
import { TEMPLATE_OPTIONS, DEFAULT_TEMPLATE } from "@/lib/hardware/templates";
import { PRODUCT_CATEGORIES } from "@/lib/hardware/types";
import { PRODUCT_STATUSES, Product } from "@/lib/hardware/types";

type SortDir = "asc" | "desc" | null;

const COLUMNS: ColumnDef[] = [
  { key: "name", label: "Name", width: "1fr", required: true },
  { key: "category", label: "Category", width: "120px" },
  { key: "price", label: "Price", width: "90px" },
  { key: "stock_count", label: "Stock", width: "80px" },
  { key: "status", label: "Status", width: "100px" },
  { key: "template", label: "Template", width: "100px" },
  { key: "_actions", label: "", width: "80px", required: true },
];

const STORAGE_KEY = "np7-products-columns";

function compareValues(a: unknown, b: unknown, dir: "asc" | "desc"): number {
  if (a == null && b == null) return 0;
  if (a == null) return dir === "asc" ? 1 : -1;
  if (b == null) return dir === "asc" ? -1 : 1;
  const cmp = String(a).localeCompare(String(b), undefined, { numeric: true });
  return dir === "asc" ? cmp : -cmp;
}

function StatusBadge({ status }: { status: string | null }) {
  const s = status ?? "draft";
  const cls =
    s === "published"
      ? "bg-green-500/15 text-green-400"
      : s === "archived"
      ? "bg-red-500/15 text-red-400"
      : "admin-surface admin-muted";
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-[0.05em] ${cls}`}>
      {s}
    </span>
  );
}

export default function ProductsPage() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    () => loadVisibleColumns(STORAGE_KEY, COLUMNS)
  );
  const [form, setForm] = useState({ name: "", template: DEFAULT_TEMPLATE, category: "boards" });
  const [creating, setCreating] = useState(false);

  function fetchData() {
    const qs = search ? `?search=${encodeURIComponent(search)}` : "";
    fetch(`/api/admin/products${qs}`)
      .then((r) => r.json())
      .then((d) => {
        setProducts(Array.isArray(d) ? d : []);
        setLoading(false);
      });
  }

  useEffect(() => { fetchData(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const t = setTimeout(fetchData, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

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

  const sorted = sortKey && sortDir
    ? [...products].sort((a, b) =>
        compareValues(a[sortKey as keyof Product], b[sortKey as keyof Product], sortDir)
      )
    : products;

  async function handleCreate() {
    if (!form.name) return;
    setCreating(true);
    const res = await fetch("/api/admin/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name, template: form.template, category: form.category }),
    });
    if (res.ok) {
      const data = await res.json();
      router.push(`/admin/products/${data.id}`);
    } else {
      setCreating(false);
    }
  }

  async function handleDuplicate(id: string) {
    await fetch(`/api/admin/products/${id}/duplicate`, { method: "POST" });
    fetchData();
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this product?")) return;
    await fetch(`/api/admin/products/${id}`, { method: "DELETE" });
    fetchData();
  }

  const inputClass =
    "w-full px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1";
  const gridTemplate = buildGridTemplate(COLUMNS, visibleColumns);

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Products</h1>
          <p className="text-sm admin-muted">
            {products.length} product{products.length !== 1 ? "s" : ""}
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
            className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors"
          >
            New Product
          </button>
        </div>
      </div>

      <div className="mb-5">
        <input
          className={`${inputClass} max-w-sm`}
          placeholder="Search by name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {showNew && (
        <div
          className="mb-6 p-5 rounded-xl"
          style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}
        >
          <h3 className="text-sm font-bold admin-heading mb-4">New Product</h3>
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className={labelClass}>Name *</label>
              <input
                className={inputClass}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. NP7 Rockstar Fin"
                autoFocus
              />
            </div>
            <div>
              <label className={labelClass}>Category</label>
              <select
                className={inputClass}
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                {PRODUCT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Template</label>
              <select
                className={inputClass}
                value={form.template}
                onChange={(e) => setForm({ ...form, template: e.target.value })}
              >
                {TEMPLATE_OPTIONS.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!form.name || creating}
              className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors"
            >
              {creating ? "Creating…" : "Create"}
            </button>
            <button
              onClick={() => { setShowNew(false); setForm({ name: "", template: DEFAULT_TEMPLATE, category: "boards" }); }}
              className="px-4 py-2 admin-muted text-sm rounded-lg"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading…</div>
      ) : products.length === 0 ? (
        <div className="py-16 text-center">
          <p className="text-sm admin-faint">No products yet</p>
        </div>
      ) : (
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
          {sorted.map((p) => (
            <div
              key={p.id}
              className="grid gap-3 px-5 py-3 transition-colors"
              style={{ gridTemplateColumns: gridTemplate, borderBottom: "1px solid var(--admin-border)" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
            >
              <Link
                href={`/admin/products/${p.id}`}
                className="text-sm font-medium admin-heading truncate hover:text-[#0aa3c7] transition-colors self-center"
              >
                {p.name}
              </Link>
              {visibleColumns.has("category") && (
                <span className="text-xs admin-muted self-center truncate">{p.category || "—"}</span>
              )}
              {visibleColumns.has("price") && (
                <span className="text-xs admin-muted self-center">
                  {p.price != null ? `${p.currency} ${Number(p.price).toLocaleString()}` : "—"}
                </span>
              )}
              {visibleColumns.has("stock_count") && (
                <span className="text-xs admin-muted self-center">{p.stock_count ?? "—"}</span>
              )}
              {visibleColumns.has("status") && (
                <span className="self-center"><StatusBadge status={p.status} /></span>
              )}
              {visibleColumns.has("template") && (
                <span className="text-xs admin-muted self-center capitalize">{p.template}</span>
              )}
              <RowActions
                onDuplicate={() => handleDuplicate(p.id)}
                onDelete={() => handleDelete(p.id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
