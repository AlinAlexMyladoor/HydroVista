"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { useStore } from "@/lib/store";
import { api, type ScenarioResponse, APIError } from "@/lib/api";
import { getTranslations } from "@/lib/translations";
import { useTheme } from "@/components/providers/ThemeProvider";
import { CloudRain, Info, MapPinned, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

if (typeof window !== "undefined") maplibregl.setWorkerUrl("/maplibre-gl-worker.mjs");

function InfoTip({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        aria-label={text}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-teal-700 focus:outline-none dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-teal-300 cursor-pointer"
      >
        <Info size={13} aria-hidden="true" />
      </button>
      <span
        role="tooltip"
        className="pointer-events-none invisible absolute bottom-full left-1/2 z-30 mb-2 w-64 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-normal leading-relaxed text-white opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        {text}
      </span>
    </span>
  );
}

function ScenarioMiniMap({
  points,
  elevatedIds,
  focusedAsset,
}: {
  points: { lat?: number | null; lon?: number | null; asset_id: string; asset_name?: string | null; name?: string | null; risk_category?: string | null }[];
  elevatedIds: Set<string>;
  focusedAsset?: { lat: number; lon: number; name?: string } | null;
}) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const [basemapType, setBasemapType] = useState<"terrain" | "satellite">("terrain");
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  // Proven, reliable ArcGIS & OpenStreetMap endpoints
  const topoBaseUrl = isDark
    ? "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}"
    : "https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}";
  const satBaseUrl = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";

  // Synchronize GeoJSON points and circles onto MapLibre
  const syncPoints = useCallback(
    (map: maplibregl.Map) => {
      const validPoints = points.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon));
      const features: GeoJSON.Feature[] = validPoints.map((p) => {
        const isEscalated = elevatedIds.has(p.asset_id);
        const color = isEscalated
          ? "#dc2626"
          : p.risk_category === "critical"
          ? "#b91c1c"
          : p.risk_category === "high"
          ? "#ea580c"
          : p.risk_category === "medium"
          ? "#d97706"
          : "#059669";
        return {
          type: "Feature",
          properties: {
            id: p.asset_id,
            name: p.asset_name || p.name || p.asset_id,
            risk: p.risk_category || "low",
            escalated: isEscalated ? 1 : 0,
            color,
          },
          geometry: {
            type: "Point",
            coordinates: [p.lon!, p.lat!],
          },
        };
      });

      const src = map.getSource("scenario-assets") as maplibregl.GeoJSONSource | undefined;
      if (src) {
        src.setData({ type: "FeatureCollection", features });
      } else {
        try {
          map.addSource("scenario-assets", {
            type: "geojson",
            data: { type: "FeatureCollection", features },
          });

          map.addLayer({
            id: "scenario-assets-halo",
            type: "circle",
            source: "scenario-assets",
            filter: ["==", "escalated", 1],
            paint: {
              "circle-radius": 11,
              "circle-color": "#dc2626",
              "circle-opacity": 0.38,
            },
          });

          map.addLayer({
            id: "scenario-assets-circle",
            type: "circle",
            source: "scenario-assets",
            paint: {
              "circle-radius": ["case", ["==", ["get", "escalated"], 1], 6.5, 4.5],
              "circle-color": ["get", "color"],
              "circle-stroke-width": 1.5,
              "circle-stroke-color": "#ffffff",
            },
          });
        } catch {
          // Layer or source already initialized
        }
      }
    },
    [points, elevatedIds]
  );

  // Initialize MapLibre Map instance
  useEffect(() => {
    if (!mapContainer.current) return;

    const mapStyle: maplibregl.StyleSpecification = {
      version: 8,
      sources: {
        "esri-topo": {
          type: "raster",
          tiles: [topoBaseUrl],
          tileSize: 256,
          maxzoom: 19,
          attribution: "Esri, USGS, NOAA, © OpenStreetMap",
        },
        "esri-satellite": {
          type: "raster",
          tiles: [satBaseUrl],
          tileSize: 256,
          maxzoom: 19,
          attribution: "Esri World Imagery",
        },
      },
      layers: [
        {
          id: "canvas-bg",
          type: "background",
          paint: { "background-color": isDark ? "#0f172a" : "#e2e8f0" },
        },
        {
          id: "topo-layer",
          type: "raster",
          source: "esri-topo",
          layout: { visibility: basemapType === "satellite" ? "none" : "visible" },
          paint: { "raster-opacity": 1.0 },
        },
        {
          id: "sat-layer",
          type: "raster",
          source: "esri-satellite",
          layout: { visibility: basemapType === "satellite" ? "visible" : "none" },
          paint: { "raster-opacity": 1.0 },
        },
      ],
    };

    let map: maplibregl.Map;
    try {
      map = new maplibregl.Map({
        container: mapContainer.current,
        style: mapStyle,
        center: [76.45, 10.28],
        zoom: 9.6,
        attributionControl: false,
      });
    } catch {
      return;
    }

    mapRef.current = map;
    popupRef.current = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: [0, -8] });

    const handleResize = () => {
      if (mapRef.current) mapRef.current.resize();
    };

    map.on("load", () => {
      handleResize();
      syncPoints(map);
    });

    map.on("styledata", () => {
      syncPoints(map);
    });

    // Hover tooltip on MapLibre circle layers
    map.on("mouseenter", "scenario-assets-circle", (e) => {
      map.getCanvas().style.cursor = "pointer";
      const feat = e.features?.[0];
      if (!feat || !popupRef.current) return;
      const props = feat.properties as { name?: string; risk?: string; escalated?: number };
      const coords = (feat.geometry as GeoJSON.Point).coordinates.slice() as [number, number];
      popupRef.current
        .setLngLat(coords)
        .setHTML(`
          <div style="font-family: inherit; font-size: 11px; padding: 2px 4px; line-height: 1.3;">
            <strong style="display: block; color: #1e292b;">${props.name || "Asset"}</strong>
            <span style="color: ${props.escalated ? "#dc2626" : "#687770"}; font-weight: 600; text-transform: uppercase; font-size: 9px;">
              Risk: ${props.risk || "low"}${props.escalated ? " · Escalated" : ""}
            </span>
          </div>
        `)
        .addTo(map);
    });

    map.on("mouseleave", "scenario-assets-circle", () => {
      map.getCanvas().style.cursor = "";
      popupRef.current?.remove();
    });

    // Multiple explicit resize triggers to guarantee painting upon flex layout completion
    requestAnimationFrame(handleResize);
    const t1 = setTimeout(handleResize, 100);
    const t2 = setTimeout(handleResize, 350);

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(mapContainer.current);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      resizeObserver.disconnect();
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, [isDark, topoBaseUrl, satBaseUrl, basemapType, syncPoints]);

  // Synchronize GeoJSON features whenever points or elevatedIds change
  useEffect(() => {
    if (mapRef.current) {
      syncPoints(mapRef.current);
    }
  }, [points, elevatedIds, syncPoints]);

  // Handle basemap toggle with zero flicker
  const handleToggleBasemap = (type: "terrain" | "satellite") => {
    setBasemapType(type);
    const map = mapRef.current;
    if (map) {
      try {
        if (map.getLayer("topo-layer")) {
          map.setLayoutProperty("topo-layer", "visibility", type === "satellite" ? "none" : "visible");
        }
        if (map.getLayer("sat-layer")) {
          map.setLayoutProperty("sat-layer", "visibility", type === "satellite" ? "visible" : "none");
        }
      } catch {
        // Handled via style reload
      }
    }
  };

  // Fly to target asset when "Focus" is clicked in the facilities list
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusedAsset) return;
    map.flyTo({
      center: [focusedAsset.lon, focusedAsset.lat],
      zoom: 12.5,
      speed: 1.4,
    });
    if (popupRef.current) {
      popupRef.current
        .setLngLat([focusedAsset.lon, focusedAsset.lat])
        .setHTML(`
          <div style="font-family: inherit; font-size: 11px; padding: 2px 4px; line-height: 1.3;">
            <strong style="display: block; color: #1e292b;">${focusedAsset.name || "Asset"}</strong>
            <span style="color: #0d9488; font-weight: 600; font-size: 9px;">Target Focus</span>
          </div>
        `)
        .addTo(map);
    }
  }, [focusedAsset]);

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden shadow-inner bg-slate-100 dark:bg-neutral-800">
      {/* Explicit 100% height map canvas */}
      <div ref={mapContainer} className="w-full h-full" />

      {/* Top Left: Title & Basemap Mode Switcher */}
      <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5">
        <div className="rounded-md bg-white/95 dark:bg-black/85 px-2.5 py-1 text-[10px] font-semibold text-slate-800 dark:text-slate-100 backdrop-blur-md shadow-xs">
          Chalakudy Basin Terrain
        </div>
        <div className="flex rounded-md bg-white/95 dark:bg-black/85 p-0.5 text-[9px] font-medium backdrop-blur-md shadow-xs">
          <button
            type="button"
            onClick={() => handleToggleBasemap("terrain")}
            className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
              basemapType === "terrain"
                ? "bg-teal-700 text-white font-semibold shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Terrain
          </button>
          <button
            type="button"
            onClick={() => handleToggleBasemap("satellite")}
            className={`px-2 py-0.5 rounded transition-colors cursor-pointer ${
              basemapType === "satellite"
                ? "bg-teal-700 text-white font-semibold shadow-xs"
                : "text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            Satellite
          </button>
        </div>
      </div>

      {/* Top Right: Harmonized Zoom & Reset Controls (replaces clashing default MapLibre controls) */}
      <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
        <button
          type="button"
          title="Zoom in"
          onClick={() => mapRef.current?.zoomIn()}
          className="rounded-md bg-white/95 dark:bg-black/85 px-2 py-1 text-[10px] font-bold text-slate-700 dark:text-slate-200 backdrop-blur-md shadow-xs hover:bg-white dark:hover:bg-neutral-800 cursor-pointer"
        >
          +
        </button>
        <button
          type="button"
          title="Zoom out"
          onClick={() => mapRef.current?.zoomOut()}
          className="rounded-md bg-white/95 dark:bg-black/85 px-2 py-1 text-[10px] font-bold text-slate-700 dark:text-slate-200 backdrop-blur-md shadow-xs hover:bg-white dark:hover:bg-neutral-800 cursor-pointer"
        >
          −
        </button>
        <button
          type="button"
          title="Reset camera view"
          onClick={() => mapRef.current?.flyTo({ center: [76.45, 10.28], zoom: 9.6, speed: 1.2 })}
          className="rounded-md bg-white/95 dark:bg-black/85 px-2 py-1 text-[9px] font-semibold text-slate-700 dark:text-slate-200 backdrop-blur-md shadow-xs hover:bg-white dark:hover:bg-neutral-800 cursor-pointer"
        >
          Reset
        </button>
      </div>

      {/* Bottom: Risk Legend & Asset Counter */}
      <div className="absolute bottom-2 left-2 right-2 z-10 flex items-center justify-between gap-2 rounded-md bg-white/95 dark:bg-black/85 px-3 py-1.5 text-[10px] text-slate-600 dark:text-slate-300 backdrop-blur-md shadow-xs">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-full bg-emerald-600"/>Low</span>
          <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-full bg-amber-500"/>Moderate</span>
          <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-full bg-orange-600"/>High</span>
          <span className="flex items-center gap-1"><i className="inline-block h-2 w-2 rounded-full bg-red-600"/>Critical</span>
        </div>
        <span className="font-mono text-[9px] text-slate-500 dark:text-slate-400">{points.length} assets</span>
      </div>
    </div>
  );
}

export function ScenariosView() {
  const { language, setActiveRoute, setActiveScenario } = useStore();
  const t = getTranslations(language);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  const [rainfallMm, setRainfallMm] = useState<number>(75);
  const [durationHours, setDurationHours] = useState<number>(24);
  const [saturation, setSaturation] = useState<"dry" | "normal" | "saturated">("normal");
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [scenarioResult, setScenarioResult] = useState<ScenarioResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [focusedAsset, setFocusedAsset] = useState<{ lat: number; lon: number; name?: string } | null>(null);

  const { data: baseline, isLoading: baselineLoading } = useQuery({
    queryKey: ["scenario-baseline-exposure"],
    queryFn: () => api.exposure.list({ page: 1, page_size: 200 }),
    staleTime: 60_000,
  });

  const baselineAssets = baseline?.items ?? [];
  const mapPoints = scenarioResult?.scenario_rankings?.length ? scenarioResult.scenario_rankings : baselineAssets;
  const elevatedIds = new Set(scenarioResult?.escalated_assets?.map((asset) => asset.asset_id) ?? []);
  const baselineSevere = baselineAssets.filter((asset) => asset.risk_category === "high" || asset.risk_category === "critical").length;

  const rainPercent = Math.max(0, Math.min(100, (rainfallMm / 300) * 100));
  const durPercent = Math.max(0, Math.min(100, ((durationHours - 6) / 66) * 100));
  const sliderTrackBase = isDark ? "#262626" : "#e2e8f0";

  // Hydrological Runoff Calculations for Chalakudy Basin (1,704 km²)
  const runoffCoeff = saturation === "dry" ? 0.52 : saturation === "normal" ? 0.72 : 0.88;
  const runoffMcm = (rainfallMm * 1704 * runoffCoeff) / 1000;
  const peakInflowM3s = Math.round(((runoffMcm * 1_000_000) / (durationHours * 3600)) * 1.45);

  const presets = [
    {
      label: language !== "ml" ? "Standard Monsoon Spate" : "സാധാരണ കാലവർഷം",
      desc: "+35mm / 24h",
      rain: 35,
      hours: 24,
      sat: "normal" as const,
    },
    {
      label: language !== "ml" ? "Severe Depressional Surge" : "തീവ്ര ന്യൂനമർദ്ദം",
      desc: "+110mm / 24h",
      rain: 110,
      hours: 24,
      sat: "saturated" as const,
    },
    {
      label: language !== "ml" ? "August 2018 Deluge Replay" : "2018 മഹാപ്രളയം",
      desc: "+240mm / 48h (Saturated)",
      rain: 240,
      hours: 48,
      sat: "saturated" as const,
    },
    {
      label: language !== "ml" ? "Dam Release + Cloudburst" : "ഡാം തുറന്നുവിടൽ + പെരുമഴ",
      desc: "+180mm / 12h",
      rain: 180,
      hours: 12,
      sat: "saturated" as const,
    },
  ];

  const handleRun = async () => {
    setIsRunning(true);
    setErrorMsg(null);
    try {
      const res = await api.scenario.create({
        rainfall_mm: rainfallMm,
        duration_hours: durationHours,
        forecast_hour: 24,
        closure_threshold: 0.3,
      });
      setScenarioResult(res);
      setActiveScenario(res);
    } catch (err) {
      setErrorMsg(err instanceof APIError ? err.detail : (err as Error).message);
    } finally {
      setIsRunning(false);
    }
  };

  const handleInspectOnMap = () => {
    const scenario = scenarioResult;
    setActiveRoute("map");
    const points = scenario?.escalated_assets?.filter((asset) => Number.isFinite(asset.lat) && Number.isFinite(asset.lon)) ?? [];
    if (points.length) {
      const padding = 0.025;
      useStore.getState().focusMapBounds(
        Math.max(-180, Math.min(...points.map((point) => point.lon!)) - padding),
        Math.max(-90, Math.min(...points.map((point) => point.lat!)) - padding),
        Math.min(180, Math.max(...points.map((point) => point.lon!)) + padding),
        Math.min(90, Math.max(...points.map((point) => point.lat!)) + padding),
      );
    }
  };

  return (
    <div className="flex-1 w-full h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)] overflow-hidden p-3 sm:p-4 flex flex-col bg-slate-50 text-[#26332F] dark:bg-black dark:text-slate-100">
      <div className="grid grid-cols-12 gap-3 sm:gap-4 h-full min-h-0 w-full">
        {/* Left Column (Parameter Panels): col-span-12 lg:col-span-4 h-full flex flex-col gap-2.5 sm:gap-3 min-h-0 */}
        <div className="col-span-12 lg:col-span-4 h-full flex flex-col gap-2.5 sm:gap-3 min-h-0">
          {/* Card 1: Preset Buttons (shrink-0) */}
          <div className="shrink-0 bg-white rounded-2xl px-4 py-1.5 sm:py-2 shadow-md shadow-slate-200/50 border-0 dark:bg-neutral-900 dark:shadow-xl dark:shadow-black/40">
            <h3 className="text-[10px] sm:text-[10.5px] font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-1">
              {language !== "ml" ? "Historical & Extreme Stress Presets" : "പ്രത്യേക സാഹചര്യങ്ങൾ"}
            </h3>
            <div className="grid grid-cols-2 gap-1.5 w-full">
              {presets.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setRainfallMm(p.rain);
                    setDurationHours(p.hours);
                    setSaturation(p.sat);
                  }}
                  className={`text-left px-2 py-0.5 sm:py-1 rounded-lg text-xs transition-all cursor-pointer ${
                    rainfallMm === p.rain && durationHours === p.hours
                      ? "bg-teal-50 text-teal-900 ring-1 ring-teal-500/40 dark:bg-teal-950/60 dark:text-teal-200 dark:ring-teal-500/40 font-bold shadow-xs"
                      : "bg-slate-50/70 hover:bg-slate-100/80 text-slate-700 dark:bg-neutral-800/60 dark:hover:bg-neutral-800 dark:text-slate-200 border-0"
                  }`}
                >
                  <div className="font-semibold text-[10px] sm:text-[10.5px] leading-tight">{p.label}</div>
                  <div className="text-[8.5px] sm:text-[9px] text-slate-500 dark:text-slate-400 leading-tight">{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Card 2: Dial Parameter Sliders (content-height, button snapped directly below toggles) */}
          <div className="shrink-0 bg-white rounded-2xl px-4 py-2 sm:py-2.5 shadow-md shadow-slate-200/50 border-0 dark:bg-neutral-900 dark:shadow-xl dark:shadow-black/40 space-y-1 sm:space-y-1.5">
            <h3 className="text-[10px] sm:text-[10.5px] font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">
              {language !== "ml" ? "Custom Basin Parameters" : "സ്വയം ക്രമീകരിക്കാവുന്ന അളവുകൾ"}
            </h3>

            {/* Rainfall Slider with softened track */}
            <div className="w-full">
              <div className="flex justify-between items-center text-xs mb-0">
                <span className="font-medium text-slate-700 dark:text-slate-200 text-[10px] sm:text-[10.5px]">
                  {t.addedRainfall}:
                </span>
                <span className="font-mono font-bold text-teal-700 dark:text-teal-400 text-xs">{rainfallMm} mm</span>
              </div>
              <input
                type="range"
                min="0"
                max="300"
                step="5"
                value={rainfallMm}
                onChange={(e) => setRainfallMm(Number(e.target.value))}
                style={{
                  background: `linear-gradient(to right, #0d9488 0%, #eab308 ${Math.max(0, rainPercent - 20)}%, #dc2626 ${rainPercent}%, ${sliderTrackBase} ${rainPercent}%, ${sliderTrackBase} 100%)`,
                }}
                className="scenario-range w-full cursor-pointer h-1.5"
              />
              <div className="flex justify-between text-[8px] text-slate-400 dark:text-slate-500 font-mono mt-0">
                <span>0 mm (Normal)</span>
                <span className="hidden sm:inline">100 mm (Warning)</span>
                <span className="hidden sm:inline">200 mm (Danger)</span>
                <span>300 mm (Deluge)</span>
              </div>
            </div>

            {/* Duration Slider with softened track */}
            <div className="w-full">
              <div className="flex justify-between items-center text-xs mb-0">
                <span className="font-medium text-slate-700 dark:text-slate-200 text-[10px] sm:text-[10.5px]">
                  {t.stormDuration}:
                </span>
                <span className="font-mono font-bold text-teal-700 dark:text-teal-400 text-xs">{durationHours} hrs</span>
              </div>
              <input
                type="range"
                min="6"
                max="72"
                step="6"
                value={durationHours}
                onChange={(e) => setDurationHours(Number(e.target.value))}
                style={{
                  background: `linear-gradient(to right, #0d9488 0%, #eab308 ${Math.max(0, durPercent - 20)}%, #dc2626 ${durPercent}%, ${sliderTrackBase} ${durPercent}%, ${sliderTrackBase} 100%)`,
                }}
                className="scenario-range w-full cursor-pointer h-1.5"
              />
              <div className="flex justify-between text-[8px] text-slate-400 dark:text-slate-500 font-mono mt-0">
                <span>6h (Flash)</span>
                <span className="hidden sm:inline">24h (Standard)</span>
                <span className="hidden sm:inline">48h (Sustained)</span>
                <span>72h (Cyclonic)</span>
              </div>
            </div>

            {/* Soil Antecedent Wetness */}
            <div className="w-full">
              <label className="text-[10px] sm:text-[10.5px] font-medium text-slate-700 dark:text-slate-200 block mb-0.5">
                {language !== "ml" ? "Antecedent Catchment Moisture" : "മണ്ണിന്റെ ഈർപ്പ നില"}:
              </label>
              <div className="grid grid-cols-3 gap-1.5 w-full">
                {(["dry", "normal", "saturated"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSaturation(s)}
                    className={`py-0.5 sm:py-1 text-[10px] sm:text-[10.5px] rounded-lg text-center capitalize transition-colors cursor-pointer border-0 ${
                      saturation === s
                        ? "bg-teal-700 text-white dark:bg-teal-600 font-semibold shadow-xs"
                        : "bg-slate-100/80 text-slate-600 dark:bg-neutral-800/60 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-neutral-800"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Run Button snapped directly beneath toggles */}
            <button
              onClick={handleRun}
              disabled={isRunning}
              className="w-full mt-2 py-1.5 sm:py-2 bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 disabled:bg-slate-400 dark:disabled:bg-neutral-800 text-white text-[11px] font-bold rounded-xl shadow-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
            >
              {isRunning ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  <span>{language !== "ml" ? "Running Hydrodynamic Solvers..." : "കണക്കുകൂട്ടുന്നു..."}</span>
                </>
              ) : (
                <>
                  <CloudRain className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t.simulateButton}</span>
                </>
              )}
            </button>
          </div>

          {/* Card 3: Catchment Hydrologic Response & Hydrograph Panel (flex-1 eliminates blank space seamlessly) */}
          <div className="flex-1 min-h-0 bg-white rounded-2xl px-4 py-2 sm:py-2.5 shadow-md shadow-slate-200/50 border-0 dark:bg-neutral-900 dark:shadow-xl dark:shadow-black/40 flex flex-col justify-between overflow-hidden">
            {/* Header (shrink-0) */}
            <div className="shrink-0 flex items-center justify-between pb-1 border-b border-slate-100 dark:border-neutral-800">
              <h3 className="text-[10px] sm:text-[10.5px] font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-1">
                <span>Catchment Hydrologic Response</span>
                <InfoTip text="Hydrodynamic model of the 1,704 km² Chalakudy river catchment showing projected discharge hydrograph, peak flood surge timing, and soil infiltration capacity." />
              </h3>
              <span className="text-[8.5px] sm:text-[9px] font-mono text-teal-700 dark:text-teal-400 font-semibold">1,704 km² BASIN</span>
            </div>

            {/* Metric Grid (shrink-0) */}
            <div className="shrink-0 grid grid-cols-2 gap-1.5 mt-1 w-full">
              <div className="p-1 sm:p-1.5 rounded-xl bg-slate-50 dark:bg-neutral-800/60">
                <div className="text-[8px] uppercase font-semibold text-slate-500 dark:text-slate-400">Est. Runoff Volume</div>
                <div className="text-xs sm:text-sm font-bold text-teal-700 dark:text-teal-400 mt-0.5 tabular-nums flex items-baseline gap-1">
                  <span>{runoffMcm.toFixed(1)} <span className="text-[9px] font-normal">MCM</span></span>
                  <span className="text-[8px] font-normal text-slate-400">({(runoffMcm * 0.81).toFixed(0)}k ac-ft)</span>
                </div>
              </div>
              <div className="p-1 sm:p-1.5 rounded-xl bg-slate-50 dark:bg-neutral-800/60">
                <div className="text-[8px] uppercase font-semibold text-slate-500 dark:text-slate-400">Peak Basin Inflow</div>
                <div className="text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums flex items-baseline gap-1">
                  <span>≈ {peakInflowM3s.toLocaleString()} <span className="text-[9px] font-normal">m³/s</span></span>
                  <span className="text-[8px] font-normal text-slate-400">(T+{Math.round(durationHours * 0.42)}h)</span>
                </div>
              </div>
            </div>

            {/* Dynamic Catchment Hydrograph Chart (tall-screen-only flex-1 fills available vertical space on tall displays) */}
            <div className="tall-screen-only flex-1 min-h-[45px] my-1 sm:my-1.5 rounded-xl bg-slate-50/70 dark:bg-neutral-800/40 p-1.5 sm:p-2 flex-col justify-between overflow-hidden hidden">
              <div className="flex justify-between items-center text-[7.5px] sm:text-[8px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
                <span className="font-semibold uppercase tracking-wider text-teal-800 dark:text-teal-300">Simulated Hydrograph Surge</span>
                <span className="text-teal-600 dark:text-teal-400 font-bold">Peak: {peakInflowM3s.toLocaleString()} m³/s</span>
              </div>
              <div className="flex-1 min-h-0 w-full relative flex items-center justify-center my-0.5">
                <svg viewBox="0 0 300 70" preserveAspectRatio="none" className="w-full h-full">
                  <defs>
                    <linearGradient id="hydrograph-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#0d9488" stopOpacity="0.38" />
                      <stop offset="100%" stopColor="#0d9488" stopOpacity="0.02" />
                    </linearGradient>
                  </defs>
                  {/* Hyetograph rainfall bars at top */}
                  <rect x="70" y="2" width="6" height={Math.min(18, rainfallMm * 0.08)} fill="#0d9488" opacity="0.3" rx="1" />
                  <rect x="82" y="2" width="6" height={Math.min(22, rainfallMm * 0.10)} fill="#0d9488" opacity="0.4" rx="1" />
                  <rect x="94" y="2" width="6" height={Math.min(25, rainfallMm * 0.12)} fill="#0d9488" opacity="0.5" rx="1" />
                  <rect x="106" y="2" width="6" height={Math.min(20, rainfallMm * 0.09)} fill="#0d9488" opacity="0.4" rx="1" />
                  <rect x="118" y="2" width="6" height={Math.min(14, rainfallMm * 0.06)} fill="#0d9488" opacity="0.25" rx="1" />

                  {/* Hydrograph Area */}
                  <path
                    d="M 10 65 C 55 65, 80 48, 120 16 C 150 16, 175 34, 215 50 C 245 56, 270 62, 290 65 Z"
                    fill="url(#hydrograph-grad)"
                  />
                  {/* Hydrograph Line */}
                  <path
                    d="M 10 65 C 55 65, 80 48, 120 16 C 150 16, 175 34, 215 50 C 245 56, 270 62, 290 65"
                    fill="none"
                    stroke="#0d9488"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                  {/* Peak Marker Dash */}
                  <line x1="120" y1="16" x2="120" y2="65" stroke="#0d9488" strokeWidth="1" strokeDasharray="2 2" opacity="0.7" />
                  {/* Peak Dot */}
                  <circle cx="120" cy="16" r="3.5" fill="#0d9488" stroke="#ffffff" strokeWidth="1.5" />
                  {/* Peak Label */}
                  <text x="125" y="14" fontSize="8" fontWeight="bold" fill="#0d9488" className="font-mono">
                    T+{Math.round(durationHours * 0.42)}h Peak
                  </text>
                </svg>
              </div>
              <div className="flex justify-between items-center text-[7.5px] font-mono text-slate-400 dark:text-slate-500 shrink-0 border-t border-slate-200/50 dark:border-neutral-700/50 pt-0.5">
                <span>0h</span>
                <span>T+{Math.round(durationHours * 0.42)}h (Peak)</span>
                <span>{durationHours}h Storm End</span>
                <span>+12h Recession</span>
              </div>
            </div>

            {/* Runoff vs Retention Partitioning & Buffer (shrink-0) */}
            <div className="shrink-0 space-y-0.5 mt-0.5">
              <div className="flex justify-between items-center text-[8px] sm:text-[8.5px] font-mono">
                <span className="text-slate-600 dark:text-slate-300">
                  Runoff: <strong className="text-teal-700 dark:text-teal-400">{(runoffCoeff * 100).toFixed(0)}%</strong> · Retention: <strong className="text-emerald-700 dark:text-emerald-400">{((1 - runoffCoeff) * 100).toFixed(0)}%</strong>
                </span>
                <span className="text-slate-500 dark:text-slate-400">
                  Buffer: <strong className="text-slate-700 dark:text-slate-200">{saturation === "dry" ? "65mm (Dry)" : saturation === "normal" ? "28mm" : "4mm (Sat)"}</strong>
                </span>
              </div>
              <div className="h-1.5 w-full bg-slate-100 dark:bg-neutral-800 rounded-full overflow-hidden flex">
                <div style={{ width: `${(runoffCoeff * 100).toFixed(0)}%` }} className="h-full bg-teal-600 transition-all duration-300" />
                <div style={{ width: `${((1 - runoffCoeff) * 100).toFixed(0)}%` }} className="h-full bg-emerald-500 transition-all duration-300" />
              </div>
            </div>

            {/* River Channel Capacity & Inflow Threat Tier (shrink-0) */}
            <div className="shrink-0 mt-1 pt-1 border-t border-slate-100 dark:border-neutral-800 flex items-center justify-between text-[8.5px] sm:text-[9px] w-full">
              <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400 font-mono">
                <span>Safe Channel:</span>
                <span className="font-bold text-slate-700 dark:text-slate-200">1,200 m³/s</span>
                <span className={`text-[7.5px] font-semibold px-1 rounded ${peakInflowM3s > 1200 ? "bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300" : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300"}`}>
                  {peakInflowM3s > 1200 ? `+${(peakInflowM3s - 1200).toLocaleString()} m³/s Exceeded` : "Normal Flow"}
                </span>
              </div>
              <span
                className={`font-semibold px-1.5 py-0.5 rounded-full text-[8px] ${
                  rainfallMm >= 200
                    ? "bg-rose-100 text-rose-800 dark:bg-rose-950/70 dark:text-rose-300"
                    : rainfallMm >= 100
                    ? "bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300"
                    : rainfallMm >= 50
                    ? "bg-sky-100 text-sky-800 dark:bg-sky-950/70 dark:text-sky-300"
                    : "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300"
                }`}
              >
                {rainfallMm >= 200 ? "Deluge" : rainfallMm >= 100 ? "Severe" : rainfallMm >= 50 ? "Active" : "Normal"}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column (Simulated Inundation Impact): col-span-12 lg:col-span-8 h-full flex flex-col min-h-0 */}
        <div className="col-span-12 lg:col-span-8 h-full flex flex-col min-h-0">
          <div className="h-full w-full flex flex-col bg-white rounded-2xl p-5 shadow-md shadow-slate-200/50 border-0 dark:bg-neutral-900 dark:shadow-xl dark:shadow-black/40 overflow-hidden">
            {/* Card Header (shrink-0) */}
            <div className="shrink-0 flex items-center justify-between pb-3 border-b border-slate-100 dark:border-neutral-800">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                  {language !== "ml" ? "Simulated Inundation Impact" : "പ്രളയ പ്രത്യാഘാത കണക്കുകൾ"}
                </h3>
                <InfoTip text="Rainfall stress test based on selected basin parameters. Evaluates spatial infrastructure exposure without reservoir operating assumptions." />
                {scenarioResult && (
                  <span className="text-[10px] font-mono bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300 px-2 py-0.5 rounded-full font-bold">
                    COMPUTED
                  </span>
                )}
              </div>
              {scenarioResult && (
                <button
                  onClick={handleInspectOnMap}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white text-xs font-semibold rounded-lg shadow-sm transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
                >
                  <MapPinned className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{language !== "ml" ? "View on 3D map" : "3D മാപ്പിൽ കാണുക"}</span>
                </button>
              )}
            </div>

            {errorMsg && (
              <div role="alert" className="shrink-0 mt-3 rounded-xl border-0 bg-rose-50 p-2.5 text-xs text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
                Scenario request failed: {errorMsg}
              </div>
            )}

            {isRunning && (
              <div className="py-8 text-center text-teal-700 dark:text-teal-400 shrink-0">
                <RefreshCw className="mx-auto mb-2 h-7 w-7 animate-spin" aria-hidden="true" />
                <div className="text-xs font-medium">
                  {language !== "ml"
                    ? "Calculating scenario exposure..."
                    : "ഹൈഡ്രോഡൈനാമിക് മോഡലുകൾ വിശകലനം ചെയ്യുന്നു..."}
                </div>
              </div>
            )}

            {/* Top Metric Row: shrink-0 mb-3 mt-3 */}
            <div className="shrink-0 mt-3 mb-3">
              {scenarioResult ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-rose-50/80 dark:bg-rose-950/30 rounded-xl p-2.5">
                    <div className="text-[10px] uppercase font-semibold text-rose-700 dark:text-rose-300">Severe Risk</div>
                    <div className="text-lg font-bold text-rose-600 dark:text-rose-400 mt-0.5">{scenarioResult.summary?.scenario_high_critical_count ?? "—"}</div>
                  </div>
                  <div className="bg-amber-50/80 dark:bg-amber-950/30 rounded-xl p-2.5">
                    <div className="text-[10px] uppercase font-semibold text-amber-700 dark:text-amber-300">Net Change</div>
                    <div className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-0.5">{scenarioResult.summary?.delta_high_critical ?? "—"}</div>
                  </div>
                  <div className="bg-emerald-50/80 dark:bg-emerald-950/30 rounded-xl p-2.5">
                    <div className="text-[10px] uppercase font-semibold text-emerald-700 dark:text-emerald-300">24h Rain</div>
                    <div className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                      {scenarioResult.summary?.combined_24h_mm?.toFixed(1) ?? "—"} <span className="text-[10px] font-normal">mm</span>
                    </div>
                  </div>
                  <div className="bg-slate-100/70 dark:bg-neutral-800/60 rounded-xl p-2.5">
                    <div className="text-[10px] uppercase font-semibold text-slate-700 dark:text-slate-300">Escalated</div>
                    <div className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-0.5">{scenarioResult.summary?.escalated_count ?? "—"}</div>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div className="bg-slate-100/70 dark:bg-neutral-800/60 rounded-xl p-2.5">
                    <div className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400">Baseline Severe</div>
                    <div className="text-lg font-bold text-slate-900 dark:text-slate-50 mt-0.5">{baselineLoading ? "…" : baselineSevere}</div>
                  </div>
                  <div className="bg-slate-100/70 dark:bg-neutral-800/60 rounded-xl p-2.5">
                    <div className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400">Current 24h</div>
                    <div className="text-lg font-bold text-slate-900 dark:text-slate-50 mt-0.5">{baseline?.rainfall_24h_mm == null ? "—" : `${baseline.rainfall_24h_mm.toFixed(1)} mm`}</div>
                  </div>
                  <div className="bg-slate-100/70 dark:bg-neutral-800/60 rounded-xl p-2.5">
                    <div className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400">Catchment Wetness</div>
                    <div className="text-lg font-bold text-teal-700 dark:text-teal-400 capitalize mt-0.5">{saturation}</div>
                  </div>
                  <div className="bg-slate-100/70 dark:bg-neutral-800/60 rounded-xl p-2.5">
                    <div className="text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400">Input Added</div>
                    <div className="text-lg font-bold text-slate-900 dark:text-slate-50 mt-0.5">+{rainfallMm} mm</div>
                  </div>
                </div>
              )}
            </div>

            {/* Map Container: dynamically fills space (flex-1 min-h-0) when before scenario, or pinned (shrink-0 h-60) when facilities list is active */}
            <div
              className={`relative ${
                scenarioResult && !isRunning && !!scenarioResult.escalated_assets?.length
                  ? "shrink-0 h-60 mb-3"
                  : "flex-1 min-h-0 mb-2"
              } rounded-xl overflow-hidden`}
            >
              <ScenarioMiniMap points={mapPoints} elevatedIds={elevatedIds} focusedAsset={focusedAsset} />

              {/* Centered Empty State Text: Dead-center in the right panel before scenario is run */}
              {!scenarioResult && !isRunning && (
                <div className="absolute inset-0 pointer-events-none flex-1 flex items-center justify-center p-6 z-20">
                  <div className="pointer-events-auto bg-white/95 dark:bg-black/90 backdrop-blur-md px-6 py-3.5 rounded-2xl shadow-xl border border-slate-200/80 dark:border-neutral-700/80 text-center max-w-md">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-200 leading-relaxed">
                      Select a preset or adjust custom basin parameters, then click <span className="font-semibold text-teal-700 dark:text-teal-400">Simulate</span> to compute infrastructure exposure.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Facilities List Container: flex-1 min-h-0 overflow-y-auto */}
            {scenarioResult && !isRunning && !!scenarioResult.escalated_assets?.length && (
              <div className="flex-1 min-h-0 flex flex-col rounded-xl overflow-hidden bg-slate-50/70 dark:bg-neutral-800/40">
                <div className="shrink-0 bg-slate-100/90 dark:bg-neutral-800 px-3 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-between">
                  <span>Facilities with higher scenario risk ({scenarioResult.escalated_assets.length})</span>
                  <span className="text-[10px] text-slate-400 font-normal">Internal scroll</span>
                </div>
                <ul className="flex-1 min-h-0 divide-y divide-slate-100 dark:divide-neutral-800 overflow-y-auto pr-1">
                  {scenarioResult.escalated_assets.map((asset) => (
                    <li key={asset.asset_id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs hover:bg-slate-100/50 dark:hover:bg-neutral-800/60 transition-colors">
                      <span className="min-w-0">
                        <span className="block truncate font-medium text-slate-800 dark:text-slate-200">{asset.name || "Unnamed facility"}</span>
                        <span className="text-[10px] capitalize text-slate-500 dark:text-slate-400">{asset.type?.replaceAll("_", " ")} · {asset.baseline_category} → <b className="text-rose-600 dark:text-rose-400">{asset.scenario_category}</b></span>
                      </span>
                      {Number.isFinite(asset.lat) && Number.isFinite(asset.lon) && (
                        <button
                          type="button"
                          onClick={() => {
                            setFocusedAsset({ lat: asset.lat!, lon: asset.lon!, name: asset.name || "Facility" });
                            useStore.getState().focusMap(asset.lat!, asset.lon!, asset.asset_id);
                          }}
                          className="shrink-0 rounded-md bg-white dark:bg-neutral-700 px-2 py-1 text-[10px] font-semibold text-teal-800 dark:text-teal-300 shadow-xs hover:bg-teal-50 dark:hover:bg-neutral-600 transition-colors cursor-pointer"
                        >
                          Focus
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Minimized footer note (shrink-0) */}
            <div className="shrink-0 mt-2 text-[10px] text-slate-400 dark:text-neutral-500 truncate">
              Rainfall stress test model · Static DEM & hydrodynamic estimation
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
