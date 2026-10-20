"use client";

import React, { useEffect, useRef, useState, useMemo } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, AnalysisParams, AnalysisRun, AnalysisStatus, APIError, InundationGeoJSON } from "@/lib/api";
import { useStore } from "@/lib/store";
import { useTheme } from "@/components/providers/ThemeProvider";
import {
  AlertCircle, Check, Info, LoaderCircle, MapPinned, SlidersHorizontal,
  X, Play, Satellite, Map as MapIcon, Crosshair, Maximize2, Layers, Plus, Minus, Download
} from "lucide-react";

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
    <label className="flex flex-col gap-1 text-[11px] text-slate-700 dark:text-slate-200">
      <span className="flex items-center justify-between gap-2 font-semibold">
        {label}
        {hint && <button type="button" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" title={hint} aria-label={`More information: ${hint}`}><Info size={13} /></button>}
      </span>
      {children}
    </label>
  );
}
const inputClass = "w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 focus:outline-none focus:border-teal-500 dark:border-neutral-800 dark:bg-neutral-950 dark:text-slate-100";

function ResultMap({ run }: { run: AnalysisRun }) {
  const ref = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [basemapMode, setBasemapMode] = useState<"satellite" | "topo">("satellite");
  const [showFlood, setShowFlood] = useState(true);
  const [showChange, setShowChange] = useState(false);
  const [showRoi, setShowRoi] = useState(true);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [hoveredInfo, setHoveredInfo] = useState<{
    area_m2?: number;
    coords?: [number, number];
  } | null>(null);

  const res = run.result;
  const p = res?.parameters ?? run.params;

  const polygons = useQuery({
    queryKey: ["analysis-geojson", run.id],
    queryFn: () => api.analysis.geojson(run.id),
    enabled: run.status === "completed" && !!res?.vectors?.available,
    staleTime: 10 * 60_000,
    retry: 1,
  });

  const roiBounds: [[number, number], [number, number]] = useMemo(() => {
    return [[p.west, p.south], [p.east, p.north]];
  }, [p.west, p.south, p.east, p.north]);

  const floodBounds = useMemo(() => {
    if (polygons.data) return geojsonBounds(polygons.data);
    return null;
  }, [polygons.data]);

  const centerLon = (p.west + p.east) / 2;
  const centerLat = (p.south + p.north) / 2;

  // Initialise map with fail-safe inline style and reliable raster basemaps pre-configured
  useEffect(() => {
    if (!ref.current || !res) return;
    setMapLoaded(false);

    const topoBaseUrl = isDark
      ? "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
      : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}";
    const topoLabelsUrl = isDark
      ? "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
      : null;

    const topoVisibility: "visible" | "none" = basemapMode === "topo" ? "visible" : "none";
    const satVisibility: "visible" | "none" = basemapMode === "satellite" ? "visible" : "none";

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: ref.current,
        style: {
          version: 8,
          sources: {
            "esri-sat-base": {
              type: "raster",
              tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
              tileSize: 256,
              maxzoom: 19,
              attribution: "Esri World Imagery",
            },
            "esri-sat-labels": {
              type: "raster",
              tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"],
              tileSize: 256,
              maxzoom: 19,
            },
            "esri-topo-base": {
              type: "raster",
              tiles: [topoBaseUrl],
              tileSize: 256,
              maxzoom: 19,
              attribution: "Esri, USGS, NOAA, © OpenStreetMap contributors",
            },
            ...(topoLabelsUrl
              ? {
                  "esri-topo-labels": {
                    type: "raster" as const,
                    tiles: [topoLabelsUrl],
                    tileSize: 256,
                    maxzoom: 19,
                  },
                }
              : {}),
          },
          layers: [
            {
              id: "canvas-bg",
              type: "background",
              paint: { "background-color": isDark ? "#0f172a" : "#f1f5f9" },
            },
            {
              id: "esri-topo-layer",
              type: "raster",
              source: "esri-topo-base",
              layout: { visibility: topoVisibility },
              paint: { "raster-opacity": 1.0 },
            },
            ...(topoLabelsUrl
              ? [
                  {
                    id: "esri-topo-labels-layer",
                    type: "raster" as const,
                    source: "esri-topo-labels",
                    layout: { visibility: topoVisibility },
                    paint: { "raster-opacity": 0.9 },
                  },
                ]
              : []),
            {
              id: "esri-sat-layer",
              type: "raster",
              source: "esri-sat-base",
              layout: { visibility: satVisibility },
              paint: { "raster-opacity": 1.0 },
            },
            {
              id: "esri-sat-labels-layer",
              type: "raster",
              source: "esri-sat-labels",
              layout: { visibility: satVisibility },
              paint: { "raster-opacity": 0.88 },
            },
          ],
        },
        center: [centerLon, centerLat],
        zoom: 9.8,
        attributionControl: false,
      });
    } catch (err) {
      console.error("MapLibre map creation error:", err);
      return;
    }

    mapRef.current = map;

    map.on("error", (e) => {
      console.debug("MapLibre tile notice:", e.error?.message);
    });

    map.on("load", () => {
      // 1. VV change detection layer
      if (res.tiles?.vv_change_db) {
        map.addSource("vvchange", { type: "raster", tiles: [res.tiles.vv_change_db], tileSize: 256 });
        map.addLayer({
          id: "vvchange",
          type: "raster",
          source: "vvchange",
          layout: { visibility: "none" },
          paint: { "raster-opacity": 0.75 },
        });
      }

      // 2. Active Flood Extent (GeoJSON Features)
      const initialGeoJSON = (polygons.data as GeoJSON.FeatureCollection | undefined) ?? { type: "FeatureCollection", features: [] };
      map.addSource("cand", { type: "geojson", data: initialGeoJSON });

      // Outer glow for instant visibility on dark satellite terrain
      map.addLayer({
        id: "cand-glow",
        type: "line",
        source: "cand",
        layout: { visibility: "visible" },
        paint: {
          "line-color": "#38bdf8",
          "line-width": 3.8,
          "line-opacity": 0.5,
        },
      });

      // Vibrant electric cyan flood fill
      map.addLayer({
        id: "cand-fill",
        type: "fill",
        source: "cand",
        layout: { visibility: "visible" },
        paint: {
          "fill-color": "#00b4d8",
          "fill-opacity": 0.78,
        },
      });

      // Sharp crisp outline
      map.addLayer({
        id: "cand-outline",
        type: "line",
        source: "cand",
        layout: { visibility: "visible" },
        paint: {
          "line-color": "#00f0ff",
          "line-width": 1.6,
          "line-opacity": 0.95,
        },
      });

      // 3. Study Area Bounding Box (ROI)
      map.addSource("roi", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "Polygon",
            coordinates: [[[p.west, p.south], [p.east, p.south], [p.east, p.north], [p.west, p.north], [p.west, p.south]]],
          },
        },
      });
      map.addLayer({
        id: "roi-fill",
        type: "fill",
        source: "roi",
        layout: { visibility: "visible" },
        paint: {
          "fill-color": "#0284c7",
          "fill-opacity": 0.05,
        },
      });
      map.addLayer({
        id: "roi-line",
        type: "line",
        source: "roi",
        layout: { visibility: "visible" },
        paint: {
          "line-color": "#38bdf8",
          "line-width": 2,
          "line-dasharray": [3, 2],
        },
      });

      // Interactive hover over flood patches
      map.on("mousemove", "cand-fill", (e) => {
        map.getCanvas().style.cursor = "pointer";
        if (e.features && e.features.length > 0) {
          const f = e.features[0];
          const area = (f.properties?.area_m2 as number | undefined) ?? (f.properties?.area as number | undefined);
          setHoveredInfo({
            area_m2: area,
            coords: [Number(e.lngLat.lng.toFixed(4)), Number(e.lngLat.lat.toFixed(4))],
          });
        }
      });
      map.on("mouseleave", "cand-fill", () => {
        map.getCanvas().style.cursor = "";
        setHoveredInfo(null);
      });

      setMapLoaded(true);

      // Fit bounds safely after canvas layout stabilizes
      window.setTimeout(() => {
        if (!mapRef.current) return;
        map.resize();
        try {
          map.fitBounds([[p.west, p.south], [p.east, p.north]], {
            padding: 36,
            maxZoom: 12,
            duration: 450,
          });
        } catch {
          // ignore
        }
      }, 150);
    });

    const resizeTimer1 = window.setTimeout(() => map.resize(), 100);
    const resizeTimer2 = window.setTimeout(() => map.resize(), 400);

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    if (ref.current) resizeObserver.observe(ref.current);

    return () => {
      window.clearTimeout(resizeTimer1);
      window.clearTimeout(resizeTimer2);
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.id, isDark]);

  // Sync GeoJSON polygons data whenever query resolves
  useEffect(() => {
    if (!mapLoaded || !polygons.data) return;
    const map = mapRef.current;
    const source = map?.getSource("cand") as maplibregl.GeoJSONSource | undefined;
    source?.setData(polygons.data as GeoJSON.FeatureCollection);
  }, [mapLoaded, polygons.data]);

  // Sync basemap mode (satellite vs topo)
  const switchBasemap = (mode: "satellite" | "topo") => {
    setBasemapMode(mode);
    const map = mapRef.current;
    if (!map) return;
    const isSat = mode === "satellite";
    if (map.getLayer("esri-sat-layer")) map.setLayoutProperty("esri-sat-layer", "visibility", isSat ? "visible" : "none");
    if (map.getLayer("esri-sat-labels-layer")) map.setLayoutProperty("esri-sat-labels-layer", "visibility", isSat ? "visible" : "none");
    if (map.getLayer("esri-topo-layer")) map.setLayoutProperty("esri-topo-layer", "visibility", !isSat ? "visible" : "none");
    if (map.getLayer("esri-topo-labels-layer")) map.setLayoutProperty("esri-topo-labels-layer", "visibility", !isSat ? "visible" : "none");
  };

  // Sync layer visibility toggles
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const floodVis = showFlood ? "visible" : "none";
    if (map.getLayer("cand-fill")) map.setLayoutProperty("cand-fill", "visibility", floodVis);
    if (map.getLayer("cand-outline")) map.setLayoutProperty("cand-outline", "visibility", floodVis);
    if (map.getLayer("cand-glow")) map.setLayoutProperty("cand-glow", "visibility", floodVis);

    const roiVis = showRoi ? "visible" : "none";
    if (map.getLayer("roi-line")) map.setLayoutProperty("roi-line", "visibility", roiVis);
    if (map.getLayer("roi-fill")) map.setLayoutProperty("roi-fill", "visibility", roiVis);

    if (map.getLayer("vvchange")) map.setLayoutProperty("vvchange", "visibility", showChange ? "visible" : "none");
  }, [showFlood, showRoi, showChange, mapLoaded]);

  const zoomToFlood = () => {
    const map = mapRef.current;
    if (!map) return;
    if (floodBounds) {
      map.fitBounds(floodBounds, { padding: 48, maxZoom: 14, duration: 650 });
    } else {
      map.fitBounds(roiBounds, { padding: 36, duration: 650 });
    }
  };

  const zoomToROI = () => {
    const map = mapRef.current;
    if (!map) return;
    map.fitBounds(roiBounds, { padding: 36, duration: 650 });
  };

  return (
    <div className="relative w-full h-[460px] lg:h-[540px] rounded-xl border border-slate-200 dark:border-neutral-800 overflow-hidden shadow-md bg-slate-100 dark:bg-neutral-900">
      <div
        ref={ref}
        className="w-full h-full"
        style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
      />

      {/* Top Left: Interactive Layer Toggles */}
      <div className="absolute top-3 left-3 z-10 flex flex-col gap-1.5">
        <label className="flex items-center gap-2 rounded-lg px-3 py-1.5 bg-white/95 dark:bg-neutral-900/90 text-slate-800 dark:text-slate-100 border border-slate-200/80 dark:border-neutral-700/80 text-[11px] font-semibold backdrop-blur-md shadow-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showFlood}
            onChange={(e) => setShowFlood(e.target.checked)}
            className="accent-cyan-500 rounded"
          />
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 rounded-xs bg-[#00b4d8] border border-[#00f0ff] shadow-xs" />
            <span>Active Flood Extent</span>
            {res?.areas_km2?.candidate_inundation_final != null && (
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-cyan-100 dark:bg-cyan-950/80 text-cyan-800 dark:text-cyan-300 font-mono font-bold">
                {res.areas_km2.candidate_inundation_final.toFixed(2)} km²
              </span>
            )}
          </span>
        </label>

        <div className="flex items-center gap-1.5">
          <label className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 bg-white/90 dark:bg-neutral-900/85 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-neutral-700/80 text-[10px] backdrop-blur-md shadow-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showRoi}
              onChange={(e) => setShowRoi(e.target.checked)}
              className="accent-sky-500 rounded"
            />
            <span>Study Footprint (ROI)</span>
          </label>

          <label className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 bg-white/90 dark:bg-neutral-900/85 text-slate-700 dark:text-slate-200 border border-slate-200/80 dark:border-neutral-700/80 text-[10px] backdrop-blur-md shadow-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showChange}
              onChange={(e) => setShowChange(e.target.checked)}
              className="accent-teal-500 rounded"
            />
            <span>VV Change (dB)</span>
          </label>
        </div>
      </div>

      {/* Top Right: Basemap Selector & Quick Zoom Utilities */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
        {/* Basemap Switcher */}
        <div className="flex items-center bg-white/95 dark:bg-neutral-900/90 border border-slate-200/80 dark:border-neutral-700/80 rounded-lg p-0.5 shadow-sm backdrop-blur-md text-xs">
          <button
            type="button"
            onClick={() => switchBasemap("satellite")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${
              basemapMode === "satellite"
                ? "bg-teal-700 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <Satellite size={12} />
            <span>Satellite</span>
          </button>
          <button
            type="button"
            onClick={() => switchBasemap("topo")}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${
              basemapMode === "topo"
                ? "bg-teal-700 text-white shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            <MapIcon size={12} />
            <span>Topo</span>
          </button>
        </div>

        {/* Quick Zoom Actions & In/Out buttons */}
        <div className="flex items-center bg-white/95 dark:bg-neutral-900/90 border border-slate-200/80 dark:border-neutral-700/80 rounded-lg p-0.5 shadow-sm backdrop-blur-md text-xs">
          <button
            type="button"
            onClick={zoomToFlood}
            title="Focus zoom to active flood extent"
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <Crosshair size={12} className="text-cyan-600 dark:text-cyan-400" />
            <span className="hidden sm:inline">Focus Flood</span>
          </button>
          <button
            type="button"
            onClick={zoomToROI}
            title="Reset zoom to full study footprint"
            className="flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <Maximize2 size={12} />
            <span className="hidden sm:inline">Full ROI</span>
          </button>
          <span className="w-px h-3.5 bg-slate-200 dark:bg-neutral-700 mx-0.5" />
          <button
            type="button"
            onClick={() => mapRef.current?.zoomIn()}
            title="Zoom In"
            className="p-1 rounded-md text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <Plus size={13} />
          </button>
          <button
            type="button"
            onClick={() => mapRef.current?.zoomOut()}
            title="Zoom Out"
            className="p-1 rounded-md text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors"
          >
            <Minus size={13} />
          </button>
        </div>
      </div>

      {/* Bottom Left: Spatial Context Pill */}
      <div className="absolute bottom-3 left-3 z-10 rounded-lg px-3 py-1.5 bg-black/75 text-white/90 border border-white/10 text-[10px] backdrop-blur-md shadow-md flex items-center gap-2">
        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        <span className="font-semibold">Sentinel-1 SAR C-Band</span>
        <span className="text-white/40">·</span>
        <span className="text-white/70">
          Chalakudy Basin ({p.west.toFixed(2)}°–{p.east.toFixed(2)}°E, {p.south.toFixed(2)}°–{p.north.toFixed(2)}°N)
        </span>
      </div>

      {/* Bottom Right: Interactive Hover Inspector */}
      {hoveredInfo && (
        <div className="absolute bottom-3 right-3 z-10 rounded-lg px-3 py-1.5 bg-cyan-950/90 text-cyan-100 border border-cyan-400/30 text-[10px] backdrop-blur-md shadow-lg flex items-center gap-2 animate-in fade-in duration-150">
          <span className="font-semibold text-cyan-300">Active Inundation</span>
          <span className="text-cyan-400/40">·</span>
          <span>
            {hoveredInfo.area_m2 ? `${(hoveredInfo.area_m2 / 10000).toFixed(2)} ha (${Math.round(hoveredInfo.area_m2)} m²)` : "SAR Inundated Zone"}
          </span>
          {hoveredInfo.coords && (
            <span className="font-mono text-cyan-300/80">
              [{hoveredInfo.coords[1]}°N, {hoveredInfo.coords[0]}°E]
            </span>
          )}
        </div>
      )}

      {polygons.isLoading && (
        <div className="absolute right-3 bottom-3 z-10 rounded-md px-2.5 py-1 bg-white/90 dark:bg-black/80 text-slate-700 dark:text-slate-200 text-[10px] backdrop-blur-md shadow-sm flex items-center gap-1.5">
          <LoaderCircle size={12} className="animate-spin text-teal-600" />
          <span>Loading flood polygons…</span>
        </div>
      )}
      {polygons.isError && (
        <div role="status" className="absolute right-3 bottom-3 z-10 rounded-md px-2.5 py-1 bg-amber-500/90 text-white text-[10px] backdrop-blur-md shadow-sm">
          Polygon preview unavailable
        </div>
      )}
    </div>
  );
}

function PreflightMap({ params }: { params: AnalysisParams }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [basemapMode, setBasemapMode] = useState<"satellite" | "topo">("satellite");
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const boundsValid = validStudyBounds(params);

  const centerLon = (params.west + params.east) / 2;
  const centerLat = (params.south + params.north) / 2;

  useEffect(() => {
    if (!containerRef.current) return;
    const topoBaseUrl = isDark
      ? "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
      : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}";
    const topoLabelsUrl = isDark
      ? "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}"
      : null;

    const topoVisibility: "visible" | "none" = basemapMode === "topo" ? "visible" : "none";
    const satVisibility: "visible" | "none" = basemapMode === "satellite" ? "visible" : "none";

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: containerRef.current,
        style: {
          version: 8,
          sources: {
            "preflight-sat-base": {
              type: "raster",
              tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
              tileSize: 256,
              maxzoom: 19,
              attribution: "Esri World Imagery",
            },
            "preflight-sat-labels": {
              type: "raster",
              tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}"],
              tileSize: 256,
              maxzoom: 19,
            },
            "preflight-topo-base": {
              type: "raster",
              tiles: [topoBaseUrl],
              tileSize: 256,
              maxzoom: 19,
              attribution: "Esri, USGS, NOAA, © OpenStreetMap contributors",
            },
            ...(topoLabelsUrl
              ? {
                  "preflight-topo-labels": {
                    type: "raster" as const,
                    tiles: [topoLabelsUrl],
                    tileSize: 256,
                    maxzoom: 19,
                  },
                }
              : {}),
          },
          layers: [
            {
              id: "preflight-background",
              type: "background",
              paint: { "background-color": isDark ? "#0f172a" : "#f1f5f9" },
            },
            {
              id: "preflight-topo-layer",
              type: "raster",
              source: "preflight-topo-base",
              layout: { visibility: topoVisibility },
              paint: { "raster-opacity": 1.0 },
            },
            ...(topoLabelsUrl
              ? [
                  {
                    id: "preflight-topo-labels-layer",
                    type: "raster" as const,
                    source: "preflight-topo-labels",
                    layout: { visibility: topoVisibility },
                    paint: { "raster-opacity": 0.9 },
                  },
                ]
              : []),
            {
              id: "preflight-sat-layer",
              type: "raster",
              source: "preflight-sat-base",
              layout: { visibility: satVisibility },
              paint: { "raster-opacity": 1.0 },
            },
            {
              id: "preflight-sat-labels-layer",
              type: "raster",
              source: "preflight-sat-labels",
              layout: { visibility: satVisibility },
              paint: { "raster-opacity": 0.88 },
            },
          ],
        },
        center: [centerLon, centerLat],
        zoom: 9.5,
        attributionControl: false,
      });
    } catch (err) {
      console.error("Preflight map creation error:", err);
      return;
    }

    mapRef.current = map;

    map.on("load", () => {
      map.addSource("preflight-bounds", { type: "geojson", data: studyBoundsGeoJSON(params) });
      map.addLayer({
        id: "preflight-bounds-fill",
        type: "fill",
        source: "preflight-bounds",
        paint: { "fill-color": "#38bdf8", "fill-opacity": 0.12 },
      });
      map.addLayer({
        id: "preflight-bounds-line",
        type: "line",
        source: "preflight-bounds",
        paint: { "line-color": "#00f0ff", "line-width": 2, "line-dasharray": [3, 2] },
      });
      setLoaded(true);

      window.setTimeout(() => {
        if (!mapRef.current) return;
        map.resize();
        if (boundsValid) {
          try {
            map.fitBounds([[params.west, params.south], [params.east, params.north]], {
              padding: 40,
              maxZoom: 12,
              duration: 400,
            });
          } catch {
            // ignore
          }
        }
      }, 150);
    });

    const t1 = window.setTimeout(() => map.resize(), 100);
    const t2 = window.setTimeout(() => map.resize(), 400);

    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      map.remove();
      mapRef.current = null;
      setLoaded(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDark]);

  // Sync basemap mode toggle
  const switchBasemap = (mode: "satellite" | "topo") => {
    setBasemapMode(mode);
    const map = mapRef.current;
    if (!map) return;
    const isSat = mode === "satellite";
    if (map.getLayer("preflight-sat-layer")) map.setLayoutProperty("preflight-sat-layer", "visibility", isSat ? "visible" : "none");
    if (map.getLayer("preflight-sat-labels-layer")) map.setLayoutProperty("preflight-sat-labels-layer", "visibility", isSat ? "visible" : "none");
    if (map.getLayer("preflight-topo-layer")) map.setLayoutProperty("preflight-topo-layer", "visibility", !isSat ? "visible" : "none");
    if (map.getLayer("preflight-topo-labels-layer")) map.setLayoutProperty("preflight-topo-labels-layer", "visibility", !isSat ? "visible" : "none");
  };

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !loaded) return;
    const source = map.getSource("preflight-bounds") as maplibregl.GeoJSONSource | undefined;
    source?.setData(studyBoundsGeoJSON(params));
    if (boundsValid) {
      const timer = window.setTimeout(() => map.fitBounds([[params.west, params.south], [params.east, params.north]], { padding: 40, maxZoom: 12, duration: 400 }), 200);
      return () => window.clearTimeout(timer);
    }
  }, [params.west, params.south, params.east, params.north, boundsValid, loaded]);

  return (
    <div className="relative w-full h-[380px] overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 shadow-md bg-slate-100 dark:bg-neutral-900">
      <div
        ref={containerRef}
        className="w-full h-full"
        style={{ width: "100%", height: "100%", position: "absolute", inset: 0 }}
      />

      {/* Basemap selector pill */}
      <div className="absolute top-3 right-3 z-10 flex items-center bg-white/95 dark:bg-neutral-900/90 border border-slate-200/80 dark:border-neutral-700/80 rounded-lg p-0.5 shadow-sm backdrop-blur-md text-xs">
        <button
          type="button"
          onClick={() => switchBasemap("satellite")}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${
            basemapMode === "satellite"
              ? "bg-teal-700 text-white shadow-xs"
              : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <Satellite size={12} />
          <span>Satellite</span>
        </button>
        <button
          type="button"
          onClick={() => switchBasemap("topo")}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${
            basemapMode === "topo"
              ? "bg-teal-700 text-white shadow-xs"
              : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
          }`}
        >
          <MapIcon size={12} />
          <span>Topo</span>
        </button>
      </div>

      <div className="absolute bottom-3 left-3 rounded-lg border border-white/10 bg-black/75 px-3 py-1.5 text-[10px] text-white/90 shadow-md backdrop-blur-md flex items-center gap-1.5">
        <span className="text-cyan-400">▧</span>
        <span className="font-semibold">Study Area · Live Bounds</span>
      </div>
      {!boundsValid && (
        <div role="status" className="absolute right-3 top-3 rounded-md bg-white/95 dark:bg-slate-900/95 border border-amber-300 dark:border-amber-800 px-2.5 py-1 text-[10px] text-amber-800 dark:text-amber-300 shadow-sm">
          Enter valid west/east and south/north bounds
        </div>
      )}
    </div>
  );
}

function ResultPanel({ run, live }: { run: AnalysisRun; live?: AnalysisStatus }) {
  const r = run.result;
  if (run.status === "failed") {
    return (
      <div role="alert" className="rounded-md p-3 bg-rose-50 border border-rose-200 text-rose-800 dark:bg-rose-950/40 dark:border-rose-900 dark:text-rose-200 text-xs">
        <b>Analysis failed</b> ({run.error_code ?? "error"}) after {run.attempts} attempt{run.attempts === 1 ? "" : "s"}.<div className="mt-1">{run.error}</div>
      </div>
    );
  }
  if (run.status !== "completed" || !r) {
    const st = live?.status ?? run.status;
    const secs = st === "queued" ? live?.queued_seconds : live?.running_seconds;
    return <div role="status" className="text-xs text-slate-500 dark:text-slate-400">Run {run.id} is <b style={{ color: STATUS_COLOR[st] }}>{st}</b>{secs != null && ` (${Math.round(secs)} s)`}{live && live.attempts > 1 && ` · attempt ${live.attempts}`}. You can leave this page; the run continues on the server.</div>;
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
    <div className="flex flex-col gap-4">
      <div className="rounded-lg px-3 py-2 bg-blue-50/80 border border-blue-200/80 text-blue-900 dark:bg-blue-950/40 dark:border-blue-900/50 dark:text-blue-200 text-xs">
        <span className="font-bold text-blue-950 dark:text-blue-100">Active Flood Extent</span> · SAR change detection derived from the selected observation window.
      </div>

      <ResultMap key={run.id} run={run} />

      {/* Constrained Metrics Table (centered with dotted separator lines) */}
      <div className="w-full max-w-4xl mx-auto space-y-4 pt-2">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr className="text-left text-slate-400 dark:text-slate-500 text-[10px] uppercase font-bold tracking-wider border-b border-slate-200 dark:border-neutral-800 pb-1.5">
              <th className="pb-2 font-bold">Measure</th>
              <th className="pb-2 text-right font-bold">Area · km²</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k} className="border-b border-dotted border-slate-300 dark:border-neutral-700/80 text-slate-800 dark:text-slate-200 hover:bg-slate-50/70 dark:hover:bg-neutral-800/40 transition-colors">
                <td className="py-2.5 font-medium">{k}</td>
                <td className="py-2.5 text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {v.toFixed(2)} km²
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Supporting Details and Metadata */}
        <div className="flex flex-col gap-2.5 pt-1 text-xs text-slate-600 dark:text-slate-300">
          <details className="ux-disclosure text-xs text-text-secondary">
            <summary className="cursor-pointer font-medium hover:text-slate-900 dark:hover:text-slate-100">Metric definitions & limitations</summary>
            <ul className="list-disc pl-5 pt-2 space-y-1 text-slate-600 dark:text-slate-400">
              {rows.map(([k, , d]) => <li key={k}><b>{k}:</b> {d}</li>)}
              {r.limitations.map((limitation) => <li key={limitation}>{limitation}</li>)}
            </ul>
          </details>

          <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-3 gap-y-1 pt-1.5 border-t border-slate-100 dark:border-neutral-800/80">
            <span><b>Scenes:</b> {r.scene_counts.pre_event} pre-event, {r.scene_counts.event} event</span>
            <span>·</span>
            <span><b>Resolution:</b> {r.processing.scale_m} m</span>
            <span>·</span>
            <span><b>Compute:</b> {r.processing.seconds}s</span>
            <span>·</span>
            <span><b>Attempts:</b> {r.run.attempts}</span>
          </div>

          <details className="ux-disclosure text-xs text-text-secondary">
            <summary className="cursor-pointer font-medium hover:text-slate-900 dark:hover:text-slate-100">Acquisitions & datasets</summary>
            <p className="pt-2 text-[11px] text-slate-600 dark:text-slate-400">
              Event: {r.acquisition_dates.event.join(", ") || "—"}<br />
              Pre-event: {r.acquisition_dates.pre_event.join(", ") || "—"}<br />
              {Object.values(r.datasets).join(" · ")}
            </p>
          </details>
        </div>
      </div>
    </div>
  );
}

export function AnalysisView() {
  const qc = useQueryClient();
  const { setAnalysisDrawerOpen } = useStore();
  const [p, setP] = useState<AnalysisParams>(DEFAULTS);
  const [selected, setSelected] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadingMapRun, setLoadingMapRun] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleSetDrawerOpen = (open: boolean) => {
    setDrawerOpen(open);
    setAnalysisDrawerOpen(open);
  };

  useEffect(() => {
    return () => setAnalysisDrawerOpen(false);
  }, [setAnalysisDrawerOpen]);

  const cap = useQuery({ queryKey: ["analysis-cap"], queryFn: api.analysis.capabilities, retry: 1 });
  const runs = useQuery({ queryKey: ["analysis-runs"], queryFn: api.analysis.runs, retry: 1, refetchInterval: (q) => (q.state.data?.runs.some((r) => r.status === "queued" || r.status === "running") ? 3000 : false) });
  const current = useQuery({ queryKey: ["analysis-run", selected], queryFn: () => api.analysis.run(selected!), enabled: !!selected });
  // Poll the cheap status endpoint (no result body) while the job is queued/running.
  const live = useQuery({
    queryKey: ["analysis-status", selected], queryFn: () => api.analysis.status(selected!), enabled: !!selected,
    refetchInterval: (q) => (q.state.data && !q.state.data.terminal ? (q.state.data.poll_after_ms ?? 3000) : false),
  });
  const liveStatus = live.data?.status;

  // Auto-select latest completed or available run
  useEffect(() => {
    if (!selected && runs.data?.runs && runs.data.runs.length > 0) {
      const completed = runs.data.runs.find((r) => r.status === "completed") ?? runs.data.runs[0];
      if (completed) setSelected(completed.id);
    }
  }, [runs.data?.runs, selected]);

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
    <input type="number" step={step} className={inputClass} value={Number.isNaN(p[k] as number) ? "" : (p[k] as number)} onChange={(e) => set(k, num(e.target.value) as never)} />
  );

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50 text-[#26332F] dark:bg-black dark:text-slate-100">
      <div className="max-w-7xl mx-auto p-6 space-y-4">
        {/* Workspace Action Toolbar (Consolidated Command Row) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-neutral-800">
          <div>
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-50 flex items-center gap-2">
              <span>Flood Analysis Workspace</span>
              {selected && current.data && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200">
                  Run: {selected}
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Sentinel-1 SAR change detection · High-resolution active flood extent
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Quick Run Switcher Dropdown */}
            {runs.data && runs.data.runs.length > 0 && (
              <div className="flex items-center gap-1.5 bg-white dark:bg-neutral-800 border border-slate-200 dark:border-neutral-700 rounded-lg px-2.5 py-1.5 text-xs shadow-xs">
                <span className="text-[10px] uppercase font-bold text-slate-400">Run:</span>
                <select
                  value={selected ?? ""}
                  onChange={(e) => setSelected(e.target.value || null)}
                  className="bg-transparent text-slate-800 dark:text-slate-200 font-semibold focus:outline-none cursor-pointer"
                >
                  {runs.data.runs.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.id} ({r.params.event_start} · {r.status})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Consolidated Command 1: Download CSV */}
            {selected && current.data?.status === "completed" && (
              <a
                href={api.analysis.exportCsvUrl(current.data.id)}
                download={`flood_analysis_${current.data.id}.csv`}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-neutral-700 transition-colors shadow-xs cursor-pointer"
                title="Download run metrics and area breakdown as CSV"
              >
                <Download size={13} className="text-teal-600 dark:text-teal-400" />
                <span>Download CSV</span>
              </a>
            )}

            {/* Consolidated Command 2: Drape on 3D Map */}
            {current.data?.status === "completed" && (
              <button
                type="button"
                onClick={() => void showRunOnMap(current.data!)}
                disabled={loadingMapRun === current.data.id}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-teal-700 dark:text-teal-400 hover:bg-slate-50 dark:hover:bg-neutral-700 transition-colors shadow-xs cursor-pointer"
                title="Drape flood extents on 3D terrain map"
              >
                {loadingMapRun === current.data.id ? <LoaderCircle size={14} className="animate-spin" /> : <MapPinned size={14} />}
                <span>Drape on 3D Map</span>
              </button>
            )}

            {/* Consolidated Command 3: Parameters & Filters */}
            <button
              type="button"
              onClick={() => handleSetDrawerOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-teal-700 hover:bg-teal-600 text-white transition-colors shadow-xs cursor-pointer"
            >
              <SlidersHorizontal size={14} />
              <span>Parameters & Filters</span>
            </button>
          </div>
        </div>

        {cap.data && !cap.data.ready && (
          <div role="alert" className="rounded-lg p-3 bg-amber-50 border border-amber-200 text-amber-900 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-200 text-xs">
            <b>Earth Engine is not configured on the server</b> — analyses cannot run yet.
            <ul className="pl-4 list-disc mt-1">{cap.data.blocking_reasons.map((r) => <li key={r}>{r}</li>)}</ul>
          </div>
        )}
        {cap.isError && <div role="alert" className="text-xs text-rose-700 dark:text-rose-400">Backend unreachable: capabilities could not be loaded.</div>}

        {/* ─── Polished Full-Width Map and Results Container ─── */}
        <div className="w-full rounded-2xl p-6 bg-white dark:bg-neutral-900 border-0 shadow-lg dark:shadow-2xl min-h-[350px]">
          {!selected && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-100">Study area preview</h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Adjust coordinates in the Parameters drawer to inspect analysis footprint before running.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleSetDrawerOpen(true)}
                  className="text-xs text-teal-700 dark:text-teal-400 font-semibold hover:underline"
                >
                  Open Parameters Form →
                </button>
              </div>
              <PreflightMap params={p} />
            </div>
          )}
          {selected && current.isLoading && (
            <div className="flex items-center justify-center h-64 text-xs text-slate-500 dark:text-slate-400">
              <LoaderCircle size={18} className="animate-spin mr-2 text-teal-600" /> Loading run {selected}…
            </div>
          )}
          {selected && current.isError && (
            <div role="alert" className="text-xs text-rose-700 dark:text-rose-400 p-4">
              Could not load run {selected}.
            </div>
          )}
          {current.data && <ResultPanel run={current.data} live={live.data} />}
        </div>
      </div>

      {/* ─── Slide-over Side Drawer for Parameters & Filters ─── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-[80] overflow-hidden">
          {/* Backdrop overlay */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-xs transition-opacity z-[80]"
            onClick={() => handleSetDrawerOpen(false)}
          />

          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10 z-[81]">
            <div className="w-screen max-w-md bg-white dark:bg-neutral-900 shadow-2xl flex flex-col h-full relative z-[82]">
              {/* Drawer Header */}
              <div className="p-4 border-b border-slate-200 dark:border-neutral-800 flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <SlidersHorizontal size={15} className="text-teal-600" />
                    <span>Analysis Parameters & Filters</span>
                  </h2>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Sentinel-1 SAR study area, thresholds, and terrain
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleSetDrawerOpen(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Drawer Body (Scrollable) */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Study area (lon/lat box) */}
                <div className="rounded-xl p-3.5 flex flex-col gap-3 bg-slate-50/70 border border-slate-200/80 dark:bg-neutral-950/60 dark:border-neutral-800">
                  <div className="font-bold text-[11px] uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Study area (lon/lat box)
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="West">{numInput("west")}</Field>
                    <Field label="East">{numInput("east")}</Field>
                    <Field label="South">{numInput("south")}</Field>
                    <Field label="North">{numInput("north")}</Field>
                  </div>
                </div>

                {/* Date windows */}
                <div className="rounded-xl p-3.5 flex flex-col gap-3 bg-slate-50/70 border border-slate-200/80 dark:bg-neutral-950/60 dark:border-neutral-800">
                  <div className="font-bold text-[11px] uppercase tracking-wider text-slate-600 dark:text-slate-300">
                    Date windows
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Pre-event start">
                      <input type="date" className={inputClass} value={p.pre_start} onChange={(e) => set("pre_start", e.target.value)} />
                    </Field>
                    <Field label="Pre-event end">
                      <input type="date" className={inputClass} value={p.pre_end} onChange={(e) => set("pre_end", e.target.value)} />
                    </Field>
                    <Field label="Event start">
                      <input type="date" className={inputClass} value={p.event_start} onChange={(e) => set("event_start", e.target.value)} />
                    </Field>
                    <Field label="Event end">
                      <input type="date" className={inputClass} value={p.event_end} onChange={(e) => set("event_end", e.target.value)} />
                    </Field>
                  </div>
                </div>

                {/* Radar parameters */}
                <div className="rounded-xl p-3.5 flex flex-col gap-3 bg-slate-50/70 border border-slate-200/80 dark:bg-neutral-950/60 dark:border-neutral-800">
                  <div className="font-bold text-[10px] uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                    Radar parameters
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Orbit">
                      <select className={inputClass} value={p.orbit} onChange={(e) => set("orbit", e.target.value as AnalysisParams["orbit"])}>
                        <option value="DESCENDING">Descending</option>
                        <option value="ASCENDING">Ascending</option>
                        <option value="ANY">Any (mixes geometries)</option>
                      </select>
                    </Field>
                    <Field label="Resolution (m)" hint="10 is heavy">
                      <select className={inputClass} value={p.scale_m} onChange={(e) => set("scale_m", Number(e.target.value))}>
                        {[10, 30, 60, 100].map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </Field>
                    <Field label="VV threshold (dB)" hint="Exploratory; −16 is a demo value">
                      {numInput("threshold_db", "0.5")}
                    </Field>
                    <Field label="Min. backscatter drop (dB)" hint="Event − pre ≤ −value counts as new water">
                      {numInput("min_drop_db", "0.5")}
                    </Field>
                    <div className="col-span-2">
                      <Field label="Speckle smoothing (m)" hint="0 = off; change detection is speckle-sensitive">
                        {numInput("smooth_m", "10")}
                      </Field>
                    </div>
                  </div>
                </div>

                {/* Terrain filters */}
                <div className="rounded-xl p-3.5 flex flex-col gap-3 bg-slate-50/70 border border-slate-200/80 dark:bg-neutral-950/60 dark:border-neutral-800">
                  <div className="font-bold text-[10px] uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
                    Terrain filters
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Max slope (°)" hint="0 disables">
                      {numInput("max_slope_deg", "1")}
                    </Field>
                    <Field label="Permanent water ≥ (%)" hint="JRC occurrence">
                      {numInput("permanent_occurrence_pct", "1")}
                    </Field>
                  </div>
                </div>

                {/* Run History List inside Drawer */}
                <div className="rounded-xl p-3.5 bg-slate-50/70 border border-slate-200/80 dark:bg-neutral-950/60 dark:border-neutral-800">
                  <div className="font-bold text-[11px] uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2">
                    Run History
                  </div>
                  {runs.isLoading && <div className="text-xs text-slate-500">Loading runs…</div>}
                  {runs.data && runs.data.runs.length === 0 && <div className="text-xs text-slate-500">No analyses yet.</div>}
                  <div className="space-y-1 max-h-48 overflow-y-auto">
                    {runs.data?.runs.map((r) => (
                      <div
                        key={r.id}
                        className={`flex items-center gap-1 p-1 rounded-lg transition-colors ${
                          selected === r.id
                            ? "bg-teal-50 dark:bg-neutral-800 border border-teal-200 dark:border-teal-700"
                            : "hover:bg-white dark:hover:bg-neutral-800/40"
                        }`}
                      >
                        <button
                          onClick={() => {
                            setSelected(r.id);
                            handleSetDrawerOpen(false);
                          }}
                          className="min-w-0 flex-1 text-left px-2 py-1 text-xs text-slate-800 dark:text-slate-200"
                        >
                          <span className="block truncate font-medium">
                            {r.id} · {r.params.event_start}→{r.params.event_end}
                          </span>
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold" style={{ color: STATUS_COLOR[r.status] }}>
                            {r.status === "queued" || r.status === "running" ? <LoaderCircle size={11} className="animate-spin" /> : r.status === "completed" ? <Check size={11} /> : <AlertCircle size={11} />}
                            {r.status}
                          </span>
                        </button>
                        <button
                          type="button"
                          aria-label={`Load run ${r.id} on the 3D map`}
                          title={r.status === "completed" ? "Load results on map" : "Available after the run completes"}
                          disabled={r.status !== "completed" || loadingMapRun === r.id}
                          onClick={() => void showRunOnMap(r)}
                          className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-slate-200 dark:border-neutral-700 text-teal-700 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {loadingMapRun === r.id ? <LoaderCircle size={14} className="animate-spin" /> : <MapPinned size={14} />}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Drawer Footer Actions with extra padding and separation */}
              <div className="p-5 pb-8 border-t border-slate-200 dark:border-neutral-800 bg-slate-50 dark:bg-neutral-950 flex flex-col gap-2.5">
                <button
                  onClick={async () => {
                    await submit();
                    handleSetDrawerOpen(false);
                  }}
                  disabled={busy || invalid || (cap.data ? !cap.data.ready : false)}
                  className="w-full rounded-xl bg-teal-600 hover:bg-teal-500 disabled:bg-slate-400 text-white font-semibold text-xs py-3 px-4 transition-all shadow-md hover:shadow-lg disabled:cursor-not-allowed cursor-pointer flex items-center justify-center gap-2"
                >
                  {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Play size={15} />}
                  <span>{busy ? "Submitting…" : "Run Analysis"}</span>
                </button>
                {invalid && <div className="text-[10px] text-rose-700 dark:text-rose-400 text-center font-medium">Fill every field with a valid value.</div>}
                {msg && <div role={msg.kind === "error" ? "alert" : "status"} className={`text-xs text-center ${msg.kind === "error" ? "text-rose-700 dark:text-rose-400" : "text-teal-700 dark:text-teal-400"}`}>{msg.text}</div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
