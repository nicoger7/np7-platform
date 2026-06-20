"use client";

import { useRef, useEffect } from "react";

/** Draw-your-signature canvas. Calls onChange(dataUrl|null) when a stroke ends. */
export function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const inked = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, rect.width) * ratio;
    canvas.height = Math.max(1, rect.height) * ratio;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#00374a";
  }, []);

  function point(e: React.PointerEvent) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }
  function start(e: React.PointerEvent) {
    e.preventDefault();
    const ctx = canvasRef.current!.getContext("2d")!;
    drawing.current = true;
    const { x, y } = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    canvasRef.current!.setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const ctx = canvasRef.current!.getContext("2d")!;
    const { x, y } = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    inked.current = true;
  }
  function end() {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(inked.current ? canvasRef.current!.toDataURL("image/png") : null);
  }
  function clear() {
    const canvas = canvasRef.current!;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    inked.current = false;
    onChange(null);
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className="w-full h-40 rounded-xl border border-[#dde6e9] bg-white"
        style={{ touchAction: "none" }}
      />
      <div className="flex justify-between mt-1.5">
        <span className="text-[11px] text-[#9aa6ac]">Draw your signature above</span>
        <button type="button" onClick={clear} className="text-[12px] font-semibold text-[#7a8a90] hover:text-[#00374a]">Clear</button>
      </div>
    </div>
  );
}
