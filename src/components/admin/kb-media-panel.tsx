"use client";

import { useCallback, useEffect, useState } from "react";
import ImagePickerModal from "@/components/image-picker-modal";

/**
 * Photos and videos for one section of a knowledge entry.
 *
 * Picking beats uploading here, which is why the photo picker opens straight
 * into `memories`: the weeks already hold thousands of real shots of real
 * riders doing the exact thing the entry describes, all of them in R2 and
 * already paid for. Attaching one costs a row, not a file, and detaching it
 * later takes nothing away from the guest whose week it came from.
 *
 * Videos live somewhere else entirely and cannot share the picker: memories
 * are Supabase Storage objects, trip clips are R2 objects under _video/, and
 * the only endpoint that lists them wants an edition. So the Videos tab asks
 * which week first. That is the storage reality, not a design choice.
 */

type Media = {
  id: string; kind: "photo" | "video"; ref: string; url: string;
  poster_url: string | null; caption: string | null; section_key: string | null;
};
type Edition = { id: string; title: string };
type Video = { stem: string; status: string; url: string | null; poster: string | null };

export function KbMediaPanel({ entryId, sectionKey }: { entryId: string; sectionKey: string }) {
  const [media, setMedia] = useState<Media[]>([]);
  const [tab, setTab] = useState<"photos" | "videos">("photos");
  const [picking, setPicking] = useState(false);
  const [editions, setEditions] = useState<Edition[]>([]);
  const [editionId, setEditionId] = useState("");
  const [videos, setVideos] = useState<Video[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/kb/${entryId}/media`).then((x) => x.json()).catch(() => null);
    setMedia(((r?.media ?? []) as Media[]).filter((m) => m.section_key === sectionKey));
  }, [entryId, sectionKey]);
  useEffect(() => { load(); }, [load]);

  async function attach(items: Partial<Media>[], source: string) {
    setBusy(true); setErr("");
    const r = await fetch(`/api/admin/kb/${entryId}/media`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sectionKey, source, items }),
    }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (!r?.ok) { setErr(r?.error || "Could not attach that."); return; }
    load();
  }

  async function detach(id: string) {
    await fetch(`/api/admin/kb/${entryId}/media?mediaId=${id}`, { method: "DELETE" }).catch(() => {});
    load();
  }

  async function saveCaption(id: string, caption: string) {
    await fetch(`/api/admin/kb/${entryId}/media`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mediaId: id, caption }),
    }).catch(() => {});
  }

  async function openVideos() {
    setTab("videos");
    if (editions.length) return;
    const r = await fetch("/api/admin/editions").then((x) => x.json()).catch(() => null);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (r?.editions ?? r ?? []) as any[];
    setEditions(rows.map((e) => ({ id: e.id, title: e.title || e.label || e.name || e.id })).filter((e) => e.id));
  }

  async function loadVideos(id: string) {
    setEditionId(id);
    setVideos([]);
    if (!id) return;
    setBusy(true);
    const r = await fetch(`/api/admin/videos?editionId=${id}`).then((x) => x.json()).catch(() => null);
    setBusy(false);
    setVideos(((r?.videos ?? []) as Video[]).filter((v) => v.status === "ready" && v.url));
  }

  const photos = media.filter((m) => m.kind === "photo");
  const clips = media.filter((m) => m.kind === "video");
  const tabCls = (on: boolean) =>
    `px-3 py-1 rounded-full text-[11.5px] font-bold transition-colors ${on ? "text-white" : "admin-muted"}`;

  return (
    <div className="mt-4 pt-4" style={{ borderTop: "1px dashed var(--admin-border)" }}>
      <div className="flex items-center gap-2 mb-3">
        <button type="button" onClick={() => setTab("photos")} className={tabCls(tab === "photos")}
          style={tab === "photos" ? { backgroundColor: "#0aa3c7" } : { border: "1px solid var(--admin-border)" }}>
          Photos {photos.length ? `· ${photos.length}` : ""}
        </button>
        <button type="button" onClick={openVideos} className={tabCls(tab === "videos")}
          style={tab === "videos" ? { backgroundColor: "#0aa3c7" } : { border: "1px solid var(--admin-border)" }}>
          Videos {clips.length ? `· ${clips.length}` : ""}
        </button>
        {tab === "photos" && (
          <button type="button" onClick={() => setPicking(true)} disabled={busy}
            className="ml-auto text-[12px] font-semibold" style={{ color: "#0aa3c7" }}>
            + Pick from memories
          </button>
        )}
      </div>

      {err && <p className="text-[11.5px] mb-2" style={{ color: "#c0392b" }}>{err}</p>}

      {tab === "photos" && (
        photos.length === 0
          ? <p className="text-[11.5px] admin-faint">Nothing yet. Pick a shot from a week that shows this.</p>
          : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {photos.map((m) => (
                <div key={m.id} className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.url} alt="" className="w-full aspect-[4/3] object-cover" />
                  <div className="p-1.5">
                    <input defaultValue={m.caption ?? ""} placeholder="caption"
                      onBlur={(e) => saveCaption(m.id, e.target.value)}
                      className="w-full admin-input text-[11px] px-1.5 py-1 rounded border outline-none"
                      style={{ borderColor: "var(--admin-border)" }} />
                    <button type="button" onClick={() => detach(m.id)}
                      className="text-[10.5px] mt-1" style={{ color: "#c0392b" }}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )
      )}

      {tab === "videos" && (
        <div className="space-y-3">
          {clips.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {clips.map((m) => (
                <div key={m.id} className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {m.poster_url
                    ? <img src={m.poster_url} alt="" className="w-full aspect-video object-cover" />
                    : <div className="w-full aspect-video grid place-items-center text-[11px] admin-faint">video</div>}
                  <div className="p-1.5">
                    <input defaultValue={m.caption ?? ""} placeholder="caption"
                      onBlur={(e) => saveCaption(m.id, e.target.value)}
                      className="w-full admin-input text-[11px] px-1.5 py-1 rounded border outline-none"
                      style={{ borderColor: "var(--admin-border)" }} />
                    <button type="button" onClick={() => detach(m.id)}
                      className="text-[10.5px] mt-1" style={{ color: "#c0392b" }}>Remove</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div>
            <label className="block text-[11px] font-semibold admin-muted mb-1">Pick from a week&apos;s trip videos</label>
            <select value={editionId} onChange={(e) => loadVideos(e.target.value)}
              className="w-full admin-input border rounded-lg px-3 py-2 text-sm outline-none"
              style={{ borderColor: "var(--admin-border)" }}>
              <option value="">choose a week…</option>
              {editions.map((e) => <option key={e.id} value={e.id}>{e.title}</option>)}
            </select>
          </div>
          {busy && <p className="text-[11.5px] admin-faint">Loading…</p>}
          {!busy && editionId && videos.length === 0 && (
            <p className="text-[11.5px] admin-faint">No finished clips on that week yet.</p>
          )}
          {videos.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {videos.map((v) => (
                <button key={v.stem} type="button"
                  onClick={() => attach([{ kind: "video", ref: v.stem, url: v.url!, poster_url: v.poster }], "memories")}
                  className="rounded-lg overflow-hidden text-left hover:opacity-80 transition-opacity"
                  style={{ border: "1px solid var(--admin-border)" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {v.poster
                    ? <img src={v.poster} alt="" className="w-full aspect-video object-cover" />
                    : <div className="w-full aspect-video grid place-items-center text-[11px] admin-faint">clip</div>}
                  <p className="text-[10.5px] admin-faint truncate px-1.5 py-1">{v.stem.split("/").pop()}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {picking && (
        <ImagePickerModal
          defaultFolder="memories"
          onClose={() => setPicking(false)}
          onSelectItem={(item) => {
            // The storage path is the handle; the URL is only how it renders.
            attach([{ kind: "photo", ref: item.path || item.url, url: item.url }],
              (item.path || "").startsWith("memories/") ? "memories" : "library");
            setPicking(false);
          }}
          onSelect={() => {}}
        />
      )}
    </div>
  );
}
