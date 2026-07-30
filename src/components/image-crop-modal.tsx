"use client";

import { useState, useRef, useCallback } from "react";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
import "react-image-crop/dist/ReactCrop.css";

interface ImageCropModalProps {
  src: string;
  fileName: string;
  filePath: string;
  onClose: () => void;
  /** the saved file's public URL — callers that hold a URL (not a file row) re-point their field at it */
  onSaved: (url?: string) => void;
  /** ratio buttons; defaults to the generic set used by File Storage */
  presets?: { label: string; aspect: number | undefined }[];
  title?: string;
  /** hide "Replace original" where overwriting would break other pages using the same photo */
  allowReplace?: boolean;
}

function getCroppedBlob(
  image: HTMLImageElement,
  crop: PixelCrop
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  const scaleX = image.naturalWidth / image.width;
  const scaleY = image.naturalHeight / image.height;
  canvas.width = Math.floor(crop.width * scaleX);
  canvas.height = Math.floor(crop.height * scaleY);
  const ctx = canvas.getContext("2d")!;

  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    canvas.width,
    canvas.height
  );

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob!), "image/png", 1);
  });
}

const PRESETS = [
  { label: "Free", aspect: undefined },
  { label: "1:1", aspect: 1 },
  { label: "16:9", aspect: 16 / 9 },
  { label: "4:3", aspect: 4 / 3 },
  { label: "3:2", aspect: 3 / 2 },
  { label: "9:16", aspect: 9 / 16 },
];

export default function ImageCropModal({
  src,
  fileName,
  filePath,
  onClose,
  onSaved,
  presets = PRESETS,
  title = "Crop Image",
  allowReplace = true,
}: ImageCropModalProps) {
  const [crop, setCrop] = useState<Crop>();
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>();
  const [aspect, setAspect] = useState<number | undefined>(undefined);
  const [saving, setSaving] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  const onImageLoad = useCallback(() => {
    // no-op, user draws their own crop
  }, []);

  async function handleSave() {
    if (!completedCrop || !imgRef.current) return;
    setSaving(true);

    const blob = await getCroppedBlob(imgRef.current, completedCrop);
    const folder = filePath.includes("/")
      ? filePath.substring(0, filePath.lastIndexOf("/"))
      : "";

    const formData = new FormData();
    formData.append("file", new File([blob], fileName, { type: "image/png" }));
    formData.append("folder", folder);

    const res = await fetch("/api/admin/images", { method: "POST", body: formData });
    const saved = res.ok ? await res.json().catch(() => null) : null;

    setSaving(false);
    onSaved(saved?.url ?? undefined);
  }

  async function handleSaveAsNew() {
    if (!completedCrop || !imgRef.current) return;
    setSaving(true);

    const blob = await getCroppedBlob(imgRef.current, completedCrop);
    const ext = fileName.lastIndexOf(".");
    const baseName = ext > 0 ? fileName.substring(0, ext) : fileName;
    const newName = `${baseName}-cropped.png`;
    const folder = filePath.includes("/")
      ? filePath.substring(0, filePath.lastIndexOf("/"))
      : "";

    const formData = new FormData();
    formData.append("file", new File([blob], newName, { type: "image/png" }));
    formData.append("folder", folder);

    const res = await fetch("/api/admin/images", { method: "POST", body: formData });
    const saved = res.ok ? await res.json().catch(() => null) : null;

    setSaving(false);
    onSaved(saved?.url ?? undefined);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="rounded-2xl w-full max-w-[900px] max-h-[90vh] flex flex-col mx-4" style={{ backgroundColor: "var(--admin-sidebar)", border: "1px solid var(--admin-border)" }}>
        {/* Header */}
        <div className="flex items-center justify-between p-5" style={{ borderBottom: "1px solid var(--admin-border)" }}>
          <div>
            <h2 className="text-lg font-bold admin-heading">{title}</h2>
            <p className="text-xs admin-muted mt-0.5">{fileName}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
            style={{ backgroundColor: "transparent" }}
            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = "var(--admin-surface-hover)"}
            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = "transparent"}
          >
            <svg className="w-5 h-5 admin-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Aspect ratio presets */}
        <div className="flex items-center gap-2 px-5 py-3" style={{ borderBottom: "1px solid var(--admin-border)" }}>
          <span className="text-xs admin-faint mr-1">Ratio:</span>
          {presets.map((preset) => (
            <button
              key={preset.label}
              onClick={() => {
                setAspect(preset.aspect);
                setCrop(undefined);
                setCompletedCrop(undefined);
              }}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                aspect === preset.aspect
                  ? "bg-[var(--admin-accent)] text-[var(--admin-accent-contrast)]"
                  : "admin-surface admin-muted"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Crop area */}
        <div className="flex-1 overflow-auto p-5 flex items-center justify-center min-h-0">
          <ReactCrop
            crop={crop}
            onChange={(c) => setCrop(c)}
            onComplete={(c) => setCompletedCrop(c)}
            aspect={aspect}
            className="max-h-[60vh]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              ref={imgRef}
              src={src}
              alt={fileName}
              onLoad={onImageLoad}
              className="max-h-[60vh] w-auto"
              crossOrigin="anonymous"
            />
          </ReactCrop>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-5" style={{ borderTop: "1px solid var(--admin-border)" }}>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm admin-muted transition-colors"
          >
            Cancel
          </button>
          {/* Replace stays the primary action in File Storage (the habit there);
              where overwriting would hit other pages using the same photo the
              caller drops it, and the copy becomes primary. */}
          <div className="flex gap-3">
            <button
              onClick={handleSaveAsNew}
              disabled={!completedCrop || saving}
              className={allowReplace
                ? "px-4 py-2 admin-surface disabled:opacity-30 admin-heading text-sm font-medium rounded-lg transition-colors"
                : "px-4 py-2 bg-[var(--admin-accent)] hover:opacity-90 disabled:opacity-30 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors"}
              style={allowReplace ? { border: "1px solid var(--admin-border)" } : undefined}
            >
              {saving && !allowReplace ? "Saving..." : "Save as copy"}
            </button>
            {allowReplace && (
              <button
                onClick={handleSave}
                disabled={!completedCrop || saving}
                className="px-4 py-2 bg-[var(--admin-accent)] hover:opacity-90 disabled:opacity-30 text-[var(--admin-accent-contrast)] text-sm font-bold rounded-lg transition-colors"
              >
                {saving ? "Saving..." : "Replace original"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
