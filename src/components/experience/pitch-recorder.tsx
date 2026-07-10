"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A short personal pitch — recorded IN-BROWSER (video or voice via MediaRecorder)
 * or uploaded as a file. Hands the chosen Blob + kind up to the form; the form
 * presigns an R2 PUT and uploads it. Everything degrades gracefully: no camera/
 * mic permission or unsupported browser → the upload-a-file path always works.
 */
const MAX_SEC = 120;

type Kind = "video" | "audio";
type Mode = "choose" | "recording" | "ready";

export function PitchRecorder({ onChange, accent = "#f47b20" }: {
  onChange: (media: { blob: Blob; kind: Kind } | null) => void;
  accent?: string;
}) {
  const [mode, setMode] = useState<Mode>("choose");
  const [kind, setKind] = useState<Kind>("video");
  const [secs, setSecs] = useState(0);
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState("");

  const streamRef = useRef<MediaStream | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const liveRef = useRef<HTMLVideoElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const supported = typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof window.MediaRecorder !== "undefined";

  function stopStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }
  function reset() {
    stopStream();
    if (url) URL.revokeObjectURL(url);
    setUrl(null); setSecs(0); setErr(""); setMode("choose"); onChange(null);
  }
  useEffect(() => () => { stopStream(); if (url) URL.revokeObjectURL(url); }, [url]);

  async function start(k: Kind) {
    setErr(""); setKind(k);
    try {
      const stream = await navigator.mediaDevices.getUserMedia(k === "video" ? { video: { facingMode: "user" }, audio: true } : { audio: true });
      streamRef.current = stream;
      if (k === "video" && liveRef.current) { liveRef.current.srcObject = stream; liveRef.current.play().catch(() => {}); }
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || (k === "video" ? "video/webm" : "audio/webm") });
        stopStream();
        const u = URL.createObjectURL(blob);
        setUrl(u); setMode("ready"); onChange({ blob, kind: k });
      };
      recRef.current = rec;
      rec.start();
      setMode("recording"); setSecs(0);
      timerRef.current = setInterval(() => setSecs((s) => { if (s + 1 >= MAX_SEC) stop(); return s + 1; }), 1000);
    } catch {
      setErr("Couldn't access your camera/mic. You can upload a file instead.");
      setMode("choose");
    }
  }
  function stop() { try { recRef.current?.stop(); } catch { /* ignore */ } }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    const k: Kind = f.type.startsWith("audio") ? "audio" : "video";
    if (url) URL.revokeObjectURL(url);
    const u = URL.createObjectURL(f);
    setKind(k); setUrl(u); setMode("ready"); onChange({ blob: f, kind: k }); setErr("");
  }

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const pill = "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-[13.5px] font-bold transition-colors";

  return (
    <div className="rounded-2xl border-2 border-dashed border-[#ecdcbb] bg-[#fffdf8] p-4 sm:p-5">
      {mode === "choose" && (
        <div>
          <div className="flex flex-wrap gap-2">
            {supported && (
              <>
                <button type="button" onClick={() => start("video")} className={`${pill} text-white`} style={{ background: accent }}>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="14" height="12" rx="2" /><path d="m16 10 6-3v10l-6-3" /></svg>
                  Record video
                </button>
                <button type="button" onClick={() => start("audio")} className={`${pill} border-2`} style={{ borderColor: accent, color: accent }}>
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
                  Record voice
                </button>
              </>
            )}
            <label className={`${pill} border-2 border-[#e2e9ec] text-[#3a4a50] cursor-pointer hover:border-[#c9d4d8]`}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 9l5-5 5 5M12 4v12" /></svg>
              Upload a file
              <input type="file" accept="video/*,audio/*" className="hidden" onChange={onFile} />
            </label>
          </div>
          <p className="text-[12px] text-[#9aa6ac] mt-2.5">Up to 2 minutes. Tell me who you are and why this trip — no need to be polished. {supported ? "" : "(Recording isn’t supported on this browser — upload a file.)"}</p>
          {err && <p className="text-[12.5px] text-[#c0392b] font-semibold mt-2">{err}</p>}
        </div>
      )}

      {mode === "recording" && (
        <div>
          {kind === "video" ? (
            <video ref={liveRef} muted playsInline className="w-full max-h-[280px] rounded-xl bg-black object-cover" />
          ) : (
            <div className="rounded-xl bg-[#0a2a33] text-white py-10 grid place-items-center">
              <span className="text-3xl animate-pulse">🎙️</span>
            </div>
          )}
          <div className="flex items-center justify-between gap-3 mt-3">
            <span className="inline-flex items-center gap-2 text-[13px] font-bold text-[#c0392b]"><span className="w-2.5 h-2.5 rounded-full bg-[#c0392b] animate-pulse" />Recording · {mmss(secs)} <span className="text-[#9aa6ac] font-medium">/ {mmss(MAX_SEC)}</span></span>
            <button type="button" onClick={stop} className={`${pill} bg-[#00374a] text-white`}>Stop</button>
          </div>
        </div>
      )}

      {mode === "ready" && url && (
        <div>
          {kind === "video"
            ? <video src={url} controls playsInline className="w-full max-h-[280px] rounded-xl bg-black" />
            : <audio src={url} controls className="w-full" />}
          <div className="flex items-center justify-between gap-3 mt-3">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-[#0f6e56]"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>Ready to send with your application</span>
            <button type="button" onClick={reset} className="text-[13px] font-bold text-[#8a97a0] hover:text-[#c0392b]">Redo</button>
          </div>
        </div>
      )}
    </div>
  );
}
