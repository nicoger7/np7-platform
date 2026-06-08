"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Dark "techy" hero for NP7 Hardware — a WebGL synthwave perspective grid in
 * retro neon (pink + acid lime) on near-black, with a glowing horizon and a
 * subtle cursor parallax. The deliberate opposite of the Experience water hero.
 *
 * Falls back to a CSS neon-grid when WebGL/reduced-motion is unavailable.
 */

const FRAG = `
precision highp float;
uniform vec2  uRes;
uniform float uTime;
uniform vec2  uMouse;

vec3 PINK = vec3(1.00, 0.16, 0.56); // #ff2990
vec3 LIME = vec3(0.76, 1.00, 0.22); // #c2ff38
vec3 BG   = vec3(0.027, 0.031, 0.043);

float gridLine(vec2 uv){
  vec2 f = abs(fract(uv) - 0.5);
  float d = min(f.x, f.y);
  return smoothstep(0.055, 0.0, d);
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes.xy;
  vec2 p  = uv * 2.0 - 1.0;
  p.x *= uRes.x / uRes.y;

  float par = (uMouse.x - 0.5) * 0.4; // cursor parallax

  vec3 col = mix(BG, vec3(0.05, 0.02, 0.07), uv.y);

  if (p.y < -0.02) {
    // perspective floor
    float z = 1.0 / (-p.y + 0.04);
    float x = (p.x + par) * z;
    float scroll = uTime * 1.1;
    vec2 g = vec2(x, z + scroll);
    float line = gridLine(g);
    float fade = exp(-z * 0.05);
    vec3 gc = mix(LIME, PINK, smoothstep(0.5, 7.0, z));
    col += gc * line * fade * 1.5;
  } else {
    // sky glow + retro sun
    float sun = length(vec2(p.x, (p.y - 0.34) * 1.15));
    float disc = smoothstep(0.34, 0.31, sun);
    vec3 sunCol = mix(vec3(1.0, 0.85, 0.3), PINK, smoothstep(0.0, 0.34, sun));
    // scanline cut on the sun
    float band = step(0.5, fract((p.y - 0.34) * 26.0));
    col += sunCol * disc * mix(0.35, 1.0, band);
    col += PINK * exp(-abs(p.y - 0.05) * 5.0) * 0.18;
  }

  // bright horizon line
  col += PINK * exp(-abs(p.y + 0.02) * 22.0) * 0.7;
  col += LIME * exp(-abs(p.y + 0.02) * 60.0) * 0.25;

  // vignette
  col *= smoothstep(1.6, 0.35, length(p * vec2(0.8, 1.0)));

  gl_FragColor = vec4(col, 1.0);
}`;

const VERT = `attribute vec2 aPos; void main(){ gl_Position = vec4(aPos,0.0,1.0); }`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn("tech-hero shader error", gl.getShaderInfoLog(sh));
    return null;
  }
  return sh;
}

export function TechHero({ children }: { children?: React.ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [webgl, setWebgl] = useState(true);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canvas = canvasRef.current;
    if (reduce || !canvas) { setWebgl(false); return; }
    const gl =
      (canvas.getContext("webgl", { antialias: true, alpha: false }) as WebGLRenderingContext) ||
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext);
    if (!gl) { setWebgl(false); return; }

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) { setWebgl(false); return; }
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const aPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "uRes");
    const uTime = gl.getUniformLocation(prog, "uTime");
    const uMouse = gl.getUniformLocation(prog, "uMouse");
    const mouse = { x: 0.5, y: 0.5 };

    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const resize = () => {
      canvas.width = Math.floor(canvas.clientWidth * dpr);
      canvas.height = Math.floor(canvas.clientHeight * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = (e.clientX - r.left) / r.width;
      mouse.y = (e.clientY - r.top) / r.height;
    };
    window.addEventListener("pointermove", onMove);

    let raf = 0;
    let running = true;
    const start = performance.now();
    const loop = () => {
      if (!running) return;
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, (performance.now() - start) / 1000);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(loop);
    };
    loop();

    const io = new IntersectionObserver(
      ([entry]) => {
        running = entry.isIntersecting;
        if (running && !raf) loop();
        if (!running) { cancelAnimationFrame(raf); raf = 0; }
      },
      { threshold: 0.01 }
    );
    io.observe(canvas);

    const onLost = (e: Event) => { e.preventDefault(); setWebgl(false); };
    canvas.addEventListener("webglcontextlost", onLost);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("webglcontextlost", onLost);
      io.disconnect();
    };
  }, []);

  return (
    <section className="relative w-full h-[100svh] min-h-[640px] overflow-hidden bg-[#070809]">
      {webgl ? (
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-hidden />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 50% 60%, rgba(255,41,144,0.25), transparent 60%), linear-gradient(180deg,#0a0410,#070809)",
          }}
        />
      )}
      {/* scanline + grain overlay for CRT/techy feel */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.08] mix-blend-overlay"
        style={{ backgroundImage: "repeating-linear-gradient(0deg, #fff 0, #fff 1px, transparent 1px, transparent 3px)" }}
        aria-hidden
      />
      {children}
    </section>
  );
}
