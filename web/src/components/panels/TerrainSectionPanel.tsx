"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Mountain, RefreshCw, AlertTriangle } from "lucide-react";
import { useStore } from "@/lib/store";
import { sampleSwath, type SwathSpec, type SwathResult } from "@/lib/dem";
import { buildSectionMesh, ELEVATION_STOPS, type SectionMesh } from "@/lib/section-mesh";

// Transect through the Chalakudy basin: Ghats side (east) → Arabian Sea side (west).
// Endpoints are configuration, not data; every elevation shown is sampled from the DEM.
export const SECTION_SPEC: SwathSpec = {
  a: { lon: 76.8, lat: 10.31 },
  b: { lon: 76.17, lat: 10.28 },
  halfWidthKm: 6,
  lines: 9,
  samples: 96,
};

// ─── tiny mat4 helpers (column-major) ────────────────────────────────────────
type M4 = Float32Array;
const perspective = (fovy: number, aspect: number, near: number, far: number): M4 => {
  const f = 1 / Math.tan(fovy / 2);
  const o = new Float32Array(16);
  o[0] = f / aspect;
  o[5] = f;
  o[10] = (far + near) / (near - far);
  o[11] = -1;
  o[14] = (2 * far * near) / (near - far);
  return o;
};
const lookAt = (e: number[], t: number[], up: number[]): M4 => {
  let zx = e[0] - t[0], zy = e[1] - t[1], zz = e[2] - t[2];
  let l = Math.hypot(zx, zy, zz);
  zx /= l; zy /= l; zz /= l;
  let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
  l = Math.hypot(xx, xy, xz);
  xx /= l; xy /= l; xz /= l;
  const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
  const o = new Float32Array(16);
  o[0] = xx; o[1] = yx; o[2] = zx;
  o[4] = xy; o[5] = yy; o[6] = zy;
  o[8] = xz; o[9] = yz; o[10] = zz;
  o[12] = -(xx * e[0] + xy * e[1] + xz * e[2]);
  o[13] = -(yx * e[0] + yy * e[1] + yz * e[2]);
  o[14] = -(zx * e[0] + zy * e[1] + zz * e[2]);
  o[15] = 1;
  return o;
};
const mul = (a: M4, b: M4): M4 => {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++)
    for (let r = 0; r < 4; r++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
      o[c * 4 + r] = s;
    }
  return o;
};

const VS = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol;
uniform mat4 uMVP; varying vec3 vNor; varying vec3 vCol;
void main(){ vNor=aNor; vCol=aCol; gl_Position=uMVP*vec4(aPos,1.0); }`;
const FS = `
precision mediump float;
varying vec3 vNor; varying vec3 vCol;
void main(){
  vec3 L = normalize(vec3(-0.5, 0.8, 0.45));
  float d = max(dot(normalize(vNor), L), 0.0);
  gl_FragColor = vec4(vCol * (0.42 + 0.68 * d), 1.0);
}`;


// 2D elevation-profile fallback (real DEM centreline samples) shown whenever WebGL is unusable.
function ProfileFallback({ mesh, message }: { mesh: SectionMesh; message: string }) {
  const pts = mesh.centerline;
  const W = 300, H = 110, pad = 4;
  const maxD = Math.max(...pts.map((p) => p.distKm), 1);
  const els = pts.map((p) => p.elevM);
  const lo = Math.min(...els), hi = Math.max(...els, lo + 1);
  const x = (d: number) => pad + (d / maxD) * (W - 2 * pad);
  const y = (e: number) => H - pad - ((e - lo) / (hi - lo)) * (H - 2 * pad);
  const line = pts.map((p) => `${x(p.distKm).toFixed(1)},${y(p.elevM).toFixed(1)}`).join(" ");
  return (
    <div className="absolute inset-0 flex flex-col bg-white" role="alert">
      <div style={{ fontSize: "0.5625rem", color: "#92400e", padding: "2px 4px" }}>
        <AlertTriangle style={{ width: 10, height: 10, display: "inline", marginRight: 3 }} />
        {message} — showing 2D profile
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="flex-1 w-full" preserveAspectRatio="none" aria-label="2D elevation profile">
        <polygon points={`${pad},${H - pad} ${line} ${W - pad},${H - pad}`} fill="#cfe3d6" stroke="none" />
        <polyline points={line} fill="none" stroke="#155E59" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div style={{ fontSize: "0.5rem", color: "#687770", padding: "0 4px 2px" }}>
        {Math.round(lo)}–{Math.round(hi)} m · {maxD.toFixed(0)} km (DEM-sampled centreline)
      </div>
    </div>
  );
}

interface View {
  yaw: number;
  pitch: number;
  dist: number;
}

function SectionCanvas({
  mesh,
  swath,
  resetToken,
}: {
  mesh: SectionMesh;
  swath: SwathResult;
  resetToken: number;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const glState = useRef<{
    gl: WebGLRenderingContext;
    prog: WebGLProgram;
    bufs: WebGLBuffer[];
    count: number;
    mvpLoc: WebGLUniformLocation | null;
  } | null>(null);
  const meshRef = useRef<SectionMesh>(mesh);
  meshRef.current = mesh;
  const view = useRef<View>({ yaw: 0.35, pitch: 0.5, dist: 80 });
  const mvpRef = useRef<M4>(new Float32Array(16));
  const sizeRef = useRef({ w: 1, h: 1 });
  const raf = useRef(0);
  const drag = useRef<{ x: number; y: number } | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; dist: number; elev: number; w: number } | null>(null);
  const [glError, setGlError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

  const fit = useCallback(() => {
    const { w, h } = sizeRef.current;
    const aspect = w / h;
    const b = mesh.bounds;
    const halfX = (b.maxX - b.minX) / 2;
    const halfY = (b.maxY - b.minY) / 2;
    const fov = (35 * Math.PI) / 180;
    const distX = halfX / (Math.tan(fov / 2) * aspect);
    const distY = (halfY * 2.4) / Math.tan(fov / 2);
    view.current = { yaw: 0.35, pitch: 0.5, dist: Math.max(distX, distY) * 0.95 };
  }, [mesh]);

  const draw = useCallback(() => {
    raf.current = 0;
    const st = glState.current;
    if (!st) return;
    const { gl } = st;
    const { w, h } = sizeRef.current;
    const b = mesh.bounds;
    const target = [0, (b.minY + b.maxY) / 2, 0];
    const v = view.current;
    const eye = [
      target[0] + v.dist * Math.cos(v.pitch) * Math.sin(v.yaw),
      target[1] + v.dist * Math.sin(v.pitch),
      target[2] + v.dist * Math.cos(v.pitch) * Math.cos(v.yaw),
    ];
    const proj = perspective((35 * Math.PI) / 180, w / h, v.dist * 0.02, v.dist * 6);
    const mvp = mul(proj, lookAt(eye, target, [0, 1, 0]));
    mvpRef.current = mvp;

    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);
    gl.useProgram(st.prog);
    gl.uniformMatrix4fv(st.mvpLoc, false, mvp);
    gl.drawElements(gl.TRIANGLES, st.count, gl.UNSIGNED_SHORT, 0);
  }, [mesh]);

  const schedule = useCallback(() => {
    if (!raf.current) raf.current = requestAnimationFrame(draw);
  }, [draw]);

  // ── GL context + program: created once per canvas, NOT per mesh ──
  // NOTE: never call WEBGL_lose_context in cleanup. React StrictMode (and any remount)
  // re-acquires the *same* context from the canvas; a context we deliberately lost makes
  // createShader() return null and getShaderInfoLog() empty -> the old "shader error".
  const buildProgram = useCallback((gl: WebGLRenderingContext): WebGLProgram => {
    const compile = (type: number, src: string, label: string) => {
      const sh = gl.createShader(type);
      if (!sh) throw new Error(`${label}: createShader returned null (${gl.isContextLost() ? "context lost" : "unknown"})`);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(sh) || (gl.isContextLost() ? "context lost" : "no info log");
        console.error(`[TerrainSection] ${label} compile failed:\n${log}\n--- source ---\n${src}`);
        gl.deleteShader(sh);
        throw new Error(`${label}: ${log}`);
      }
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, VS, "vertex shader");
    const fs = compile(gl.FRAGMENT_SHADER, FS, "fragment shader");
    const prog = gl.createProgram();
    if (!prog) throw new Error("createProgram returned null");
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      const log = gl.getProgramInfoLog(prog) || "no info log";
      console.error(`[TerrainSection] program link failed:\n${log}`);
      gl.deleteProgram(prog);
      throw new Error(`link: ${log}`);
    }
    return prog;
  }, []);

  // Upload (or re-upload) mesh buffers for the current program.
  const uploadMesh = useCallback((gl: WebGLRenderingContext, prog: WebGLProgram, m: SectionMesh) => {
    const old = glState.current;
    old?.bufs.forEach((b) => gl.deleteBuffer(b));
    const bufs: WebGLBuffer[] = [];
    gl.useProgram(prog);
    const attr = (name: string, data: Float32Array) => {
      const loc = gl.getAttribLocation(prog, name);
      if (loc < 0) throw new Error(`attribute ${name} not found (optimised out?)`);
      const buf = gl.createBuffer();
      if (!buf) throw new Error("createBuffer returned null");
      bufs.push(buf);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 3, gl.FLOAT, false, 0, 0);
    };
    attr("aPos", m.positions);
    attr("aNor", m.normals);
    attr("aCol", m.colors);
    const ib = gl.createBuffer();
    if (!ib) throw new Error("createBuffer returned null");
    bufs.push(ib);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.indices, gl.STATIC_DRAW);
    glState.current = { gl, prog, bufs, count: m.indices.length, mvpLoc: gl.getUniformLocation(prog, "uMVP") };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = (canvas.getContext("webgl", { antialias: true, alpha: true }) ||
      canvas.getContext("experimental-webgl")) as WebGLRenderingContext | null;
    if (!gl) {
      setGlError("WebGL is not available in this browser.");
      return;
    }
    let prog: WebGLProgram | null = null;
    const init = () => {
      try {
        glState.current = null;
        prog = buildProgram(gl);
        uploadMesh(gl, prog, meshRef.current);
        setGlError(null);
        schedule();
      } catch (e) {
        setGlError(`WebGL shader error: ${(e as Error).message}`);
      }
    };
    const onLost = (e: Event) => {
      e.preventDefault(); // allows restoration
      glState.current = null;
      setGlError("WebGL context lost — waiting for the browser to restore it…");
    };
    const onRestored = () => init();
    canvas.addEventListener("webglcontextlost", onLost);
    canvas.addEventListener("webglcontextrestored", onRestored);
    init();
    return () => {
      canvas.removeEventListener("webglcontextlost", onLost);
      canvas.removeEventListener("webglcontextrestored", onRestored);
      cancelAnimationFrame(raf.current);
      raf.current = 0;
      glState.current?.bufs.forEach((b) => gl.deleteBuffer(b));
      if (prog) gl.deleteProgram(prog);
      glState.current = null;
    };
  }, [buildProgram, uploadMesh, schedule]);

  // Re-upload buffers when the mesh changes (e.g. exaggeration slider) — same context, same program.
  useEffect(() => {
    const st = glState.current;
    if (!st || st.gl.isContextLost()) return;
    try {
      uploadMesh(st.gl, st.prog, mesh);
      schedule();
    } catch (e) {
      setGlError(`WebGL buffer error: ${(e as Error).message}`);
    }
  }, [mesh, uploadMesh, schedule]);

  // ── Resize ──
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const apply = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.max(1, wrap.clientWidth);
      const h = Math.max(1, wrap.clientHeight);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      sizeRef.current = { w, h };
      schedule();
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [schedule]);

  // fit camera whenever mesh changes or reset pressed
  useEffect(() => {
    fit();
    schedule();
  }, [fit, schedule, resetToken, mesh]);

  // ── Interaction ──
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      view.current.dist = Math.min(Math.max(view.current.dist * (1 + Math.sign(e.deltaY) * 0.08), 5), 600);
      schedule();
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", onWheel);
  }, [schedule]);

  const project = (x: number, y: number, z: number) => {
    const m = mvpRef.current;
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const cy = m[1] * x + m[5] * y + m[9] * z + m[13];
    const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    const { w, h } = sizeRef.current;
    return { sx: ((cx / cw) * 0.5 + 0.5) * w, sy: (1 - ((cy / cw) * 0.5 + 0.5)) * h };
  };

  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
    (e.target as Element).setPointerCapture(e.pointerId);
    setHover(null);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (drag.current) {
      const dx = e.clientX - drag.current.x;
      const dy = e.clientY - drag.current.y;
      drag.current = { x: e.clientX, y: e.clientY };
      view.current.yaw -= dx * 0.008;
      view.current.pitch = Math.min(Math.max(view.current.pitch + dy * 0.006, 0.05), 1.5);
      schedule();
      return;
    }
    const rect = canvasRef.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    let best: { d: number; i: number; sx: number; sy: number } | null = null;
    mesh.centerline.forEach((p, i) => {
      const { sx, sy } = project(p.x, p.y, p.z);
      const d = Math.hypot(sx - mx, sy - my);
      if (!best || d < best.d) best = { d, i, sx, sy };
    });
    const b = best as { d: number; i: number; sx: number; sy: number } | null;
    if (b && b.d < 28) {
      const p = mesh.centerline[b.i];
      setHover({ x: b.sx, y: b.sy, dist: p.distKm, elev: p.elevM, w: sizeRef.current.w });
    } else setHover(null);
  };
  const onPointerUp = () => {
    drag.current = null;
    setDragging(false);
  };

  return (
    <div ref={wrapRef} className="relative w-full h-full" style={{ minHeight: 0 }}>
      <canvas
        ref={canvasRef}
        className="absolute inset-0 w-full h-full"
        style={{ touchAction: "none", cursor: dragging ? "grabbing" : "grab" }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setHover(null)}
        aria-label={`3D elevation block, ${swath.lengthKm.toFixed(0)} km transect. Drag to rotate, scroll to zoom.`}
        role="img"
      />
      {glError && <ProfileFallback mesh={mesh} message={glError} />}
      {hover && (
        <>
          <div
            className="absolute pointer-events-none rounded-full"
            style={{ left: hover.x - 4, top: hover.y - 4, width: 8, height: 8, background: "#155E59", border: "1.5px solid #fff" }}
          />
          <div
            className="absolute pointer-events-none rounded px-1.5 py-0.5"
            style={{
              left: Math.min(hover.x + 8, hover.w - 110),
              top: Math.max(hover.y - 30, 2),
              background: "rgba(255,255,255,0.96)",
              border: "1px solid #DCE4DD",
              fontSize: "0.625rem",
              color: "#26332F",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {hover.dist.toFixed(1)} km · <b>{Math.round(hover.elev)} m</b>
          </div>
        </>
      )}
    </div>
  );
}

export function TerrainSectionPanel() {
  const { language } = useStore();
  const [vertExag, setVertExag] = useState(8);
  const [resetToken, setResetToken] = useState(0);

  const { data: swath, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["dem-swath", SECTION_SPEC],
    queryFn: ({ signal }) => sampleSwath(SECTION_SPEC, signal),
    staleTime: Infinity,
    retry: 1,
  });

  const retryElevation = useCallback(() => {
    setResetToken((n) => n + 1);
    void refetch();
  }, [refetch]);

  const tooMuchMissing = !!swath && swath.missingCount / swath.totalCount > 0.05;
  const mesh = useMemo(
    () => (swath && !tooMuchMissing && swath.maxM != null ? buildSectionMesh(swath, vertExag) : null),
    [swath, vertExag, tooMuchMissing]
  );

  const en = language === "en";
  return (
    <div className="h-full flex flex-col">
      <div className="analytics-panel-title">
        <Mountain style={{ width: 12, height: 12, color: "#8B7355" }} />
        {en ? "3D Elevation Cross-section (DEM)" : "3D ഉയര ക്രോസ്-സെക്ഷൻ (DEM)"}
        <div className="ml-auto flex items-center gap-1.5">
          <label style={{ fontSize: "0.5rem", color: "#687770" }} title="Vertical exaggeration of this block only">
            ×{vertExag}
            <input
              type="range"
              min={1}
              max={20}
              step={1}
              value={vertExag}
              onChange={(e) => setVertExag(Number(e.target.value))}
              className="timeline-slider"
              style={{ width: 52, marginLeft: 4, verticalAlign: "middle" }}
              aria-label={`Vertical exaggeration ${vertExag}x`}
            />
          </label>
          <button
            type="button"
            onClick={retryElevation}
            disabled={isFetching}
            title={en ? "Retry elevation data and reset the 3D view" : "ഉയര ഡാറ്റ വീണ്ടും ലോഡ് ചെയ്ത് 3D കാഴ്ച പുനഃക്രമീകരിക്കുക"}
            aria-label={en ? "Retry elevation data and reset 3D view" : "ഉയര ഡാറ്റ വീണ്ടും ലോഡ് ചെയ്യുക"}
            aria-busy={isFetching}
            style={{ background: "none", border: "none", cursor: isFetching ? "wait" : "pointer", color: "#155E59", padding: 5, display: "flex", opacity: isFetching ? 0.55 : 1 }}
          >
            <RefreshCw style={{ width: 13, height: 13 }} className={isFetching ? "animate-spin" : undefined} />
          </button>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0 }} className="relative overflow-hidden rounded-lg bg-slate-950/5 dark:bg-slate-950/30">
        {mesh && (
          <div className="pointer-events-none absolute inset-x-3 top-2 z-10 flex justify-between text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 dark:text-slate-300">
            <span className="rounded-full bg-white/70 px-2 py-1 backdrop-blur-md dark:bg-slate-900/70">Western Ghats</span>
            <span className="rounded-full bg-white/70 px-2 py-1 backdrop-blur-md dark:bg-slate-900/70">Floodplain</span>
          </div>
        )}
        {(isLoading || isFetching) && !mesh && (
          <div className="skeleton absolute inset-0 rounded" aria-busy="true" />
        )}
        {isError && (
          <div className="h-full flex flex-col items-center justify-center gap-1 text-center" style={{ fontSize: "0.6875rem", color: "#92400e" }}>
            <span>
              <AlertTriangle style={{ width: 12, height: 12, display: "inline", marginRight: 4 }} />
              {en ? "Elevation tiles could not be loaded" : "ഉയര ഡാറ്റ ലോഡ് ചെയ്യാനായില്ല"}
            </span>
            <span style={{ color: "#9ca3af", fontSize: "0.5625rem" }}>{(error as Error)?.message}</span>
            <button
              onClick={retryElevation}
              disabled={isFetching}
              style={{ fontSize: "0.625rem", color: "#155E59", border: "1px solid #DCE4DD", borderRadius: 4, padding: "2px 8px", background: "white", cursor: "pointer" }}
            >
              <RefreshCw style={{ width: 9, height: 9, display: "inline", marginRight: 3 }} />
              {en ? "Retry" : "വീണ്ടും"}
            </button>
          </div>
        )}
        {swath && tooMuchMissing && (
          <div className="h-full flex flex-col items-center justify-center gap-1 text-center" style={{ fontSize: "0.6875rem", color: "#92400e" }}>
            {en
              ? `No-data: ${swath.missingCount} of ${swath.totalCount} DEM samples unavailable (${swath.tiles.failed} tile requests failed).`
              : "DEM ഡാറ്റ ലഭ്യമല്ല."}
            <button
              onClick={retryElevation}
              disabled={isFetching}
              style={{ fontSize: "0.625rem", color: "#155E59", border: "1px solid #DCE4DD", borderRadius: 4, padding: "2px 8px", background: "white", cursor: "pointer" }}
            >
              {en ? "Retry" : "വീണ്ടും"}
            </button>
          </div>
        )}
        {mesh && swath && <SectionCanvas mesh={mesh} swath={swath} resetToken={resetToken} />}
      </div>

      {swath && mesh && (
        <div style={{ fontSize: "0.5rem", color: "#9ca3af", marginTop: 2, lineHeight: 1.35 }}>
          {swath.lengthKm.toFixed(0)} km transect · {Math.round(swath.minM ?? 0)}–{Math.round(swath.maxM ?? 0)} m ·{" "}
          {swath.tiles.ok + 0} DEM tiles ok{swath.tiles.failed ? `, ${swath.tiles.failed} failed` : ""} · z{swath.zoom} ·{" "}
          {swath.source.split(" — ")[0]}
          {mesh.filledCount > 0 && <span style={{ color: "#92400e" }}> · {mesh.filledCount} gaps interpolated for display</span>}
          <span style={{ marginLeft: 4 }}>
            {ELEVATION_STOPS.slice(1).map((s, i) => (
              <span
                key={i}
                title={s.label}
                style={{ display: "inline-block", width: 8, height: 6, marginRight: 1, background: `rgb(${s.c.map((v) => Math.round(v * 255)).join(",")})` }}
              />
            ))}
          </span>
        </div>
      )}
    </div>
  );
}
