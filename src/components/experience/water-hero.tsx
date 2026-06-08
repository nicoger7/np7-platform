"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Full-bleed WebGL "sun to sea" water hero.
 *
 * A fragment shader renders a living water surface in the NP7 brand palette
 * (sun yellow at the top, melting through coral into ocean blue and deep sea)
 * with animated caustics and a cursor-driven ripple — the page's signature
 * "wow" moment.
 *
 * Falls back to a pure-CSS gradient when WebGL is unavailable or the user
 * prefers reduced motion, so the hero always looks intentional.
 */

const FRAG = `
precision highp float;
uniform vec2  uRes;
uniform float uTime;
uniform vec2  uMouse;     // normalised cursor (0..1)
uniform float uRipple;    // ripple energy (decays after movement)

vec3 cSun   = vec3(1.000, 0.770, 0.180); // #ffc42e
vec3 cCoral = vec3(0.957, 0.482, 0.125); // #f47b20
vec3 cOcean = vec3(0.000, 0.686, 0.859); // #00afdb
vec3 cDeep  = vec3(0.000, 0.216, 0.290); // #00374a
vec3 cFoam  = vec3(0.560, 0.902, 0.949); // #8fe6f2

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p), f = fract(p);
  float a = hash(i), b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0)), d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++){ v += a * noise(p); p *= 2.02; a *= 0.5; }
  return v;
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes.xy;
  vec2 p  = uv;
  p.x *= uRes.x / uRes.y;

  float t = uTime * 0.04;

  // flowing, domain-warped water field
  vec2 q = vec2(fbm(p * 3.0 + t), fbm(p * 3.0 - t + 5.2));
  float caustic = fbm(p * 4.5 + q * 1.6 + vec2(t * 2.0, -t));

  // cursor ripple
  vec2 m = uMouse; m.x *= uRes.x / uRes.y;
  float d = distance(p, m);
  float ripple = sin(d * 38.0 - uTime * 4.5) * exp(-d * 5.5) * uRipple;
  caustic += ripple * 0.6;

  // vertical sun -> sea gradient (top is sun)
  float g = uv.y;
  vec3 col = mix(cDeep, cOcean, smoothstep(0.0, 0.5, g));
  col = mix(col, cCoral, smoothstep(0.52, 0.82, g) * 0.65);
  col = mix(col, cSun, smoothstep(0.8, 1.0, g));

  // caustic shimmer + foam highlights
  col += caustic * 0.16 * cFoam;
  col = mix(col, mix(col, cFoam, 0.35), smoothstep(0.55, 0.95, caustic));

  // subtle vignette for text legibility
  float vig = smoothstep(1.15, 0.35, distance(uv, vec2(0.5, 0.45)));
  col *= 0.82 + 0.18 * vig;

  gl_FragColor = vec4(col, 1.0);
}`;

const VERT = `
attribute vec2 aPos;
void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

function compile(gl: WebGLRenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.warn("shader error", gl.getShaderInfoLog(sh));
    return null;
  }
  return sh;
}

export function WaterHero({ children }: { children?: React.ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [webgl, setWebgl] = useState(true);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const canvas = canvasRef.current;
    if (reduce || !canvas) {
      setWebgl(false);
      return;
    }
    const gl =
      (canvas.getContext("webgl", { antialias: true, alpha: false }) as WebGLRenderingContext) ||
      (canvas.getContext("experimental-webgl") as WebGLRenderingContext);
    if (!gl) {
      setWebgl(false);
      return;
    }

    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) {
      setWebgl(false);
      return;
    }
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
    const uRipple = gl.getUniformLocation(prog, "uRipple");

    const mouse = { x: 0.5, y: 0.6 };
    let ripple = 0;

    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    const resize = () => {
      const w = canvas.clientWidth, h = canvas.clientHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    window.addEventListener("resize", resize);

    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = (e.clientX - r.left) / r.width;
      mouse.y = 1 - (e.clientY - r.top) / r.height;
      ripple = Math.min(ripple + 0.25, 1);
    };
    window.addEventListener("pointermove", onMove);

    let raf = 0;
    let running = true;
    const start = performance.now();
    const loop = () => {
      if (!running) return;
      const time = (performance.now() - start) / 1000;
      ripple *= 0.96; // decay
      gl.uniform2f(uRes, canvas.width, canvas.height);
      gl.uniform1f(uTime, time);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.uniform1f(uRipple, ripple);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      raf = requestAnimationFrame(loop);
    };
    loop();

    // pause when scrolled away
    const io = new IntersectionObserver(
      ([entry]) => {
        running = entry.isIntersecting;
        if (running && !raf) loop();
        if (!running) cancelAnimationFrame(raf), (raf = 0);
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
    <section className="relative w-full h-[100svh] min-h-[640px] overflow-hidden">
      {webgl ? (
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" aria-hidden />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background:
              "linear-gradient(180deg,#ffc42e 0%,#f47b20 32%,#00afdb 68%,#00374a 100%)",
          }}
        />
      )}
      {children}
    </section>
  );
}
