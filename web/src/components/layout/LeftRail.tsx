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
  X,
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
    playbackSpeed,
    setPlaybackSpeed,
    setActiveRoute,
    satelliteInfo,
  } = useStore();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const t = getTranslations(language);

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

  const setLeftSidebarOpen = useStore((s) => s.setLeftSidebarOpen);

  return (
    <aside
      className="flex flex-col bg-white/95 lg:bg-white/85 dark:bg-slate-950/95 lg:dark:bg-slate-950/85 backdrop-blur-md border-r border-slate-200/50 dark:border-slate-800/60 overflow-y-auto scrollbar-hide flex-shrink-0 text-xs w-full lg:w-[264px] h-full"
      aria-label="Map controls"
    >
      {/* Mobile drawer header with close button */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-200/60 dark:border-slate-800/60 lg:hidden shrink-0">
        <span className="font-bold text-xs text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
          <Layers className="h-4 w-4 text-teal-600" />
          <span>{language !== "ml" ? "Map Layers & Timeline" : "ഭൂപട നിയന്ത്രണങ്ങൾ"}</span>
        </span>
        <button
          type="button"
          onClick={() => setLeftSidebarOpen(false)}
          className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
          aria-label="Close"
        >
          <X size={16} />
        </button>
      </div>

      {/* ─── Study Area ─── */}
      <section className="border-b border-slate-200/50 dark:border-slate-800/60 px-3 py-2.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            {language !== "ml" ? "Study Area" : "പഠനമേഖല"}
          </span>
        </div>

        <div className="mt-1.5 rounded-xl px-3 py-2.5 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md shadow-lg shadow-slate-200/50 dark:shadow-none border-none">
          <div className="min-w-0">
            <div className="font-semibold text-slate-800 dark:text-slate-100 text-xs leading-tight truncate">
              {language !== "ml" ? "Chalakudy River Basin" : "ചാലക്കുടിപ്പുഴ തടം"}
            </div>
            <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              {language !== "ml" ? "Thrissur, Ernakulam, Kerala" : "തൃശ്ശൂർ, എറണാകുളം, കേരളം"}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Forecast Timeline ─── */}
      <section className="border-b border-slate-200/60 dark:border-slate-800 p-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-2">
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
                className={`flex-1 rounded py-1 px-0.5 text-[11px] text-center transition-all ${
                  isActive
                    ? "bg-teal-700 dark:bg-teal-600 text-white font-semibold border border-teal-700 dark:border-none shadow-xs"
                    : "bg-white text-slate-600 dark:bg-slate-900 dark:text-slate-400 border border-slate-200/80 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-200 shadow-xs"
                }`}
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
          <div className="flex justify-between text-[9px] font-medium text-slate-500 dark:text-slate-400">
            {timelineMarks.map((m) => (
              <span key={m}>{forecastHorizon === 168 && m > 0 ? `${m / 24}d` : `${m}h`}</span>
            ))}
          </div>

          {/* Current time display */}
          <div className="flex items-center justify-between mt-1 text-[11px]">
            <span className="text-slate-500 dark:text-slate-400">
              {language !== "ml" ? "Now" : "ഇപ്പോൾ"}
            </span>
            <span className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums" suppressHydrationWarning>
              {selectedForecastPoint
                ? `${formatForecastTimestamp(selectedForecastPoint.time, language)} IST`
                : mounted
                  ? `${new Date(now.getTime() + forecastHour * 3_600_000).toLocaleString("en-IN", {
                      weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
                      timeZone: "Asia/Kolkata",
                    })} IST`
                  : "Loading…"}
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
            className="flex-1 flex items-center justify-center gap-1.5 rounded py-1.5 px-2.5 bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white font-semibold text-xs shadow-xs transition-colors cursor-pointer"
            aria-label={isPlayingTimeline ? "Pause forecast playback" : "Play forecast playback"}
            title={language !== "ml" ? "Moves through forecast rainfall hours; flood extent remains the latest analysis." : "മഴ പ്രവചന സമയങ്ങളിലൂടെ നീങ്ങുന്നു; വെള്ളപ്പൊക്ക പരിധി ഏറ്റവും പുതിയ വിശകലനമാണ്."}
          >
            {isPlayingTimeline
              ? <><Pause className="h-3 w-3" /> {language !== "ml" ? "Pause" : "നിർത്തുക"}</>
              : <><Play className="h-3 w-3" /> {language !== "ml" ? "Play Forecast" : "പ്രവചനം പ്ലേ ചെയ്യുക"}</>
            }
          </button>

          {/* Speed */}
          <button
            onClick={() => setPlaybackSpeed(playbackSpeed === 1 ? 2 : playbackSpeed === 2 ? 4 : 1)}
            className="flex items-center gap-0.5 rounded py-1.5 px-2 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 text-[10px] font-semibold shrink-0 shadow-xs cursor-pointer"
            title="Playback speed"
          >
            {playbackSpeed}x
          </button>

          {/* Reset */}
          <button
            onClick={() => { setForecastHour(0); setIsPlayingTimeline(false); }}
            className="flex items-center justify-center rounded p-1.5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-800 dark:hover:text-slate-200 shrink-0 shadow-xs cursor-pointer"
            title={language !== "ml" ? "Reset timeline" : "ടൈംലൈൻ റീസെറ്റ്"}
            aria-label="Reset timeline"
          >
            <RotateCcw className="h-3 w-3" />
          </button>
        </div>
      </section>

      {/* ─── Map Layers ─── */}
      <section className="border-b border-slate-200/60 dark:border-slate-800 p-3 flex-1">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
            {language !== "ml" ? "Map Layers" : "ഭൂപട പാളികൾ"}
          </span>
          <button
            onClick={resetLayers}
            className="text-[11px] text-teal-700 dark:text-teal-400 hover:underline font-medium p-0 cursor-pointer"
          >
            {language !== "ml" ? "Reset" : "പുനഃക്രമം"}
          </button>
        </div>

        <div className="space-y-1.5">
          {LAYER_GROUPS.map((group) => (
            <details key={group.id} open={group.open} className="group/layers">
              <summary className="cursor-pointer list-none px-1 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white flex items-center justify-between">
                <span className="inline-flex items-center gap-1.5">
                  <ChevronRight className="h-3 w-3 transition-transform group-open/layers:rotate-90" />
                  {language !== "ml" ? group.en : group.ml}
                </span>
              </summary>
              <div className="space-y-1 pl-1 mt-0.5">
                {group.layers.map((id) => {
                  const layer = LAYER_ITEMS.find((item) => item.id === id);
                  if (!layer) return null;
                  const Icon = layer.icon;
                  const isOn = !layer.unavailable && visibleLayers.has(layer.id);
                  const tooltip = layer.id === "satellite" && satelliteInfo ? satelliteInfo : layer.unavailable;
                  return (
                    <label
                      key={layer.id}
                      className={`flex items-center gap-2 rounded py-1 px-1.5 transition-colors ${
                        layer.unavailable
                          ? "opacity-60 cursor-not-allowed"
                          : "cursor-pointer hover:bg-slate-100/70 dark:hover:bg-slate-800/60"
                      }`}
                      title={tooltip}
                    >
                      <input
                        type="checkbox"
                        checked={isOn}
                        disabled={!!layer.unavailable}
                        onChange={() => toggleLayer(layer.id)}
                        className="layer-checkbox flex-shrink-0"
                        aria-label={language !== "ml" ? layer.label : layer.mlLabel}
                      />
                      <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: isOn ? layer.iconColor : "#9ca3af" }} />
                      <span className={`text-xs leading-none ${isOn ? "font-medium text-slate-800 dark:text-slate-100" : "text-slate-400 dark:text-slate-500"}`}>
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
        <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300">
          <span>{language !== "ml" ? "Data Sources" : "ഡാറ്റ സ്രോതസ്സ്"}</span>
          <button
            onClick={() => setActiveRoute("about")}
            className="flex items-center gap-0.5 normal-case tracking-normal text-[11px] font-medium text-teal-700 dark:text-teal-400 hover:underline p-0"
          >
            {language !== "ml" ? "View all" : "എല്ലാം"}
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>

        <div className="space-y-1">
          {dataSources.length > 0
            ? dataSources.map((ds) => {
                const labels = SOURCE_LABELS[ds.slug] ?? { en: ds.name, ml: ds.name };
                const age = getAgeLabel(ds as any);
                return (
                  <div key={ds.slug} className="flex flex-col py-1 border-b border-slate-100/60 dark:border-slate-800/40 last:border-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className={`h-2 w-2 rounded-full shrink-0 ${
                          ds.is_available ? "bg-emerald-500 dark:bg-emerald-400" : "bg-slate-400 dark:bg-slate-600"
                        }`}
                      />
                      <span className="text-slate-800 dark:text-slate-200 font-semibold text-xs leading-snug">
                        {language !== "ml" ? labels.en : labels.ml}
                      </span>
                    </div>
                    <div className="pl-3.5 text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5" suppressHydrationWarning>
                      {age}
                    </div>
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
                <div key={s.slug} className="flex flex-col py-1 border-b border-slate-100/60 dark:border-slate-800/40 last:border-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${s.status === "available" ? "bg-emerald-500" : "bg-amber-500"}`} />
                    <span className="text-slate-800 dark:text-slate-200 text-xs font-semibold leading-snug">{s.name}</span>
                  </div>
                  <div className="pl-3.5 text-[10px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                    {s.status === "available" ? "Available" : "Checking..."}
                  </div>
                </div>
              ))
            )
          }
        </div>

      </section>
    </aside>
  );
}
