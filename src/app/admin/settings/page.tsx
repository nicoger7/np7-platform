"use client";

import { useState, useEffect } from "react";
import ImagePickerModal from "@/components/image-picker-modal";
import { DIVISIONS, type Division, type CompanySettings } from "@/lib/invoices/types";

const VAT_MODES = [
  { value: "margin", label: "Margin scheme (Differenzbesteuerung)" },
  { value: "standard", label: "Standard (Regelbesteuerung)" },
];

const EMPTY: CompanySettings = {
  division: "experience",
  legal_name: null,
  address_line1: null,
  address_line2: null,
  postal_code: null,
  city: null,
  country: null,
  email: null,
  phone: null,
  website: null,
  vat_id: null,
  tax_number: null,
  gs1_prefix: null,
  register_info: null,
  managing_director: null,
  iban: null,
  bic: null,
  bank_name: null,
  logo_url: null,
  currency: "EUR",
  vat_mode: "margin",
  vat_rate: null,
  invoice_prefix: null,
  invoice_footer: null,
  terms_url: null,
  sicherungsschein_insurer: null,
  sicherungsschein_number: null,
};

export default function CompanySettingsPage() {
  const [division, setDivision] = useState<Division>("experience");
  const [form, setForm] = useState<CompanySettings>({ ...EMPTY, division: "experience" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [showLogoPicker, setShowLogoPicker] = useState(false);

  async function fetchSettings(div: Division) {
    setLoading(true);
    const res = await fetch(`/api/admin/company-settings/${div}`);
    if (res.ok) {
      const data = await res.json();
      setForm({ ...EMPTY, ...data, division: div });
    } else {
      setForm({ ...EMPTY, division: div });
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchSettings(division);
  }, [division]);

  function update(field: keyof CompanySettings, value: unknown) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  async function handleSave() {
    setSaving(true);
    const { division: _div, ...fields } = form;
    await fetch(`/api/admin/company-settings/${division}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(fields),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  const inputClass =
    "w-full px-4 py-2.5 admin-input border rounded-lg text-sm focus:outline-none focus:border-[var(--admin-accent)] focus:ring-1 focus:ring-[var(--admin-accent)] transition-colors";
  const labelClass = "block text-xs font-medium admin-muted mb-1.5";
  const sectionHeadingClass = "text-xs font-bold tracking-[0.12em] admin-faint uppercase mb-3 pt-2";

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold admin-heading">Company Settings</h1>
          <p className="text-sm admin-muted mt-0.5">Legal entity and invoicing configuration per division</p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || loading}
          className="px-4 py-2 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-50 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors"
        >
          {saving ? "Saving..." : saved ? "Saved!" : "Save"}
        </button>
      </div>

      {/* Division toggle */}
      <div className="flex gap-1 mb-6 p-1 rounded-lg inline-flex" style={{ backgroundColor: "var(--admin-surface)", border: "1px solid var(--admin-border)" }}>
        {DIVISIONS.map((div) => (
          <button
            key={div}
            onClick={() => setDivision(div)}
            className="px-4 py-1.5 rounded-md text-sm font-medium transition-colors capitalize"
            style={{
              backgroundColor: division === div ? "#0aa3c7" : "transparent",
              color: division === div ? "#fff" : "var(--admin-text-muted)",
            }}
          >
            {div}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-12 text-center text-sm admin-faint">Loading...</div>
      ) : (
        <div className="max-w-[720px] space-y-6">

          {/* Legal entity */}
          <div>
            <div className={sectionHeadingClass} style={{ borderTop: "1px solid var(--admin-border)" }}>Legal Entity</div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Legal name</label>
                  <input className={inputClass} value={form.legal_name || ""} onChange={(e) => update("legal_name", e.target.value || null)} placeholder="GmbH / UG name" />
                </div>
                <div>
                  <label className={labelClass}>Managing director</label>
                  <input className={inputClass} value={form.managing_director || ""} onChange={(e) => update("managing_director", e.target.value || null)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Register info</label>
                  <input className={inputClass} value={form.register_info || ""} onChange={(e) => update("register_info", e.target.value || null)} placeholder="HRB 12345, AG München" />
                </div>
                <div>
                  <label className={labelClass}>Website</label>
                  <input className={inputClass} value={form.website || ""} onChange={(e) => update("website", e.target.value || null)} placeholder="https://..." />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Email</label>
                  <input className={inputClass} type="email" value={form.email || ""} onChange={(e) => update("email", e.target.value || null)} />
                </div>
                <div>
                  <label className={labelClass}>Phone</label>
                  <input className={inputClass} value={form.phone || ""} onChange={(e) => update("phone", e.target.value || null)} />
                </div>
              </div>
            </div>
          </div>

          {/* Address */}
          <div>
            <div className={sectionHeadingClass} style={{ borderTop: "1px solid var(--admin-border)" }}>Address</div>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Address line 1</label>
                <input className={inputClass} value={form.address_line1 || ""} onChange={(e) => update("address_line1", e.target.value || null)} />
              </div>
              <div>
                <label className={labelClass}>Address line 2</label>
                <input className={inputClass} value={form.address_line2 || ""} onChange={(e) => update("address_line2", e.target.value || null)} />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className={labelClass}>Postal code</label>
                  <input className={inputClass} value={form.postal_code || ""} onChange={(e) => update("postal_code", e.target.value || null)} />
                </div>
                <div>
                  <label className={labelClass}>City</label>
                  <input className={inputClass} value={form.city || ""} onChange={(e) => update("city", e.target.value || null)} />
                </div>
                <div>
                  <label className={labelClass}>Country</label>
                  <input className={inputClass} value={form.country || ""} onChange={(e) => update("country", e.target.value || null)} placeholder="DE" />
                </div>
              </div>
            </div>
          </div>

          {/* Tax & Registration */}
          <div>
            <div className={sectionHeadingClass} style={{ borderTop: "1px solid var(--admin-border)" }}>Tax &amp; Registration</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>VAT ID (USt-IdNr.)</label>
                <input className={inputClass} value={form.vat_id || ""} onChange={(e) => update("vat_id", e.target.value || null)} placeholder="DE123456789" />
              </div>
              <div>
                <label className={labelClass}>Tax number (Steuernr.)</label>
                <input className={inputClass} value={form.tax_number || ""} onChange={(e) => update("tax_number", e.target.value || null)} />
              </div>
              {division === "hardware" && (
                <div className="col-span-2">
                  <label className={labelClass}>GS1 company prefix</label>
                  <input className={inputClass} value={form.gs1_prefix || ""} onChange={(e) => update("gs1_prefix", e.target.value.replace(/\D/g, "") || null)} placeholder="e.g. 426012345" />
                  <p className="text-[11px] admin-faint mt-1 leading-relaxed">
                    From your GS1 Germany licence. Product EANs are issued from this prefix — a shorter
                    prefix means more numbers. Leave empty until you&apos;ve registered; EANs can&apos;t be
                    invented, retailers verify who owns them.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Bank */}
          <div>
            <div className={sectionHeadingClass} style={{ borderTop: "1px solid var(--admin-border)" }}>Bank Account</div>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Bank name</label>
                <input className={inputClass} value={form.bank_name || ""} onChange={(e) => update("bank_name", e.target.value || null)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>IBAN</label>
                  <input className={inputClass} value={form.iban || ""} onChange={(e) => update("iban", e.target.value || null)} />
                </div>
                <div>
                  <label className={labelClass}>BIC / SWIFT</label>
                  <input className={inputClass} value={form.bic || ""} onChange={(e) => update("bic", e.target.value || null)} />
                </div>
              </div>
            </div>
          </div>

          {/* Invoice Options */}
          <div>
            <div className={sectionHeadingClass} style={{ borderTop: "1px solid var(--admin-border)" }}>Invoice Options</div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>VAT mode</label>
                  <select
                    className={inputClass}
                    value={form.vat_mode}
                    onChange={(e) => update("vat_mode", e.target.value)}
                  >
                    {VAT_MODES.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelClass}>VAT rate (%)</label>
                  <input
                    className={inputClass}
                    type="number"
                    step="0.1"
                    min="0"
                    max="100"
                    value={form.vat_rate ?? ""}
                    onChange={(e) => update("vat_rate", e.target.value ? Number(e.target.value) : null)}
                    placeholder="e.g. 19"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Invoice number prefix</label>
                  <input className={inputClass} value={form.invoice_prefix || ""} onChange={(e) => update("invoice_prefix", e.target.value || null)} placeholder="e.g. NP7-EXP" />
                </div>
                <div>
                  <label className={labelClass}>Currency</label>
                  <input className={inputClass} value={form.currency || "EUR"} onChange={(e) => update("currency", e.target.value || "EUR")} placeholder="EUR" />
                </div>
              </div>
              <div>
                <label className={labelClass}>Invoice footer text</label>
                <textarea
                  className={`${inputClass} min-h-[80px] resize-y`}
                  value={form.invoice_footer || ""}
                  onChange={(e) => update("invoice_footer", e.target.value || null)}
                  placeholder="Appears at the bottom of every invoice..."
                />
              </div>
              <div>
                <label className={labelClass}>Terms &amp; conditions URL</label>
                <input className={inputClass} value={form.terms_url || ""} onChange={(e) => update("terms_url", e.target.value || null)} placeholder="https://..." />
              </div>
            </div>
          </div>

          {/* Sicherungsschein (Package Travel Insurance) */}
          <div>
            <div className={sectionHeadingClass} style={{ borderTop: "1px solid var(--admin-border)" }}>Sicherungsschein (Package Travel)</div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Insurer name</label>
                <input className={inputClass} value={form.sicherungsschein_insurer || ""} onChange={(e) => update("sicherungsschein_insurer", e.target.value || null)} />
              </div>
              <div>
                <label className={labelClass}>Policy / certificate number</label>
                <input className={inputClass} value={form.sicherungsschein_number || ""} onChange={(e) => update("sicherungsschein_number", e.target.value || null)} />
              </div>
            </div>
          </div>

          {/* Logo */}
          <div>
            <div className={sectionHeadingClass} style={{ borderTop: "1px solid var(--admin-border)" }}>Logo</div>
            <div className="flex items-center gap-4">
              {form.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={form.logo_url}
                  alt="Company logo"
                  className="h-12 object-contain rounded"
                  style={{ border: "1px solid var(--admin-border)" }}
                />
              ) : (
                <div
                  className="h-12 w-24 rounded flex items-center justify-center text-xs admin-faint"
                  style={{ border: "1px dashed var(--admin-border)" }}
                >
                  No logo
                </div>
              )}
              <button
                onClick={() => setShowLogoPicker(true)}
                className="px-3 py-2 text-xs admin-muted rounded-lg transition-colors"
                style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}
              >
                {form.logo_url ? "Change logo" : "Pick logo"}
              </button>
              {form.logo_url && (
                <button
                  onClick={() => update("logo_url", null)}
                  className="text-xs text-red-400/60 hover:text-red-400 transition-colors"
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          {/* Save at bottom too */}
          <div className="pt-2 pb-4">
            <button
              onClick={handleSave}
              disabled={saving || loading}
              className="px-5 py-2.5 bg-[var(--admin-accent)] hover:bg-[var(--admin-accent)]/90 disabled:opacity-50 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors"
            >
              {saving ? "Saving..." : saved ? "Saved!" : "Save changes"}
            </button>
          </div>
        </div>
      )}

      {showLogoPicker && (
        <ImagePickerModal
          onSelect={(url) => { update("logo_url", url); setShowLogoPicker(false); }}
          onClose={() => setShowLogoPicker(false)}
        />
      )}
    </div>
  );
}
