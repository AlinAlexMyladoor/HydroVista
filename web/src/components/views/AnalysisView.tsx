"use client";

import React, { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, AnalysisParams, AnalysisRun, AnalysisStatus, APIError } from "@/lib/api";
import { useStore } from "@/lib/store";

if (typeof window !== "undefined") maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

// Example inputs from the blueprint (August 2018 Kerala flood). Editable; not a claim that scenes exist.
const DEFAULTS: AnalysisParams = {
  west: 76.2, south: 10.15, east: 76.55, north: 10.45,
  pre_start: "2018-07-01", pre_end: "2018-08-01", event_start: "2018-08-01", event_end: "2018-09-01",
  orbit: "DESCENDING", threshold_db: -16, permanent_occurrence_pct: 90, max_slope_deg: 5, smooth_m: 50, min_drop_db: 3, scale_m: 30,
};
const STATUS_COLOR: Record<string, string> = { queued: "#687770", running: "#2563EB", completed: "#16A34A", failed: "#DC2626" };

const num = (v: string) => (v === "" || Number.isNaN(Number(v)) ? NaN : Number(v));

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1" style={{ fontSize: "0.6875rem", color: "#26332F" }}>
      <span style={{ fontWeight: 600 }}>{label}</span>
      {children}
      {hint && <span style={{ color: "#687770", fontSize: "0.5625rem" }}>{hint}</span>}
    </label>
  );
}
const inputStyle: React.CSSProperties = { border: "1px solid #DCE4DD", borderRadius: 6, padding: "4px 6px", fontSize: "0.75rem", background: "#fff", width: "100%" };

function ResultMap({ run }: { run: AnalysisRun }) {
  const ref = useRef<HTMLDivElement>(null);
  const [showChange, setShowChange] = useState(false);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const res = run.result;
  useEffect(() => {
    if (!ref.current || !res) return;
    const p = res.parameters;
    const map = new maplibregl.Map({
      container: ref.current, style: "/style-liberty.json",
      bounds: [[p.west, p.south], [p.east, p.north]], fitBoundsOptions: { padding: 24 }, attributionControl: false,
    });
    mapRef.current = map;
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      map.addSource("vvchange", { type: "raster", tiles: [res.tiles.vv_change_db], tileSize: 256 });
      map.addLayer({ id: "vvchange", type: "raster", source: "vvchange", layout: { visibility: "none" }, paint: { "raster-opacity": 0.75 } });
      map.addSource("cand", { type: "raster", tiles: [res.tiles.candidate_inundation], tileSize: 256 });
      map.addLayer({ id: "cand", type: "raster", source: "cand", paint: { "raster-opacity": 0.85 } });
      map.addSource("roi", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[p.west, p.south], [p.east, p.south], [p.east, p.north], [p.west, p.north], [p.west, p.south]]] } } });
      map.addLayer({ id: "roi", type: "line", source: "roi", paint: { "line-color": "#2563EB", "line-width": 2, "line-dasharray": [2, 2] } });
    });
    return () => map.remove();
  }, [res]);
  useEffect(() => {
    const m = mapRef.current;
    if (m?.getLayer("vvchange")) m.setLayoutProperty("vvchange", "visibility", showChange ? "visible" : "none");
  }, [showChange]);
  return (
    <div className="relative" style={{ height: 320, border: "1px solid #DCE4DD", borderRadius: 8, overflow: "hidden" }}>
      <div ref={ref} style={{ position: "absolute", inset: 0 }} />
      <label className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded px-2 py-1" style={{ background: "rgba(255,255,255,0.95)", fontSize: "0.625rem", border: "1px solid #DCE4DD" }}>
        <input type="checkbox" checked={showChange} onChange={(e) => setShowChange(e.target.checked)} /> VV change (event − pre, dB)
      </label>
      <div className="absolute bottom-2 left-2 z-10 rounded px-2 py-1" style={{ background: "rgba(255,255,255,0.95)", fontSize: "0.5625rem", border: "1px solid #DCE4DD" }}>
        <span style={{ color: "#F97316" }}>■</span> Active Flood Extent (SAR-derived)
      </div>
    </div>
  );
}

function ResultPanel({ run, live }: { run: AnalysisRun; live?: AnalysisStatus }) {
  const r = run.result;
  const openIn3D = () => {
    const st = useStore.getState();
    st.setInundationRunId(run.id);
    st.setLayerVisible("inundation", true);
    st.setLayerVisible("terrain", true);
    st.setMapIs3D(true);
    st.setActiveRoute("map");
  };
  if (run.status === "failed") {
    return (
      <div role="alert" className="rounded-md p-3" style={{ background: "#fef2f2", border: "1px solid #fecaca", fontSize: "0.75rem", color: "#991b1b" }}>
        <b>Analysis failed</b> ({run.error_code ?? "error"}) after {run.attempts} attempt{run.attempts === 1 ? "" : "s"}.<div style={{ marginTop: 4 }}>{run.error}</div>
      </div>
    );
  }
  if (run.status !== "completed" || !r) {
    const st = live?.status ?? run.status;
    const secs = st === "queued" ? live?.queued_seconds : live?.running_seconds;
    return <div role="status" style={{ fontSize: "0.75rem", color: "#687770" }}>Run {run.id} is <b style={{ color: STATUS_COLOR[st] }}>{st}</b>{secs != null && ` (${Math.round(secs)} s)`}{live && live.attempts > 1 && ` · attempt ${live.attempts}`}. You can leave this page; the run continues on the server.</div>;
  }
  const a = r.areas_km2;
  const rows: [string, number, string][] = [
    ["Study area", a.study_area, "Total area of the rectangle analysed"],
    ["Water at event (threshold only)", a.threshold_only, "VV below threshold in the event window, observed cells only"],
    ["Newly inundated (change detection)", a.after_change_detection, "…and backscatter dropped vs pre-event, and was not water before"],
    ["After permanent-water exclusion", a.after_permanent_water_exclusion, "Removes JRC occurrence ≥ selected %"],
    ["Flood extent (final)", a.candidate_inundation_final, "After terrain (slope) mask"],
    ["No observation (NODATA)", a.no_observation, "No usable Sentinel-1 data in one window — NOT counted as dry"],
  ].filter((row) => row[1] != null) as [string, number, string][];
  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-md px-3 py-2" style={{ background: "#EFF6FF", border: "1px solid #BFDBFE", fontSize: "0.6875rem", color: "#1E40AF" }}>
        <b>Active Flood Extent</b> · SAR-derived from the selected observation window.
      </div>
      <ResultMap run={run} />
      <table style={{ fontSize: "0.75rem", width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ textAlign: "left", color: "#687770", fontSize: "0.625rem", textTransform: "uppercase" }}><th>Measure</th><th style={{ textAlign: "right" }}>km²</th><th>Definition</th></tr></thead>
        <tbody>{rows.map(([k, v, d]) => (
          <tr key={k} style={{ borderTop: "1px solid #EEF2EF" }}><td style={{ padding: "4px 0" }}>{k}</td><td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{v.toFixed(2)}</td><td style={{ color: "#687770", paddingLeft: 8 }}>{d}</td></tr>
        ))}</tbody>
      </table>
      <div style={{ fontSize: "0.6875rem" }}>
        <b>Scenes:</b> {r.scene_counts.pre_event} pre-event, {r.scene_counts.event} event ·{" "}
        <b>Resolution:</b> {r.processing.scale_m} m · <b>Compute:</b> {r.processing.seconds}s · <b>Attempts:</b> {r.run.attempts}
        <div style={{ color: "#687770", marginTop: 2 }}>Event acquisitions: {r.acquisition_dates.event.join(", ") || "—"}</div>
        <div style={{ color: "#687770" }}>Pre-event acquisitions: {r.acquisition_dates.pre_event.join(", ") || "—"}</div>
        <div style={{ color: "#687770" }}>Datasets: {Object.values(r.datasets).join(" · ")}</div>
      </div>
      <ul style={{ fontSize: "0.625rem", color: "#687770", paddingLeft: 16, listStyle: "disc" }}>{r.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
      {r.vectors?.available ? (
        <button onClick={openIn3D} style={{ alignSelf: "flex-start", background: "#0F766E", color: "#fff", border: "none", borderRadius: 6, padding: "7px 10px", fontWeight: 600, fontSize: "0.75rem", cursor: "pointer" }}>
          Drape on 3D terrain map ({r.vectors.feature_count} polygons{r.vectors.truncated ? `, largest of ${r.vectors.total_polygons}` : ""})
        </button>
      ) : (
        <div style={{ fontSize: "0.6875rem", color: "#92400e" }}>No polygon output for this run{r.vectors?.reason ? `: ${r.vectors.reason}` : ""}. The raster tiles above are still valid.</div>
      )}
      <a href={api.analysis.exportCsvUrl(run.id)} style={{ fontSize: "0.6875rem", color: "#2563EB", fontWeight: 600 }}>Download CSV (areas, scene counts, parameters)</a>
    </div>
  );
}

export function AnalysisView() {
  const qc = useQueryClient();
  const [p, setP] = useState<AnalysisParams>(DEFAULTS);
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const cap = useQuery({ queryKey: ["analysis-cap"], queryFn: api.analysis.capabilities, retry: 1 });
  const runs = useQuery({ queryKey: ["analysis-runs"], queryFn: api.analysis.runs, retry: 1, refetchInterval: (q) => (q.state.data?.runs.some((r) => r.status === "queued" || r.status === "running") ? 3000 : false) });
  const current = useQuery({ queryKey: ["analysis-run", selected], queryFn: () => api.analysis.run(selected!), enabled: !!selected });
  // Poll the cheap status endpoint (no result body) while the job is queued/running.
  const live = useQuery({
    queryKey: ["analysis-status", selected], queryFn: () => api.analysis.status(selected!), enabled: !!selected,
    refetchInterval: (q) => (q.state.data && !q.state.data.terminal ? (q.state.data.poll_after_ms ?? 3000) : false),
  });
  const liveStatus = live.data?.status;
  useEffect(() => {
    // When the job reaches a terminal state, fetch the full run (result/error) once and refresh history.
    if (selected && (liveStatus === "completed" || liveStatus === "failed")) {
      qc.invalidateQueries({ queryKey: ["analysis-run", selected] });
      qc.invalidateQueries({ queryKey: ["analysis-runs"] });
    }
  }, [liveStatus, selected, qc]);

  const set = <K extends keyof AnalysisParams>(k: K, v: AnalysisParams[K]) => setP((o) => ({ ...o, [k]: v }));
  const invalid = Object.entries(p).some(([k, v]) => typeof v === "number" && Number.isNaN(v)) || !p.pre_start || !p.pre_end || !p.event_start || !p.event_end;

  const submit = async () => {
    setBusy(true); setMsg(null);
    try {
      const run = await api.analysis.create(p);
      setSelected(run.id);
      setMsg({ kind: "info", text: run.cache_hit ? `Identical analysis found (run ${run.id}); showing the stored result instead of recomputing.` : `Run ${run.id} queued.` });
      qc.invalidateQueries({ queryKey: ["analysis-runs"] });
    } catch (e) {
      setMsg({ kind: "error", text: e instanceof APIError ? e.detail : (e as Error).message });
    } finally { setBusy(false); }
  };

  const numInput = (k: keyof AnalysisParams, step = "any") => (
    <input type="number" step={step} style={inputStyle} value={Number.isNaN(p[k] as number) ? "" : (p[k] as number)} onChange={(e) => set(k, num(e.target.value) as never)} />
  );

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "#F7F8F4", color: "#26332F" }}>
      <div className="max-w-6xl mx-auto p-6 grid gap-6" style={{ gridTemplateColumns: "minmax(300px, 380px) 1fr" }}>
        <div className="flex flex-col gap-4">
          <div>
            <h1 style={{ fontSize: "1.125rem", fontWeight: 700 }}>Flood Analysis Workspace</h1>
            <p style={{ fontSize: "0.6875rem", color: "#687770" }}>Sentinel-1 candidate inundation via Google Earth Engine. Runs are stored with their parameters.</p>
          </div>

          {cap.data && !cap.data.ready && (
            <div role="alert" className="rounded-md p-2.5" style={{ background: "#fffbeb", border: "1px solid #fde68a", fontSize: "0.6875rem", color: "#92400e" }}>
              <b>Earth Engine is not configured on the server</b> — analyses cannot run yet.
              <ul style={{ paddingLeft: 16, listStyle: "disc", marginTop: 2 }}>{cap.data.blocking_reasons.map((r) => <li key={r}>{r}</li>)}</ul>
            </div>
          )}
          {cap.isError && <div role="alert" style={{ fontSize: "0.6875rem", color: "#991b1b" }}>Backend unreachable: capabilities could not be loaded.</div>}

          <div className="rounded-lg p-3 flex flex-col gap-3" style={{ background: "#fff", border: "1px solid #DCE4DD" }}>
            <div style={{ fontWeight: 700, fontSize: "0.6875rem", textTransform: "uppercase", color: "#687770" }}>Study area (lon/lat box)</div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="West">{numInput("west")}</Field><Field label="East">{numInput("east")}</Field>
              <Field label="South">{numInput("south")}</Field><Field label="North">{numInput("north")}</Field>
            </div>
            <div style={{ fontWeight: 700, fontSize: "0.6875rem", textTransform: "uppercase", color: "#687770" }}>Date windows</div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Pre-event start"><input type="date" style={inputStyle} value={p.pre_start} onChange={(e) => set("pre_start", e.target.value)} /></Field>
              <Field label="Pre-event end"><input type="date" style={inputStyle} value={p.pre_end} onChange={(e) => set("pre_end", e.target.value)} /></Field>
              <Field label="Event start"><input type="date" style={inputStyle} value={p.event_start} onChange={(e) => set("event_start", e.target.value)} /></Field>
              <Field label="Event end"><input type="date" style={inputStyle} value={p.event_end} onChange={(e) => set("event_end", e.target.value)} /></Field>
            </div>
            <div style={{ fontWeight: 700, fontSize: "0.6875rem", textTransform: "uppercase", color: "#687770" }}>Processing</div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Orbit">
                <select style={inputStyle} value={p.orbit} onChange={(e) => set("orbit", e.target.value as AnalysisParams["orbit"])}>
                  <option value="DESCENDING">Descending</option><option value="ASCENDING">Ascending</option><option value="ANY">Any (mixes geometries)</option>
                </select>
              </Field>
              <Field label="Resolution (m)" hint="10 is heavy">
                <select style={inputStyle} value={p.scale_m} onChange={(e) => set("scale_m", Number(e.target.value))}>{[10, 30, 60, 100].map((v) => <option key={v} value={v}>{v}</option>)}</select>
              </Field>
              <Field label="VV threshold (dB)" hint="Exploratory; −16 is a demo value">{numInput("threshold_db", "0.5")}</Field>
              <Field label="Permanent water ≥ (%)" hint="JRC occurrence">{numInput("permanent_occurrence_pct", "1")}</Field>
              <Field label="Max slope (°)" hint="0 disables">{numInput("max_slope_deg", "1")}</Field>
              <Field label="Speckle smoothing (m)" hint="0 = off; change detection is speckle-sensitive">{numInput("smooth_m", "10")}</Field>
              <Field label="Min. backscatter drop (dB)" hint="event − pre ≤ −value counts as new water">{numInput("min_drop_db", "0.5")}</Field>
            </div>
            <button onClick={submit} disabled={busy || invalid || (cap.data ? !cap.data.ready : false)}
              style={{ background: busy || invalid || (cap.data && !cap.data.ready) ? "#9ca3af" : "#2563EB", color: "#fff", borderRadius: 6, padding: "8px 10px", fontWeight: 600, fontSize: "0.8125rem", border: "none", cursor: busy || invalid ? "not-allowed" : "pointer" }}>
              {busy ? "Submitting…" : "Run analysis"}
            </button>
            {invalid && <div style={{ fontSize: "0.625rem", color: "#991b1b" }}>Fill every field with a valid value.</div>}
            {msg && <div role={msg.kind === "error" ? "alert" : "status"} style={{ fontSize: "0.6875rem", color: msg.kind === "error" ? "#991b1b" : "#155E59" }}>{msg.text}</div>}
          </div>

          <div className="rounded-lg p-3" style={{ background: "#fff", border: "1px solid #DCE4DD" }}>
            <div style={{ fontWeight: 700, fontSize: "0.6875rem", textTransform: "uppercase", color: "#687770", marginBottom: 6 }}>Run history</div>
            {runs.isLoading && <div style={{ fontSize: "0.6875rem", color: "#687770" }}>Loading…</div>}
            {runs.data && runs.data.runs.length === 0 && <div style={{ fontSize: "0.6875rem", color: "#687770" }}>No analyses yet.</div>}
            {runs.data?.runs.map((r) => (
              <button key={r.id} onClick={() => setSelected(r.id)} className="w-full text-left flex items-center justify-between" style={{ padding: "4px 6px", borderRadius: 4, border: "none", background: selected === r.id ? "#EEF4FF" : "transparent", cursor: "pointer", fontSize: "0.6875rem" }}>
                <span>{r.id} · {r.params.event_start}→{r.params.event_end}</span>
                <span style={{ color: STATUS_COLOR[r.status], fontWeight: 600 }}>{r.status}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-lg p-4" style={{ background: "#fff", border: "1px solid #DCE4DD", minHeight: 300 }}>
          {!selected && <div style={{ fontSize: "0.8125rem", color: "#687770" }}>Select or start a run to see its scene counts, areas and map. Nothing is shown until real results exist.</div>}
          {selected && current.isLoading && <div style={{ fontSize: "0.75rem", color: "#687770" }}>Loading run…</div>}
          {selected && current.isError && <div role="alert" style={{ fontSize: "0.75rem", color: "#991b1b" }}>Could not load run {selected}.</div>}
          {current.data && <ResultPanel run={current.data} live={live.data} />}
        </div>
      </div>
    </div>
  );
}
