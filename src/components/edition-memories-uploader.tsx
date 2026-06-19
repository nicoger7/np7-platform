"use client";

import { useState, useEffect, useCallback, useRef } from "react";

/**
 * Photographer/admin uploader for a week's participant photos. Files go to
 * Supabase Storage at assets/memories/{editionId}/ — exactly where
 * getMemoryPhotos() reads — so they appear in every participant's member-area
 * "Your memories" gallery for this edition. Also edits the highlight video URL.
 */
export function EditionMemoriesUploader({ editionId, initialVideoUrl }: { editionId: string; initialVideoUrl: string | null }) {
  const folder = `memories/${editionId}`;
  const [photos, setPhotos] = useState<{ name: string; path: string; url: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [videoUrl, setVideoUrl] = useState(initialVideoUrl ?? "");
  const [videoSaved, setVideoSaved] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/images?folder=${encodeURIComponent(folder)}`);
    const data = await res.json();
    const files = (Array.isArray(data) ? data : data.files ?? [])
      .filter((f: { url: string | null; name: string }) => f.url && f.name !== ".emptyFolderPlaceholder");
    setPhotos(files);
    setLoading(false);
  }, [folder]);

  useEffect(() => { load(); }, [load]);

  async function upload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setProgress({ done: 0, total: files.length });
    for (let i = 0; i < files.length; i++) {
      const fd = new FormData();
      fd.append("file", files[i]);
      fd.append("folder", folder);
      await fetch("/api/admin/images", { method: "POST", body: fd });
      setProgress({ done: i + 1, total: files.length });
    }
    setUploading(false);
    setProgress(null);
    if (fileInput.current) fileInput.current.value = "";
    load();
  }

  async function remove(path: string) {
    if (!confirm("Remove this photo from the participants' gallery?")) return;
    await fetch("/api/admin/images", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paths: [path] }) });
    load();
  }

  async function saveVideo() {
    await fetch(`/api/admin/editions/${editionId}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memories_video_url: videoUrl.trim() || null }),
    });
    setVideoSaved(true);
    setTimeout(() => setVideoSaved(false), 2000);
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl p-4" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
        <h3 className="text-sm font-bold admin-heading">Participant photos</h3>
        <p className="text-xs admin-faint mt-0.5 mb-3">
          Uploaded here, they appear in <span className="admin-muted">every participant&apos;s member-area gallery</span> for this week.
          These are private trip photos — separate from the public marketing gallery in Event Content.
        </p>

        <div className="flex items-center gap-3 mb-4">
          <input ref={fileInput} type="file" accept="image/*" multiple onChange={(e) => upload(e.target.files)} className="hidden" id="memories-file" />
          <label htmlFor="memories-file" className={`px-4 py-2 rounded-lg text-xs font-bold cursor-pointer transition-colors ${uploading ? "opacity-50 pointer-events-none" : ""} bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 text-white`}>
            {uploading ? `Uploading ${progress?.done}/${progress?.total}…` : "Upload photos"}
          </label>
          <span className="text-xs admin-faint">{photos.length} photo{photos.length !== 1 ? "s" : ""} in this week&apos;s gallery</span>
        </div>

        {loading ? (
          <p className="text-xs admin-faint">Loading…</p>
        ) : photos.length === 0 ? (
          <p className="text-xs admin-faint">No photos yet. Upload the week&apos;s shots above.</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {photos.map((p) => (
              <div key={p.path} className="relative group aspect-square rounded-lg overflow-hidden" style={{ border: "1px solid var(--admin-border)" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={p.url} alt="" className="w-full h-full object-cover" />
                <button onClick={() => remove(p.path)} className="absolute top-1 right-1 w-6 h-6 rounded bg-black/60 text-white text-sm grid place-items-center opacity-0 group-hover:opacity-100 transition-opacity" title="Remove">×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl p-4" style={{ border: "1px solid var(--admin-border)", backgroundColor: "var(--admin-surface)" }}>
        <h3 className="text-sm font-bold admin-heading">Highlight video</h3>
        <p className="text-xs admin-faint mt-0.5 mb-3">Optional — a YouTube/Vimeo link shown in the participants&apos; memories card.</p>
        <div className="flex items-center gap-2">
          <input value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} placeholder="https://youtu.be/…" className="admin-input flex-1 px-3 py-2 rounded-lg border text-sm outline-none focus:border-[#0aa3c7]" />
          <button onClick={saveVideo} className="px-3 py-2 bg-[#0aa3c7] hover:bg-[#0aa3c7]/90 text-white text-xs font-bold rounded-lg transition-colors">Save</button>
          {videoSaved && <span className="text-xs text-green-400">Saved ✓</span>}
        </div>
      </div>
    </div>
  );
}
