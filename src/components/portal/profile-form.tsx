"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MemberProfile } from "@/lib/portal-data";

const SIZES = ["XS", "S", "M", "L", "XL", "XXL"];

export function ProfileForm({ profile }: { profile: MemberProfile }) {
  const supabase = createClient();
  const [f, setF] = useState({
    name: profile.name ?? "",
    phone: profile.phone ?? "",
    country: profile.country ?? "",
    tshirt_size: profile.tshirt_size ?? "",
    diet_allergies: profile.diet_allergies ?? "",
    date_of_birth: profile.date_of_birth ?? "",
    marketing_opt_in: !!profile.marketing_opt_in,
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // password section
  const [pw, setPw] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState("");

  const set = (k: keyof typeof f, v: string | boolean) => setF((s) => ({ ...s, [k]: v }));

  async function save() {
    setSaving(true); setSaved(false);
    const res = await fetch("/api/portal/profile", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f),
    });
    setSaving(false);
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
  }

  async function setPassword(e: React.FormEvent) {
    e.preventDefault(); setPwBusy(true); setPwMsg("");
    const { error } = await supabase.auth.updateUser({ password: pw });
    setPwBusy(false);
    setPwMsg(error ? error.message : "Password set — you can now log in with it.");
    if (!error) setPw("");
  }

  const field = "w-full px-4 py-3 rounded-xl border border-[#dde6e9] text-[15px] text-[#00374a] outline-none focus:border-[#00afdb] placeholder:text-[#9aa6ac]";
  const label = "block text-[12px] font-bold tracking-[0.08em] uppercase text-[#9aa6ac] mb-1.5";

  return (
    <div className="space-y-5">
      <section className="bg-white rounded-2xl border border-[#f0e6d6] p-6">
        <h2 className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#00afdb] mb-5">Your details</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2"><label className={label}>Name</label><input className={field} value={f.name} onChange={(e) => set("name", e.target.value)} /></div>
          <div><label className={label}>Phone</label><input className={field} value={f.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+49…" /></div>
          <div><label className={label}>Country</label><input className={field} value={f.country} onChange={(e) => set("country", e.target.value)} /></div>
          <div><label className={label}>T-shirt size</label>
            <select className={field} value={f.tshirt_size} onChange={(e) => set("tshirt_size", e.target.value)}>
              <option value="">Select…</option>
              {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div><label className={label}>Date of birth</label><input type="date" className={field} value={f.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} /></div>
          <div className="sm:col-span-2"><label className={label}>Diet / allergies</label><textarea rows={2} className={`${field} resize-y`} value={f.diet_allergies} onChange={(e) => set("diet_allergies", e.target.value)} placeholder="Vegetarian, nut allergy, …" /></div>
        </div>
        <label className="flex items-start gap-2.5 mt-5 cursor-pointer">
          <input type="checkbox" checked={f.marketing_opt_in} onChange={(e) => set("marketing_opt_in", e.target.checked)} className="mt-0.5 w-4 h-4 accent-[#00afdb]" />
          <span className="text-[13px] text-[#6a7a80] leading-relaxed">Send me news about new NP7 experiences and early-bird dates. (You can opt out anytime.)</span>
        </label>
        <div className="flex items-center gap-3 mt-6">
          <button onClick={save} disabled={saving} className="px-6 py-3 rounded-full text-[14px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] disabled:opacity-60 transition-all">{saving ? "Saving…" : "Save changes"}</button>
          {saved && <span className="text-[13px] font-semibold text-green-700">Saved ✓</span>}
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-[#f0e6d6] p-6">
        <h2 className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#00afdb] mb-2">Set a password</h2>
        <p className="text-[13.5px] text-[#6a7a80] mb-4 leading-relaxed">Optional — you can always log in with an email link. Set a password if you prefer.</p>
        <form onSubmit={setPassword} className="flex flex-wrap gap-3 items-center">
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password (min 6)" minLength={6} required className={`${field} max-w-[280px]`} />
          <button type="submit" disabled={pwBusy} className="px-6 py-3 rounded-full text-[14px] font-bold text-[#00374a] bg-[#eef3f4] hover:bg-[#e2eaec] disabled:opacity-60">{pwBusy ? "…" : "Set password"}</button>
          {pwMsg && <span className="text-[13px] text-[#6a7a80] w-full">{pwMsg}</span>}
        </form>
      </section>

      <section className="bg-white rounded-2xl border border-[#f0e6d6] p-6">
        <h2 className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#9aa6ac] mb-2">Your data</h2>
        <p className="text-[13.5px] text-[#6a7a80] leading-relaxed">Want a copy of your data, or to delete your account? Email <a href="mailto:experience@np-seven.com?subject=Data request" className="text-[#00afdb] font-semibold">experience@np-seven.com</a> and we&apos;ll handle it in line with GDPR. Booking/invoice records we&apos;re legally required to keep are retained as required by law.</p>
      </section>
    </div>
  );
}
