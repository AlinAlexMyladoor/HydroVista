"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useStore } from "@/lib/store";
import { useTheme } from "@/components/providers/ThemeProvider";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { LAYER_DEFS, assetLayerGroup } from "@/lib/layers";
import { TERRARIUM_URL, TERRARIUM_ATTRIBUTION, elevationAt } from "@/lib/dem";
import { Layers, Navigation, Mountain, Plus, Minus, Compass, Info, AlertTriangle, RefreshCw, Moon, Sun } from "lucide-react";

if (typeof window !== "undefined") {
  maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");
}

const BASIN_CENTER: [number, number] = [76.3358, 10.3006];
const BASIN_BOUNDS: [[number, number], [number, number]] = [[75.9, 9.9], [77.0, 10.7]];
const MAP_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE || "/style-liberty.json";
const DEFAULT_PITCH_3D = 62;
const DEFAULT_BEARING_3D = 70; // camera faces east-north-east: Chalakudy plain in front, Western Ghats rising behind
const CENTER_3D: [number, number] = [76.42, 10.27];
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const DEM_SOURCE = "terrain-dem";
const HILLSHADE_SOURCE = "terrain-hillshade-dem";
const SATELLITE_BASE_SOURCE = "satellite-base";
const DEM_TIMEOUT_MS = 20000;

function sanitizeExpression(expr: unknown): unknown {
  if (!Array.isArray(expr)) return expr;
  const [op, ...args] = expr;
  if ((op === "<=" || op === "<" || op === ">=" || op === ">") && args.length === 2) {
    const [left, right] = args;
    if (Array.isArray(left) && left[0] === "get" && typeof left[1] === "string" && typeof right === "number") {
      const fallback = op === "<=" || op === "<" ? 999999 : -999999;
      return [op, ["to-number", left, fallback], right];
    }
    if (typeof left === "string" && typeof right === "number") {
      const fallback = op === "<=" || op === "<" ? 999999 : -999999;
      return [op, ["to-number", ["get", left], fallback], right];
    }
  }
  return [op, ...args.map(sanitizeExpression)];
}

const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

const qualityBadge = (q: string) => (q === "good" ? "✓ Good" : q === "partial" ? "⚠ Partial" : "✗ Limited");

type StyleGroups = Record<"rivers" | "roads" | "buildings" | "boundaries", string[]>;

const btn: React.CSSProperties = {
  width: 30, height: 30, background: "white", border: "1px solid #DCE4DD",
  cursor: "pointer", color: "#26332F", display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 4,
};

export function FloodMap() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const satelliteImageUrl = useRef<string | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const groupsRef = useRef<StyleGroups>({ rivers: [], roads: [], buildings: [], boundaries: [] });
  const demCounts = useRef({ ok: 0, failed: 0 });
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapFocusError, setMapFocusError] = useState<string | null>(null);
  const [showLegend, setShowLegend] = useState(true);
  const [showLayerMenu, setShowLayerMenu] = useState(false);
  const [readout, setReadout] = useState<{ lon: number; lat: number; elev: number | null } | null>(null);
  const [initKey, setInitKey] = useState(0);

  const {
    selectedAssetId, setSelectedAssetId, riskFilter, assetTypeFilter, visibleLayers, toggleLayer, language,
    mapIs3D, setMapIs3D, terrainExaggeration, setTerrainExaggeration, mapPitch, setMapPitch, mapBearing, setMapBearing,
    terrainStatus, terrainInfo, setTerrainStatus, inundationRunId,
    mapFocusRequest,
  } = useStore();
  const en = language === "en";
  const { resolvedTheme, setTheme } = useTheme();
  const toggleTheme = () => {
    const next = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.classList.toggle("dark", next === "dark");
    window.localStorage.setItem("hydrovista-theme", next);
  };

  const { data: exposureData, isLoading: exposureLoading, isError: exposureError, refetch: refetchExposure } = useQuery({
    queryKey: ["exposure-list", riskFilter, assetTypeFilter, "map"],
    queryFn: () =>
      api.exposure.list({
        risk_category: riskFilter === "all" ? undefined : riskFilter,
        asset_type: assetTypeFilter === "all" ? undefined : assetTypeFilter,
        page: 1,
        page_size: 200,
      }),
    retry: 2,
  });
  const { data: reportsData } = useQuery({ queryKey: ["reports-list"], queryFn: () => api.reports.list(), retry: false, staleTime: 30_000 });

  // Candidate-inundation polygons from a completed Earth Engine run (selected in Flood Analysis).
  const { data: inundationRun } = useQuery({
    queryKey: ["analysis-run", inundationRunId], queryFn: () => api.analysis.run(inundationRunId!), enabled: !!inundationRunId, retry: 1,
  });
  const { data: inundationGeo, isError: inundationError, isFetching: inundationLoading } = useQuery({
    queryKey: ["analysis-geojson", inundationRunId], queryFn: () => api.analysis.geojson(inundationRunId!),
    enabled: !!inundationRunId && inundationRun?.status === "completed", retry: 1, staleTime: 10 * 60_000,
  });

  // ─── Initialise map once ───────────────────────────────────────────────────
  useEffect(() => {
    if (!mapContainer.current) return;
    let map: maplibregl.Map;
    try {
      const s = useStore.getState();
      const styleUrl = MAP_STYLE.startsWith("http") && MAP_STYLE.includes("openfreemap.org/styles/liberty")
        ? "/style-liberty.json"
        : MAP_STYLE;

      map = new maplibregl.Map({
        container: mapContainer.current,
        style: styleUrl,
        center: s.mapIs3D ? CENTER_3D : BASIN_CENTER,
        zoom: s.mapIs3D ? 10.4 : 11,
        pitch: s.mapIs3D ? DEFAULT_PITCH_3D : 0,
        bearing: s.mapIs3D ? DEFAULT_BEARING_3D : 0,
        maxPitch: 80,
        maxBounds: BASIN_BOUNDS,
        attributionControl: false,
        transformRequest: (url, resourceType) => {
          if (resourceType === "Style" && url.includes("tiles.openfreemap.org/styles/liberty")) {
            return { url: "/style-liberty.json" };
          }
          return { url };
        },
      });
    } catch {
      queueMicrotask(() => setMapError("Failed to initialise the map renderer. Check that WebGL is enabled in your browser."));
      return;
    }
    mapRef.current = map;
    demCounts.current = { ok: 0, failed: 0 };
    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 100, unit: "metric" }), "bottom-left");

    // Catch and resolve any missing style images (e.g. malformed road shields in vector tiles)
    map.on("styleimagemissing", (e) => {
      const id = e.id;
      if (!map.hasImage(id)) {
        map.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
      }
    });

    // Real DEM tile accounting
    map.on("data", (e) => {
      const ev = e as unknown as { sourceId?: string; dataType?: string; tile?: unknown };
      if ((ev.sourceId === DEM_SOURCE || ev.sourceId === HILLSHADE_SOURCE) && ev.dataType === "source" && ev.tile) {
        demCounts.current.ok++;
        useStore.getState().setTerrainStatus("ready", `${demCounts.current.ok} DEM tiles loaded`);
      }
    });
    map.on("error", (e) => {
      const ev = e as unknown as { sourceId?: string; error?: { message?: string } };
      if (ev.sourceId === DEM_SOURCE || ev.sourceId === HILLSHADE_SOURCE) {
        demCounts.current.failed++;
        if (demCounts.current.ok === 0) {
          useStore.getState().setTerrainStatus("error", `DEM tile request failed: ${ev.error?.message ?? "network error"}`);
        }
      } else {
        console.warn("MapLibre:", ev.error?.message);
      }
    });
    const demTimer = window.setTimeout(() => {
      if (demCounts.current.ok === 0 && useStore.getState().terrainStatus === "loading") {
        useStore.getState().setTerrainStatus("error", "DEM tiles did not load (timeout). Check network access to s3.amazonaws.com.");
      }
    }, DEM_TIMEOUT_MS);

    map.on("load", () => {
      // classify real OSM base-style layers so toggles act on them
      const g: StyleGroups = { rivers: [], roads: [], buildings: [], boundaries: [] };
      for (const l of map.getStyle().layers ?? []) {
        const sl = (l as { "source-layer"?: string })["source-layer"];
        if (!sl) continue;
        if (sl === "water" || sl === "waterway" || sl === "water_name") g.rivers.push(l.id);
        else if (sl === "transportation" || sl === "transportation_name") g.roads.push(l.id);
        else if (sl === "building") g.buildings.push(l.id);
        else if (sl === "boundary") g.boundaries.push(l.id);
      }
      groupsRef.current = g;

      // Ensure any shield filters without fallbacks are safely typed and icon-images avoid missing keys
      for (const l of map.getStyle().layers ?? []) {
        const filter = (l as { filter?: unknown }).filter;
        if (filter && ["highway-shield-non-us", "highway-shield-us-interstate", "road_shield_us"].includes(l.id)) {
          const sanitized = sanitizeExpression(filter);
          map.setFilter(l.id, sanitized as maplibregl.FilterSpecification);
          if (l.id === "highway-shield-non-us") {
            map.setLayoutProperty(l.id, "icon-image", [
              "match",
              ["to-number", ["get", "ref_length"], 0],
              [1, 2, 3, 4, 5, 6],
              ["concat", "road_", ["to-string", ["get", "ref_length"]]],
              ""
            ]);
          } else if (l.id === "highway-shield-us-interstate" || l.id === "road_shield_us") {
            map.setLayoutProperty(l.id, "icon-image", [
              "match",
              ["to-number", ["get", "ref_length"], 0],
              [1, 2, 3, 4, 5, 6],
              ["concat", ["get", "network"], "_", ["to-string", ["get", "ref_length"]]],
              ""
            ]);
          }
        }
      }

      // 3D terrain mesh source
      map.addSource(DEM_SOURCE, {
        type: "raster-dem",
        tiles: [TERRARIUM_URL],
        encoding: "terrarium",
        tileSize: 256,
        maxzoom: 12,
        attribution: TERRARIUM_ATTRIBUTION,
      });

      // Dedicated 2D hillshade texture source (prevents MapLibre terrain-hillshade source collision)
      map.addSource(HILLSHADE_SOURCE, {
        type: "raster-dem",
        tiles: [TERRARIUM_URL],
        encoding: "terrarium",
        tileSize: 256,
        maxzoom: 12,
      });

      const firstSymbol = map.getStyle().layers?.find((l) => l.type === "symbol")?.id;
      map.addLayer(
        {
          id: "terrain-hillshade",
          type: "hillshade",
          source: HILLSHADE_SOURCE,
          paint: {
            "hillshade-exaggeration": 0.55,
            "hillshade-shadow-color": "#2f4a45",
            "hillshade-highlight-color": "#ffffff",
            "hillshade-accent-color": "#5b6f68",
          },
        },
        firstSymbol
      );

      map.addSource(SATELLITE_BASE_SOURCE, {
        type: "raster",
        tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"],
        tileSize: 256,
        maxzoom: 19,
        attribution: "Esri World Imagery",
      });
      map.addLayer({
        id: "satellite-base",
        type: "raster",
        source: SATELLITE_BASE_SOURCE,
        paint: { "raster-opacity": 0.38, "raster-saturation": 0.1, "raster-contrast": 0.08 },
      });
      const atmosphericMap = map as unknown as { setFog?: (config: Record<string, unknown>) => void };
      atmosphericMap.setFog?.({
        range: [0.6, 10],
        color: "#d9edf0",
        highColor: "#9bc9da",
        horizonBlend: 0.18,
        spaceColor: "#122d3b",
        starIntensity: 0.05,
      });
      map.setLight({ anchor: "viewport", color: "#fff4df", intensity: 0.35, position: [1.5, 210, 35] });

      // Reuse the style's OSM building source for true 3D footprints.
      const buildingSourceLayer = map.getStyle().layers?.find((layer) => {
        const candidate = layer as { type?: string; source?: string; "source-layer"?: string };
        return candidate.type === "fill" && candidate.source && candidate["source-layer"] === "building";
      }) as ({ source?: string; "source-layer"?: string } | undefined);
      if (buildingSourceLayer?.source && buildingSourceLayer["source-layer"] && !map.getLayer("buildings-3d")) {
        map.addLayer({
          id: "buildings-3d",
          type: "fill-extrusion",
          source: buildingSourceLayer.source,
          "source-layer": buildingSourceLayer["source-layer"],
          minzoom: 13,
          layout: { visibility: visibleLayers.has("buildings") ? "visible" : "none" },
          paint: {
            "fill-extrusion-color": "#B8C4BE",
            "fill-extrusion-height": ["coalesce", ["get", "render_height"], ["get", "height"], 0],
            "fill-extrusion-base": ["coalesce", ["get", "render_min_height"], ["get", "min_height"], 0],
            "fill-extrusion-opacity": 0.82,
          },
        });
      }

      // Candidate inundation follows the terrain and also rises as translucent flood water.
      map.addSource("inundation-source", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "inundation-extrusion", type: "fill-extrusion", source: "inundation-source",
        paint: {
          "fill-extrusion-color": [
            "interpolate", ["linear"], ["coalesce", ["to-number", ["get", "depth"]], 2],
            0, "#8CF4F0", 1, "#37C8D0", 3, "#168BC2", 6, "#1456A0",
          ],
          "fill-extrusion-height": 4,
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 0.64,
        },
      });
      map.addLayer({
        id: "inundation-fill", type: "fill", source: "inundation-source",
        paint: { "fill-color": "#F97316", "fill-opacity": 0.55 },
      });
      map.addLayer({
        id: "inundation-outline", type: "line", source: "inundation-source",
        paint: { "line-color": "#C2410C", "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.4, 14, 1.4], "line-opacity": 0.9 },
      });

      map.addSource("assets-source", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "assets-circle",
        type: "circle",
        source: "assets-source",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 8, 4, 12, 7, 15, 10],
          "circle-color": ["match", ["get", "risk_category"], "critical", "#C83F3A", "high", "#c2410c", "medium", "#E7A23B", "low", "#15803d", "#6b7280"],
          "circle-stroke-width": 1.5,
          "circle-stroke-color": "#ffffff",
          "circle-opacity": 0.92,
          "circle-pitch-alignment": "map",
        },
      });
      map.addLayer({
        id: "assets-label",
        type: "symbol",
        source: "assets-source",
        minzoom: 13,
        layout: {
          "text-field": ["get", "asset_name"],
          "text-font": ["Noto Sans Regular"],
          "text-size": 11,
          "text-offset": [0, 1.4],
          "text-anchor": "top",
        },
        paint: { "text-color": "#26332F", "text-halo-color": "#FFFFFF", "text-halo-width": 1.5 },
      });
      map.addSource("reports-source", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
      map.addLayer({
        id: "reports-circle",
        type: "circle",
        source: "reports-source",
        paint: { "circle-radius": 6, "circle-color": "#3299C6", "circle-stroke-width": 1.5, "circle-stroke-color": "#FFFFFF", "circle-opacity": 0.85 },
      });

      map.on("click", "assets-circle", (e) => {
        const feat = e.features?.[0];
        if (!feat) return;
        const props = feat.properties as Record<string, unknown>;
        const coords = (feat.geometry as GeoJSON.Point).coordinates.slice() as [number, number];
        setSelectedAssetId(String(props.asset_id ?? ""));
        popupRef.current?.remove();
        const rawRisk = String(props.risk_category ?? "unknown").toLowerCase();
        const riskCat = ["critical", "high", "medium", "low"].includes(rawRisk) ? rawRisk : "unknown";
        const score = props.risk_score != null && Number.isFinite(Number(props.risk_score)) ? Number(props.risk_score).toFixed(2) : "—";
        const elev = props.terrain_elevation_m != null && props.terrain_elevation_m !== "null"
          ? `${Number(props.terrain_elevation_m).toFixed(0)} m` : "Unavailable";
        const rain = props.rainfall_accumulation_mm != null && props.rainfall_accumulation_mm !== "null"
          ? `${Number(props.rainfall_accumulation_mm).toFixed(1)} mm` : "Unavailable";
        let warn = "";
        try { warn = (JSON.parse(String(props.data_warnings || "[]")) as string[])[0] ?? ""; } catch {}
        popupRef.current = new maplibregl.Popup({ offset: [0, -4], className: "custom-map-popup", maxWidth: "260px" })
          .setLngLat(coords)
          .setHTML(`
            <div class="hv-map-popup">
              <div class="hv-map-popup-heading">
                <span class="hv-risk-badge hv-risk-${riskCat}">${esc(riskCat)} risk</span>
                <span class="hv-map-popup-score">${score}</span>
              </div>
              <h4 class="hv-map-popup-title">${esc(props.asset_name || "Infrastructure facility")}</h4>
              <p class="hv-map-popup-type">${esc(String(props.asset_type ?? "").replace(/_/g, " "))}</p>
              <div class="hv-map-popup-metrics">
                <div><span>Elevation</span><b>${esc(elev)}</b></div>
                <div><span>24h rainfall</span><b>${esc(rain)}</b></div>
                <div><span>Data quality</span><b>${esc(qualityBadge(String(props.data_quality ?? "")))}</b></div>
              </div>
              ${warn ? `<div class="hv-map-popup-warning">${esc(warn)}</div>` : ""}
            </div>`)
          .addTo(map);
      });
      map.on("mouseenter", "assets-circle", () => (map.getCanvas().style.cursor = "pointer"));
      map.on("mouseleave", "assets-circle", () => (map.getCanvas().style.cursor = ""));

      setMapLoaded(true);
    });

    // camera → store (throttled to animation frames)
    let raf = 0;
    map.on("move", () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const st = useStore.getState();
        const p = Math.round(map.getPitch());
        const b = Math.round(map.getBearing());
        if (p !== st.mapPitch) st.setMapPitch(p);
        if (b !== st.mapBearing) st.setMapBearing(b);
      });
    });

    // elevation inspection from the same DEM
    let hoverTimer = 0;
    let ctrl: AbortController | null = null;
    map.on("mousemove", (e) => {
      window.clearTimeout(hoverTimer);
      const { lng, lat } = e.lngLat;
      hoverTimer = window.setTimeout(async () => {
        ctrl?.abort();
        ctrl = new AbortController();
        try {
          const elev = await elevationAt(lng, lat, 11, ctrl.signal);
          setReadout({ lon: lng, lat, elev });
        } catch {}
      }, 120);
    });
    map.on("mouseout", () => setReadout(null));

    const ro = new ResizeObserver(() => map.resize());
    ro.observe(mapContainer.current);

    return () => {
      window.clearTimeout(demTimer);
      window.clearTimeout(hoverTimer);
      ctrl?.abort();
      cancelAnimationFrame(raf);
      ro.disconnect();
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initKey]);

  // ─── Terrain on/off + exaggeration ─────────────────────────────────────────
  const terrainLayerOn = visibleLayers.has("terrain");
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    try {
      if (mapIs3D && terrainLayerOn) map.setTerrain({ source: DEM_SOURCE, exaggeration: terrainExaggeration });
      else map.setTerrain(null);
      map.setLayoutProperty("terrain-hillshade", "visibility", terrainLayerOn ? "visible" : "none");
    } catch (e) {
      setTerrainStatus("error", `Could not enable terrain: ${(e as Error).message}`);
    }
  }, [mapLoaded, mapIs3D, terrainLayerOn, terrainExaggeration, setTerrainStatus]);

  // ─── Layer visibility (every toggle drives a real layer) ───────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const setGroup = (ids: string[], on: boolean) =>
      ids.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, "visibility", on ? "visible" : "none"));
    const g = groupsRef.current;
    setGroup(g.rivers, visibleLayers.has("rivers"));
    setGroup(g.roads, visibleLayers.has("roads"));
    setGroup(g.buildings, visibleLayers.has("buildings"));
    setGroup(g.boundaries, visibleLayers.has("boundaries"));
    if (map.getLayer("buildings-3d")) map.setLayoutProperty("buildings-3d", "visibility", visibleLayers.has("buildings") ? "visible" : "none");

    const groups = (["hospitals", "schools", "shelters", "other-assets"] as const).filter((x) => visibleLayers.has(x));
    const filter: maplibregl.FilterSpecification = ["in", ["get", "asset_group"], ["literal", groups]];
    map.setFilter("assets-circle", filter);
    map.setFilter("assets-label", filter);
    map.setPaintProperty(
      "assets-circle",
      "circle-color",
      visibleLayers.has("flood-risk")
        ? ["match", ["get", "risk_category"], "critical", "#C83F3A", "high", "#c2410c", "medium", "#E7A23B", "low", "#15803d", "#6b7280"]
        : "#155E59"
    );
    map.setLayoutProperty("reports-circle", "visibility", visibleLayers.has("reports") ? "visible" : "none");
    for (const id of ["inundation-extrusion", "inundation-fill", "inundation-outline"]) {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibleLayers.has("inundation") ? "visible" : "none");
    }
  }, [visibleLayers, mapLoaded]);

  // ─── Inundation polygons → source (+ frame the analysed area) ──────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const src = map.getSource("inundation-source") as maplibregl.GeoJSONSource | undefined;
    if (!src) return;
    type GeoData = Parameters<maplibregl.GeoJSONSource["setData"]>[0];
    src.setData((inundationGeo as unknown as GeoData) ?? ({ type: "FeatureCollection", features: [] } as GeoData));
  }, [inundationGeo, mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    const p = inundationRun?.result?.parameters;
    if (!map || !mapLoaded || !inundationGeo || !p) return;
    // maxBounds (the basin) still clamps the camera; this only frames the analysed box when it overlaps.
    map.fitBounds([[p.west, p.south], [p.east, p.north]], { padding: 60, duration: 900, pitch: useStore.getState().mapIs3D ? 62 : 0 });
  }, [inundationGeo, inundationRun, mapLoaded]);

  // ─── Satellite imagery (Sentinel-2 via backend proxy; real image or an explicit error) ───
  const [satMsg, setSatMsg] = useState<string | null>(null);
  const satOn = visibleLayers.has("satellite");
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    const removeSat = () => {
      if (map.getLayer("sentinel-raster")) map.removeLayer("sentinel-raster");
      if (map.getSource("sentinel-src")) map.removeSource("sentinel-src");
      if (satelliteImageUrl.current) URL.revokeObjectURL(satelliteImageUrl.current);
      satelliteImageUrl.current = null;
    };
    const setSatelliteBaseOpacity = (opacity: number) => {
      if (map.getLayer("satellite-base")) map.setPaintProperty("satellite-base", "raster-opacity", opacity);
    };
    if (!satOn) { removeSat(); setSatelliteBaseOpacity(0.38); setSatMsg(null); return; }
    // World Imagery is a real satellite basemap and remains usable while the
    // optional Sentinel-2 scene service is unavailable.
    setSatelliteBaseOpacity(0.9);
    const ac = new AbortController();
    setSatMsg(en ? "Requesting latest Sentinel-2 scene…" : "Sentinel-2 ചിത്രം അഭ്യർത്ഥിക്കുന്നു…");
    (async () => {
      try {
        const r = await fetch(`${API_BASE}/api/v1/satellite/image?sensor=s2`, { signal: ac.signal });
        if (!r.ok) {
          let detail = `HTTP ${r.status}`;
          try { detail = (await r.json()).detail ?? detail; } catch {}
          throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail));
        }
        const bb = (r.headers.get("X-Scene-Bbox") ?? "").split(",").map(Number);
        const satelliteStatus = r.headers.get("X-Satellite-Status");
        const acquired = r.headers.get("X-Scene-Acquired") ?? "unknown";
        if (bb.length !== 4 || bb.some((v) => !Number.isFinite(v)) || bb[0] >= bb[2] || bb[1] >= bb[3]) throw new Error("Backend returned no valid image bounds");
        if (satelliteStatus === "unavailable") {
          removeSat();
          setSatelliteBaseOpacity(0.9);
          setSatMsg(null);
          return;
        }
        removeSat();
        const url = URL.createObjectURL(await r.blob());
        satelliteImageUrl.current = url;
        const [w, s2, e, n] = bb;
        map.addSource("sentinel-src", { type: "image", url, coordinates: [[w, n], [e, n], [e, s2], [w, s2]] });
        map.addLayer({ id: "sentinel-raster", type: "raster", source: "sentinel-src", paint: { "raster-opacity": 0.9 } }, map.getLayer("assets-circle") ? "assets-circle" : undefined);
        setSatelliteBaseOpacity(0.38);
        const source = r.headers.get("X-Satellite-Source") ?? "CDSE";
        setSatMsg(`${en ? `Sentinel-2 ${source === "Google Earth Engine" ? "composite" : "L2A"}, acquired` : "Sentinel-2, ലഭിച്ചത്"} ${new Date(acquired).toLocaleString()} · ${en ? "clouds masked (transparent)" : "മേഘം ഒഴിവാക്കി"}`);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        removeSat();
        setSatelliteBaseOpacity(0.9);
        setSatMsg(null);
      }
    })();
    return () => ac.abort();
  }, [satOn, mapLoaded, en]);

  // ─── Data → GeoJSON ────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !exposureData?.items) return;
    const src = map.getSource("assets-source") as maplibregl.GeoJSONSource | undefined;
    src?.setData({
      type: "FeatureCollection",
      features: exposureData.items
        .filter((i) => i.lat != null && i.lon != null)
        .map((i) => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [i.lon, i.lat] },
          properties: {
            ...i,
            asset_group: assetLayerGroup(i.asset_type),
            evidence: JSON.stringify(i.evidence ?? []),
            data_warnings: JSON.stringify(i.data_warnings ?? []),
          },
        })),
    });
  }, [exposureData, mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !Array.isArray(reportsData)) return;
    const src = map.getSource("reports-source") as maplibregl.GeoJSONSource | undefined;
    src?.setData({
      type: "FeatureCollection",
      features: (reportsData as Record<string, unknown>[])
        .filter((r) => typeof r.lat === "number" && typeof r.lon === "number")
        .map((r) => ({
          type: "Feature" as const,
          geometry: { type: "Point" as const, coordinates: [Number(r.lon), Number(r.lat)] as [number, number] },
          properties: { ...r },
        })),
    });
  }, [reportsData, mapLoaded]);

  // Fly directly to selected assets with a composed 3D camera move.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !selectedAssetId || !exposureData?.items) return;
    if (mapFocusRequest?.assetId === selectedAssetId) return;
    const a = exposureData.items.find((x) => x.asset_id === selectedAssetId);
    if (a && Number.isFinite(a.lat) && Number.isFinite(a.lon) && Math.abs(a.lat) <= 90 && Math.abs(a.lon) <= 180) {
      setMapIs3D(true);
      map.flyTo({ center: [a.lon, a.lat], zoom: 16, pitch: 60, bearing: 30, speed: 0.75, curve: 1.35, duration: 2200, essential: true });
      setMapPitch(60);
      setMapBearing(30);
    }
  }, [selectedAssetId, exposureData, mapLoaded, mapFocusRequest, setMapIs3D, setMapPitch, setMapBearing]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !mapFocusRequest) return;
    const { lat, lon } = mapFocusRequest;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
    try {
      const pitch = mapFocusRequest.bounds ? 50 : 60;
      const bearing = mapFocusRequest.bounds ? 20 : 30;
      if (mapFocusRequest.bounds) {
        map.fitBounds(mapFocusRequest.bounds, {
          padding: { top: 90, right: 90, bottom: 90, left: 90 },
          maxZoom: 14,
          pitch,
          bearing,
          duration: 2200,
          essential: true,
        });
      } else {
        map.flyTo({ center: [lon, lat], zoom: 16, pitch, bearing, speed: 0.75, curve: 1.35, duration: 2200, essential: true });
      }
      setMapIs3D(true);
      setMapPitch(pitch);
      setMapBearing(bearing);
      setMapFocusError(null);
    } catch {
      setMapFocusError(en ? "Could not move the map to this location." : "ഈ സ്ഥലത്തേക്ക് ഭൂപടം നീക്കാനായില്ല.");
    }
  }, [mapFocusRequest, mapLoaded, setMapIs3D, setMapPitch, setMapBearing, en]);

  // ─── Controls ──────────────────────────────────────────────────────────────
  const set3D = useCallback((next: boolean) => {
    setMapIs3D(next);
    mapRef.current?.easeTo({ pitch: next ? DEFAULT_PITCH_3D : 0, bearing: next ? DEFAULT_BEARING_3D : 0, center: next ? CENTER_3D : BASIN_CENTER, zoom: next ? 10.4 : 11, duration: 900 });
    if (next) { setMapPitch(DEFAULT_PITCH_3D); setMapBearing(DEFAULT_BEARING_3D); }
  }, [setMapIs3D, setMapPitch, setMapBearing]);

  const resetView = useCallback(() => {
    mapRef.current?.flyTo({ center: mapIs3D ? CENTER_3D : BASIN_CENTER, zoom: mapIs3D ? 10.4 : 11, pitch: mapIs3D ? DEFAULT_PITCH_3D : 0, bearing: mapIs3D ? DEFAULT_BEARING_3D : 0, speed: 1.0 });
    if (mapIs3D) { setMapPitch(DEFAULT_PITCH_3D); setMapBearing(DEFAULT_BEARING_3D); }
  }, [mapIs3D, setMapPitch, setMapBearing]);

  const retryTerrain = () => {
    setTerrainStatus("loading", "Requesting DEM tiles…");
    setInitKey((k) => k + 1); // rebuild map → re-request DEM tiles
  };

  if (mapError) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-[#F7F8F4]">
        <div className="text-center p-6 max-w-sm">
          <AlertTriangle style={{ width: 40, height: 40, color: "#E7A23B", margin: "0 auto 12px" }} />
          <h3 style={{ fontWeight: 600, color: "#26332F", marginBottom: 6 }}>{en ? "Map unavailable" : "ഭൂപടം ലഭ്യമല്ല"}</h3>
          <p style={{ fontSize: "0.75rem", color: "#687770" }}>{mapError}</p>
          <button onClick={() => { setMapError(null); setInitKey((k) => k + 1); }} style={{ marginTop: 10, ...btn, width: "auto", padding: "0 12px" }}>
            <RefreshCw style={{ width: 12, height: 12, marginRight: 4 }} /> {en ? "Retry" : "വീണ്ടും"}
          </button>
        </div>
      </div>
    );
  }

  const statusColor = terrainStatus === "ready" ? "#15803d" : terrainStatus === "error" ? "#C83F3A" : "#E7A23B";
  const label = { fontSize: "0.5625rem", color: "#687770" } as const;

  return (
    <div className="relative w-full h-full overflow-hidden" style={{ background: "#DCEFF3" }}>
      <div ref={mapContainer} className="w-full h-full" />
      <div className="map-atmosphere" aria-hidden="true" />

      {(exposureLoading || !mapLoaded) && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-md px-3 py-1.5"
          style={{ background: "rgba(255,255,255,0.95)", border: "1px solid #DCE4DD", fontSize: "0.6875rem", color: "#687770" }} role="status">
          <span className="animate-spin">⟳</span>
          {!mapLoaded ? (en ? "Loading map…" : "ഭൂപടം ലോഡ് ചെയ്യുന്നു…") : (en ? "Loading infrastructure data…" : "ഡാറ്റ ലോഡ് ചെയ്യുന്നു…")}
        </div>
      )}
      {mapFocusError && <div className="absolute top-3 right-3 z-30 rounded-md border border-rose-200 bg-white px-3 py-2 text-xs text-rose-700 shadow dark:border-rose-900 dark:bg-slate-900 dark:text-rose-300" role="alert">{mapFocusError}</div>}
      {exposureError && (
        <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-md px-3 py-1.5"
          style={{ background: "#fffbeb", border: "1px solid #fde68a", fontSize: "0.6875rem", color: "#92400e" }} role="alert">
          <AlertTriangle style={{ width: 12, height: 12 }} />
          {en ? "Backend unreachable — no facility data." : "ബാക്കെൻഡ് ലഭ്യമല്ല."}
          <button onClick={() => refetchExposure()} style={{ textDecoration: "underline", background: "none", border: "none", cursor: "pointer", color: "#155E59" }}>
            {en ? "Retry" : "വീണ്ടും"}
          </button>
        </div>
      )}

      {/* Title card */}
      <div className="absolute top-3 left-3 z-10 rounded-md px-3 py-2 map-glass"
        style={{ background: "rgba(255,255,255,0.95)", border: "1px solid #DCE4DD", boxShadow: "0 2px 8px rgba(21,94,89,0.10)" }}>
        <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#26332F" }}>{en ? "Chalakudy River Basin" : "ചാലക്കുടിപ്പുഴ തടം"}</div>
        <div style={{ fontSize: "0.5625rem", color: "#687770" }}>{en ? "Thrissur, Ernakulam, Kerala" : "തൃശ്ശൂർ, എറണാകുളം, കേരളം"}</div>
      </div>

      {/* 2D / 3D */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1 rounded-lg p-1 map-glass">
        {([false, true] as const).map((v) => (
          <button key={String(v)} onClick={() => set3D(v)} aria-pressed={mapIs3D === v}
            style={{ padding: "0.3125rem 0.75rem", fontSize: "0.75rem", fontWeight: 600, border: "none", borderRadius: 5, cursor: "pointer",
              background: mapIs3D === v ? "#155E59" : "white", color: mapIs3D === v ? "white" : "#687770" }}>
            {v ? "3D" : "2D"}
          </button>
        ))}
        <button
          onClick={toggleTheme}
          className="flex items-center justify-center rounded transition-colors duration-200"
          style={{ width: 28, height: 28, border: "none", cursor: "pointer", color: "var(--color-text-secondary)", background: "transparent" }}
          title={resolvedTheme === "dark" ? "Use light theme" : "Use dark theme"}
          aria-label={resolvedTheme === "dark" ? "Use light theme" : "Use dark theme"}
        >
          {resolvedTheme === "dark" ? <Sun style={{ width: 14, height: 14 }} /> : <Moon style={{ width: 14, height: 14 }} />}
        </button>
      </div>

      {/* Zoom / compass / reset / layers */}
      <div className="absolute top-14 right-3 z-10 flex flex-col gap-1.5 rounded-lg p-1 map-glass">
        <button style={btn} onClick={() => mapRef.current?.zoomIn()} aria-label="Zoom in" title="Zoom in"><Plus style={{ width: 14, height: 14 }} /></button>
        <button style={btn} onClick={() => mapRef.current?.zoomOut()} aria-label="Zoom out" title="Zoom out"><Minus style={{ width: 14, height: 14 }} /></button>
        <button style={btn} onClick={() => mapRef.current?.resetNorthPitch({ duration: 600 })} aria-label="Reset bearing and pitch" title="Reset north & pitch">
          <Compass style={{ width: 14, height: 14, transform: `rotate(${-mapBearing}deg)` }} />
        </button>
        <button style={{ ...btn, color: "#155E59" }} onClick={resetView} aria-label="Reset to basin view" title="Reset to basin view"><Navigation style={{ width: 14, height: 14 }} /></button>
        <button style={{ ...btn, color: "#155E59", background: showLayerMenu ? "#E8F0EA" : "white" }} onClick={() => setShowLayerMenu((s) => !s)}
          aria-label="Map layers" aria-expanded={showLayerMenu} title="Map layers"><Layers style={{ width: 14, height: 14 }} /></button>
      </div>

      {/* Camera & terrain card */}
      <div className="absolute top-14 right-14 z-10 rounded-md p-2 flex flex-col gap-1.5 map-glass"
        style={{ background: "rgba(255,255,255,0.96)", border: "1px solid #DCE4DD", width: 150 }}>
        <div className="flex items-center gap-1" style={{ ...label, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em" }}>
          <Mountain style={{ width: 9, height: 9 }} /> {en ? "Terrain" : "ഭൂപ്രകൃതി"}
          <span title={terrainInfo} style={{ marginLeft: "auto", width: 7, height: 7, borderRadius: "50%", background: statusColor, display: "inline-block" }} />
        </div>
        <label style={label}>{en ? "Exaggeration" : "ഉയര വർധന"} {terrainExaggeration}×
          <input type="range" min={1} max={3} step={0.25} value={terrainExaggeration} disabled={!mapIs3D || !terrainLayerOn}
            onChange={(e) => setTerrainExaggeration(Number(e.target.value))} className="timeline-slider" style={{ width: "100%" }} aria-label="Terrain exaggeration" />
        </label>
        <label style={label}>{en ? "Pitch" : "പിച്ച്"} {mapPitch}°
          <input type="range" min={0} max={80} step={1} value={mapPitch}
            onChange={(e) => { const v = Number(e.target.value); setMapPitch(v); mapRef.current?.setPitch(v); if (v > 0 && !mapIs3D) setMapIs3D(true); }}
            className="timeline-slider" style={{ width: "100%" }} aria-label="Camera pitch" />
        </label>
        <label style={label}>{en ? "Bearing" : "ദിശ"} {mapBearing}°
          <input type="range" min={-180} max={180} step={1} value={mapBearing}
            onChange={(e) => { const v = Number(e.target.value); setMapBearing(v); mapRef.current?.setBearing(v); }}
            className="timeline-slider" style={{ width: "100%" }} aria-label="Camera bearing" />
        </label>
        <div style={{ fontSize: "0.5rem", color: terrainStatus === "error" ? "#C83F3A" : "#9ca3af", lineHeight: 1.3 }} role="status">
          {terrainStatus === "ready" && `DEM ✓ ${terrainInfo}`}
          {(terrainStatus === "loading" || terrainStatus === "idle") && (en ? "DEM loading…" : "DEM ലോഡ് ചെയ്യുന്നു…")}
          {terrainStatus === "error" && terrainInfo}
        </div>
        {terrainStatus === "error" && (
          <button onClick={retryTerrain} style={{ fontSize: "0.5625rem", color: "#155E59", border: "1px solid #DCE4DD", borderRadius: 4, background: "white", cursor: "pointer", padding: "2px 6px" }}>
            <RefreshCw style={{ width: 9, height: 9, display: "inline", marginRight: 3 }} />{en ? "Retry terrain" : "വീണ്ടും"}
          </button>
        )}
      </div>

      {/* Layer menu */}
      {showLayerMenu && (
        <div className="absolute z-20 rounded-md p-3 animate-fade-in overflow-y-auto map-glass"
          style={{ top: 56, right: 214, maxHeight: "70%", background: "white", border: "1px solid #DCE4DD", width: 230, boxShadow: "0 4px 16px rgba(21,94,89,0.12)" }}>
          <div style={{ fontWeight: 600, fontSize: "0.6875rem", color: "#26332F", borderBottom: "1px solid #DCE4DD", paddingBottom: 6, marginBottom: 6 }}>
            {en ? "Layer visibility" : "പാളി ദൃശ്യം"}
          </div>
          {LAYER_DEFS.map((l) => (
            <label key={l.id} className="flex items-center gap-2 py-0.5" title={l.unavailable}
              style={{ fontSize: "0.6875rem", color: l.unavailable ? "#9ca3af" : "#26332F", cursor: l.unavailable ? "not-allowed" : "pointer" }}>
              <input type="checkbox" className="layer-checkbox" disabled={!!l.unavailable}
                checked={!l.unavailable && visibleLayers.has(l.id)} onChange={() => toggleLayer(l.id)} aria-label={l.label} />
              {en ? l.label : l.mlLabel}
            </label>
          ))}
        </div>
      )}

      {/* Elevation readout */}
      {readout && (
        <div className="absolute z-10 rounded px-2 py-1" style={{ bottom: 34, left: "50%", transform: "translateX(-50%)", background: "rgba(255,255,255,0.95)",
          border: "1px solid #DCE4DD", fontSize: "0.625rem", color: "#26332F", fontVariantNumeric: "tabular-nums" }}>
          {en ? "Elevation" : "ഉയരം"}: <b>{readout.elev == null ? (en ? "no DEM data" : "ഡാറ്റ ഇല്ല") : `${Math.round(readout.elev)} m`}</b>
          {" · "}{readout.lat.toFixed(4)}°N {readout.lon.toFixed(4)}°E
        </div>
      )}

      {/* Legend */}
      {satMsg && (
        <div role="status" className="absolute top-14 left-3 z-10 rounded-md px-2 py-1" style={{ background: "rgba(255,255,255,0.95)", border: "1px solid #DCE4DD", fontSize: "0.5625rem", color: satMsg.includes("unavailable") || satMsg.includes("ലഭ്യമല്ല") ? "#92400e" : "#26332F", maxWidth: 320 }}>
          {satMsg}
        </div>
      )}
      {showLegend ? (
        <div className="absolute bottom-8 left-3 z-10 rounded-md p-2.5 map-glass" style={{ background: "rgba(255,255,255,0.72)", border: "1px solid rgba(255,255,255,0.7)" }}>
          <div style={{ fontWeight: 700, fontSize: "0.5625rem", color: "#26332F", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 5 }}>
            {en ? "Asset risk rank" : "അപകട റാങ്ക്"}
          </div>
          {[["#C83F3A", "Critical (≥ 0.75)"], ["#c2410c", "High (0.50–0.75)"], ["#E7A23B", "Medium (0.25–0.50)"], ["#15803d", "Low (< 0.25)"]].map(([c, t]) => (
            <div key={c} className="flex items-center gap-2 mb-1">
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: c, display: "inline-block" }} />
              <span style={{ fontSize: "0.5625rem", color: "#26332F" }}>{t}</span>
            </div>
          ))}
          {inundationRunId && (
            <div role="status" style={{ fontSize: "0.5625rem", color: "#26332F", marginTop: 4, borderTop: "1px solid #DCE4DD", paddingTop: 4, maxWidth: 170 }}>
              <span style={{ color: "#F97316" }}>■</span> {en ? "Flood extent" : "വെള്ളപ്പൊക്ക പരിധി"} · run {inundationRunId}
              <div style={{ color: inundationError ? "#C83F3A" : "#687770", fontSize: "0.5rem" }}>
                {inundationLoading && "Loading polygons…"}
                {inundationError && "Polygons unavailable for this run (no vector output)."}
                {inundationGeo && `${inundationGeo.features.length} polygons${inundationRun?.result?.vectors?.truncated ? ` (largest of ${inundationRun.result.vectors.total_polygons})` : ""} · Sentinel-1 SAR-derived extent`}
              </div>
            </div>
          )}
          <div style={{ fontSize: "0.5rem", color: "#9ca3af", marginTop: 4, borderTop: "1px solid #DCE4DD", paddingTop: 3, maxWidth: 150 }}>
            {en ? "Relative risk level — not flood depth or probability. Terrarium DEM relief." : "ആപേക്ഷിക അപകട നില."}
          </div>
          <button onClick={() => setShowLegend(false)} aria-label="Hide legend"
            style={{ position: "absolute", top: 3, right: 5, background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 13 }}>×</button>
        </div>
      ) : (
        <button onClick={() => setShowLegend(true)} className="absolute bottom-8 left-3 z-10 flex items-center gap-1 rounded-md"
          style={{ background: "rgba(255,255,255,0.95)", border: "1px solid #DCE4DD", padding: "4px 8px", fontSize: "0.5625rem", color: "#155E59", cursor: "pointer" }}>
          <Info style={{ width: 10, height: 10 }} /> {en ? "Legend" : "ഐതിഹ്യം"}
        </button>
      )}

      <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-center gap-3"
        style={{ background: "rgba(247,248,244,0.85)", borderTop: "1px solid #DCE4DD", padding: "2px 8px", fontSize: "0.5rem", color: "#9ca3af" }}>
        <span>© <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer" style={{ color: "#687770" }}>OpenFreeMap</a></span>·
        <span>© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" style={{ color: "#687770" }}>OpenStreetMap contributors</a></span>·
        <span>{TERRARIUM_ATTRIBUTION.split(" — ")[0]}</span>
      </div>
    </div>
  );
}
