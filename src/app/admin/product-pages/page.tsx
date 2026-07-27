"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

// WEBSITE side of the hardware world: one row per product page on np-seven.com.
// Backend data (variants, stock, purchasing) lives under CATALOG/SUPPLY.
interface ProductRow {
  id: string; name: string; slug: string; category: string; status: string | null;
  subtitle: string | null; images: string[] | null;
}

export default function ProductPagesPage() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => {
      const qs = search ? `?search=${encodeURIComponent(search)}` : "";
      fetch(`/api/admin/products${qs}`).then((r) => r.json()).then((d) => {
        setProducts(Array.isArray(d) ? d : []);
        setLoading(false);
      });
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const published = products.filter((p) => p.status === "published").length;

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading mb-1">Product Pages</h1>
          <p className="text-sm admin-muted">{published} live on the website · hero, gallery, copy &amp; Find-Your-Fit per product</p>
        </div>
        <input
          className="w-full sm:max-w-xs px-3 py-2 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors"
          placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading…</div>
      ) : products.length === 0 ? (
        <div className="py-16 text-center rounded-xl" style={{ border: "1px dashed var(--admin-border)" }}>
          <p className="text-sm admin-faint">
            No products yet — create one under <Link href="/admin/products" className="text-[var(--admin-accent)] hover:underline">Products</Link> first,
            then design its page here.
          </p>
        </div>
      ) : (
        <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
          <div className="grid grid-cols-[1fr_120px_110px_110px] gap-3 px-5 py-3 admin-surface" style={{ borderBottom: "1px solid var(--admin-border)" }}>
            {["Page", "Category", "Status", ""].map((h, i) => (
              <span key={i} className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">{h}</span>
            ))}
          </div>
          {products.map((p) => (
            <div key={p.id} className="grid grid-cols-[1fr_120px_110px_110px] gap-3 px-5 py-3 transition-colors"
              style={{ borderBottom: "1px solid var(--admin-border)" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}>
              <Link href={`/admin/product-pages/${p.id}`} className="self-center min-w-0">
                <span className="text-sm font-medium admin-heading truncate block hover:text-[var(--admin-accent)] transition-colors">{p.name}</span>
                {p.subtitle && <span className="text-xs admin-faint truncate block">{p.subtitle}</span>}
              </Link>
              <span className="text-xs admin-muted self-center capitalize">{p.category || "—"}</span>
              <span className="self-center">
                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-[0.05em] ${p.status === "published" ? "bg-green-500/15 text-green-400" : "admin-surface admin-muted"}`}>
                  {p.status ?? "draft"}
                </span>
              </span>
              <a href={`/hardware/${p.slug}`} target="_blank" rel="noreferrer"
                className="text-xs self-center text-[var(--admin-accent)] hover:underline">
                View on site ↗
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
