"use client";

import { useMemo, useState } from "react";
import {
  ageFrom, firstNameInitial, initialsFrom, MINOR_AGE,
  type ProfileField, type ProfileSurface, type Visibility,
} from "@/lib/member-profile";

type Props = {
  name: string;
  country: string | null;
  level: string | null;
  dateOfBirth: string | null;
  username: string | null;
  avatarUrl: string | null;
  displayCity: string | null;
  visibility: Visibility;
  photoChoices: string[];
};

const SURFACES: { key: ProfileSurface; label: string; icon: string }[] = [
  { key: "crew", label: "On my trips (crew)", icon: "✈" },
  { key: "reviews", label: "On reviews I write", icon: "★" },
  { key: "spot_notes", label: "On spot notes I post", icon: "◎" },
];
const FIELDS: { key: ProfileField; label: string }[] = [
  { key: "level", label: "Level" },
  { key: "country", label: "Country" },
  { key: "city", label: "City" },
  { key: "age", label: "Age" },
];

export function CommunityProfile(p: Props) {
  const [username, setUsername] = useState(p.username ?? "");
  const [city, setCity] = useState(p.displayCity ?? "");
  const [avatar, setAvatar] = useState<string | null>(p.avatarUrl);
  const [surfaces, setSurfaces] = useState<Record<string, boolean>>({ ...p.visibility.surfaces });
  const [fields, setFields] = useState<Record<string, boolean>>({ ...p.visibility.fields });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [err, setErr] = useState("");

  const displayName = firstNameInitial(p.name);
  const initials = initialsFrom(p.name);
  const age = ageFrom(p.dateOfBirth);
  const isMinor = age != null && age < MINOR_AGE;

  const previewAge = fields.age && age != null && age >= MINOR_AGE ? age : null;
  const previewPlace = useMemo(() => {
    const bits = [fields.city ? city : "", fields.country ? p.country ?? "" : ""].filter(Boolean);
    return bits.join(", ");
  }, [fields.city, fields.country, city, p.country]);

  async function save() {
    setSaving(true); setSaved(false); setErr("");
    const res = await fetch("/api/portal/profile", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username, display_city: city, avatar_url: avatar,
        profile_visibility: { surfaces, fields },
      }),
    });
    setSaving(false);
    if (res.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); return; }
    const d = await res.json().catch(() => ({}));
    setErr(d?.error ?? "Couldn't save. Please try again.");
  }

  const field = "w-full px-4 py-3 rounded-xl border border-[#dde6e9] text-[15px] text-[#00374a] outline-none focus:border-[#00afdb] placeholder:text-[#9aa6ac]";
  const label = "block text-[12px] font-bold tracking-[0.08em] uppercase text-[#9aa6ac] mb-1.5";

  return (
    <section className="bg-white rounded-2xl border border-[#f0e6d6] p-6">
      <h2 className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#00afdb] mb-1.5">Community profile</h2>
      <p className="text-[13.5px] text-[#6a7a80] mb-5 leading-relaxed">
        Optional — let other NP7 riders put a face to your name on trips you share. Off by default; you choose exactly where and what.
      </p>

      {/* avatar + handle */}
      <div className="flex flex-wrap gap-5">
        <div className="flex flex-col items-center gap-2">
          {avatar ? (
            <div className="w-20 h-20 rounded-full bg-cover bg-center border border-[#e6eef0]" style={{ backgroundImage: `url('${avatar}')` }} />
          ) : (
            <div className="w-20 h-20 rounded-full grid place-items-center bg-[#e8f6fb] text-[#00748f] text-[22px] font-bold">{initials}</div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={() => setPickerOpen((o) => !o)} className="text-[12px] font-bold text-[#00afdb] hover:underline">
              {avatar ? "Change" : "Add photo"}
            </button>
            {avatar && <button type="button" onClick={() => setAvatar(null)} className="text-[12px] font-semibold text-[#9aa6ac] hover:text-[#c4621a]">Remove</button>}
          </div>
        </div>

        <div className="flex-1 min-w-[220px] space-y-3">
          <div>
            <label className={label}>Display name</label>
            <p className="text-[15px] text-[#00374a] font-semibold">{displayName} <span className="text-[12px] font-normal text-[#9aa6ac]">· auto from your name</span></p>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className={label}>Username</label>
              <div className="flex items-center rounded-xl border border-[#dde6e9] focus-within:border-[#00afdb] overflow-hidden">
                <span className="pl-3 pr-1 text-[15px] text-[#9aa6ac]">@</span>
                <input className="flex-1 px-1 py-3 text-[15px] text-[#00374a] outline-none" value={username} onChange={(e) => setUsername(e.target.value.replace(/^@+/, ""))} placeholder="nicoprien" />
              </div>
            </div>
            <div>
              <label className={label}>City (optional)</label>
              <input className={field} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Hamburg" />
            </div>
          </div>
        </div>
      </div>

      {/* photo picker */}
      {pickerOpen && (
        <div className="mt-4 rounded-xl border border-[#eef3f4] bg-[#fbfdfe] p-3">
          {p.photoChoices.length === 0 ? (
            <p className="text-[13px] text-[#9aa6ac] py-2 text-center">Your trip photos appear here after your first week — until then you&apos;ll show with your initials.</p>
          ) : (
            <div className="grid grid-cols-5 sm:grid-cols-8 gap-2 max-h-[180px] overflow-y-auto">
              {p.photoChoices.map((src) => (
                <button key={src} type="button" onClick={() => { setAvatar(src); setPickerOpen(false); }}
                  aria-label="Use this photo"
                  className={`aspect-square rounded-lg bg-cover bg-center hover:opacity-90 hover:scale-[1.03] transition-all ${avatar === src ? "ring-2 ring-[#00afdb]" : ""}`}
                  style={{ backgroundImage: `url('${src}')` }} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* surfaces */}
      <div className="mt-6 pt-5 border-t border-[#f3ede2]">
        <p className="text-[13px] font-bold text-[#00374a] mb-3">Where can other members see me?</p>
        <div className="space-y-2.5">
          {SURFACES.map((s) => (
            <Toggle key={s.key} on={!!surfaces[s.key]} onChange={(v) => setSurfaces((m) => ({ ...m, [s.key]: v }))}
              label={<span className="text-[14px] text-[#00374a]"><span className="inline-block w-5 text-[#00afdb]">{s.icon}</span> {s.label}</span>} />
          ))}
        </div>
      </div>

      {/* fields */}
      <div className="mt-5">
        <p className="text-[13px] font-bold text-[#00374a] mb-3">What can they see?</p>
        <div className="flex flex-wrap gap-2">
          {FIELDS.map((f) => {
            const on = !!fields[f.key];
            return (
              <button key={f.key} type="button" onClick={() => setFields((m) => ({ ...m, [f.key]: !on }))}
                className={`text-[13px] font-semibold px-3.5 py-2 rounded-full border transition-colors ${on ? "border-[#00afdb] bg-[#e8f6fb] text-[#00748f]" : "border-[#dde6e9] text-[#6a7a80] hover:border-[#bcd] "}`}>
                {on ? "✓ " : ""}{f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* live preview */}
      <div className="mt-6 pt-5 border-t border-[#f3ede2]">
        <p className="text-[12px] font-bold tracking-[0.08em] uppercase text-[#9aa6ac] mb-3">How others see you</p>
        <div className="inline-flex flex-col items-center text-center rounded-xl border border-[#e6eef0] px-6 py-4 min-w-[170px]">
          {avatar ? (
            <div className="w-12 h-12 rounded-full bg-cover bg-center mb-2" style={{ backgroundImage: `url('${avatar}')` }} />
          ) : (
            <div className="w-12 h-12 rounded-full grid place-items-center bg-[#e8f6fb] text-[#00748f] text-[15px] font-bold mb-2">{initials}</div>
          )}
          <p className="text-[14px] font-bold text-[#00374a]">{displayName}</p>
          {username.trim() && <p className="text-[12px] text-[#9aa6ac]">@{username.trim().toLowerCase()}</p>}
          {(previewPlace || previewAge != null) && (
            <p className="text-[12px] text-[#6a7a80] mt-1">{[previewPlace, previewAge != null ? `${previewAge}` : ""].filter(Boolean).join(" · ")}</p>
          )}
          {fields.level && p.level && <span className="mt-2 inline-block text-[11px] font-bold bg-[#e1f5ee] text-[#0f6e56] px-2.5 py-0.5 rounded-md">{p.level}</span>}
        </div>
        {isMinor && <p className="text-[12px] text-[#c4621a] mt-2">Under-18 riders are never listed in a trip crew, and your age is never shown.</p>}
      </div>

      <div className="flex items-center gap-3 mt-6">
        <button onClick={save} disabled={saving} className="px-6 py-3 rounded-full text-[14px] font-bold text-white bg-[#00afdb] hover:bg-[#15c0ec] disabled:opacity-60 transition-all">{saving ? "Saving…" : "Save community profile"}</button>
        {saved && <span className="text-[13px] font-semibold text-green-700">Saved ✓</span>}
        {err && <span className="text-[13px] font-semibold text-[#c4621a]">{err}</span>}
      </div>
    </section>
  );
}

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: React.ReactNode }) {
  return (
    <label className="flex items-center justify-between gap-3 cursor-pointer">
      {label}
      <button type="button" role="switch" aria-checked={on} onClick={() => onChange(!on)}
        className={`relative shrink-0 w-[42px] h-[24px] rounded-full transition-colors ${on ? "bg-[#00afdb]" : "bg-[#d6dee1]"}`}>
        <span className={`absolute top-[3px] w-[18px] h-[18px] rounded-full bg-white transition-all ${on ? "left-[21px]" : "left-[3px]"}`} />
      </button>
    </label>
  );
}
