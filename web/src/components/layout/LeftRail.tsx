"use client";

import React, { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { getTranslations } from "@/lib/translations";
import { LAYER_DEFS } from "@/lib/layers";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatForecastTimestamp, getForecastPointAt } from "@/lib/forecast-time";
import {
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
const LAYER_GROUPS = [
  { id: "base", en: "Map context", ml: "ഭൂപട പശ്ചാത്തലം", layers: ["terrain", "rivers", "roads", "buildings", "boundaries", "satellite"], open: true },
  { id: "hazards", en: "Hazards", ml: "അപകടങ്ങൾ", layers: ["inundation", "flood-risk"], open: true },
  { id: "infrastructure", en: "Infrastructure & reports", ml: "അടിസ്ഥാന സൗകര്യങ്ങളും റിപ്പോർട്ടുകളും", layers: ["hospitals", "schools", "shelters", "other-assets", "reports"], open: false },
];

// ─── Timeline hour marks ──────────────────────────────────────────────────────
const TIMELINE_MARKS_24H = [0, 6, 12, 18, 24];
const TIMELINE_MARKS_72H = [0, 12, 24, 36, 48, 60, 72];
const TIMELINE_MARKS_168H = [0, 24, 48, 72, 96, 120, 144, 168];

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

  const t = getTranslations(language);
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
  const selectedForecastPoint = getForecastPointAt(forecast?.hourly, forecastHour);

  // The selected cursor controls the forecast chart and on-map weather readout.
  const maxHour = forecastHorizon;
  const timelineMarks = forecastHorizon === 24
    ? TIMELINE_MARKS_24H
    : forecastHorizon === 72
      ? TIMELINE_MARKS_72H
      : TIMELINE_MARKS_168H;

  // Advance the selected forecast hour while playing. The map and forecast
  // chart subscribe to this shared value so playback stays synchronized.
  useEffect(() => {
    if (!isPlayingTimeline) return;
    const timer = window.setInterval(() => {
      const current = useStore.getState().forecastHour;
      if (current >= maxHour) {
        setIsPlayingTimeline(false);
      } else {
        setForecastHour(Math.min(current + 1, maxHour));
      }
    }, 1200 / playbackSpeed);
    return () => window.clearInterval(timer);
  }, [isPlayingTimeline, maxHour, playbackSpeed, setForecastHour, setIsPlayingTimeline]);

  const resetLayers = () => {
    LAYER_ITEMS.forEach((l) => setLayerVisible(l.id, l.defaultOn && !l.unavailable));
  };

  // Format age for data source
  const getAgeLabel = (ds: { last_success: string | null; is_available: boolean }) => {
    if (!ds.is_available) return language !== "ml" ? "Unavailable" : "ലഭ്യമല്ല";
    if (!ds.last_success) return language !== "ml" ? "Available" : "ലഭ്യമാണ്";
    const minutes = Math.floor((Date.now() - new Date(ds.last_success).getTime()) / 60_000);
    if (minutes < 1) return language !== "ml" ? "Updated just now" : "ഇപ്പോൾ പുതുക്കി";
    if (minutes < 60) return `${language !== "ml" ? "Updated" : "അവസാനം"} ${minutes}m ${language !== "ml" ? "ago" : "മുൻപ്"}`;
    const hours = Math.floor(minutes / 60);
    return `${language !== "ml" ? "Updated" : "അവസാനം"} ${hours}h ${language !== "ml" ? "ago" : "മുൻപ്"}`;
  };

  const dataSources = status?.data_sources ?? [];

  // Map backend slug → friendly label
  const SOURCE_LABELS: Record<string, { en: string; ml: string }> = {
    "open-meteo": { en: "Weather (Open-Meteo)", ml: "കാലാവസ്ഥ (Open-Meteo)" },
    "cwc-river-stage": { en: "CWC Arangaly River Gauge", ml: "സി.ഡബ്ല്യു.സി അരംഗലി ഗേജ്" },
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
      <section className="border-b border-[#DCE4DD] px-3 py-2">
        <div className="flex items-center justify-between">
          <span style={{ fontWeight: 600, color: "#26332F", fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
            {language !== "ml" ? "Study Area" : "പഠനമേഖല"}
          </span>
        </div>

        <div className="mt-1 rounded-md px-2.5 py-1.5"
          style={{ background: "#F7F8F4", border: "1px solid #DCE4DD" }}>
          <div className="min-w-0">
            <div style={{ fontWeight: 600, color: "#26332F", lineHeight: 1.3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {language !== "ml" ? "Chalakudy River Basin" : "ചാലക്കുടിപ്പുഴ തടം"}
            </div>
            <div style={{ color: "#687770", fontSize: "0.625rem", marginTop: 1 }}>
              {language !== "ml" ? "Thrissur, Ernakulam, Kerala" : "തൃശ്ശൂർ, എറണാകുളം, കേരളം"}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Forecast Timeline ─── */}
      <section className="border-b border-[#DCE4DD] p-3">
        <div style={{ fontWeight: 600, color: "#26332F", fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 8 }}>
          {language !== "ml" ? "Forecast Timeline" : "പ്രവചന ടൈംലൈൻ"}
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
                {language !== "ml" ? labels[h].en : labels[h].ml}
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
              <span key={m}>{forecastHorizon === 168 && m > 0 ? `${m / 24}d` : `${m}h`}</span>
            ))}
          </div>

          {/* Current time display */}
          <div className="flex items-center justify-between mt-1" style={{ fontSize: "0.625rem", color: "#687770" }}>
            <span>
              {language !== "ml" ? "Now" : "ഇപ്പോൾ"}
            </span>
            <span style={{ fontWeight: 500, color: "#26332F" }}>
              {selectedForecastPoint
                ? `${formatForecastTimestamp(selectedForecastPoint.time, language)} IST`
                : `${new Date(now.getTime() + forecastHour * 3_600_000).toLocaleString("en-IN", {
                    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                    timeZone: "Asia/Kolkata",
                  })} IST`}
            </span>
          </div>
        </div>

        {/* Playback controls */}
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={() => {
              if (!isPlayingTimeline && forecastHour >= maxHour) setForecastHour(0);
              setIsPlayingTimeline(!isPlayingTimeline);
            }}
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
            aria-label={isPlayingTimeline ? "Pause forecast playback" : "Play forecast playback"}
            title={language !== "ml" ? "Moves through forecast rainfall hours; flood extent remains the latest analysis." : "മഴ പ്രവചന സമയങ്ങളിലൂടെ നീങ്ങുന്നു; വെള്ളപ്പൊക്ക പരിധി ഏറ്റവും പുതിയ വിശകലനമാണ്."}
          >
            {isPlayingTimeline
              ? <><Pause style={{ width: 11, height: 11 }} /> {language !== "ml" ? "Pause" : "നിർത്തുക"}</>
              : <><Play style={{ width: 11, height: 11 }} /> {language !== "ml" ? "Play Forecast" : "പ്രവചനം പ്ലേ ചെയ്യുക"}</>
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
            title={language !== "ml" ? "Reset timeline" : "ടൈംലൈൻ റീസെറ്റ്"}
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
            {language !== "ml" ? "Map Layers" : "ഭൂപട പാളികൾ"}
          </span>
          <button
            onClick={resetLayers}
            style={{ fontSize: "0.625rem", color: "#155E59", fontWeight: 500, background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            {language !== "ml" ? "Reset" : "പുനഃക്രമം"}
          </button>
        </div>

        <div className="space-y-1.5">
          {LAYER_GROUPS.map((group) => (
            <details key={group.id} open={group.open} className="group/layers">
              <summary className="cursor-pointer list-none px-1 py-1 font-semibold text-slate-500 hover:text-slate-700">
                <span className="inline-flex items-center gap-1.5">
                  <ChevronRight className="h-3 w-3 transition-transform group-open/layers:rotate-90" />
                  {language !== "ml" ? group.en : group.ml}
                </span>
              </summary>
              <div className="space-y-1 pl-1">
                {group.layers.map((id) => {
                  const layer = LAYER_ITEMS.find((item) => item.id === id);
                  if (!layer) return null;
                  const Icon = layer.icon;
                  const isOn = !layer.unavailable && visibleLayers.has(layer.id);
                  return (
                    <label
                      key={layer.id}
                      className="flex items-center gap-2 rounded py-0.5 px-1 transition-colors hover:bg-[#F7F8F4]"
                      style={{ userSelect: "none", cursor: layer.unavailable ? "not-allowed" : "pointer", opacity: layer.unavailable ? 0.6 : 1 }}
                      title={layer.unavailable}
                    >
                      <input type="checkbox" checked={isOn} disabled={!!layer.unavailable}
                        onChange={() => toggleLayer(layer.id)} className="layer-checkbox flex-shrink-0"
                        aria-label={language !== "ml" ? layer.label : layer.mlLabel} />
                      <Icon style={{ width: 13, height: 13, color: isOn ? layer.iconColor : "#9ca3af", flexShrink: 0 }} />
                      <span style={{ color: isOn ? "#26332F" : "#9ca3af", fontSize: "0.6875rem", lineHeight: 1.4 }}>
                        {language !== "ml" ? layer.label : layer.mlLabel}
                      </span>
                    </label>
                  );
                })}
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* ─── Data Sources ─── */}
      <section className="p-3">
        <div className="mb-2 flex items-center justify-between" style={{ fontWeight: 600, color: "#26332F", fontSize: "0.6875rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {language !== "ml" ? "Data Sources" : "ഡാറ്റ സ്രോതസ്സ്"}
          <button
            onClick={() => setActiveRoute("about")}
            className="flex items-center gap-0.5 normal-case tracking-normal"
            style={{ fontSize: "0.625rem", color: "#155E59", fontWeight: 500, background: "none", border: "none", cursor: "pointer", padding: 0 }}
          >
            {language !== "ml" ? "View all" : "എല്ലാം"}
            <ChevronRight style={{ width: 10, height: 10 }} />
          </button>
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
                      {language !== "ml" ? labels.en : labels.ml}
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

      </section>
    </aside>
  );
}
