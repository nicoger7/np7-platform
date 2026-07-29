"use client";

// The product editor, mounted on TWO admin surfaces so website editing and
// backend data stay separate in the menu (same split as the Experience world):
//   · /admin/products/[id]       → surface "backend": Details, Variants, Inquiries
//   · /admin/product-pages/[id]  → surface "website": Content, Find Your Fit
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ImagePickerModal from "@/components/image-picker-modal";
import {
  Product,
  ProductContent,
  FitSegment,
  SpecRow,
  FIT_ICONS,
  PRODUCT_STATUSES,
  PRODUCT_CATEGORIES,
  emptyFit,
} from "@/lib/hardware/types";
import { TEMPLATE_OPTIONS } from "@/lib/hardware/templates";
import { FinTuningEditor } from "@/components/admin/fin-tuning-editor";
import { HeroFocusPicker, TILE_ASPECTS } from "@/components/admin/placement-editors";
import { EanField } from "@/components/admin/ean-field";

// ─── Helpers ───────────────────────────────────────────────────────────────

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
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
    <span
      className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-[0.05em] ${cls}`}
    >
      {s}
    </span>
  );
}

// ─── Sub-component helpers ──────────────────────────────────────────────────

function IconBtn({
  onClick,
  label,
  children,
  danger,
}: {
  onClick: () => void;
  label: string;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`w-7 h-7 grid place-items-center rounded-md border admin-muted hover:admin-heading transition-colors ${
        danger ? "hover:text-red-400 hover:border-red-400/40" : ""
      }`}
      style={{ borderColor: "var(--admin-border)" }}
    >
      <svg
        className="w-3.5 h-3.5"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {children}
      </svg>
    </button>
  );
}

function RowButtons({
  onUp,
  onDown,
  onRemove,
}: {
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <IconBtn onClick={onUp} label="Move up">
        <path d="M18 15l-6-6-6 6" />
      </IconBtn>
      <IconBtn onClick={onDown} label="Move down">
        <path d="M6 9l6 6 6-6" />
      </IconBtn>
      <IconBtn onClick={onRemove} label="Remove" danger>
        <path d="M18 6L6 18M6 6l12 12" />
      </IconBtn>
    </div>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#0aa3c7] hover:gap-2.5 transition-all"
    >
      <svg
        className="w-4 h-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 5v14M5 12h14" />
      </svg>
      {label}
    </button>
  );
}

function ImageField({
  url,
  onPick,
  onClear,
  ratio,
}: {
  url: string;
  onPick: () => void;
  onClear: () => void;
  ratio: string;
}) {
  if (url) {
    return (
      <div
        className={`relative ${ratio} rounded-xl overflow-hidden max-w-[480px]`}
        style={{ border: "1px solid var(--admin-border)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt="" className="w-full h-full object-cover" />
        <div className="absolute top-2 right-2 flex gap-1.5">
          <button
            onClick={onPick}
            className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-black/60 text-white hover:bg-black/80"
          >
            Change
          </button>
          <button
            onClick={onClear}
            className="px-2.5 py-1 rounded-md text-[11px] font-bold bg-black/60 text-white hover:bg-red-500"
          >
            Remove
          </button>
        </div>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onPick}
      className={`${ratio} max-w-[480px] w-full rounded-xl border-2 border-dashed grid place-items-center admin-muted hover:admin-heading hover:border-[var(--admin-accent)] transition-colors`}
      style={{ borderColor: "var(--admin-border)" }}
    >
      <span className="flex flex-col items-center gap-1.5 text-[13px] font-semibold">
        <svg
          className="w-7 h-7"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        >
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
        Choose image
      </span>
    </button>
  );
}

// ─── Variant types ──────────────────────────────────────────────────────────

interface Variant {
  id: string;
  name: string;
  sku: string;
  ean: string | null;
  rrp: number | null;
  weight_g: number | null;
  box_l_mm: number | null;
  box_w_mm: number | null;
  box_h_mm: number | null;
  hs_code: string | null;
  country_of_origin: string | null;
  preferential_origin: boolean;
  serialized: boolean;
  lifecycle: string;
}

const emptyVariantForm = () => ({
  id: "", name: "", sku: "", ean: "", rrp: "", weight_g: "",
  box_l_mm: "", box_w_mm: "", box_h_mm: "", hs_code: "",
  country_of_origin: "", preferential_origin: false, serialized: false,
  lifecycle: "active",
});

// ─── Inquiry types ──────────────────────────────────────────────────────────

interface Inquiry {
  id: string;
  name: string | null;
  email: string | null;
  message: string | null;
  status: string;
  created_at: string;
}

// ─── Main page ──────────────────────────────────────────────────────────────

type Tab = "details" | "media" | "story" | "specs" | "fit" | "variants" | "inquiries";

type PickerTarget =
  | { kind: "hero" }
  | { kind: "tile" }
  | { kind: "gallery" }
  | { kind: "fit"; index: number };

const emptyContent = (): ProductContent => ({
  hero_image: null,
  hero_focus: null,
  tile_image: null,
  tile_focus: null,
  hero_video_url: null,
  gallery: [],
  tagline: null,
  overview: null,
  highlights: [],
  spec_rows: [],
  find_your_fit: [],
});

export type EditorSurface = "backend" | "website";

export default function ProductEditor({
  id,
  surface,
}: {
  id: string;
  surface: EditorSurface;
}) {
  const router = useRouter();

  const tabs: readonly Tab[] = surface === "backend" ? ["details", "variants", "inquiries"] : ["media", "story", "specs", "fit"];
  const listHref = surface === "backend" ? "/admin/products" : "/admin/product-pages";
  const [tab, setTab] = useState<Tab>(surface === "backend" ? "details" : "media");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");

  // Product (ERP) state
  const [product, setProduct] = useState<Product | null>(null);

  // Content state (shared across content + fit tabs)
  const [content, setContent] = useState<ProductContent>(emptyContent());
  const [contentLoaded, setContentLoaded] = useState(false);

  // Variants
  const [variants, setVariants] = useState<Variant[]>([]);
  const [variantForm, setVariantForm] = useState(emptyVariantForm());
  const [showVariantForm, setShowVariantForm] = useState(false);

  // Inquiries
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);

  // Image picker
  const [picker, setPicker] = useState<PickerTarget | null>(null);

  // ── Loaders ──────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch(`/api/admin/products/${id}`)
      .then((r) => r.json())
      .then((d) => {
        setProduct(d);
        setLoading(false);
      });
  }, [id]);

  function loadContent() {
    if (contentLoaded) return;
    fetch(`/api/admin/products/${id}/content`)
      .then((r) => r.json())
      .then((d) => {
        setContent({
          hero_image: d.hero_image ?? null,
          hero_focus: d.hero_focus ?? null,
          tile_image: d.tile_image ?? null,
          tile_focus: d.tile_focus ?? null,
          hero_video_url: d.hero_video_url ?? null,
          gallery: Array.isArray(d.gallery) ? d.gallery : [],
          tagline: d.tagline ?? null,
          overview: d.overview ?? null,
          highlights: Array.isArray(d.highlights) ? d.highlights : [],
          spec_rows: Array.isArray(d.spec_rows) ? d.spec_rows : [],
          find_your_fit: Array.isArray(d.find_your_fit) ? d.find_your_fit : [],
        });
        setContentLoaded(true);
      });
  }

  function loadVariants() {
    fetch(`/api/admin/products/${id}/variants`)
      .then((r) => r.json())
      .then((d) => setVariants(Array.isArray(d) ? d : []));
  }

  function loadInquiries() {
    fetch(`/api/admin/products/${id}/inquiries`)
      .then((r) => r.json())
      .then((d) => setInquiries(Array.isArray(d) ? d : []));
  }

  useEffect(() => {
    if (tab === "media" || tab === "story" || tab === "specs" || tab === "fit") loadContent();
    if (tab === "variants") loadVariants();
    if (tab === "inquiries") loadInquiries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  // ── Save helpers ─────────────────────────────────────────────────────────

  function showSaved() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleSaveDetails() {
    if (!product) return;
    setSaving(true);
    setSaveError("");
    const res = await fetch(`/api/admin/products/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: product.name,
        slug: product.slug,
        subtitle: product.subtitle,
        category: product.category,
        template: product.template,
        status: product.status,
        price: product.price,
        compare_at_price: product.compare_at_price,
        currency: product.currency,
        description: product.description,
      }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setSaveError(j.error ?? "Failed to save");
    } else {
      showSaved();
    }
    setSaving(false);
  }

  async function handleSaveContent() {
    setSaving(true);
    setSaveError("");
    const res = await fetch(`/api/admin/products/${id}/content`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(content),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setSaveError(j.error ?? "Failed to save");
    } else {
      showSaved();
    }
    setSaving(false);
  }

  // ── Product field updater ────────────────────────────────────────────────

  function update(field: keyof Product, value: unknown) {
    setProduct((prev) => (prev ? { ...prev, [field]: value } : prev));
  }

  function updateContent<K extends keyof ProductContent>(key: K, value: ProductContent[K]) {
    setContent((prev) => ({ ...prev, [key]: value }));
  }

  // ── Move helper (for arrays) ─────────────────────────────────────────────

  function move<T>(arr: T[], i: number, dir: -1 | 1): T[] {
    const j = i + dir;
    if (j < 0 || j >= arr.length) return arr;
    const next = [...arr];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  }

  // ── Image picker apply ───────────────────────────────────────────────────

  function applyPicked(url: string) {
    if (!picker) return;
    if (picker.kind === "hero") {
      updateContent("hero_image", url);
    } else if (picker.kind === "tile") {
      updateContent("tile_image", url);
    } else if (picker.kind === "gallery") {
      updateContent("gallery", [...content.gallery, url]);
    } else if (picker.kind === "fit") {
      const fits = content.find_your_fit.map((f, i) =>
        i === picker.index ? { ...f, image: url } : f
      );
      updateContent("find_your_fit", fits);
    }
    setPicker(null);
  }

  // ── Variant CRUD ─────────────────────────────────────────────────────────

  async function saveVariant() {
    const { id: variantId, ...body } = variantForm;
    const res = variantId
      ? await fetch(`/api/admin/variants/${variantId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        })
      : await fetch(`/api/admin/products/${id}/variants`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      alert(d.error || "Could not save variant");
      return;
    }
    setShowVariantForm(false);
    setVariantForm(emptyVariantForm());
    loadVariants();
  }

  async function deleteVariant(variantId: string) {
    if (!confirm("Archive this variant?")) return;
    await fetch(`/api/admin/variants/${variantId}`, { method: "DELETE" });
    loadVariants();
  }

  // ── Inquiry status PATCH ─────────────────────────────────────────────────

  async function patchInquiryStatus(inquiryId: string, status: string) {
    await fetch(`/api/admin/products/${id}/inquiries`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inquiry_id: inquiryId, status }),
    });
    setInquiries((prev) =>
      prev.map((q) => (q.id === inquiryId ? { ...q, status } : q))
    );
  }

  // ── Delete product ───────────────────────────────────────────────────────

  async function handleDelete() {
    if (!confirm("Delete this product? This cannot be undone.")) return;
    await fetch(`/api/admin/products/${id}`, { method: "DELETE" });
    router.push("/admin/products");
  }

  // ── Styles ───────────────────────────────────────────────────────────────

  const inputClass =
    "w-full px-4 py-2.5 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1.5";

  // ── Early returns ─────────────────────────────────────────────────────────

  if (loading) return <div className="text-sm admin-faint">Loading…</div>;
  if (!product) return <div className="text-sm text-red-400">Product not found</div>;

  const slug = product.slug;

  const isSaveableTab = tab === "details" || tab === "media" || tab === "story" || tab === "specs" || tab === "fit";
  const saveHandler = tab === "details" ? handleSaveDetails : handleSaveContent;

  return (
    <div>
      {/* ── Header ── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href={listHref} className="admin-faint hover:admin-muted transition-colors">
            <svg
              className="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            >
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold admin-heading">{product.name}</h1>
              <StatusBadge status={product.status} />
            </div>
            <p className="text-sm admin-muted">{product.category}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Jump between the two surfaces of the same product */}
          <Link
            href={surface === "backend" ? `/admin/product-pages/${id}` : `/admin/products/${id}`}
            className="px-3 py-2 text-xs admin-muted hover:text-[var(--admin-accent)] rounded-lg transition-colors"
            style={{ border: "1px solid var(--admin-border)" }}
          >
            {surface === "backend" ? "Website page →" : "Product data →"}
          </Link>
          {surface === "backend" && (
            <button
              onClick={handleDelete}
              className="px-3 py-2 text-xs text-red-400/60 hover:text-red-400 transition-colors"
            >
              Delete
            </button>
          )}
          {isSaveableTab && (
            <button
              onClick={saveHandler}
              disabled={saving}
              className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-50 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors"
            >
              {saving ? "Saving…" : saved ? "Saved!" : "Save"}
            </button>
          )}
        </div>
      </div>

      {saveError && (
        <p className="mb-4 text-sm text-red-400">{saveError}</p>
      )}

      {/* ── Tabs ── */}
      <div className="flex gap-1 mb-6" style={{ borderBottom: "1px solid var(--admin-border)" }}>
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-[1px] capitalize ${
              tab === t
                ? "admin-heading border-[var(--admin-accent)]"
                : "admin-muted border-transparent"
            }`}
          >
            {t === "fit" ? "Find Your Fit" : t}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════════
          DETAILS TAB
      ════════════════════════════════════════════ */}
      {tab === "details" && (
        <div className="max-w-[720px] space-y-5">
          {/fin/i.test(product.category ?? "") && (
            <FinTuningEditor productId={id} initial={(product as unknown as Record<string, unknown>).selector_tuning} />
          )}
          {/* Name + slug */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Name *</label>
              <input
                className={inputClass}
                value={product.name}
                onChange={(e) => {
                  update("name", e.target.value);
                  if (!product.slug || product.slug === slugify(product.name)) {
                    update("slug", slugify(e.target.value));
                  }
                }}
              />
            </div>
            <div>
              <label className={labelClass}>Slug</label>
              <input
                className={inputClass}
                value={product.slug || ""}
                onChange={(e) => update("slug", e.target.value)}
                placeholder={slugify(product.name)}
              />
            </div>
          </div>

          {/* Subtitle + category */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Subtitle</label>
              <input
                className={inputClass}
                value={product.subtitle || ""}
                onChange={(e) => update("subtitle", e.target.value || null)}
                placeholder="Short tagline"
              />
            </div>
            <div>
              <label className={labelClass}>Category</label>
              <select
                className={inputClass}
                value={product.category || "boards"}
                onChange={(e) => update("category", e.target.value)}
              >
                {PRODUCT_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Template + status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Template</label>
              <select
                className={inputClass}
                value={product.template || "board"}
                onChange={(e) => update("template", e.target.value)}
              >
                {TEMPLATE_OPTIONS.map((t) => (
                  <option key={t.id} value={t.id}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Status</label>
              <select
                className={inputClass}
                value={product.status ?? "draft"}
                onChange={(e) => update("status", e.target.value)}
              >
                {PRODUCT_STATUSES.map((s) => (
                  <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Pricing — the RRP shown on the website; per-size overrides live on Variants */}
          <div className="pt-4" style={{ borderTop: "1px solid var(--admin-border)" }}>
            <h3 className="text-xs font-bold tracking-[0.1em] admin-faint uppercase mb-4">Website pricing (RRP)</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Currency</label>
                <select
                  className={inputClass}
                  value={product.currency || "EUR"}
                  onChange={(e) => update("currency", e.target.value)}
                >
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                  <option value="GBP">GBP</option>
                </select>
              </div>
              <div>
                <label className={labelClass}>Price</label>
                <input
                  type="number"
                  className={inputClass}
                  value={product.price ?? ""}
                  onChange={(e) => update("price", e.target.value ? Number(e.target.value) : null)}
                />
              </div>
              <div>
                <label className={labelClass}>Compare-at price</label>
                <input
                  type="number"
                  className={inputClass}
                  value={product.compare_at_price ?? ""}
                  onChange={(e) =>
                    update("compare_at_price", e.target.value ? Number(e.target.value) : null)
                  }
                />
              </div>
            </div>
            {/* Stock and SKUs moved to the ledger world — no mutable columns here. */}
            <p className="text-xs admin-faint mt-3">
              SKUs, EANs and costs live per size on the <button type="button" onClick={() => setTab("variants")} className="text-[var(--admin-accent)] hover:underline">Variants</button> tab ·
              stock is counted by the <Link href="/admin/inventory" className="text-[var(--admin-accent)] hover:underline">Inventory ledger</Link> ·
              real unit costs come from <Link href="/admin/purchasing" className="text-[var(--admin-accent)] hover:underline">Purchasing</Link> (landed).
            </p>
          </div>

          {/* Description */}
          <div>
            <label className={labelClass}>Description</label>
            <textarea
              className={`${inputClass} min-h-[120px] resize-y`}
              value={product.description || ""}
              onChange={(e) => update("description", e.target.value || null)}
              placeholder="Internal product description…"
            />
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════════
          CONTENT TAB
      ════════════════════════════════════════════ */}
      {tab === "media" && (
        <div className="max-w-[720px] space-y-7">
          {/* Hero */}
          <section>
            <h2 className="text-[15px] font-bold admin-heading">Hero image</h2>
            <p className="text-xs admin-faint mb-3 mt-0.5">Main banner shown at the top of the product page.</p>
            <ImageField
              url={content.hero_image || ""}
              onPick={() => setPicker({ kind: "hero" })}
              onClear={() => updateContent("hero_image", null)}
              ratio="aspect-[21/9]"
            />
          </section>

          {/* Hero video */}
          <section>
            <h2 className="text-[15px] font-bold admin-heading">Hero video URL</h2>
            <p className="text-xs admin-faint mb-3 mt-0.5">YouTube link for a video hero (overrides hero image).</p>
            <input
              className={inputClass}
              value={content.hero_video_url || ""}
              onChange={(e) => updateContent("hero_video_url", e.target.value || null)}
              placeholder="https://youtu.be/…"
            />
          </section>

          {/* Gallery */}
          <section>
            <h2 className="text-[15px] font-bold admin-heading">Gallery</h2>
            <p className="text-xs admin-faint mb-3 mt-0.5">Photos shown in the product gallery.</p>
            <div className="grid grid-cols-4 gap-2.5">
              {content.gallery.map((url, i) => (
                <div
                  key={i}
                  className="relative group aspect-square rounded-lg overflow-hidden"
                  style={{ border: "1px solid var(--admin-border)" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt="" className="w-full h-full object-cover" />
                  <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => updateContent("gallery", move(content.gallery, i, -1))}
                      className="w-6 h-6 grid place-items-center rounded bg-black/60 text-white hover:bg-black/80"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6" /></svg>
                    </button>
                    <button
                      onClick={() => updateContent("gallery", move(content.gallery, i, 1))}
                      className="w-6 h-6 grid place-items-center rounded bg-black/60 text-white hover:bg-black/80"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M9 18l6-6-6-6" /></svg>
                    </button>
                    <button
                      onClick={() => updateContent("gallery", content.gallery.filter((_, j) => j !== i))}
                      className="w-6 h-6 grid place-items-center rounded bg-black/60 text-white hover:bg-red-500"
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setPicker({ kind: "gallery" })}
                className="aspect-square rounded-lg border-2 border-dashed grid place-items-center admin-muted hover:admin-heading hover:border-[var(--admin-accent)] transition-colors"
                style={{ borderColor: "var(--admin-border)" }}
              >
                <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
              </button>
            </div>
          </section>

          {/* Framing — one photo, every shape it appears in */}
          {content.hero_image && (
            <section>
              <h2 className="text-[15px] font-bold admin-heading">Framing</h2>
              <p className="text-xs admin-faint mb-3 mt-0.5">Drag to set what stays centred as the hero reshapes — wide on desktop, tall on phone. The previews below are the real shapes.</p>
              <HeroFocusPicker
                image={content.hero_image}
                value={content.hero_focus ?? null}
                onChange={(v) => updateContent("hero_focus", v)}
              />
            </section>
          )}

          {/* Card / tile — its own crop, because a wide hero rarely works small */}
          <section>
            <h2 className="text-[15px] font-bold admin-heading">Card image</h2>
            <p className="text-xs admin-faint mb-3 mt-0.5">The photo on shop cards and the fins range. Leave empty to reuse the hero — a card is narrow, so its own shot (or at least its own framing) usually looks better.</p>
            <ImageField
              url={content.tile_image || ""}
              onPick={() => setPicker({ kind: "tile" })}
              onClear={() => updateContent("tile_image", null)}
              ratio="aspect-[4/3]"
            />
            {(content.tile_image || content.hero_image) && (
              <div className="mt-4">
                <HeroFocusPicker
                  image={content.tile_image || content.hero_image}
                  value={(content.tile_image ? content.tile_focus : content.tile_focus ?? content.hero_focus) ?? null}
                  onChange={(v) => updateContent("tile_focus", v)}
                  aspects={TILE_ASPECTS}
                  label="Drag to frame the card"
                />
                {!content.tile_image && (
                  <p className="text-[11px] admin-faint mt-2">Framing the hero photo for card use — it doesn&apos;t change the hero itself.</p>
                )}
              </div>
            )}
          </section>
        </div>
      )}

      {tab === "story" && (
        <div className="max-w-[720px] space-y-7">
          {/* Tagline */}
          <section>
            <h2 className="text-[15px] font-bold admin-heading">Tagline</h2>
            <p className="text-xs admin-faint mb-3 mt-0.5">Short marketing line shown under the product name.</p>
            <input
              className={inputClass}
              value={content.tagline || ""}
              onChange={(e) => updateContent("tagline", e.target.value || null)}
              placeholder="e.g. Designed for speed."
            />
          </section>

          {/* Overview */}
          <section>
            <h2 className="text-[15px] font-bold admin-heading">Overview</h2>
            <p className="text-xs admin-faint mb-3 mt-0.5">Main product description shown on the page.</p>
            <textarea
              className={`${inputClass} min-h-[140px] resize-y`}
              value={content.overview || ""}
              onChange={(e) => updateContent("overview", e.target.value || null)}
              placeholder="Describe the product…"
            />
          </section>

          {/* Highlights */}
          <section>
            <h2 className="text-[15px] font-bold admin-heading">Highlights</h2>
            <p className="text-xs admin-faint mb-3 mt-0.5">Short bullet-point features.</p>
            <div className="space-y-2">
              {content.highlights.map((h, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className={inputClass}
                    value={h}
                    onChange={(e) =>
                      updateContent(
                        "highlights",
                        content.highlights.map((x, j) => (j === i ? e.target.value : x))
                      )
                    }
                    placeholder="e.g. Ultra-light carbon deck"
                  />
                  <RowButtons
                    onUp={() => updateContent("highlights", move(content.highlights, i, -1))}
                    onDown={() => updateContent("highlights", move(content.highlights, i, 1))}
                    onRemove={() =>
                      updateContent(
                        "highlights",
                        content.highlights.filter((_, j) => j !== i)
                      )
                    }
                  />
                </div>
              ))}
              <AddButton
                label="Add highlight"
                onClick={() => updateContent("highlights", [...content.highlights, ""])}
              />
            </div>
          </section>

        </div>
      )}

      {tab === "specs" && (
        <div className="max-w-[720px] space-y-7">
          {/* Spec rows */}
          <section>
            <h2 className="text-[15px] font-bold admin-heading">Specifications</h2>
            <p className="text-xs admin-faint mb-3 mt-0.5">Label/value rows for the specs table.</p>
            <div className="space-y-2">
              {content.spec_rows.map((row, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    className={`${inputClass} w-40`}
                    value={row.label}
                    onChange={(e) =>
                      updateContent(
                        "spec_rows",
                        content.spec_rows.map((x, j) =>
                          j === i ? { ...x, label: e.target.value } : x
                        )
                      )
                    }
                    placeholder="Label"
                  />
                  <input
                    className={inputClass}
                    value={row.value}
                    onChange={(e) =>
                      updateContent(
                        "spec_rows",
                        content.spec_rows.map((x, j) =>
                          j === i ? { ...x, value: e.target.value } : x
                        )
                      )
                    }
                    placeholder="Value"
                  />
                  <RowButtons
                    onUp={() => updateContent("spec_rows", move(content.spec_rows, i, -1))}
                    onDown={() => updateContent("spec_rows", move(content.spec_rows, i, 1))}
                    onRemove={() =>
                      updateContent(
                        "spec_rows",
                        content.spec_rows.filter((_, j) => j !== i)
                      )
                    }
                  />
                </div>
              ))}
              <AddButton
                label="Add spec row"
                onClick={() =>
                  updateContent("spec_rows", [
                    ...content.spec_rows,
                    { label: "", value: "" } as SpecRow,
                  ])
                }
              />
            </div>
          </section>
        </div>
      )}

      {/* ════════════════════════════════════════════
          FIT TAB
      ════════════════════════════════════════════ */}
      {tab === "fit" && (
        <div className="max-w-[860px] space-y-6">
          <p className="text-xs admin-faint">
            Each card is a persona. Users click chips to switch between them. Save via the button above.
          </p>
          {content.find_your_fit.map((fit, i) => (
            <div
              key={fit.id}
              className="rounded-xl p-5 space-y-4"
              style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}
            >
              {/* Card header */}
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold admin-heading">Persona {i + 1}</span>
                <div className="flex items-center gap-1">
                  <IconBtn
                    onClick={() =>
                      updateContent("find_your_fit", move(content.find_your_fit, i, -1))
                    }
                    label="Move up"
                  >
                    <path d="M18 15l-6-6-6 6" />
                  </IconBtn>
                  <IconBtn
                    onClick={() =>
                      updateContent("find_your_fit", move(content.find_your_fit, i, 1))
                    }
                    label="Move down"
                  >
                    <path d="M6 9l6 6 6-6" />
                  </IconBtn>
                  <IconBtn
                    onClick={() =>
                      updateContent(
                        "find_your_fit",
                        content.find_your_fit.filter((_, j) => j !== i)
                      )
                    }
                    label="Remove"
                    danger
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </IconBtn>
                </div>
              </div>

              {/* Row 1: chip, tag, icon */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className={labelClass}>Chip (tab label)</label>
                  <input
                    className={inputClass}
                    value={fit.chip}
                    onChange={(e) =>
                      updateContent(
                        "find_your_fit",
                        content.find_your_fit.map((f, j) =>
                          j === i ? { ...f, chip: e.target.value } : f
                        )
                      )
                    }
                    placeholder="e.g. I want speed"
                  />
                </div>
                <div>
                  <label className={labelClass}>Tag (badge)</label>
                  <input
                    className={inputClass}
                    value={fit.tag}
                    onChange={(e) =>
                      updateContent(
                        "find_your_fit",
                        content.find_your_fit.map((f, j) =>
                          j === i ? { ...f, tag: e.target.value } : f
                        )
                      )
                    }
                    placeholder="e.g. The racer"
                  />
                </div>
                <div>
                  <label className={labelClass}>Icon</label>
                  <select
                    className={inputClass}
                    value={fit.icon}
                    onChange={(e) =>
                      updateContent(
                        "find_your_fit",
                        content.find_your_fit.map((f, j) =>
                          j === i
                            ? { ...f, icon: e.target.value as FitSegment["icon"] }
                            : f
                        )
                      )
                    }
                  >
                    {FIT_ICONS.map((ic) => (
                      <option key={ic} value={ic}>{ic}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Row 2: title */}
              <div>
                <label className={labelClass}>Title</label>
                <input
                  className={inputClass}
                  value={fit.title}
                  onChange={(e) =>
                    updateContent(
                      "find_your_fit",
                      content.find_your_fit.map((f, j) =>
                        j === i ? { ...f, title: e.target.value } : f
                      )
                    )
                  }
                  placeholder="Panel heading"
                />
              </div>

              {/* Row 3: body */}
              <div>
                <label className={labelClass}>Body</label>
                <textarea
                  className={`${inputClass} min-h-[80px] resize-y`}
                  value={fit.body}
                  onChange={(e) =>
                    updateContent(
                      "find_your_fit",
                      content.find_your_fit.map((f, j) =>
                        j === i ? { ...f, body: e.target.value } : f
                      )
                    )
                  }
                  placeholder="Paragraph explaining why this board fits this persona…"
                />
              </div>

              {/* Row 4: points */}
              <div>
                <label className={labelClass}>Points (bullet list)</label>
                <div className="space-y-2">
                  {fit.points.map((pt, pi) => (
                    <div key={pi} className="flex items-center gap-2">
                      <input
                        className={inputClass}
                        value={pt}
                        onChange={(e) => {
                          const newPoints = fit.points.map((p, pj) =>
                            pj === pi ? e.target.value : p
                          );
                          updateContent(
                            "find_your_fit",
                            content.find_your_fit.map((f, j) =>
                              j === i ? { ...f, points: newPoints } : f
                            )
                          );
                        }}
                        placeholder="e.g. Locks in at high speed"
                      />
                      <RowButtons
                        onUp={() => {
                          const newPoints = move(fit.points, pi, -1);
                          updateContent(
                            "find_your_fit",
                            content.find_your_fit.map((f, j) =>
                              j === i ? { ...f, points: newPoints } : f
                            )
                          );
                        }}
                        onDown={() => {
                          const newPoints = move(fit.points, pi, 1);
                          updateContent(
                            "find_your_fit",
                            content.find_your_fit.map((f, j) =>
                              j === i ? { ...f, points: newPoints } : f
                            )
                          );
                        }}
                        onRemove={() => {
                          const newPoints = fit.points.filter((_, pj) => pj !== pi);
                          updateContent(
                            "find_your_fit",
                            content.find_your_fit.map((f, j) =>
                              j === i ? { ...f, points: newPoints } : f
                            )
                          );
                        }}
                      />
                    </div>
                  ))}
                  <AddButton
                    label="Add point"
                    onClick={() => {
                      const newPoints = [...fit.points, ""];
                      updateContent(
                        "find_your_fit",
                        content.find_your_fit.map((f, j) =>
                          j === i ? { ...f, points: newPoints } : f
                        )
                      );
                    }}
                  />
                </div>
              </div>

              {/* Row 5: CTA */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>CTA label</label>
                  <input
                    className={inputClass}
                    value={fit.cta}
                    onChange={(e) =>
                      updateContent(
                        "find_your_fit",
                        content.find_your_fit.map((f, j) =>
                          j === i ? { ...f, cta: e.target.value } : f
                        )
                      )
                    }
                    placeholder="e.g. Buy now"
                  />
                </div>
                <div>
                  <label className={labelClass}>CTA href</label>
                  <input
                    className={inputClass}
                    value={fit.cta_href}
                    onChange={(e) =>
                      updateContent(
                        "find_your_fit",
                        content.find_your_fit.map((f, j) =>
                          j === i ? { ...f, cta_href: e.target.value } : f
                        )
                      )
                    }
                    placeholder="#buy"
                  />
                </div>
              </div>

              {/* Row 6: image */}
              <div>
                <label className={labelClass}>Image</label>
                <ImageField
                  url={fit.image}
                  onPick={() => setPicker({ kind: "fit", index: i })}
                  onClear={() =>
                    updateContent(
                      "find_your_fit",
                      content.find_your_fit.map((f, j) =>
                        j === i ? { ...f, image: "" } : f
                      )
                    )
                  }
                  ratio="aspect-[16/9]"
                />
              </div>
            </div>
          ))}

          <AddButton
            label="Add persona"
            onClick={() =>
              updateContent("find_your_fit", [...content.find_your_fit, emptyFit()])
            }
          />
        </div>
      )}

      {/* ════════════════════════════════════════════
          VARIANTS TAB
      ════════════════════════════════════════════ */}
      {tab === "variants" && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <p className="text-xs admin-faint">
              {variants.length} variant{variants.length !== 1 ? "s" : ""} · stock lives in{" "}
              <Link href="/admin/inventory" className="text-[var(--admin-accent)] hover:underline">Inventory</Link>
            </p>
            <button
              onClick={() => {
                setVariantForm(emptyVariantForm());
                setShowVariantForm(true);
              }}
              className="px-3 py-1.5 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 text-[var(--admin-accent-contrast)] text-xs font-bold rounded-lg transition-colors"
            >
              New Variant
            </button>
          </div>

          {showVariantForm && (
            <div
              className="mb-4 p-4 rounded-xl"
              style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}
            >
              <h3 className="text-sm font-bold admin-heading mb-3">
                {variantForm.id ? "Edit Variant" : "New Variant"}
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                <div>
                  <label className={labelClass}>Name *</label>
                  <input className={inputClass} value={variantForm.name}
                    onChange={(e) => setVariantForm({ ...variantForm, name: e.target.value })}
                    placeholder="e.g. 95L" />
                </div>
                <div>
                  <label className={labelClass}>SKU *</label>
                  <input className={inputClass} value={variantForm.sku}
                    onChange={(e) => setVariantForm({ ...variantForm, sku: e.target.value })}
                    placeholder="NP7-BRD-FRX-95" />
                </div>
                <EanField
                  variantId={variantForm.id || null}
                  value={variantForm.ean}
                  onChange={(v) => setVariantForm({ ...variantForm, ean: v })}
                  labelClass={labelClass}
                  inputClass={inputClass}
                />
                <div>
                  <label className={labelClass}>RRP €</label>
                  <input type="number" className={inputClass} value={variantForm.rrp}
                    onChange={(e) => setVariantForm({ ...variantForm, rrp: e.target.value })} />
                </div>
                <div>
                  <label className={labelClass}>Boxed weight (g)</label>
                  <input type="number" className={inputClass} value={variantForm.weight_g}
                    onChange={(e) => setVariantForm({ ...variantForm, weight_g: e.target.value })} />
                </div>
                <div>
                  <label className={labelClass}>Box L×W×H (mm)</label>
                  <div className="flex gap-1">
                    {(["box_l_mm", "box_w_mm", "box_h_mm"] as const).map((k) => (
                      <input key={k} type="number" className={inputClass} value={variantForm[k]}
                        onChange={(e) => setVariantForm({ ...variantForm, [k]: e.target.value })} />
                    ))}
                  </div>
                </div>
                <div>
                  <label className={labelClass}>HS code</label>
                  <input className={inputClass} value={variantForm.hs_code}
                    onChange={(e) => setVariantForm({ ...variantForm, hs_code: e.target.value })}
                    placeholder="9506 21 00" />
                </div>
                <div>
                  <label className={labelClass}>Country of origin</label>
                  <input className={inputClass} value={variantForm.country_of_origin}
                    onChange={(e) => setVariantForm({ ...variantForm, country_of_origin: e.target.value })}
                    placeholder="TH" />
                </div>
                <div>
                  <label className={labelClass}>Lifecycle</label>
                  <select className={inputClass} value={variantForm.lifecycle}
                    onChange={(e) => setVariantForm({ ...variantForm, lifecycle: e.target.value })}>
                    {["draft", "active", "phase_out", "discontinued"].map((l) => (
                      <option key={l} value={l}>{l.replace("_", " ")}</option>
                    ))}
                  </select>
                </div>
                <label className="flex items-center gap-2 text-xs admin-muted self-end pb-2">
                  <input type="checkbox" checked={variantForm.serialized}
                    onChange={(e) => setVariantForm({ ...variantForm, serialized: e.target.checked })} />
                  Serialized (boards/masts)
                </label>
                <label className="flex items-center gap-2 text-xs admin-muted self-end pb-2">
                  <input type="checkbox" checked={variantForm.preferential_origin}
                    onChange={(e) => setVariantForm({ ...variantForm, preferential_origin: e.target.checked })} />
                  Preferential origin (0% duty)
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={saveVariant}
                  disabled={!variantForm.name || !variantForm.sku}
                  className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-40 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors"
                >
                  {variantForm.id ? "Update" : "Create"}
                </button>
                <button
                  onClick={() => { setShowVariantForm(false); setVariantForm(emptyVariantForm()); }}
                  className="px-4 py-2 admin-muted text-sm rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {variants.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm admin-faint">No variants yet</p>
            </div>
          ) : (
            <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
              <div
                className="grid grid-cols-[1fr_150px_110px_80px_90px_40px] gap-4 px-5 py-3 admin-surface"
                style={{ borderBottom: "1px solid var(--admin-border)" }}
              >
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Name</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">SKU</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase hidden sm:block">EAN</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">RRP</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Lifecycle</span>
                <span />
              </div>
              {variants.map((v) => (
                <div
                  key={v.id}
                  className="grid grid-cols-[1fr_150px_110px_80px_90px_40px] gap-4 px-5 py-3.5 transition-colors group"
                  style={{ borderBottom: "1px solid var(--admin-border)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                >
                  <span
                    className="text-sm font-medium admin-heading self-center cursor-pointer truncate"
                    onClick={() => {
                      setVariantForm({
                        id: v.id, name: v.name, sku: v.sku, ean: v.ean ?? "",
                        rrp: v.rrp?.toString() ?? "", weight_g: v.weight_g?.toString() ?? "",
                        box_l_mm: v.box_l_mm?.toString() ?? "", box_w_mm: v.box_w_mm?.toString() ?? "",
                        box_h_mm: v.box_h_mm?.toString() ?? "", hs_code: v.hs_code ?? "",
                        country_of_origin: v.country_of_origin ?? "",
                        preferential_origin: v.preferential_origin, serialized: v.serialized,
                        lifecycle: v.lifecycle,
                      });
                      setShowVariantForm(true);
                    }}
                  >
                    {v.name}
                    {v.serialized && (
                      <span className="ml-2 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-[var(--admin-accent-weak)] text-[var(--admin-accent)]">serial</span>
                    )}
                  </span>
                  <span className="text-xs admin-muted self-center font-mono truncate">{v.sku}</span>
                  <span className="text-xs admin-muted self-center truncate hidden sm:block">{v.ean ?? "—"}</span>
                  <span className="text-xs admin-muted self-center">{v.rrp != null ? `€${Number(v.rrp).toLocaleString()}` : "—"}</span>
                  <span className="text-xs admin-muted self-center capitalize">{v.lifecycle.replace("_", " ")}</span>
                  <button
                    onClick={() => deleteVariant(v.id)}
                    className="self-center opacity-0 group-hover:opacity-100 admin-faint hover:text-red-400 transition-all"
                    title="Archive"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════
          INQUIRIES TAB
      ════════════════════════════════════════════ */}
      {tab === "inquiries" && (
        <div>
          <p className="text-xs admin-faint mb-4">
            {inquiries.length} inquir{inquiries.length !== 1 ? "ies" : "y"}
          </p>
          {inquiries.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm admin-faint">No inquiries yet</p>
            </div>
          ) : (
            <div className="rounded-xl admin-tablecard" style={{ border: "1px solid var(--admin-border)" }}>
              <div
                className="grid grid-cols-[1fr_160px_120px_100px] gap-4 px-5 py-3 admin-surface"
                style={{ borderBottom: "1px solid var(--admin-border)" }}
              >
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Name / Email</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Message</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Date</span>
                <span className="text-[10px] font-bold tracking-[0.1em] admin-faint uppercase">Status</span>
              </div>
              {inquiries.map((q) => (
                <div
                  key={q.id}
                  className="grid grid-cols-[1fr_160px_120px_100px] gap-4 px-5 py-4"
                  style={{ borderBottom: "1px solid var(--admin-border)" }}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium admin-heading truncate">{q.name || "—"}</div>
                    <div className="text-xs admin-faint truncate">{q.email || "—"}</div>
                  </div>
                  <span
                    className="text-xs admin-muted self-center truncate"
                    title={q.message ?? ""}
                  >
                    {q.message || "—"}
                  </span>
                  <span className="text-xs admin-faint self-center">
                    {q.created_at
                      ? new Date(q.created_at).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })
                      : "—"}
                  </span>
                  <select
                    className="px-2 py-1.5 admin-input border rounded-md text-xs focus:outline-none focus:border-[var(--admin-accent)] transition-colors self-center"
                    value={q.status}
                    onChange={(e) => patchInquiryStatus(q.id, e.target.value)}
                  >
                    <option value="new">New</option>
                    <option value="replied">Replied</option>
                    <option value="closed">Closed</option>
                    <option value="spam">Spam</option>
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Image picker modal ── */}
      {picker && (
        <ImagePickerModal
          defaultFolder={slug ? `products/${slug}` : undefined}
          onSelect={applyPicked}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}
