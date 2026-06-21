"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function NewExperiencePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: "",
    slug: "",
    location: "",
    price: "",
    description: "",
    status: "draft",
    hotel: "",
    airport_code: "",
    currency: "EUR",
    timezone: "Europe/Berlin",
    whatsapp_group_link: "",
    notes: "",
    cancellation_policy: "",
  });

  function update(field: string, value: unknown) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title || !form.slug || !form.location) return;
    setSaving(true);

    const res = await fetch("/api/admin/experiences", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        price: form.price ? Number(form.price) : null,
        hotel: form.hotel || null,
        airport_code: form.airport_code || null,
        whatsapp_group_link: form.whatsapp_group_link || null,
        notes: form.notes || null,
        cancellation_policy: form.cancellation_policy || null,
      }),
    });

    const data = await res.json();
    setSaving(false);

    // The API returns the created row directly.
    if (data?.id) {
      router.push(`/admin/experiences/${data.id}`);
    }
  }

  const inputClass =
    "w-full px-4 py-2.5 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1.5";

  return (
    <div>
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push("/admin/experiences")}
          className="admin-faint hover:admin-heading transition-colors"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h1 className="text-2xl font-bold admin-heading">New Experience</h1>
          <p className="text-sm admin-muted">Create a new trip or event</p>
        </div>
      </div>

      <form onSubmit={handleCreate} className="max-w-[720px] space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Title *</label>
            <input
              className={inputClass}
              value={form.title}
              onChange={(e) => {
                update("title", e.target.value);
                update("slug", slugify(e.target.value));
              }}
              placeholder="NP7 Turkey Experience"
              required
            />
          </div>
          <div>
            <label className={labelClass}>Slug</label>
            <input
              className={inputClass}
              value={form.slug}
              onChange={(e) => update("slug", e.target.value)}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Location *</label>
            <input
              className={inputClass}
              value={form.location}
              onChange={(e) => update("location", e.target.value)}
              placeholder="Alaçatı, Turkey"
              required
            />
          </div>
          <div>
            <label className={labelClass}>Hotel</label>
            <select
              className={inputClass}
              value={form.hotel}
              onChange={(e) => update("hotel", e.target.value)}
            >
              <option value="">No hotel</option>
              <option value="Sorobon">Sorobon</option>
              <option value="Wanapa">Wanapa</option>
              <option value="Playa Surf">Playa Surf</option>
              <option value="Hotel Paradiso">Hotel Paradiso</option>
              <option value="Alacati">Alacati</option>
              <option value="REF">REF</option>
              <option value="REF II">REF II</option>
            </select>
          </div>
        </div>

        <div className="rounded-lg p-3 text-xs admin-faint" style={{ border: "1px dashed var(--admin-border)" }}>
          Dates, spots, deposit and per-package pricing are set on each <span className="font-medium admin-muted">edition</span> after
          you create the experience — an experience is the reusable template.
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>From price <span className="admin-faint">(optional)</span></label>
            <input
              type="number"
              className={inputClass}
              value={form.price}
              onChange={(e) => update("price", e.target.value)}
              placeholder="1890"
            />
          </div>
          <div>
            <label className={labelClass}>Currency</label>
            <select
              className={inputClass}
              value={form.currency}
              onChange={(e) => update("currency", e.target.value)}
            >
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="GBP">GBP</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Airport code</label>
            <input
              className={inputClass}
              value={form.airport_code}
              onChange={(e) => update("airport_code", e.target.value)}
              placeholder="e.g. ADB, BON, VRN"
            />
          </div>
          <div>
            <label className={labelClass}>Timezone</label>
            <input
              className={inputClass}
              value={form.timezone}
              onChange={(e) => update("timezone", e.target.value)}
              placeholder="Europe/Berlin"
            />
          </div>
        </div>

        <div>
          <label className={labelClass}>Description</label>
          <textarea
            className={`${inputClass} min-h-[100px] resize-y`}
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            placeholder="Tell people what this experience is about..."
          />
        </div>

        <div>
          <label className={labelClass}>Status</label>
          <div className="flex gap-2">
            {["draft", "published"].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => update("status", s)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize ${
                  form.status === s
                    ? s === "published"
                      ? "bg-green-500/20 text-green-400 border border-green-500/30"
                      : "admin-heading border"
                    : "admin-surface admin-faint border transition-colors"
                }`}
                style={{
                  borderColor: form.status === s && s !== "published" ? "var(--admin-input-border)" : undefined,
                  ...(form.status !== s ? { borderColor: "var(--admin-border)" } : {}),
                }}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="pt-4">
          <button
            type="submit"
            disabled={saving || !form.title || !form.location}
            className="px-6 py-2.5 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-50 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors"
          >
            {saving ? "Creating..." : "Create Experience"}
          </button>
        </div>
      </form>
    </div>
  );
}
