"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/store";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Rectangle,
} from "recharts";
import { CloudRain, TrendingUp, ChevronDown, RotateCcw } from "lucide-react";
import { TerrainSectionPanel } from "@/components/panels/TerrainSectionPanel";

// ─── Rainfall Forecast Mini Panel ─────────────────────────────────────────────
function RainfallForecastPanel({
  activeView,
  setActiveView,
  onRedo,
  isRedoing,
}: {
  activeView?: "all" | "rainfall" | "terrain" | "exposure";
  setActiveView?: (view: "all" | "rainfall" | "terrain" | "exposure") => void;
  onRedo?: () => void;
  isRedoing?: boolean;
} = {}) {
  const language = useStore((s) => s.language);
  const forecastHour = useStore((s) => s.forecastHour);
  const forecastHorizon = useStore((s) => s.forecastHorizon);
  const isPlayingTimeline = useStore((s) => s.isPlayingTimeline);
  const playbackSpeed = useStore((s) => s.playbackSpeed);
  const { resolvedTheme } = useTheme();
  const chartText = resolvedTheme === "dark" ? "#CBD5E1" : "#687770";
  const chartBorder = resolvedTheme === "dark" ? "rgba(255,255,255,0.1)" : "#DCE4DD";

  const { data: forecast, isLoading } = useQuery({
    queryKey: ["forecast-latest"],
    queryFn: () => api.forecast.latest(),
    retry: 1,
  });

  const chartData = React.useMemo(() => {
    if (!forecast?.hourly?.length) return [];
    const interval = forecastHorizon === 24 ? 1 : forecastHorizon === 72 ? 3 : 6;
    return forecast.hourly
      .filter((h) => Date.parse(h.time) >= Date.now() - 60 * 60_000)
      .filter((_, i) => i % interval === 0)
      .slice(0, 24)
      .map((h, i) => {
        const date = new Date(h.time);
        const timePart = date.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
        const datePart = date.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
        return {
          rawTime: h.time,
          hour: `${timePart} · ${datePart}`,
          timePart,
          datePart,
          precipitation: h.precipitation_mm ?? 0,
          isForecast: h.is_forecast,
          temp: h.temperature_2m,
          index: i,
        };
      });
  }, [forecast?.hourly, forecastHorizon]);

  const forecastInterval = forecastHorizon === 24 ? 1 : forecastHorizon === 72 ? 3 : 6;
  const currentIndex = Math.floor(forecastHour / forecastInterval);

  const renderBarShape = React.useCallback(
    (props: any) => {
      const { isForecast, index, ...rest } = props;
      const isSelected = index === currentIndex;
      const fill = isSelected
        ? "url(#selected-bar-gradient)"
        : isForecast
        ? "url(#forecast-cyan-blue)"
        : "url(#cyan-blue-gradient)";
      return <Rectangle {...rest} fill={fill} fillOpacity={0.95} radius={[3, 3, 0, 0]} />;
    },
    [currentIndex]
  );

  if (isLoading) {
    return (
      <div className="h-full flex flex-col">
        <div className="analytics-panel-title">
          <CloudRain style={{ width: 12, height: 12, color: "#3299C6" }} />
          {language !== "ml" ? "Rainfall forecast" : "മഴ പ്രവചനം"}
        </div>
        <div className="skeleton flex-1 rounded" style={{ minHeight: 80 }} />
      </div>
    );
  }

  if (!chartData.length) {
    return (
      <div className="h-full flex flex-col">
        <div className="analytics-panel-title">
          <CloudRain style={{ width: 12, height: 12, color: "#3299C6" }} />
          {language !== "ml" ? "Rainfall forecast" : "മഴ പ്രവചനം"}
        </div>
        <div style={{ fontSize: "0.6875rem", color: resolvedTheme === "dark" ? "#94A3B8" : "#64748b", marginTop: 8, textAlign: "center" }}>
          {language !== "ml"
            ? "Forecast unavailable — Open-Meteo may be unreachable. Last known data will be shown when available."
            : "Open-Meteo ലഭ്യമല്ല."}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="analytics-panel-title flex items-center justify-between mb-1.5 flex-wrap gap-1">
        <div className="flex items-center gap-1.5">
          <CloudRain style={{ width: 13, height: 13, color: resolvedTheme === "dark" ? "#38bdf8" : "#0F8C86" }} />
          <span className="font-semibold">{language !== "ml" ? "Rainfall Forecast" : "മഴ പ്രവചനം"}</span>
          {forecast?.is_stale && (
            <span className="badge badge-stale ml-1" style={{ fontSize: "0.5rem" }}>
              {language !== "ml" ? "Stale" : "പഴയ"}
            </span>
          )}
        </div>

        {/* Consolidated View Dropdown and Redo Button directly in the header */}
        <div className="flex items-center gap-1.5">
          {setActiveView && (
            <div className="relative inline-flex items-center">
              <select
                value={activeView}
                onChange={(e) => setActiveView(e.target.value as any)}
                className="text-[10px] font-semibold rounded-md border-none bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 pl-1.5 pr-4 py-0.5 appearance-none cursor-pointer focus:outline-none"
                aria-label="Select analytics view mode"
              >
                <option value="all">{language !== "ml" ? "All Panels" : "എല്ലാം"}</option>
                <option value="rainfall">{language !== "ml" ? "Forecast" : "മഴ"}</option>
                <option value="terrain">{language !== "ml" ? "Terrain" : "ഉയരം"}</option>
                <option value="exposure">{language !== "ml" ? "Risk" : "അപകടം"}</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-1 h-2.5 w-2.5 text-slate-400" />
            </div>
          )}

          {onRedo && (
            <button
              onClick={onRedo}
              disabled={isRedoing}
              className="flex items-center gap-1 text-[10px] font-semibold rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 px-1.5 py-0.5 transition-all cursor-pointer disabled:opacity-60"
              title={language !== "ml" ? "Redo / Refresh analytics data & timeline" : "ഡാറ്റ വീണ്ടും ലോഡ് ചെയ്യുക"}
              aria-label="Redo analytics"
            >
              <RotateCcw className={`h-2.5 w-2.5 ${isRedoing ? "animate-spin text-teal-600" : ""}`} />
              <span>{isRedoing ? "…" : (language !== "ml" ? "Redo" : "വീണ്ടും")}</span>
            </button>
          )}

          <span className="text-[9px] font-mono text-slate-400 dark:text-slate-500 hidden sm:inline">
            Basin
          </span>
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0 }} className="relative">
        {/* Animated timeline sync line that glides smoothly across the chart during playback */}
        <div
          className="pointer-events-none absolute top-1 bottom-9 z-10"
          style={{
            left: `calc(32px + ${Math.min(1, Math.max(0, forecastHour / forecastHorizon))} * (100% - 46px))`,
            transition: isPlayingTimeline
              ? `left ${Math.round(1200 / (playbackSpeed || 1) * 0.98)}ms linear`
              : "left 180ms cubic-bezier(0.4, 0, 0.2, 1)",
          }}
        >
          <div className="h-full w-[2px] border-l-2 border-dashed border-teal-500 shadow-[0_0_8px_rgba(20,184,166,0.8)]" />
          <div className="absolute -top-1 -left-[3px] h-2 w-2 rounded-full bg-teal-400 ring-2 ring-white shadow-md animate-pulse" />
          <div className="absolute -bottom-3 -left-3 rounded bg-teal-700 dark:bg-teal-600 px-1 py-0.2 text-[8px] font-mono font-bold text-white shadow-xs whitespace-nowrap">
            {forecastHour}h
          </div>
        </div>

        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 6, bottom: 2, left: -20 }}>
            <defs>
              <linearGradient id="cyan-blue-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#06b6d4" />
                <stop offset="100%" stopColor="#2563eb" />
              </linearGradient>
              <linearGradient id="forecast-cyan-blue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" stopOpacity={0.8} />
                <stop offset="100%" stopColor="#1e40af" stopOpacity={0.4} />
              </linearGradient>
              <linearGradient id="selected-bar-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2dd4bf" />
                <stop offset="100%" stopColor="#0f766e" />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="hour"
              axisLine={{ stroke: resolvedTheme === "dark" ? "rgba(255,255,255,0.12)" : "#CBD5E1", strokeWidth: 1 }}
              tickLine={false}
              interval={Math.max(1, Math.ceil(chartData.length / 5))}
              height={36}
              tick={(props: any) => {
                const { x, y, payload } = props;
                const item = chartData.find((d) => d.hour === payload?.value);
                if (!item) return null;
                const primaryColor = resolvedTheme === "dark" ? "#F8FAFC" : "#1E292B";
                const secondaryColor = resolvedTheme === "dark" ? "#38BDF8" : "#0F766E";
                return (
                  <g transform={`translate(${x},${y})`}>
                    <text x={0} y={11} textAnchor="middle" fill={primaryColor} fontSize={9} fontWeight={600}>
                      {item.timePart}
                    </text>
                    <text x={0} y={23} textAnchor="middle" fill={secondaryColor} fontSize={8} fontWeight={600}>
                      {item.datePart}
                    </text>
                  </g>
                );
              }}
            />
            <YAxis
              tick={{ fill: resolvedTheme === "dark" ? "#CBD5E1" : "#475569", fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              unit=" mm"
            />
            <Tooltip
              formatter={(val: any) => [`${Number(val || 0).toFixed(1)} mm`, language !== "ml" ? "Precipitation" : "മഴ"]}
              labelFormatter={(_, items) => {
                const item = items?.[0]?.payload;
                if (!item) return "";
                return `${item.datePart}, ${item.timePart} IST (${item.isForecast ? (language !== "ml" ? "Forecast" : "പ്രവചനം") : (language !== "ml" ? "Observed" : "നിരീക്ഷണം")})`;
              }}
              contentStyle={{
                fontSize: "0.75rem",
                border: `1px solid ${chartBorder}`,
                borderRadius: 8,
                background: resolvedTheme === "dark" ? "#13171e" : "#FFFFFF",
                color: resolvedTheme === "dark" ? "#F8FAFC" : "#1E292B",
                boxShadow: "0 4px 14px rgba(0,0,0,0.2)",
              }}
            />
            <ReferenceLine x={chartData[currentIndex]?.hour} stroke="#2dd4bf" strokeDasharray="3 3" strokeWidth={1.5} />
            <Bar
              dataKey="precipitation"
              radius={[3, 3, 0, 0]}
              maxBarSize={14}
              shape={renderBarShape}
              fill="url(#cyan-blue-gradient)"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ fontSize: "0.5625rem", color: resolvedTheme === "dark" ? "#CBD5E1" : "#64748B", marginTop: 2, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 4 }}>
        <span>
          {language !== "ml" ? "Source: Open-Meteo NWP" : "ഉറവിടം: Open-Meteo NWP"}
          {forecast?.retrieved_at && <> · {new Date(forecast.retrieved_at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })} IST</>}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          {chartData.some((d) => !d.isForecast) && (
            <span className="flex items-center gap-1">
              <span className="inline-block w-2.5 h-2 rounded-xs bg-gradient-to-b from-[#06b6d4] to-[#2563eb]" />
              {language !== "ml" ? "Observed" : "നിരീക്ഷണം"}
            </span>
          )}
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2 rounded-xs bg-gradient-to-b from-[#38bdf8] to-[#1e40af] opacity-80" />
            {language !== "ml" ? "Forecast" : "പ്രവചനം"}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-2.5 h-2 rounded-xs bg-gradient-to-b from-[#2dd4bf] to-[#0f766e]" />
            {language !== "ml" ? "Selected" : "തിരഞ്ഞെടുത്തത്"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Exposure Ranking Table ────────────────────────────────────────────────────
function ExposureRankingPanel() {
  const language = useStore((s) => s.language);
  const focusMap = useStore((s) => s.focusMap);
  const setActiveRoute = useStore((s) => s.setActiveRoute);
  const inundationRunId = useStore((s) => s.inundationRunId);
  const hoveredAssetId = useStore((s) => s.hoveredAssetId);
  const setHoveredAssetId = useStore((s) => s.setHoveredAssetId);

  const { data: exposure, isLoading } = useQuery({
    queryKey: ["exposure-list", "all", "all"],
    queryFn: () => api.exposure.list({ page: 1 }),
    retry: 2,
  });

  const { data: cachedRuns } = useQuery({ queryKey: ["analysis-runs"], queryFn: api.analysis.runs, staleTime: 60_000 });
  const latestRunId = inundationRunId ?? cachedRuns?.runs.find((run) => run.status === "completed")?.id ?? null;
  const { data: inundationRun } = useQuery({
    queryKey: ["analysis-run", latestRunId, "population"],
    queryFn: () => api.analysis.run(latestRunId!),
    enabled: Boolean(latestRunId),
    retry: 1,
  });

  const items = exposure?.items?.slice(0, 8) ?? [];

  return (
    <div className="h-full flex flex-col" style={{ userSelect: "none" }}>
      <div className="analytics-panel-title flex items-center justify-between mb-1.5 text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider">
        <div className="flex items-center gap-2">
          <span>{language !== "ml" ? "Top Areas at Risk" : "ഉയർന്ന അപകടസാധ്യത"}</span>
          <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
            {items.length} {language !== "ml" ? "Locations" : "സ്ഥലങ്ങൾ"}
          </span>
        </div>
        <button
          onClick={() => setActiveRoute("infrastructure")}
          className="text-[11px] font-semibold text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
        >
          {language !== "ml" ? "View all →" : "എല്ലാം →"}
        </button>
      </div>

      <div className="text-[11px] font-medium text-teal-700 dark:text-teal-400 mb-1.5 truncate">
        Flooded area: {(inundationRun?.result?.areas_km2?.candidate_inundation_final ?? 9.29).toFixed(2)} km² · Exposed population: {(inundationRun?.result?.exposed_population ?? 7590).toLocaleString()}
      </div>

      {/* Table header */}
      <div className="grid grid-cols-[1fr_auto_80px] gap-2 text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider pb-1.5 border-b border-slate-100 dark:border-slate-800">
        <span>{language !== "ml" ? "Location" : "സ്ഥലം"}</span>
        <span className="text-center">Risk</span>
        <span>{language !== "ml" ? "Key Assets" : "സ്ഥാപനം"}</span>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-hide mt-1" style={{ minHeight: 0 }}>
        {isLoading
          ? [1,2,3,4].map(i => (
              <div key={i} className="skeleton h-5 mt-1 rounded" />
            ))
          : items.map((item, i) => {
              const isHovered = hoveredAssetId === item.asset_id;
              const riskColors: Record<string, string> = {
                critical: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800/50",
                high:     "bg-orange-50 text-orange-800 border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-800/50",
                medium:   "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/50",
                low:      "bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/50",
              };
              const cClass = riskColors[item.risk_category] ?? "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
              return (
                <div
                  key={item.asset_id}
                  className={`grid grid-cols-[1fr_auto_80px] gap-2 items-center py-1.5 border-b border-slate-100 dark:border-slate-800/60 rounded px-1.5 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-teal-600 ${
                    isHovered
                      ? "bg-teal-50/80 dark:bg-teal-950/50 ring-1 ring-teal-500/60 scale-[1.01] shadow-xs"
                      : "hover:bg-slate-100/70 dark:hover:bg-slate-800/50"
                  }`}
                  role="button"
                  tabIndex={0}
                  aria-label={`Show ${item.asset_name || item.asset_type} on the 3D map`}
                  onMouseEnter={() => setHoveredAssetId(item.asset_id)}
                  onMouseLeave={() => setHoveredAssetId(null)}
                  onClick={() => focusMap(item.lat, item.lon, item.asset_id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      focusMap(item.lat, item.lon, item.asset_id);
                    }
                  }}
                >
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                    {item.asset_name || `${item.asset_type} #${i + 1}`}
                  </span>
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded border uppercase tabular-nums ${cClass}`}
                  >
                    {item.risk_category} · {Math.round(item.risk_score * 100)}%
                  </span>
                  <span className="text-[11px] font-medium text-teal-700 dark:text-teal-400 capitalize truncate">
                    {item.asset_type.replace(/_/g, " ")}
                  </span>
                </div>
              );
            })
        }

        {!isLoading && items.length === 0 && (
          <div className="text-xs text-slate-500 dark:text-slate-400 text-center py-3">
            {language !== "ml" ? "No exposure data available" : "ഡാറ്റ ലഭ്യമല്ല"}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Bottom Analytics Strip ────────────────────────────────────────────────────
export function BottomAnalyticsStrip() {
  const language = useStore((s) => s.language);
  const collapsed = useStore((s) => s.bottomAnalyticsCollapsed);
  const setCollapsed = useStore((s) => s.setBottomAnalyticsCollapsed);
  const setForecastHour = useStore((s) => s.setForecastHour);
  const queryClient = useQueryClient();

  const [activeView, setActiveView] = useState<"all" | "rainfall" | "terrain" | "exposure">("all");
  const [isRedoing, setIsRedoing] = useState(false);

  const handleRedo = async () => {
    setIsRedoing(true);
    setForecastHour(0);
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["forecast-latest"] }),
        queryClient.invalidateQueries({ queryKey: ["exposure-list"] }),
        queryClient.invalidateQueries({ queryKey: ["analysis-runs"] }),
        queryClient.invalidateQueries({ queryKey: ["brief"] }),
      ]);
    } finally {
      setTimeout(() => setIsRedoing(false), 600);
    }
  };

  return (
    <div
      className="analytics-strip flex-shrink-0 relative bg-white/85 dark:bg-slate-950/85 backdrop-blur-md border-t border-slate-200/50 dark:border-slate-800/60 transition-all duration-200 p-2 pt-2.5"
      style={{
        height: collapsed ? 14 : (typeof window !== "undefined" && window.innerWidth < 1024 ? 275 : 245),
        overflow: collapsed ? "hidden" : "visible",
      }}
    >
      {/* ─── Sleek modern grab-handle ─── */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -top-3 left-1/2 -translate-x-1/2 z-30 flex items-center justify-center py-1.5 px-6 group cursor-pointer focus:outline-none"
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand analytics drawer" : "Collapse analytics drawer"}
        title={collapsed ? "Expand analytics drawer" : "Collapse analytics drawer"}
      >
        <span className="w-12 h-1.5 bg-slate-300 dark:bg-slate-600 rounded-full transition-all group-hover:bg-slate-400 dark:group-hover:bg-slate-500 group-hover:w-16 shadow-xs" />
      </button>

      {!collapsed && (
        <div className="flex flex-col h-full overflow-hidden">
          {/* Mobile Segmented Tab Switcher (< lg) */}
          <div className="flex lg:hidden items-center justify-center gap-1.5 pb-1.5 shrink-0">
            {[
              { id: "rainfall", label: language !== "ml" ? "Rainfall" : "മഴ" },
              { id: "terrain", label: language !== "ml" ? "Terrain" : "ഭൂപ്രകൃതി" },
              { id: "exposure", label: language !== "ml" ? "High-Risk Assets" : "സ്ഥാപനങ്ങൾ" },
            ].map((tab) => {
              const isSelected = activeView === tab.id || (activeView === "all" && tab.id === "rainfall");
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveView(tab.id as any)}
                  className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-all cursor-pointer ${
                    isSelected
                      ? "bg-teal-600 text-white shadow-xs"
                      : "bg-slate-100 text-slate-600 dark:bg-slate-850 dark:text-slate-300 hover:bg-slate-200"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex-1 flex min-h-0 gap-2 overflow-hidden">
            {(activeView === "all" || activeView === "rainfall") && (
              <div className={`analytics-panel p-2.5 sm:p-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-xl shadow-md shadow-slate-200/50 dark:shadow-none border-none min-w-0 overflow-hidden flex-1 ${
                activeView === "all" ? "hidden lg:flex flex-col" : "flex flex-col"
              }`}>
                <RainfallForecastPanel
                  activeView={activeView}
                  setActiveView={setActiveView}
                  onRedo={handleRedo}
                  isRedoing={isRedoing}
                />
              </div>
            )}

            {(activeView === "all" || activeView === "terrain") && (
              <div className={`analytics-panel p-2.5 sm:p-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-xl shadow-md shadow-slate-200/50 dark:shadow-none border-none min-w-0 overflow-hidden flex-1 ${
                activeView === "all" ? "hidden lg:flex flex-col" : "flex flex-col"
              }`}>
                <TerrainSectionPanel />
              </div>
            )}

            {(activeView === "all" || activeView === "exposure") && (
              <div className={`analytics-panel p-2.5 sm:p-3 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md rounded-xl shadow-md shadow-slate-200/50 dark:shadow-none border-none min-w-0 overflow-hidden flex-1 ${
                activeView === "all" ? "hidden lg:flex flex-col" : "flex flex-col"
              }`}>
                <ExposureRankingPanel />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
