"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import ImagePickerModal from "@/components/image-picker-modal";

interface Coach {
  id: string;
  name: string;
  role: string | null;
  bio: string | null;
  image_url: string | null;
  cutout_url: string | null;
  whatsapp_link: string | null;
}

interface GuideLink {
  id: string;
  coach_id: string;
  sort_order: number;
  name_override: string | null;
  role_override: string | null;
  bio_override: string | null;
  image_override: string | null;
  exp_coaches: Coach | null;
}

type PickerTarget = { coachId: string; mode: "template" | "override" | "cutout" };
type StudioTarget = { coachId: string; photoUrl: string; name: string };

const CoachPhotoStudio = dynamic(
  () => import("@/components/admin/coach-photo-studio").then((m) => m.CoachPhotoStudio),
  { ssr: false },
);

// Standard team roles (suggested in the role fields; free text still allowed).
export const TEAM_ROLES = ["Head Coach", "Coach", "Co-Coach", "Trip Assistant"];

const eff = (link: GuideLink, field: "name" | "role" | "bio" | "image") => {
  const override = link[`${field}_override` as keyof GuideLink] as string | null;
  const base = (link.exp_coaches?.[(field === "image" ? "image_url" : field) as keyof Coach] as string | null) ?? null;
  return override ?? base ?? "";
};

/**
 * Edit an edition's guides: assign coaches from the shared library (or create new),
 * with per-edition overrides and the ability to edit the shared template.
 */
export function EditionGuidesEditor({ editionId, slug }: { editionId: string; slug?: string | null }) {
  const [links, setLinks] = useState<GuideLink[]>([]);
  const [library, setLibrary] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [addId, setAddId] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [newCoach, setNewCoach] = useState({ name: "", role: "", bio: "", image_url: "" });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [studio, setStudio] = useState<StudioTarget | null>(null);

  const load = useCallback(() => {
    Promise.all([
      fetch(`/api/admin/editions/${editionId}/coaches`).then((r) => r.json()),
      fetch(`/api/admin/coaches`).then((r) => r.json()),
    ]).then(([l, c]) => {
      setLinks(Array.isArray(l) ? l : []);
      setLibrary(Array.isArray(c) ? c : []);
      setLoading(false);
    });
  }, [editionId]);

  useEffect(() => { load(); }, [load]);

  const assignedIds = new Set(links.map((l) => l.coach_id));

  async function assignExisting() {
    if (!addId) return;
    await fetch(`/api/admin/editions/${editionId}/coaches`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coach_id: addId }),
    });
    setAddId(""); load();
  }

  async function createAndAssign() {
    if (!newCoach.name.trim()) return;
    await fetch(`/api/admin/editions/${editionId}/coaches`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(newCoach),
    });
    setNewCoach({ name: "", role: "", bio: "", image_url: "" });
    setShowNew(false); load();
  }

  async function patchLink(coachId: string, patch: Record<string, unknown>) {
    await fetch(`/api/admin/editions/${editionId}/coaches`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ coach_id: coachId, ...patch }),
    });
    load();
  }

  async function patchTemplate(coachId: string, patch: Record<string, unknown>) {
    await fetch(`/api/admin/coaches/${coachId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    load();
  }

  async function unassign(coachId: string) {
    await fetch(`/api/admin/editions/${editionId}/coaches?coach_id=${coachId}`, { method: "DELETE" });
    load();
  }

  async function move(idx: number, dir: -1 | 1) {
    const a = links[idx]; const b = links[idx + dir];
    if (!a || !b) return;
    await Promise.all([
      patchLink(a.coach_id, { sort_order: b.sort_order }),
      patchLink(b.coach_id, { sort_order: a.sort_order }),
    ]);
  }

  const inputClass = "px-2 py-1.5 admin-input border rounded-lg text-xs focus:outline-none focus:border-[#0aa3c7]";
  const labelClass = "block text-[10px] font-bold uppercase tracking-wide admin-faint mb-1";
  const folder = slug ? `experiences/${slug}` : undefined;

  if (loading) return <div className="text-xs admin-faint py-2">Loading team…</div>;

  return (
    <div className="rounded-xl p-4" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
      <datalist id="team-roles">{TEAM_ROLES.map((r) => <option key={r} value={r} />)}</datalist>
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="text-sm font-bold admin-heading">Your team</h3>
          <p className="text-xs admin-faint mt-0.5">Coaches &amp; assistants shown on the public page and in My Trip. Members join the shared library — reusable across experiences.</p>
        </div>
      </div>

      {links.length === 0 ? (
        <p className="text-xs admin-faint mb-3">No team members yet.</p>
      ) : (
        <div className="space-y-1.5 mb-4">
          {links.map((link, idx) => {
            const expanded = expandedId === link.coach_id;
            const hasOverride = !!(link.name_override || link.role_override || link.bio_override || link.image_override);
            // whatsapp_link comes from the library (select * — tolerant), not the embed
            const lib = library.find((c) => c.id === link.coach_id) || null;
            return (
              <div key={link.id} className="rounded-lg" style={{ border: "1px solid var(--admin-border)" }}>
                <div className="flex items-center gap-3 p-2">
                  <div className="w-9 h-9 rounded-lg bg-cover bg-center shrink-0 admin-bg" style={{ backgroundImage: eff(link, "image") ? `url('${eff(link, "image")}')` : undefined, border: "1px solid var(--admin-border)" }} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium admin-heading truncate">{eff(link, "name") || "Unnamed coach"}</div>
                    <div className="text-[11px] admin-faint truncate">{eff(link, "role") || "—"}{hasOverride && <span className="ml-1.5 text-[#0aa3c7]">· edited for this edition</span>}</div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button onClick={() => move(idx, -1)} disabled={idx === 0} className="admin-faint hover:admin-heading disabled:opacity-20 text-xs px-1" title="Move up">↑</button>
                    <button onClick={() => move(idx, 1)} disabled={idx === links.length - 1} className="admin-faint hover:admin-heading disabled:opacity-20 text-xs px-1" title="Move down">↓</button>
                    <button onClick={() => setExpandedId(expanded ? null : link.coach_id)} className="text-[11px] font-medium text-[#0aa3c7] px-2 py-1">{expanded ? "Close" : "Edit"}</button>
                    <button onClick={() => unassign(link.coach_id)} className="admin-faint hover:text-red-400 transition-colors" title="Remove from edition">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="grid grid-cols-2 gap-4 p-3 pt-1" style={{ borderTop: "1px solid var(--admin-border)" }}>
                    {/* Template (shared) */}
                    <div className="space-y-2">
                      <p className="text-[11px] font-bold admin-muted">Template <span className="admin-faint font-normal">· edits apply everywhere</span></p>
                      <div><label className={labelClass}>Name</label><input className={`${inputClass} w-full`} defaultValue={link.exp_coaches?.name ?? ""} onBlur={(e) => { if (e.target.value !== (link.exp_coaches?.name ?? "")) patchTemplate(link.coach_id, { name: e.target.value }); }} /></div>
                      <div><label className={labelClass}>Role</label><input list="team-roles" className={`${inputClass} w-full`} defaultValue={link.exp_coaches?.role ?? ""} onBlur={(e) => { if (e.target.value !== (link.exp_coaches?.role ?? "")) patchTemplate(link.coach_id, { role: e.target.value || null }); }} /></div>
                      <div><label className={labelClass}>Bio</label><textarea className={`${inputClass} w-full min-h-[56px] resize-y`} defaultValue={link.exp_coaches?.bio ?? ""} onBlur={(e) => { if (e.target.value !== (link.exp_coaches?.bio ?? "")) patchTemplate(link.coach_id, { bio: e.target.value || null }); }} /></div>
                      <div><label className={labelClass}>WhatsApp link <span className="admin-faint">(members can chat directly)</span></label><input className={`${inputClass} w-full`} defaultValue={lib?.whatsapp_link ?? ""} placeholder="wa.me/4368054000977" onBlur={(e) => { if (e.target.value !== (lib?.whatsapp_link ?? "")) patchTemplate(link.coach_id, { whatsapp_link: e.target.value || null }); }} /></div>
                      <div>
                        <label className={labelClass}>Photo</label>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setPicker({ coachId: link.coach_id, mode: "template" })} className={`${inputClass} flex-1 text-left admin-muted`}>{link.exp_coaches?.image_url ? "Change photo…" : "Pick photo…"}</button>
                          {/* Re-frame the photo you already picked, and cut the coach
                              out of it — both were previously external-editor jobs. */}
                          {link.exp_coaches?.image_url && (
                            <button onClick={() => setStudio({ coachId: link.coach_id, photoUrl: link.exp_coaches!.image_url!, name: link.exp_coaches?.name ?? "Coach" })}
                              className="text-[11px] font-bold text-[#0aa3c7] hover:underline px-1 whitespace-nowrap"
                              title="Crop this photo, or generate the tile cutout from it">
                              Crop / cut out
                            </button>
                          )}
                        </div>
                      </div>
                      <div>
                        <label className={labelClass}>Tile cutout <span className="admin-faint font-normal normal-case">· transparent PNG, for auto-branded tiles</span></label>
                        <div className="flex items-center gap-2">
                          {link.exp_coaches?.cutout_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={link.exp_coaches.cutout_url} alt="" className="w-9 h-9 object-contain shrink-0 rounded admin-bg" style={{ border: "1px solid var(--admin-border)" }} />
                          )}
                          <button onClick={() => setPicker({ coachId: link.coach_id, mode: "cutout" })} className={`${inputClass} flex-1 text-left admin-muted`}>{link.exp_coaches?.cutout_url ? "Change cutout…" : "Pick cutout…"}</button>
                          {link.exp_coaches?.cutout_url && <button onClick={() => patchTemplate(link.coach_id, { cutout_url: null })} className="text-[11px] admin-faint hover:text-red-400 px-1">clear</button>}
                        </div>
                        {!link.exp_coaches?.cutout_url && link.exp_coaches?.image_url && (
                          <button onClick={() => setStudio({ coachId: link.coach_id, photoUrl: link.exp_coaches!.image_url!, name: link.exp_coaches?.name ?? "Coach" })}
                            className="text-[11px] font-bold text-[#0aa3c7] hover:underline mt-1">
                            Generate it from the photo →
                          </button>
                        )}
                      </div>
                    </div>
                    {/* Override (this edition) */}
                    <div className="space-y-2">
                      <p className="text-[11px] font-bold admin-muted">This edition <span className="admin-faint font-normal">· blank = use template</span></p>
                      <div><label className={labelClass}>Name</label><input className={`${inputClass} w-full`} defaultValue={link.name_override ?? ""} placeholder={link.exp_coaches?.name ?? ""} onBlur={(e) => { if (e.target.value !== (link.name_override ?? "")) patchLink(link.coach_id, { name_override: e.target.value }); }} /></div>
                      <div><label className={labelClass}>Role</label><input list="team-roles" className={`${inputClass} w-full`} defaultValue={link.role_override ?? ""} placeholder={link.exp_coaches?.role ?? ""} onBlur={(e) => { if (e.target.value !== (link.role_override ?? "")) patchLink(link.coach_id, { role_override: e.target.value }); }} /></div>
                      <div><label className={labelClass}>Bio</label><textarea className={`${inputClass} w-full min-h-[56px] resize-y`} defaultValue={link.bio_override ?? ""} placeholder={link.exp_coaches?.bio ?? ""} onBlur={(e) => { if (e.target.value !== (link.bio_override ?? "")) patchLink(link.coach_id, { bio_override: e.target.value }); }} /></div>
                      <div>
                        <label className={labelClass}>Photo</label>
                        <div className="flex gap-2">
                          <button onClick={() => setPicker({ coachId: link.coach_id, mode: "override" })} className={`${inputClass} flex-1 text-left admin-muted`}>{link.image_override ? "Change photo…" : "Pick photo…"}</button>
                          {link.image_override && <button onClick={() => patchLink(link.coach_id, { image_override: null })} className="text-[11px] admin-faint hover:text-red-400 px-1">clear</button>}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add row */}
      <div className="flex items-center gap-2">
        <select value={addId} onChange={(e) => setAddId(e.target.value)} className={`${inputClass} flex-1`}>
          <option value="">Add a team member…</option>
          {library.filter((c) => !assignedIds.has(c.id)).map((c) => (
            <option key={c.id} value={c.id}>{c.name}{c.role ? ` — ${c.role}` : ""}</option>
          ))}
        </select>
        <button onClick={assignExisting} disabled={!addId} className="px-3 py-1.5 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-40 text-white text-xs font-bold rounded-lg transition-colors">Add</button>
        <button onClick={() => setShowNew((v) => !v)} className="px-3 py-1.5 admin-surface admin-muted text-xs rounded-lg transition-colors" style={{ border: "1px solid var(--admin-border)" }}>+ New member</button>
      </div>

      {showNew && (
        <div className="mt-3 grid grid-cols-2 gap-2 p-3 rounded-lg" style={{ border: "1px solid var(--admin-border)" }}>
          <input className={`${inputClass} w-full`} placeholder="Name *" value={newCoach.name} onChange={(e) => setNewCoach({ ...newCoach, name: e.target.value })} />
          <input list="team-roles" className={`${inputClass} w-full`} placeholder="Role (e.g. Head Coach, Trip Assistant)" value={newCoach.role} onChange={(e) => setNewCoach({ ...newCoach, role: e.target.value })} />
          <textarea className={`${inputClass} w-full col-span-2 min-h-[48px] resize-y`} placeholder="Short bio" value={newCoach.bio} onChange={(e) => setNewCoach({ ...newCoach, bio: e.target.value })} />
          <button onClick={() => setPicker({ coachId: "__new__", mode: "template" })} className={`${inputClass} text-left admin-muted`}>{newCoach.image_url ? "Photo selected ✓" : "Pick photo…"}</button>
          <button onClick={createAndAssign} disabled={!newCoach.name.trim()} className="px-3 py-1.5 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 disabled:opacity-40 text-white text-xs font-bold rounded-lg">Create & add</button>
        </div>
      )}

      {picker && (
        <ImagePickerModal
          defaultFolder={folder}
          onSelect={(url) => {
            if (picker.coachId === "__new__") setNewCoach((n) => ({ ...n, image_url: url }));
            else if (picker.mode === "cutout") patchTemplate(picker.coachId, { cutout_url: url });
            else if (picker.mode === "template") patchTemplate(picker.coachId, { image_url: url });
            else patchLink(picker.coachId, { image_override: url });
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}

      {/* Loaded on demand — it pulls in WASM for the segmentation model and
          must not sit in the admin's initial bundle. */}
      {studio && (
        <CoachPhotoStudio
          photoUrl={studio.photoUrl}
          coachName={studio.name}
          onPhoto={(url: string) => patchTemplate(studio.coachId, { image_url: url })}
          onCutout={(url: string) => patchTemplate(studio.coachId, { cutout_url: url })}
          onClose={() => setStudio(null)}
        />
      )}
    </div>
  );
}
