"use client";

import React, { useEffect, useRef, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, AnalysisParams, AnalysisRun, AnalysisStatus, APIError, InundationGeoJSON } from "@/lib/api";
import { useStore } from "@/lib/store";
import { AlertCircle, Check, Info, LoaderCircle, MapPinned } from "lucide-react";

if (typeof window !== "undefined") maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

// Example inputs from the blueprint (August 2018 Kerala flood). Editable; not a claim that scenes exist.
const DEFAULTS: AnalysisParams = {
  west: 76.2, south: 10.15, east: 76.55, north: 10.45,
  pre_start: "2018-07-01", pre_end: "2018-08-01", event_start: "2018-08-01", event_end: "2018-09-01",
  orbit: "DESCENDING", threshold_db: -16, permanent_occurrence_pct: 90, max_slope_deg: 5, smooth_m: 50, min_drop_db: 3, scale_m: 30,
};
const STATUS_COLOR: Record<string, string> = { queued: "#687770", running: "#2563EB", completed: "#16A34A", failed: "#DC2626" };

const num = (v: string) => (v === "" || Number.isNaN(Number(v)) ? NaN : Number(v));
const validStudyBounds = (p: AnalysisParams) => [p.west, p.south, p.east, p.north].every(Number.isFinite)
  && p.west >= -180 && p.east <= 180 && p.south >= -85 && p.north <= 85 && p.west < p.east && p.south < p.north;

function geojsonBounds(geojson: InundationGeoJSON): [[number, number], [number, number]] | null {
  if (!geojson || geojson.type !== "FeatureCollection" || !Array.isArray(geojson.features) || geojson.features.length === 0) return null;
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  const visit = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (typeof value[0] === "number" && typeof value[1] === "number") {
      bounds[0] = Math.min(bounds[0], value[0]);
      bounds[1] = Math.min(bounds[1], value[1]);
      bounds[2] = Math.max(bounds[2], value[0]);
      bounds[3] = Math.max(bounds[3], value[1]);
      return;
    }
    value.forEach(visit);
  };
  geojson.features.forEach((feature) => visit(feature.geometry.coordinates));
  if (!bounds.every(Number.isFinite) || bounds[0] >= bounds[2] || bounds[1] >= bounds[3]) return null;
  return [[bounds[0], bounds[1]], [bounds[2], bounds[3]]];
}

function studyBoundsGeoJSON(p: AnalysisParams): GeoJSON.FeatureCollection {
  if (!validStudyBounds(p)) return { type: "FeatureCollection", features: [] };
  return {
    type: "FeatureCollection",
    features: [{
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [[[p.west, p.south], [p.east, p.south], [p.east, p.north], [p.west, p.north], [p.west, p.south]]] },
    }],
  };
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1" style={{ fontSize: "0.6875rem", color: "#26332F" }}>
      <span className="flex items-center justify-between gap-2" style={{ fontWeight: 600 }}>
        {label}
        {hint && <button type="button" className="text-text-secondary" title={hint} aria-label={`More information: ${hint}`}><Info size={13} /></button>}
      </span>
      {children}
    </label>
  );
}
const inputStyle: React.CSSProperties = { border: "1px solid #DCE4DD", borderRadius: 6, padding: "4px 6px", fontSize: "0.75rem", background: "#fff", width: "100%" };

function ResultMap({ run }: { run: AnalysisRun }) {
  const ref = useRef<HTMLDivElement>(null);
  const [showChange, setShowChange] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const res = run.result;
  const polygons = useQuery({
    queryKey: ["analysis-geojson", run.id],
    queryFn: () => api.analysis.geojson(run.id),
    enabled: run.status === "completed" && !!res?.vectors?.available,
    staleTime: 10 * 60_000,
    retry: 1,
  });
  useEffect(() => {
    if (!ref.current || !res) return;
    setMapLoaded(false);
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
      map.addSource("cand-raster", { type: "raster", tiles: [res.tiles.candidate_inundation], tileSize: 256 });
      map.addLayer({ id: "cand-raster-layer", type: "raster", source: "cand-raster", paint: { "raster-opacity": 0.72 } });
      map.addSource("cand", { type: "geojson", data: (polygons.data as GeoJSON.FeatureCollection | undefined) ?? { type: "FeatureCollection", features: [] } });
      map.addLayer({ id: "cand-fill", type: "fill", source: "cand", paint: { "fill-color": "#00A6C7", "fill-opacity": 0.52 } });
      map.addLayer({ id: "cand-outline", type: "line", source: "cand", paint: { "line-color": "#007E9E", "line-width": 1.2, "line-opacity": 0.95 } });
      map.addSource("roi", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "Polygon", coordinates: [[[p.west, p.south], [p.east, p.south], [p.east, p.north], [p.west, p.north], [p.west, p.south]]] } } });
      map.addLayer({ id: "roi", type: "line", source: "roi", paint: { "line-color": "#2563EB", "line-width": 2, "line-dasharray": [2, 2] } });
      setMapLoaded(true);
    });
    return () => map.remove();
  }, [res]);
  useEffect(() => {
    if (!mapLoaded || !polygons.data) return;
    const map = mapRef.current;
    const source = map?.getSource("cand") as maplibregl.GeoJSONSource | undefined;
    source?.setData(polygons.data as GeoJSON.FeatureCollection);
    if (map?.getLayer("cand-raster-layer")) map.setLayoutProperty("cand-raster-layer", "visibility", "none");
  }, [mapLoaded, polygons.data]);
  useEffect(() => {
    const m = mapRef.current;
    if (m?.getLayer("vvchange")) m.setLayoutProperty("vvchange", "visibility", showChange ? "visible" : "none");
  }, [showChange, mapLoaded]);
  return (
    <div className="relative" style={{ height: 320, border: "1px solid #DCE4DD", borderRadius: 8, overflow: "hidden" }}>
      <div ref={ref} style={{ position: "absolute", inset: 0 }} />
      <label className="absolute top-2 left-2 z-10 flex items-center gap-1 rounded px-2 py-1" style={{ background: "rgba(255,255,255,0.95)", fontSize: "0.625rem", border: "1px solid #DCE4DD" }}>
        <input type="checkbox" checked={showChange} onChange={(e) => setShowChange(e.target.checked)} /> VV change (event − pre, dB)
      </label>
      <div className="absolute bottom-2 left-2 z-10 rounded px-2 py-1" style={{ background: "rgba(255,255,255,0.95)", fontSize: "0.5625rem", border: "1px solid #DCE4DD" }}>
        <span style={{ color: "#00A6C7" }}>■</span> Active Flood Extent (SAR-derived)
      </div>
      {polygons.isLoading && <div className="absolute right-2 bottom-2 z-10 rounded px-2 py-1" style={{ background: "rgba(255,255,255,0.95)", fontSize: "0.625rem" }}>Loading flood polygons…</div>}
      {polygons.isError && <div role="status" className="absolute right-2 bottom-2 z-10 rounded px-2 py-1" style={{ background: "rgba(255,255,255,0.95)", fontSize: "0.625rem", color: "#92400e" }}>Polygon preview unavailable</div>}
    </div>
  );
}

function PreflightMap({ params }: { params: AnalysisParams }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [loaded, setLoaded] = useState(false);
  const boundsValid = validStudyBounds(params);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: "preflight-background", type: "background", paint: { "background-color": "#E8ECEB" } }],
      },
      center: [76.36, 10.3],
      zoom: 9,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    map.on("load", () => {
      map.addSource("preflight-gray-basemap", {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        maxzoom: 16,
        attribution: "Esri, HERE, Garmin, © OpenStreetMap contributors",
      });
      map.addLayer({ id: "preflight-gray-layer", type: "raster", source: "preflight-gray-basemap", paint: { "raster-opacity": 0.9, "raster-saturation": -0.65 } });
      map.addSource("preflight-bounds", { type: "geojson", data: studyBoundsGeoJSON(params) });
      map.addLayer({ id: "preflight-bounds-fill", type: "fill", source: "preflight-bounds", paint: { "fill-color": "#0284C7", "fill-opacity": 0.1 } });
      map.addLayer({ id: "preflight-bounds-line", type: "line", source: "preflight-bounds", paint: { "line-color": "#0369A1", "line-width": 2, "line-dasharray": [2, 2] } });
      setLoaded(true);
    });
    return () => {
      map.remove();
      mapRef.current = null;
      setLoaded(false);
    };
    // The map is initialized once; bounds are updated by the following effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const source = map.getSource("preflight-bounds") as maplibregl.GeoJSONSource | undefined;
    source?.setData(studyBoundsGeoJSON(params));
    if (boundsValid) {
      const timer = window.setTimeout(() => map.fitBounds([[params.west, params.south], [params.east, params.north]], { padding: 46, maxZoom: 12, duration: 450 }), 240);
      return () => window.clearTimeout(timer);
    }
  }, [params.west, params.south, params.east, params.north, boundsValid, loaded]);

  return <div className="relative overflow-hidden rounded-lg border border-slate-200">
    <div ref={containerRef} className="h-[330px] w-full" />
    <div className="absolute bottom-2 left-2 rounded-md border border-white/80 bg-white/90 px-2 py-1 text-[10px] text-slate-700 shadow-sm">
      <span className="mr-1 text-sky-700">▧</span>Study area · live bounds
    </div>
    {!boundsValid && <div role="status" className="absolute right-2 top-2 rounded-md bg-white/95 px-2 py-1 text-[10px] text-amber-800 shadow-sm">Enter valid west/east and south/north bounds</div>}
  </div>;
}

function ResultPanel({ run, live }: { run: AnalysisRun; live?: AnalysisStatus }) {
  const r = run.result;
  const [drapeError, setDrapeError] = useState<string | null>(null);
  const polygons = useQuery({
    queryKey: ["analysis-geojson", run.id],
    queryFn: () => api.analysis.geojson(run.id),
    enabled: run.status === "completed" && !!r?.vectors?.available,
    staleTime: 10 * 60_000,
    retry: 1,
  });
  const openIn3D = async () => {
    setDrapeError(null);
    try {
      const response = polygons.data ? { data: polygons.data } : await polygons.refetch();
      const geojson = response.data;
      if (!geojson || !geojsonBounds(geojson)) throw new Error("This run has no valid flood polygons to display.");
      const st = useStore.getState();
      st.setDrapedInundation({ runId: run.id, geojson });
      st.setInundationRunId(run.id);
      st.setLayerVisible("inundation", true);
      st.setLayerVisible("terrain", true);
      const bounds = geojsonBounds(geojson)!;
      st.focusMapBounds(bounds[0][0], bounds[0][1], bounds[1][0], bounds[1][1]);
    } catch (error) {
      setDrapeError(error instanceof Error ? error.message : "Could not load polygons for the 3D map.");
    }
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
      <ResultMap key={run.id} run={run} />
      <table style={{ fontSize: "0.75rem", width: "100%", borderCollapse: "collapse" }}>
        <thead><tr style={{ textAlign: "left", color: "#687770", fontSize: "0.625rem", textTransform: "uppercase" }}><th>Measure</th><th style={{ textAlign: "right" }}>Area · km²</th></tr></thead>
        <tbody>{rows.map(([k, v]) => (
          <tr key={k} style={{ borderTop: "1px solid #EEF2EF" }}><td style={{ padding: "6px 0" }}>{k}</td><td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{v.toFixed(2)} km²</td></tr>
        ))}</tbody>
      </table>
      <details className="ux-disclosure text-xs text-text-secondary">
        <summary>Metric definitions & limitations</summary>
        <ul className="list-disc pl-5 pt-2 space-y-1">{rows.map(([k, , d]) => <li key={k}><b>{k}:</b> {d}</li>)}{r.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}</ul>
      </details>
      <div style={{ fontSize: "0.6875rem" }}>
        <b>Scenes:</b> {r.scene_counts.pre_event} pre-event, {r.scene_counts.event} event ·{" "}
        <b>Resolution:</b> {r.processing.scale_m} m · <b>Compute:</b> {r.processing.seconds}s · <b>Attempts:</b> {r.run.attempts}
      </div>
      <details className="ux-disclosure text-xs text-text-secondary"><summary>Acquisitions & datasets</summary><p className="pt-2">Event: {r.acquisition_dates.event.join(", ") || "—"}<br />Pre-event: {r.acquisition_dates.pre_event.join(", ") || "—"}<br />{Object.values(r.datasets).join(" · ")}</p></details>
      {r.vectors?.available ? (
        <button onClick={() => void openIn3D()} disabled={polygons.isFetching} title={polygons.isError ? "Retry loading polygons" : polygons.isFetching ? "Loading the analysis polygons" : "Show this analysis on the 3D map"} style={{ display: "inline-flex", alignItems: "center", gap: 7, alignSelf: "flex-start", background: polygons.data || polygons.isError ? "#0F766E" : "#94A3B8", color: "#fff", border: "none", borderRadius: 6, padding: "7px 10px", fontWeight: 600, fontSize: "0.75rem", cursor: polygons.isFetching ? "wait" : "pointer" }}>
          {polygons.isLoading ? <LoaderCircle size={14} className="animate-spin" /> : <MapPinned size={14} />}
          {polygons.isLoading ? "Preparing map…" : polygons.isError ? "Retry polygon load" : `Drape on 3D terrain map (${r.vectors.feature_count} polygons${r.vectors.truncated ? `, largest of ${r.vectors.total_polygons}` : ""})`}
        </button>
      ) : (
        <div style={{ fontSize: "0.6875rem", color: "#92400e" }}>No polygon output for this run{r.vectors?.reason ? `: ${r.vectors.reason}` : ""}. The raster tiles above are still valid.</div>
      )}
      {r.vectors?.available && polygons.isError && <div role="status" className="text-[0.6875rem] text-amber-800">Could not load the polygon file for this run. The raster analysis results remain available.</div>}
      {drapeError && <div role="alert" className="text-[0.6875rem] text-red-700">{drapeError}</div>}
      <a href={api.analysis.exportCsvUrl(run.id)} style={{ fontSize: "0.6875rem", color: "#0F766E", fontWeight: 600 }}>Download CSV</a>
    </div>
  );
}

export function AnalysisView() {
  const qc = useQueryClient();
  const [p, setP] = useState<AnalysisParams>(DEFAULTS);
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingMapRun, setLoadingMapRun] = useState<string | null>(null);

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

  const showRunOnMap = async (run: AnalysisRun) => {
    if (run.status !== "completed") return;
    setLoadingMapRun(run.id);
    setMsg(null);
    try {
      const [details, geojson] = await Promise.all([api.analysis.run(run.id), api.analysis.geojson(run.id)]);
      if (!details.result?.vectors?.available) throw new Error(details.result?.vectors?.reason || "This run has no polygon output.");
      qc.setQueryData(["analysis-geojson", run.id], geojson);
      const st = useStore.getState();
      st.setDrapedInundation({ runId: run.id, geojson });
      st.setInundationRunId(run.id);
      st.setLayerVisible("inundation", true);
      st.setLayerVisible("terrain", true);
      const bounds = geojsonBounds(geojson) ?? [[run.params.west, run.params.south], [run.params.east, run.params.north]];
      st.focusMapBounds(bounds[0][0], bounds[0][1], bounds[1][0], bounds[1][1]);
    } catch (error) {
      setMsg({ kind: "error", text: error instanceof Error ? error.message : "Could not load this run on the map." });
    } finally {
      setLoadingMapRun(null);
    }
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
            <div className="rounded-md border p-2.5" style={{ borderColor: "#E2E8F0", background: "#FAFCFB" }}>
              <div style={{ fontWeight: 700, fontSize: "0.625rem", textTransform: "uppercase", color: "#52635D", marginBottom: 8 }}>Radar parameters</div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Orbit"><select style={inputStyle} value={p.orbit} onChange={(e) => set("orbit", e.target.value as AnalysisParams["orbit"])}><option value="DESCENDING">Descending</option><option value="ASCENDING">Ascending</option><option value="ANY">Any (mixes geometries)</option></select></Field>
                <Field label="Resolution (m)" hint="10 is heavy"><select style={inputStyle} value={p.scale_m} onChange={(e) => set("scale_m", Number(e.target.value))}>{[10, 30, 60, 100].map((v) => <option key={v} value={v}>{v}</option>)}</select></Field>
                <Field label="VV threshold (dB)" hint="Exploratory; −16 is a demo value">{numInput("threshold_db", "0.5")}</Field>
                <Field label="Min. backscatter drop (dB)" hint="Event − pre ≤ −value counts as new water">{numInput("min_drop_db", "0.5")}</Field>
                <Field label="Speckle smoothing (m)" hint="0 = off; change detection is speckle-sensitive">{numInput("smooth_m", "10")}</Field>
              </div>
            </div>
            <div className="rounded-md border p-2.5" style={{ borderColor: "#E2E8F0", background: "#FAFCFB" }}>
              <div style={{ fontWeight: 700, fontSize: "0.625rem", textTransform: "uppercase", color: "#52635D", marginBottom: 8 }}>Terrain filters</div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="Max slope (°)" hint="0 disables">{numInput("max_slope_deg", "1")}</Field>
                <Field label="Permanent water ≥ (%)" hint="JRC occurrence">{numInput("permanent_occurrence_pct", "1")}</Field>
              </div>
            </div>
            <button onClick={submit} disabled={busy || invalid || (cap.data ? !cap.data.ready : false)}
              style={{ background: busy || invalid || (cap.data && !cap.data.ready) ? "#9ca3af" : "#0D9488", color: "#fff", borderRadius: 6, padding: "8px 10px", fontWeight: 600, fontSize: "0.8125rem", border: "none", cursor: busy || invalid ? "not-allowed" : "pointer" }}>
              {busy ? "Submitting…" : "Run analysis"}
            </button>
            {invalid && <div style={{ fontSize: "0.625rem", color: "#991b1b" }}>Fill every field with a valid value.</div>}
            {msg && <div role={msg.kind === "error" ? "alert" : "status"} style={{ fontSize: "0.6875rem", color: msg.kind === "error" ? "#991b1b" : "#155E59" }}>{msg.text}</div>}
          </div>

          <div className="rounded-lg p-3" style={{ background: "#fff", border: "1px solid #DCE4DD" }}>
            <div style={{ fontWeight: 700, fontSize: "0.6875rem", textTransform: "uppercase", color: "#687770", marginBottom: 6 }}>Run history</div>
            {runs.isLoading && <div style={{ fontSize: "0.6875rem", color: "#687770" }}>Loading…</div>}
            {runs.data && runs.data.runs.length === 0 && <div style={{ fontSize: "0.6875rem", color: "#687770" }}>No analyses yet.</div>}
            {runs.data?.runs.map((r) => <div key={r.id} className="flex items-center gap-1" style={{ padding: "3px 4px", borderRadius: 4, background: selected === r.id ? "#EEF4FF" : "transparent" }}>
              <button onClick={() => setSelected(r.id)} className="min-w-0 flex-1 text-left" style={{ padding: "3px 2px", border: "none", background: "transparent", cursor: "pointer", fontSize: "0.6875rem", color: "#26332F" }}>
                <span className="block truncate">{r.id} · {r.params.event_start}→{r.params.event_end}</span>
                <span className="inline-flex items-center gap-1" style={{ color: STATUS_COLOR[r.status], fontWeight: 600, fontSize: "0.625rem" }}>
                  {r.status === "queued" || r.status === "running" ? <LoaderCircle size={12} className="animate-spin" /> : r.status === "completed" ? <Check size={12} /> : <AlertCircle size={12} />}
                  {r.status}
                </span>
              </button>
              <button type="button" aria-label={`Load run ${r.id} on the 3D map`} title={r.status === "completed" ? "Load results on map" : "Available after the run completes"} disabled={r.status !== "completed" || loadingMapRun === r.id} onClick={() => void showRunOnMap(r)} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 text-teal-800 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-40">
                {loadingMapRun === r.id ? <LoaderCircle size={15} className="animate-spin" /> : <MapPinned size={15} />}
              </button>
            </div>)}
          </div>
        </div>

        <div className="rounded-lg p-4" style={{ background: "#fff", border: "1px solid #DCE4DD", minHeight: 300 }}>
          {!selected && <div className="flex flex-col gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-800">Study area preview</h2>
              <p className="mt-0.5 text-xs text-slate-500">Adjust the coordinates to check the analysis footprint before running.</p>
            </div>
            <PreflightMap params={p} />
          </div>}
          {selected && current.isLoading && <div style={{ fontSize: "0.75rem", color: "#687770" }}>Loading run…</div>}
          {selected && current.isError && <div role="alert" style={{ fontSize: "0.75rem", color: "#991b1b" }}>Could not load run {selected}.</div>}
          {current.data && <ResultPanel run={current.data} live={live.data} />}
        </div>
      </div>
    </div>
  );
}
