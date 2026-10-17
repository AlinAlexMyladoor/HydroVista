"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/store";
import { translations } from "@/lib/translations";
import { LAYER_DEFS } from "@/lib/layers";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  ChevronDown,
  Play,
  Pause,
  RotateCcw,
  ChevronRight,
  Mountain,
  Droplets,
  Waves,
  Navigation,
  Building2,
  CrossIcon,
  GraduationCap,
  Tent,
  Map,
  Layers,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
} from "lucide-react";

// ─── Layer definition ──────────────────────────────────────────────────────────
interface LayerItem {
  id: string;
  label: string;
  mlLabel: string;
  icon: React.ElementType;
  iconColor: string;
  defaultOn: boolean;
  indent?: boolean;
  unavailable?: string;
}

const LAYER_ICONS: Record<string, { icon: React.ElementType; iconColor: string }> = {
  "terrain":      { icon: Mountain,      iconColor: "#8B7355" },
  "flood-risk":   { icon: AlertCircle,   iconColor: "#C83F3A" },
  "rivers":       { icon: Waves,         iconColor: "#2563EB" },
  "roads":        { icon: Navigation,    iconColor: "#6b7280" },
  "buildings":    { icon: Building2,     iconColor: "#9ca3af" },
  "hospitals":    { icon: CrossIcon,     iconColor: "#C83F3A" },
  "schools":      { icon: GraduationCap, iconColor: "#E7A23B" },
  "shelters":     { icon: Tent,          iconColor: "#155E59" },
  "other-assets": { icon: Building2,     iconColor: "#687770" },
  "reports":      { icon: AlertCircle,   iconColor: "#3299C6" },
  "boundaries":   { icon: Map,           iconColor: "#9ca3af" },
  "satellite":    { icon: Layers,        iconColor: "#687770" },
};
const LAYER_ITEMS: LayerItem[] = LAYER_DEFS.map((d) => ({
  ...d,
  ...(LAYER_ICONS[d.id] ?? { icon: Layers, iconColor: "#687770" }),
}));

// ─── Timeline hour marks ──────────────────────────────────────────────────────
const TIMELINE_MARKS_24H = [0, 6, 12, 18, 24];
const TIMELINE_MARKS_72H = [0, 12, 24, 36, 48, 60, 72];

export function LeftRail() {
  const {
    language,
    visibleLayers,
    toggleLayer,
    setLayerVisible,
    forecastHorizon,
    setForecastHorizon,
    forecastHour,
    setForecastHour,
    isPlayingTimeline,
    setIsPlayingTimeline,
    setActiveRoute,
  } = useStore();

  const t = translations[language];
  const [studyAreaOpen, setStudyAreaOpen] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const { data: status } = useQuery({
    queryKey: ["system-status"],
    queryFn: () => api.status(),
    refetchInterval: 120_000,
    retry: 1,
  });

  const { data: forecast } = useQuery({
    queryKey: ["forecast-latest"],
    queryFn: () => api.forecast.latest(),
    retry: 1,
  });

  // Build actual timeline from forecast data if available
  const forecastTimestamps = forecast?.hourly?.map((h) => h.time) ?? [];
  const maxHour = forecastHorizon;
  const timelineMarks = forecastHorizon === 24 ? TIMELINE_MARKS_24H : TIMELINE_MARKS_72H;

  const resetLayers = () => {
    LAYER_ITEMS.forEach((l) => setLayerVisible(l.id, l.defaultOn && !l.unavailable));
  };

  // Format age for data source
  const getAgeLabel = (ds: { last_success: string | null; is_available: boolean }) => {
    if (!ds.is_available) return language === "en" ? "Unavailable" : "ലഭ്യമല്ല";
    if (!ds.last_success) return language === "en" ? "Available" : "ലഭ്യമാണ്";
    const minutes = Math.floor((Date.now() - new Date(ds.last_success).getTime()) / 60_000);
    if (minutes < 1) return language === "en" ? "Updated just now" : "ഇപ്പോൾ പുതുക്കി";
    if (minutes < 60) return `${language === "en" ? "Updated" : "അവസാനം"} ${minutes}m ${language === "en" ? "ago" : "മുൻപ്"}`;
    const hours = Math.floor(minutes / 60);
    return `${language === "en" ? "Updated" : "അവസാനം"} ${hours}h ${language === "en" ? "ago" : "മുൻപ്"}`;
  };

  const dataSources = status?.data_sources ?? [];

  // Map backend slug → friendly label
  const SOURCE_LABELS: Record<string, { en: string; ml: string }> = {
    "open-meteo": { en: "Weather (Open-Meteo)", ml: "കാലാവസ്ഥ (Open-Meteo)" },
    "osm":        { en: "Roads & Infrastructure (OSM)", ml: "റോഡ് & ഘടന (OSM)" },
    "terrarium-dem": { en: "Elevation (Terrarium DEM)", ml: "ഉയരം (Terrarium DEM)" },
    "sentinel-1": { en: "Sentinel-1 SAR", ml: "Sentinel-1 SAR" },
    "sentinel-2": { en: "Sentinel-2 optical", ml: "Sentinel-2 ഒപ്റ്റിക്കൽ" },
    "worldpop":   { en: "Population (WorldPop)", ml: "ജനസംഖ്യ (WorldPop)" },
  };

  const now = new Date();

  return (
    <aside
      className="flex flex-col bg-white border-r border-[#DCE4DD] overflow-y-auto scrollbar-thin flex-shrink-0"
      style={{ width: 228, fontSize: "0.75rem" }}
      aria-label="Map controls"
    >
      {/* ─── Study Area ─── */}
      <section className="border-b border-[#DCE4DD] p-3">
        <div
          className="flex items-center justify-between cursor-pointer"
          onClick={() => setStudyAreaOpen(!studyAreaOpen)}
          aria-expanded={studyAreaOpen}
        >
          <span style={{ fontWeight: 600, color: "#26332F", fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {language === "en" ? "Study Area" : "പഠനമേഖല"}
          </span>
          <ChevronDown
            style={{
              width: 13, height: 13, color: "#687770",
              transform: studyAreaOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 150ms",
            }}
          />
        </div>

        {/* Basin card */}
        <div className="mt-2 flex items-center gap-2 rounded-md p-2"
          style={{ background: "#F7F8F4", border: "1px solid #DCE4DD" }}>
          {/* Mini river illustration */}
          <div
            className="flex-shrink-0 rounded"
            style={{ width: 40, height: 32, background: "#DCEFF3", overflow: "hidden", position: "relative" }}
          >
            <svg width="40" height="32" viewBox="0 0 40 32" fill="none" aria-hidden="true">
              <rect width="40" height="32" fill="#DCEFF3"/>
              {/* Simplified basin topography */}
              <path d="M0 20 Q10 14 20 18 Q30 22 40 16" stroke="#3299C6" strokeWidth="2" fill="none" opacity="0.7"/>
              <path d="M0 26 Q12 22 20 24 Q32 26 40 22" stroke="#3299C6" strokeWidth="1.5" fill="none" opacity="0.5"/>
              <ellipse cx="20" cy="18" rx="18" ry="8" fill="#155E59" opacity="0.12"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <div style={{ fontWeight: 600, color: "#26332F", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {language === "en" ? "Chalakudy River Basin" : "ചാലക്കുടിപ്പുഴ തടം"}
            </div>
            <div style={{ color: "#687770", fontSize: "0.625rem", marginTop: 1 }}>
              {language === "en" ? "Thrissur, Ernakulam, Kerala" : "തൃശ്ശൂർ, എറണാകുളം, കേരളം"}
            </div>
          </div>
          <ChevronDown style={{ width: 12, height: 12, color: "#9ca3af", flexShrink: 0 }} />
        </div>
      </section>

      {/* ─── Forecast Timeline ─── */}
      <section className="border-b border-[#DCE4DD] p-3">
        <div style={{ fontWeight: 600, color: "#26332F", fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
          {language === "en" ? "Forecast Timeline" : "പ്രവചന ടൈംലൈൻ"}
        </div>

        {/* Horizon tabs */}
        <div className="flex gap-1 mb-3">
          {([24, 72, 168] as const).map((h) => {
            const labels: Record<number, { en: string; ml: string }> = {
              24:  { en: "24 Hours", ml: "24 മണി" },
              72:  { en: "3 Days",   ml: "3 ദിവസം" },
              168: { en: "7 Days",   ml: "7 ദിവസം" },
            };
            const isActive = forecastHorizon === h;
            return (
              <button
                key={h}
                onClick={() => { setForecastHorizon(h); setForecastHour(0); }}
                className="flex-1 rounded text-center transition-all"
                style={{
                  padding: "0.25rem 0.125rem",
                  fontSize: "0.625rem",
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? "white" : "#687770",
                  background: isActive ? "#155E59" : "#F7F8F4",
                  border: `1px solid ${isActive ? "#155E59" : "#DCE4DD"}`,
                  cursor: "pointer",
                }}
                aria-pressed={isActive}
              >
                {language === "en" ? labels[h].en : labels[h].ml}
              </button>
            );
          })}
        </div>

        {/* Timeline scrubber */}
        <div className="space-y-1.5">
          <input
            type="range"
            min={0}
            max={maxHour}
            step={1}
            value={forecastHour}
            onChange={(e) => setForecastHour(Number(e.target.value))}
            className="timeline-slider w-full"
            aria-label={`Forecast hour: ${forecastHour}`}
          />
          <div className="flex justify-between" style={{ fontSize: "0.5625rem", color: "#9ca3af" }}>
            {timelineMarks.map((m) => (
              <span key={m}>{m}h</span>
            ))}
          </div>

          {/* Current time display */}
          <div className="flex items-center justify-between mt-1" style={{ fontSize: "0.625rem", color: "#687770" }}>
            <span>
              {language === "en" ? "Now" : "ഇപ്പോൾ"}
            </span>
            <span style={{ fontWeight: 500, color: "#26332F" }}>
              {new Date(now.getTime() + forecastHour * 3_600_000).toLocaleString("en-IN", {
                weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                timeZone: "Asia/Kolkata",
              })} IST
            </span>
          </div>
        </div>

        {/* Playback controls */}
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={() => setIsPlayingTimeline(!isPlayingTimeline)}
            className="flex items-center gap-1.5 rounded transition-colors"
            style={{
              padding: "0.3125rem 0.625rem",
              background: "#155E59",
              color: "white",
              border: "none",
              fontSize: "0.6875rem",
              fontWeight: 600,
              cursor: "pointer",
              flex: 1,
              justifyContent: "center",
            }}
            aria-label={isPlayingTimeline ? "Pause simulation" : "Play simulation"}
          >
            {isPlayingTimeline
              ? <><Pause style={{ width: 11, height: 11 }} /> {language === "en" ? "Pause" : "നിർത്തുക"}</>
              : <><Play style={{ width: 11, height: 11 }} /> {language === "en" ? "Play Simulation" : "സിമുലേഷൻ"}</>
            }
          </button>

          {/* Speed */}
          <button
            onClick={() => setPlaybackSpeed(s => s === 1 ? 2 : s === 2 ? 4 : 1)}
            className="flex items-center gap-0.5 rounded"
            style={{
              padding: "0.3125rem 0.5rem",
              background: "#F7F8F4",
              border: "1px solid #DCE4DD",
              color: "#26332F",
              fontSize: "0.625rem",
              fontWeight: 600,
              cursor: "pointer",
              flexShrink: 0,
            }}
            title="Playback speed"
          >
            {playbackSpeed}x
          </button>

          {/* Reset */}
          <button
            onClick={() => { setForecastHour(0); setIsPlayingTimeline(false); }}
            style={{
              padding: "0.3125rem",
              background: "transparent",
              border: "1px solid #DCE4DD",
              borderRadius: 5,
              cursor: "pointer",
              color: "#687770",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
            title={language === "en" ? "Reset timeline" : "ടൈംലൈൻ റീസെറ്റ്"}
            aria-label="Reset timeline"
          >
            <RotateCcw style={{ width: 11, height: 11 }} />
          </button>
        </div>
      </section>

      {/* ─── Map Layers ─── */}
      <section className="border-b border-[#DCE4DD] p-3 flex-1">
        <div className="flex items-center justify-between mb-2">
          <span style={{ fontWeight: 600, color: "#26332F", fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {language === "en" ? "Map Layers" : "ഭൂപട പാളികൾ"}
          </span>
          <button
            onClick={resetLayers}
            style={{ fontSize: "0.625rem", color: "#155E59", fontWeight: 500, background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            {language === "en" ? "Reset" : "പുനഃക്രമം"}
          </button>
        </div>

        <div className="space-y-1">
          {LAYER_ITEMS.map((layer) => {
            const Icon = layer.icon;
            const isOn = !layer.unavailable && visibleLayers.has(layer.id);
            return (
              <label
                key={layer.id}
                className="flex items-center gap-2 rounded py-0.5 px-1 transition-colors hover:bg-[#F7F8F4]"
                style={{ userSelect: "none", cursor: layer.unavailable ? "not-allowed" : "pointer", opacity: layer.unavailable ? 0.6 : 1 }}
                title={layer.unavailable}
              >
                <input
                  type="checkbox"
                  checked={isOn}
                  disabled={!!layer.unavailable}
                  onChange={() => toggleLayer(layer.id)}
                  className="layer-checkbox flex-shrink-0"
                  aria-label={language === "en" ? layer.label : layer.mlLabel}
                />
                <Icon style={{ width: 13, height: 13, color: isOn ? layer.iconColor : "#9ca3af", flexShrink: 0 }} />
                <span style={{ color: isOn ? "#26332F" : "#9ca3af", fontSize: "0.6875rem", lineHeight: 1.4 }}>
                  {language === "en" ? layer.label : layer.mlLabel}
                </span>
              </label>
            );
          })}
        </div>
      </section>

      {/* ─── Data Sources ─── */}
      <section className="p-3">
        <div style={{ fontWeight: 600, color: "#26332F", fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
          {language === "en" ? "Data Sources" : "ഡാറ്റ സ്രോതസ്സ്"}
        </div>

        <div className="space-y-1.5">
          {dataSources.length > 0
            ? dataSources.map((ds) => {
                const labels = SOURCE_LABELS[ds.slug] ?? { en: ds.name, ml: ds.name };
                const age = getAgeLabel(ds as any);
                return (
                  <div key={ds.slug} className="source-pill">
                    <span
                      className="status-dot"
                      style={{
                        backgroundColor: ds.is_available ? "#22c55e" : "#9ca3af",
                      }}
                    />
                    <span className="source-name flex-1">
                      {language === "en" ? labels.en : labels.ml}
                    </span>
                    <span className="source-age">{age}</span>
                  </div>
                );
              })
            : (
              // Placeholder when no status yet
              [
                { slug: "open-meteo", name: "Weather (Open-Meteo)", status: "checking" },
                { slug: "osm",        name: "Roads & Infrastructure (OSM)", status: "checking" },
                { slug: "terrarium-dem", name: "Elevation (Terrarium DEM)", status: "checking" },
                { slug: "worldpop",   name: "Population (WorldPop)", status: "checking" },
              ].map((s) => (
                <div key={s.slug} className="source-pill">
                  <span className="status-dot" style={{ backgroundColor: s.status === "available" ? "#22c55e" : "#E7A23B" }} />
                  <span className="source-name flex-1" style={{ fontSize: "0.625rem" }}>{s.name}</span>
                  <span className="source-age" style={{ fontSize: "0.5625rem" }}>
                    {s.status === "available" ? "Available" : "Checking..."}
                  </span>
                </div>
              ))
            )
          }
        </div>

        <button
          onClick={() => setActiveRoute("about")}
          className="mt-3 flex items-center gap-1"
          style={{ fontSize: "0.625rem", color: "#155E59", fontWeight: 500, background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          {language === "en" ? "View all data sources" : "എല്ലാ ഡാറ്റ സ്രോതസ്സുകളും"}
          <ChevronRight style={{ width: 10, height: 10 }} />
        </button>
      </section>
    </aside>
  );
}
