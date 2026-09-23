"use client";

import type { PhotoFit, PhotoMask } from "@/components/admin/board-photo-outline";

/**
 * The picture the fittings finder shows the AI: the board as it lies under the
 * 2D plan, straightened, tail on the LEFT, cut to the board with a margin, and
 * a centimetre grid drawn on it with labels (cm from the tail along the top
 * and bottom, cm off the centreline on the left). The model reads positions
 * off those labels; a model asked for pixel coordinates guesses.
 */
export async function fittingsImage(src: string, m: PhotoMask, fit: PhotoFit): Promise<{ dataUrl: string; lengthCm: number; halfWidthCm: number }> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.crossOrigin = "anonymous";
    i.onload = () => resolve(i);
    i.onerror = () => reject(new Error("The picture did not load."));
    // Blob URLs (the straightened copy) need no CORS; CDN URLs need their own copy.
    i.src = src.startsWith("blob:") ? src : src + (src.includes("?") ? "&" : "?") + "cors=1";
  });

  // Picture px per drawn px: the mask is in the picture's own px, which for a
  // straightened copy are the copy's px and otherwise the original's.
  const sx = img.naturalWidth / m.w, sy = img.naturalHeight / m.h;
  const k = fit.cmPerPx, kA = fit.cmPerPxAcross;          // cm per picture px, along and across
  const lenPx = m.vertical ? m.y1 - m.y0 : m.x1 - m.x0;
  const widePx = m.vertical ? m.x1 - m.x0 : m.y1 - m.y0;
  const lengthCm = lenPx * k, halfWidthCm = (widePx * kA) / 2;

  const SCALE = Math.min(8, 1500 / lengthCm);              // output px per cm
  const LEFT = 64, TOP = 30, BOTTOM = 30, RIGHT = 24;
  const boardW = Math.round(lengthCm * SCALE), boardH = Math.round(halfWidthCm * 2 * SCALE);
  const W = boardW + LEFT + RIGHT, H = boardH + TOP + BOTTOM;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("No canvas.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);

  // Place the picture: long side → x (tail at the left), across → y, the
  // board's middle on the image's middle line.
  ctx.save();
  ctx.translate(LEFT, TOP + boardH / 2);
  const s = SCALE * k, sA = SCALE * kA;                    // output px per picture px, along and across
  // Always a turn, never a mirror (a mirrored board would swap its sides), and
  // the same turn the 2D plan uses, so "above the centreline" means the same.
  if (m.vertical) {
    // picture y runs along the board: tail at the top (tailFirst) or bottom
    if (fit.tailFirst) ctx.transform(0, -sA, s, 0, -m.y0 * s, m.centre * sA);
    else ctx.transform(0, sA, -s, 0, m.y1 * s, -m.centre * sA);
  } else if (fit.tailFirst) {
    ctx.transform(s, 0, 0, sA, -m.x0 * s, -m.centre * sA);
  } else {
    ctx.transform(-s, 0, 0, -sA, m.x1 * s, m.centre * sA);
  }
  ctx.drawImage(img, 0, 0, img.naturalWidth / sx, img.naturalHeight / sy);
  ctx.restore();

  // The grid: every 10 cm along, every 5 cm across, labelled.
  ctx.font = "bold 13px Arial, sans-serif";
  ctx.textBaseline = "middle";
  for (let cm = 0; cm <= lengthCm + 0.01; cm += 10) {
    const x = LEFT + cm * SCALE;
    ctx.strokeStyle = cm % 50 === 0 ? "rgba(220,20,60,0.75)" : "rgba(220,20,60,0.4)";
    ctx.lineWidth = cm % 50 === 0 ? 1.6 : 1;
    ctx.beginPath(); ctx.moveTo(x, TOP - 4); ctx.lineTo(x, TOP + boardH + 4); ctx.stroke();
    ctx.fillStyle = "#b0102e";
    ctx.textAlign = "center";
    ctx.fillText(String(cm), x, TOP / 2);
    ctx.fillText(String(cm), x, TOP + boardH + BOTTOM / 2);
  }
  for (let cm = -Math.floor(halfWidthCm / 5) * 5; cm <= halfWidthCm + 0.01; cm += 5) {
    const y = TOP + boardH / 2 - cm * SCALE;
    ctx.strokeStyle = cm === 0 ? "rgba(20,60,220,0.8)" : "rgba(20,60,220,0.35)";
    ctx.lineWidth = cm === 0 ? 1.6 : 1;
    ctx.beginPath(); ctx.moveTo(LEFT - 4, y); ctx.lineTo(LEFT + boardW + 4, y); ctx.stroke();
    ctx.fillStyle = "#1030a0";
    ctx.textAlign = "right";
    ctx.fillText(cm > 0 ? `+${cm}` : String(cm), LEFT - 8, y);
  }
  ctx.textAlign = "left";
  ctx.fillStyle = "#333";
  ctx.font = "12px Arial, sans-serif";
  ctx.fillText("tail", 6, TOP + boardH + BOTTOM / 2);

  return { dataUrl: c.toDataURL("image/jpeg", 0.88), lengthCm, halfWidthCm };
}

export type FoundFitting = {
  kind: "mast_track" | "footstrap" | "fin_box" | "foil_box" | "vent" | "handle" | "other";
  label: string;
  from_cm: number; to_cm: number;             // cm from the tail
  offset_from_cm: number; offset_to_cm: number;
  confidence: "high" | "medium" | "low";
  note: string;
};
