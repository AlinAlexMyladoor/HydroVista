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
import { formatForecastTimestamp, getForecastPointAt } from "@/lib/forecast-time";
import { Layers, Navigation, Mountain, Plus, Minus, Compass, Info, AlertTriangle, RefreshCw, Moon, Sun, X } from "lucide-react";

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

function raiseFloodOverlays(map: maplibregl.Map) {
  // Keep every satellite raster below the flood layers. Reasserting this after
  // each asynchronous image insertion avoids relying on the layer's old index.
  if (map.getLayer("sentinel-raster") && map.getLayer("inundation-extrusion")) {
    map.moveLayer("sentinel-raster", "inundation-extrusion");
  }
  for (const id of ["inundation-extrusion", "inundation-fill", "inundation-outline"]) {
    if (map.getLayer(id)) map.moveLayer(id);
  }
}

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

const qualityBadge = (q: string) => (q === "good" ? "Good" : q === "partial" ? "Partial" : "Limited");

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
  const [showTerrainControls, setShowTerrainControls] = useState(false);
  const [readout, setReadout] = useState<{ lon: number; lat: number; elev: number | null } | null>(null);
  const [initKey, setInitKey] = useState(0);

  const {
    activeRoute, hoveredAssetId, bottomAnalyticsCollapsed,
    selectedAssetId, setSelectedAssetId, riskFilter, assetTypeFilter, visibleLayers, toggleLayer, language,
    mapIs3D, setMapIs3D, terrainExaggeration, setTerrainExaggeration, mapPitch, setMapPitch, mapBearing, setMapBearing,
    terrainStatus, terrainInfo, setTerrainStatus, inundationRunId, drapedInundation, forecastHour, activeScenario, setActiveScenario,
    mapFocusRequest, transectHoverPoint, leftSidebarOpen, rightRailOpen, satelliteInfo, setSatelliteInfo,
  } = useStore();
  const en = language !== "ml";
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
  const { data: forecast } = useQuery({ queryKey: ["forecast-latest"], queryFn: () => api.forecast.latest(), retry: 1 });
  const forecastPoint = getForecastPointAt(forecast?.hourly, forecastHour);

  // Candidate-inundation polygons from a completed Earth Engine run (selected in Flood Analysis).
  const { data: inundationRun } = useQuery({
    queryKey: ["analysis-run", inundationRunId], queryFn: () => api.analysis.run(inundationRunId!), enabled: !!inundationRunId, retry: 1,
  });
  const { data: inundationGeo, isError: inundationError, isFetching: inundationLoading } = useQuery({
    queryKey: ["analysis-geojson", inundationRunId], queryFn: () => api.analysis.geojson(inundationRunId!),
    enabled: !!inundationRunId && inundationRun?.status === "completed", retry: 1, staleTime: 10 * 60_000,
  });
  const transferredInundation = drapedInundation?.runId === inundationRunId ? drapedInundation.geojson : null;
  const visibleInundationGeo = transferredInundation ?? inundationGeo;

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
        paint: { "raster-opacity": 0.28, "raster-saturation": 0.1, "raster-contrast": 0.08 },
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

      // Candidate polygons drape over terrain; the shallow extrusion is a visual aid,
      // not a measured depth product (the current GEE output has no depth attribute).
      map.addSource("inundation-source", {
        type: "geojson",
        data: (visibleInundationGeo as unknown as GeoJSON.FeatureCollection | undefined) ?? { type: "FeatureCollection", features: [] },
      });
      map.addLayer({
        id: "inundation-extrusion", type: "fill-extrusion", source: "inundation-source",
        paint: {
          "fill-extrusion-color": "#0284C7",
          // Fixed display height for visibility; this analysis does not estimate flood depth.
          "fill-extrusion-height": 1.8,
          "fill-extrusion-base": 0,
          "fill-extrusion-opacity": 0.6,
        },
      });
      map.addLayer({
        id: "inundation-fill", type: "fill", source: "inundation-source",
        paint: { "fill-color": "#0EA5E9", "fill-opacity": 0.48 },
      });
      map.addLayer({
        id: "inundation-outline", type: "line", source: "inundation-source",
        paint: { "line-color": "#0369A1", "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.4, 14, 1.4], "line-opacity": 0.95 },
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
          "circle-pitch-alignment": "viewport",
          "circle-pitch-scale": "viewport",
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

      // ─── Transect Reference Line (Ghats → Arabian Sea) ───
      map.addSource("transect-ref-src", {
        type: "geojson",
        data: {
          type: "Feature",
          properties: {},
          geometry: {
            type: "LineString",
            coordinates: [[76.8, 10.31], [76.17, 10.28]],
          },
        },
      });
      map.addLayer({
        id: "transect-ref-line",
        type: "line",
        source: "transect-ref-src",
        paint: {
          "line-color": "#2dd4bf",
          "line-width": 2,
          "line-dasharray": [4, 3],
          "line-opacity": 0.7,
        },
      });

      raiseFloodOverlays(map);

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

  useEffect(() => {
    const scale = mapRef.current?.getContainer().querySelector<HTMLElement>(".maplibregl-ctrl-scale");
    if (scale) scale.style.display = mapIs3D ? "none" : "";
  }, [mapIs3D, mapLoaded]);

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
    src.setData((visibleInundationGeo as unknown as GeoData) ?? ({ type: "FeatureCollection", features: [] } as GeoData));
  }, [visibleInundationGeo, mapLoaded]);

  useEffect(() => {
    const map = mapRef.current;
    const p = inundationRun?.result?.parameters;
    if (mapFocusRequest?.bounds) return; // The cinematic flyTo owns this camera transition.
    if (!map || !mapLoaded || !visibleInundationGeo || !p) return;
    // maxBounds (the basin) still clamps the camera; this only frames the analysed box when it overlaps.
    map.fitBounds([[p.west, p.south], [p.east, p.north]], { padding: 60, duration: 900, pitch: useStore.getState().mapIs3D ? 62 : 0 });
  }, [visibleInundationGeo, inundationRun, mapLoaded, mapFocusRequest]);

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
    if (!satOn) { removeSat(); setSatelliteBaseOpacity(0.38); setSatMsg(null); setSatelliteInfo(null); return; }
    // World Imagery is a real satellite basemap and remains usable while the
    // optional Sentinel-2 scene service is unavailable.
    // Satellite imagery is a context layer, never an opaque flood-analysis mask.
    setSatelliteBaseOpacity(0.48);
    const ac = new AbortController();
    const loadingText = en ? "Requesting latest Sentinel-2 scene…" : "Sentinel-2 ചിത്രം അഭ്യർത്ഥിക്കുന്നു…";
    setSatMsg(loadingText);
    setSatelliteInfo(loadingText);
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
          setSatelliteBaseOpacity(0.48);
          setSatMsg(null);
          setSatelliteInfo(null);
          return;
        }
        removeSat();
        const url = URL.createObjectURL(await r.blob());
        satelliteImageUrl.current = url;
        const [w, s2, e, n] = bb;
        map.addSource("sentinel-src", { type: "image", url, coordinates: [[w, n], [e, n], [e, s2], [w, s2]] });
        map.addLayer({ id: "sentinel-raster", type: "raster", source: "sentinel-src", paint: { "raster-opacity": 0.54 } }, map.getLayer("inundation-extrusion") ? "inundation-extrusion" : undefined);
        raiseFloodOverlays(map);
        map.once("idle", () => raiseFloodOverlays(map));
        setSatelliteBaseOpacity(0.28);
        const source = r.headers.get("X-Satellite-Source") ?? "CDSE";
        const msg = `${en ? `Sentinel-2 ${source === "Google Earth Engine" ? "composite" : "L2A"}, acquired` : "Sentinel-2, ലഭിച്ചത്"} ${new Date(acquired).toLocaleString()} · ${en ? "clouds masked (transparent)" : "മേഘം ഒഴിവാക്കി"}`;
        setSatMsg(msg);
        setSatelliteInfo(msg);
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        removeSat();
        setSatelliteBaseOpacity(0.48);
        setSatMsg(null);
        setSatelliteInfo(null);
      }
    })();
    return () => ac.abort();
  }, [satOn, mapLoaded, en]);

  // ─── Data → GeoJSON ────────────────────────────────────────────────────────
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || (!exposureData?.items && !activeScenario?.scenario_rankings)) return;
    const src = map.getSource("assets-source") as maplibregl.GeoJSONSource | undefined;
    const mapAssets = activeScenario?.scenario_rankings?.length ? activeScenario.scenario_rankings : (exposureData?.items ?? []);
    src?.setData({
      type: "FeatureCollection",
      features: mapAssets
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
  }, [exposureData, mapLoaded, activeScenario]);

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
      const pitch = 60;
      const bearing = 30;
      if (mapFocusRequest.bounds) {
        const camera = map.cameraForBounds(mapFocusRequest.bounds, {
          padding: { top: 90, right: 90, bottom: 90, left: 90 },
          maxZoom: 15,
        });
        if (camera) map.flyTo({ ...camera, pitch, bearing, duration: 2400, essential: true });
        else map.fitBounds(mapFocusRequest.bounds, { padding: 90, maxZoom: 15, pitch, bearing, duration: 2400, essential: true });
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

  // Dynamic interactive marker when user hovers over 3D terrain profile in bottom panel
  const transectMarkerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (!transectHoverPoint) {
      if (transectMarkerRef.current) {
        transectMarkerRef.current.remove();
        transectMarkerRef.current = null;
      }
      return;
    }

    const { lon, lat, elevM, distKm } = transectHoverPoint;

    if (!transectMarkerRef.current) {
      const el = document.createElement("div");
      el.className = "transect-interactive-crosshair";
      el.style.pointerEvents = "none";
      el.innerHTML = `
        <div style="position: relative; pointer-events: none; z-index: 60;">
          <!-- Telemetry HUD Badge above the crosshair -->
          <div style="position: absolute; bottom: 26px; left: 50%; transform: translateX(-50%); background: rgba(15, 23, 42, 0.94); backdrop-filter: blur(10px); -webkit-backdrop-filter: blur(10px); border: 1.5px solid #2dd4bf; border-radius: 8px; padding: 4px 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.8), 0 0 14px rgba(45, 212, 191, 0.4); white-space: nowrap; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; display: flex; align-items: center; gap: 8px; color: #fff;">
            <div style="display: flex; align-items: center; gap: 4px;">
              <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #2dd4bf; box-shadow: 0 0 8px #2dd4bf;"></span>
              <span id="transect-marker-elev" style="font-size: 11px; font-weight: 800; color: #2dd4bf;">${Math.round(elevM)} m</span>
            </div>
            <span style="color: rgba(255,255,255,0.3); font-size: 10px;">|</span>
            <span id="transect-marker-dist" style="font-size: 10px; font-weight: 600; color: #94a3b8;">${distKm.toFixed(1)} km</span>
            <span style="color: rgba(255,255,255,0.3); font-size: 10px;">|</span>
            <span id="transect-marker-coords" style="font-size: 9px; font-weight: 500; color: #cbd5e1;">${lat.toFixed(3)}°N, ${lon.toFixed(3)}°E</span>
          </div>
          <!-- Precision Crosshair Reticle Center -->
          <div style="position: relative; width: 44px; height: 44px; margin-left: -22px; margin-top: -22px; display: flex; align-items: center; justify-content: center;">
            <div style="position: absolute; width: 44px; height: 1.5px; background: linear-gradient(90deg, transparent, #2dd4bf 20%, #2dd4bf 80%, transparent); box-shadow: 0 0 6px #2dd4bf;"></div>
            <div style="position: absolute; height: 44px; width: 1.5px; background: linear-gradient(180deg, transparent, #2dd4bf 20%, #2dd4bf 80%, transparent); box-shadow: 0 0 6px #2dd4bf;"></div>
            <div style="position: absolute; width: 28px; height: 28px; border-radius: 50%; border: 1.5px dashed rgba(45, 212, 191, 0.7); animation: spin 8s linear infinite;"></div>
            <div style="position: absolute; width: 14px; height: 14px; border-radius: 50%; background: rgba(45, 212, 191, 0.35); border: 1.5px solid #2dd4bf; box-shadow: 0 0 10px #2dd4bf;"></div>
            <div style="position: absolute; width: 4px; height: 4px; border-radius: 50%; background: #ffffff; box-shadow: 0 0 4px #ffffff;"></div>
          </div>
        </div>
      `;
      transectMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([lon, lat])
        .addTo(map);
    } else {
      transectMarkerRef.current.setLngLat([lon, lat]);
      const elevEl = document.getElementById("transect-marker-elev");
      const distEl = document.getElementById("transect-marker-dist");
      const coordsEl = document.getElementById("transect-marker-coords");
      if (elevEl) elevEl.textContent = `${Math.round(elevM)} m`;
      if (distEl) distEl.textContent = `${distKm.toFixed(1)} km`;
      if (coordsEl) coordsEl.textContent = `${lat.toFixed(3)}°N, ${lon.toFixed(3)}°E`;
    }
  }, [transectHoverPoint, mapLoaded]);

  // Dynamic pulsing radar beacon marker when user hovers over an asset in the bottom risk table
  const hoveredAssetMarkerRef = useRef<maplibregl.Marker | null>(null);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    if (!hoveredAssetId) {
      if (hoveredAssetMarkerRef.current) {
        hoveredAssetMarkerRef.current.remove();
        hoveredAssetMarkerRef.current = null;
      }
      return;
    }

    const allAssets = activeScenario?.scenario_rankings?.length
      ? activeScenario.scenario_rankings
      : (exposureData?.items ?? []);
    const asset = allAssets.find((a: any) => a.asset_id === hoveredAssetId);

    if (!asset || asset.lon == null || asset.lat == null) {
      if (hoveredAssetMarkerRef.current) {
        hoveredAssetMarkerRef.current.remove();
        hoveredAssetMarkerRef.current = null;
      }
      return;
    }

    const { lon, lat, asset_name, asset_type, risk_category, risk_score } = asset;
    const name = asset_name || asset_type?.replace(/_/g, " ") || "Asset";
    const riskPct = Math.round((risk_score ?? 0.8) * 100);
    const category = (risk_category || "high").toUpperCase();

    const markerHtml = `
      <div style="position: relative; pointer-events: none; z-index: 90; display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <!-- Telemetry HUD pill badge directly above the pin -->
        <div style="position: absolute; bottom: 28px; left: 50%; transform: translateX(-50%); background: rgba(15, 23, 42, 0.94); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px); border: 1.5px solid #ef4444; border-radius: 8px; padding: 4px 10px; box-shadow: 0 8px 24px rgba(0,0,0,0.7), 0 0 16px rgba(239, 68, 68, 0.5); white-space: nowrap; display: flex; align-items: center; gap: 6px; color: #fff; font-family: system-ui, -apple-system, sans-serif;">
          <span style="display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: #ef4444; box-shadow: 0 0 8px #ef4444;"></span>
          <span style="font-size: 11px; font-weight: 700; color: #ffffff;">${name}</span>
          <span style="font-size: 9px; font-weight: 800; padding: 1px 5px; border-radius: 4px; background: rgba(239, 68, 68, 0.25); color: #fca5a5; letter-spacing: 0.05em;">
            ${category} · ${riskPct}%
          </span>
        </div>

        <!-- Outer expanding pulse ring (Radar ping) -->
        <div class="animate-beacon-ping" style="position: absolute; width: 56px; height: 56px; margin-left: -28px; margin-top: -28px; border-radius: 50%; background: rgba(239, 68, 68, 0.35);"></div>
        
        <!-- Glowing focus ring -->
        <div style="position: absolute; width: 34px; height: 34px; margin-left: -17px; margin-top: -17px; border-radius: 50%; border: 2px solid #ef4444; box-shadow: 0 0 14px #ef4444, inset 0 0 8px rgba(239, 68, 68, 0.4);"></div>

        <!-- Solid Red Pin Head -->
        <div style="position: relative; width: 16px; height: 16px; border-radius: 50%; background: #ef4444; border: 2.5px solid #ffffff; box-shadow: 0 0 14px rgba(239, 68, 68, 1);">
          <div style="width: 4px; height: 4px; border-radius: 50%; background: #ffffff; margin: 3.5px auto;"></div>
        </div>
      </div>
    `;

    if (!hoveredAssetMarkerRef.current) {
      const el = document.createElement("div");
      el.className = "hovered-asset-pulse-marker";
      el.style.pointerEvents = "none";
      el.innerHTML = markerHtml;
      hoveredAssetMarkerRef.current = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([lon, lat])
        .addTo(map);
    } else {
      hoveredAssetMarkerRef.current.setLngLat([lon, lat]);
      hoveredAssetMarkerRef.current.getElement().innerHTML = markerHtml;
    }
  }, [hoveredAssetId, mapLoaded, exposureData, activeScenario]);

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
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-lg px-3 py-1.5 border border-slate-100 bg-white/95 text-slate-700 shadow-md shadow-slate-200/50 backdrop-blur-md dark:border-slate-700/80 dark:bg-slate-900/90 dark:text-slate-200 text-xs"
          role="status"
        >
          <span className="animate-spin">⟳</span>
          {!mapLoaded ? (en ? "Loading map…" : "ഭൂപടം ലോഡ് ചെയ്യുന്നു…") : (en ? "Loading infrastructure data…" : "ഡാറ്റ ലോഡ് ചെയ്യുന്നു…")}
        </div>
      )}
      {mapFocusError && <div className="absolute top-3 right-3 z-30 rounded-md border border-rose-200 bg-white px-3 py-2 text-xs text-rose-700 shadow dark:border-rose-900 dark:bg-slate-900 dark:text-rose-300" role="alert">{mapFocusError}</div>}
      {exposureError && (
        <div
          className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-lg px-3 py-1.5 border border-amber-300 bg-amber-50/95 text-amber-900 shadow-md backdrop-blur-md dark:border-amber-800/80 dark:bg-amber-950/90 dark:text-amber-200 text-xs"
          role="alert"
        >
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
          {en ? "Backend unreachable — no facility data." : "ബാക്കെൻഡ് ലഭ്യമല്ല."}
          <button onClick={() => refetchExposure()} className="underline font-semibold text-teal-700 dark:text-teal-300 ml-1">
            {en ? "Retry" : "വീണ്ടും"}
          </button>
        </div>
      )}

      {/* ─── Top-Center Floating Container: Dynamic Stacking of Time Pill & Scenario Risk Overlay ─── */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center space-y-2 pointer-events-none">
        {/* Time and Rainfall pill */}
        <div className="pointer-events-auto rounded-lg px-3.5 py-1.5 border border-slate-100 dark:border-none bg-white/95 dark:bg-slate-900/90 text-slate-800 shadow-md shadow-slate-200/50 dark:shadow-xl backdrop-blur-md dark:text-slate-100 text-xs font-mono whitespace-nowrap flex items-center gap-1.5">
          <span className="font-bold text-slate-900 dark:text-white">{forecastHour === 0 ? (en ? "Now" : "ഇപ്പോൾ") : (en ? "Forecast" : "പ്രവചനം")}</span>
          {forecastPoint?.time && <span className="text-slate-600 dark:text-slate-300"> · {formatForecastTimestamp(forecastPoint.time, language)} IST</span>}
          <span className="font-semibold text-teal-700 dark:text-teal-300"> · {forecastPoint?.precipitation_mm != null ? `${forecastPoint.precipitation_mm.toFixed(1)} mm` : (en ? "rainfall unavailable" : "മഴ ലഭ്യമല്ല")}</span>
        </div>

        {/* Scenario risk overlay: sits cleanly below the time pill when active */}
        {activeScenario && (
          <div className="pointer-events-auto flex items-center gap-2.5 rounded-lg border border-sky-200/80 bg-white/95 px-3 py-1.5 text-xs shadow-md shadow-slate-200/50 dark:border-sky-900 dark:bg-slate-900/95 backdrop-blur-md animate-fade-in">
            <span>
              <b className="text-sky-800 dark:text-sky-200">Scenario risk overlay</b>
              <span className="ml-2 text-slate-600 dark:text-slate-300 font-mono">+{activeScenario.rainfall_mm} mm · {activeScenario.duration_hours}h</span>
            </span>
            <button
              type="button"
              onClick={() => setActiveScenario(null)}
              aria-label="Clear scenario risk overlay"
              title="Clear scenario risk overlay"
              className="rounded p-0.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Classic vertical map controls stack floating naturally with right margin */}
      <div
        className="absolute top-6 right-4 z-10 flex flex-col gap-1.5 rounded-xl p-1.5 border border-white/60 dark:border-slate-800/60 bg-white/90 dark:bg-slate-900/85 shadow-lg shadow-slate-200/50 dark:shadow-none backdrop-blur-md transition-all duration-200"
      >
        {([false, true] as const).map((v) => (
          <button
            key={String(v)}
            onClick={() => set3D(v)}
            aria-pressed={mapIs3D === v}
            className={`h-7 w-7 rounded-md flex items-center justify-center text-xs font-bold transition-all border ${
              mapIs3D === v
                ? "bg-teal-700 text-white border-teal-700 dark:bg-teal-600 dark:border-none shadow-xs"
                : "border-slate-200/60 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-none dark:bg-black/40 dark:text-slate-200 dark:hover:bg-white/10 dark:hover:text-white"
            }`}
          >
            {v ? "3D" : "2D"}
          </button>
        ))}
        <button
          onClick={toggleTheme}
          className="h-7 w-7 rounded-md flex items-center justify-center transition-all border border-slate-200/60 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-none dark:bg-black/40 dark:text-slate-200 dark:hover:bg-white/10 dark:hover:text-white shadow-xs cursor-pointer"
          title={resolvedTheme === "dark" ? "Use light theme" : "Use dark theme"}
          aria-label={resolvedTheme === "dark" ? "Use light theme" : "Use dark theme"}
        >
          {resolvedTheme === "dark" ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
        </button>
        <button
          className={`h-7 w-7 rounded-md flex items-center justify-center transition-all border cursor-pointer ${
            showTerrainControls
              ? "bg-teal-100 border-teal-300 text-teal-800 dark:bg-teal-900/50 dark:border-none dark:text-teal-200"
              : "border-slate-200/60 bg-white text-teal-700 hover:bg-slate-100 dark:border-none dark:bg-black/40 dark:text-teal-300 dark:hover:bg-white/10"
          } shadow-xs`}
          onClick={() => { setShowLayerMenu(false); setShowTerrainControls((show) => !show); }}
          aria-label="Terrain controls"
          aria-expanded={showTerrainControls}
          title="Terrain controls"
        >
          <Mountain className="h-3.5 w-3.5" />
        </button>
        <button
          className="h-7 w-7 rounded-md flex items-center justify-center transition-all border border-slate-200/60 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-none dark:bg-black/40 dark:text-slate-200 dark:hover:bg-white/10 dark:hover:text-white shadow-xs cursor-pointer"
          onClick={() => mapRef.current?.zoomIn()}
          aria-label="Zoom in"
          title="Zoom in"
        >
          <Plus className="h-3.5 w-3.5" />
        </button>
        <button
          className="h-7 w-7 rounded-md flex items-center justify-center transition-all border border-slate-200/60 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-none dark:bg-black/40 dark:text-slate-200 dark:hover:bg-white/10 dark:hover:text-white shadow-xs cursor-pointer"
          onClick={() => mapRef.current?.zoomOut()}
          aria-label="Zoom out"
          title="Zoom out"
        >
          <Minus className="h-3.5 w-3.5" />
        </button>
        <button
          className="h-7 w-7 rounded-md flex items-center justify-center transition-all border border-slate-200/60 bg-white text-slate-700 hover:bg-slate-100 hover:text-slate-900 dark:border-none dark:bg-black/40 dark:text-slate-200 dark:hover:bg-white/10 dark:hover:text-white shadow-xs cursor-pointer"
          onClick={() => mapRef.current?.resetNorthPitch({ duration: 600 })}
          aria-label="Reset bearing and pitch"
          title="Reset north & pitch"
        >
          <Compass className="h-3.5 w-3.5" style={{ transform: `rotate(${-mapBearing}deg)` }} />
        </button>
        <button
          className="h-7 w-7 rounded-md flex items-center justify-center transition-all border border-slate-200/60 bg-white text-teal-700 hover:bg-slate-100 dark:border-none dark:bg-black/40 dark:text-teal-300 dark:hover:bg-white/10 shadow-xs cursor-pointer"
          onClick={resetView}
          aria-label="Reset to basin view"
          title="Reset to basin view"
        >
          <Navigation className="h-3.5 w-3.5" />
        </button>
        <button
          className={`h-7 w-7 rounded-md flex items-center justify-center transition-all border cursor-pointer ${
            showLayerMenu
              ? "bg-teal-100 border-teal-300 text-teal-800 dark:bg-teal-900/50 dark:border-none dark:text-teal-200"
              : "border-slate-200/60 bg-white text-teal-700 hover:bg-slate-100 dark:border-none dark:bg-black/40 dark:text-teal-300 dark:hover:bg-white/10"
          } shadow-xs`}
          onClick={() => { setShowTerrainControls(false); setShowLayerMenu((show) => !show); }}
          aria-label="Map layers"
          aria-expanded={showLayerMenu}
          title="Map layers"
        >
          <Layers className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Terrain controls popover */}
      {showTerrainControls && (
        <div
          className="absolute top-6 right-16 z-20 rounded-xl p-3 flex flex-col gap-2 border border-white/60 dark:border-slate-800/60 bg-white/95 dark:bg-slate-900/90 text-slate-800 shadow-xl shadow-slate-200/50 backdrop-blur-md dark:text-slate-100 w-[170px]"
        >
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200">
            <Mountain className="h-3.5 w-3.5" /> {en ? "Terrain" : "ഭൂപ്രകൃതി"}
            <span title={terrainInfo} style={{ marginLeft: "auto", width: 7, height: 7, borderRadius: "50%", background: statusColor, display: "inline-block" }} />
          </div>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
            {en ? "Exaggeration" : "ഉയര വർധന"} {terrainExaggeration}×
            <input type="range" min={1} max={3} step={0.25} value={terrainExaggeration} disabled={!mapIs3D || !terrainLayerOn}
              onChange={(e) => setTerrainExaggeration(Number(e.target.value))} className="timeline-slider w-full mt-1" aria-label="Terrain exaggeration" />
          </label>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
            {en ? "Pitch" : "പിച്ച്"} {mapPitch}°
            <input type="range" min={0} max={80} step={1} value={mapPitch}
              onChange={(e) => { const v = Number(e.target.value); setMapPitch(v); mapRef.current?.setPitch(v); if (v > 0 && !mapIs3D) setMapIs3D(true); }}
              className="timeline-slider w-full mt-1" aria-label="Camera pitch" />
          </label>
          <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
            {en ? "Bearing" : "ദിശ"} {mapBearing}°
            <input type="range" min={-180} max={180} step={1} value={mapBearing}
              onChange={(e) => { const v = Number(e.target.value); setMapBearing(v); mapRef.current?.setBearing(v); }}
              className="timeline-slider w-full mt-1" aria-label="Camera bearing" />
          </label>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight" role="status">
            {terrainStatus === "ready" && `DEM ✓ ${terrainInfo}`}
            {(terrainStatus === "loading" || terrainStatus === "idle") && (en ? "DEM loading…" : "DEM ലോഡ് ചെയ്യുന്നു…")}
            {terrainStatus === "error" && <span className="text-rose-600 dark:text-rose-400">{terrainInfo}</span>}
          </div>
          {terrainStatus === "error" && (
            <button
              onClick={retryTerrain}
              className="flex items-center justify-center gap-1 rounded border border-slate-300 dark:border-none bg-white dark:bg-slate-800 text-xs font-medium text-teal-700 dark:text-teal-300 py-1 px-2 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-xs cursor-pointer"
            >
              <RefreshCw className="h-3 w-3" />{en ? "Retry elevation" : "ഉയരം വീണ്ടും ലോഡ് ചെയ്യുക"}
            </button>
          )}
        </div>
      )}

      {/* Layer menu popover */}
      {showLayerMenu && (
        <div
          className="absolute top-6 right-16 z-20 rounded-xl p-3 animate-fade-in overflow-y-auto border border-white/60 dark:border-slate-800/60 bg-white/95 dark:bg-slate-900/90 text-slate-800 shadow-xl shadow-slate-200/50 backdrop-blur-md dark:text-slate-100 w-[240px]"
          style={{ maxHeight: "70%" }}
        >
          <div className="text-xs font-bold text-slate-800 dark:text-slate-100 border-b border-slate-200 dark:border-neutral-800 pb-2 mb-2">
            {en ? "Layer visibility" : "പാളി ദൃശ്യം"}
          </div>
          <div className="space-y-1">
            {LAYER_DEFS.map((l) => {
              const tooltip = l.id === "satellite" && satelliteInfo ? satelliteInfo : l.unavailable;
              return (
                <label
                  key={l.id}
                  className="flex items-center gap-2 py-1 px-1 rounded hover:bg-slate-100/70 dark:hover:bg-white/10 cursor-pointer text-xs"
                  title={tooltip}
                >
                  <input
                    type="checkbox"
                    className="layer-checkbox"
                    disabled={!!l.unavailable}
                    checked={!l.unavailable && visibleLayers.has(l.id)}
                    onChange={() => toggleLayer(l.id)}
                    aria-label={l.label}
                  />
                  <span className={l.unavailable ? "text-slate-400 dark:text-slate-500" : "text-slate-700 dark:text-slate-200"}>
                    {en ? l.label : l.mlLabel}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Legend: Translucent glassmorphism with neatly aligned and filled risk rank badges */}
      {showLegend ? (
        <div
          className="absolute bottom-4 left-4 z-10 rounded-xl p-3 bg-white/90 dark:bg-slate-900/85 backdrop-blur-md shadow-lg shadow-slate-200/50 dark:shadow-none border border-white/60 dark:border-slate-800/60 text-slate-800 dark:text-slate-100 w-[230px] transition-all"
        >
          <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-slate-200/50 dark:border-slate-800/60">
            <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
              {en ? "Asset Risk Rank" : "അപകട റാങ്ക്"}
            </span>
            <button
              onClick={() => setShowLegend(false)}
              aria-label="Hide legend"
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-0.5 rounded cursor-pointer transition-colors"
            >
              <X className="h-3 w-3" />
            </button>
          </div>

          <div className="space-y-1">
            {[
              { label: en ? "Critical" : "തീവ്രം", range: "≥ 0.75", dot: "bg-rose-600", bg: "bg-rose-50/80 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200" },
              { label: en ? "High" : "ഉയർന്നത്", range: "0.50–0.75", dot: "bg-orange-500", bg: "bg-orange-50/80 dark:bg-orange-950/40 text-orange-800 dark:text-orange-200" },
              { label: en ? "Medium" : "ഇടത്തരം", range: "0.25–0.50", dot: "bg-amber-500", bg: "bg-amber-50/80 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200" },
              { label: en ? "Low" : "കുറഞ്ഞത്", range: "< 0.25", dot: "bg-emerald-600", bg: "bg-emerald-50/80 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200" },
            ].map((r) => (
              <div
                key={r.range}
                className={`flex items-center justify-between px-2 py-1 rounded-md text-[11px] ${r.bg} transition-colors`}
              >
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full ${r.dot} shrink-0`} />
                  <span className="font-semibold">{r.label}</span>
                </div>
                <span className="font-mono text-[10px] tabular-nums font-medium opacity-85">{r.range}</span>
              </div>
            ))}
          </div>

          {inundationRunId && (
            <div className="mt-1.5 px-2 py-1 rounded-md bg-teal-50/80 dark:bg-teal-950/40 text-[10px] text-teal-800 dark:text-teal-200 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-xs bg-teal-600 shrink-0" />
                <span className="font-semibold">{en ? "Flood Extent" : "വെള്ളപ്പൊക്ക പരിധി"}</span>
              </div>
              <span className="font-mono text-[9px] opacity-80">
                {visibleInundationGeo ? `${visibleInundationGeo.features.length} poly` : "Active"}
              </span>
            </div>
          )}

          {/* Elevation readout inside legend bottom */}
          <div className="mt-2.5 pt-1.5 border-t border-slate-200/50 dark:border-slate-800/60 text-[10px] font-mono text-slate-600 dark:text-slate-300">
            <div className="flex items-center justify-between">
              <span className="text-slate-500 dark:text-slate-400 font-sans">{en ? "Elevation" : "ഉയരം"}:</span>
              <span className="font-bold text-slate-900 dark:text-white tabular-nums">
                {readout?.elev != null ? `${Math.round(readout.elev)} m` : "73 m"}
              </span>
            </div>
            <div className="text-[9px] font-mono text-slate-400 dark:text-slate-500 text-right tabular-nums mt-0.5">
              {readout
                ? `${readout.lat.toFixed(4)}°N · ${readout.lon.toFixed(4)}°E`
                : "10.3008°N · 76.4750°E"}
            </div>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowLegend(true)}
          className="absolute bottom-4 left-4 z-10 flex items-center gap-1.5 rounded-lg border border-white/60 dark:border-slate-800/60 bg-white/90 dark:bg-slate-900/85 px-2.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-md shadow-slate-200/50 dark:shadow-none backdrop-blur-md cursor-pointer hover:bg-white dark:hover:bg-slate-900 transition-all"
        >
          <Info className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
          <span>{en ? "Risk Legend" : "ഐതിഹ്യം"}</span>
        </button>
      )}

      {/* Attribution Pill shifted to the left away from the vertical map controls column */}
      <div
        className="absolute bottom-1.5 right-20 z-10 flex items-center gap-2 rounded-md bg-white/80 dark:bg-slate-900/80 px-2.5 py-0.5 text-[9px] text-slate-500 dark:text-slate-400 backdrop-blur-md border border-white/60 dark:border-slate-800/60 shadow-xs pointer-events-auto"
      >
        <span>© <a href="https://openfreemap.org" target="_blank" rel="noopener noreferrer" className="hover:underline text-slate-600 dark:text-slate-300">OpenFreeMap</a></span>·
        <span>© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="hover:underline text-slate-600 dark:text-slate-300">OpenStreetMap contributors</a></span>·
        <span>{TERRARIUM_ATTRIBUTION.split(" — ")[0]}</span>
      </div>
    </div>
  );
}
