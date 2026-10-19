"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/store";
import { useTheme } from "@/components/providers/ThemeProvider";
import { useQuery } from "@tanstack/react-query";
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
import { CloudRain, TrendingUp, ChevronDown } from "lucide-react";
import { TerrainSectionPanel } from "@/components/panels/TerrainSectionPanel";

// ─── Rainfall Forecast Mini Panel ─────────────────────────────────────────────
function RainfallForecastPanel() {
  const language = useStore((s) => s.language);
  const forecastHour = useStore((s) => s.forecastHour);
  const forecastHorizon = useStore((s) => s.forecastHorizon);
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
      const fill = isForecast
        ? (isSelected ? "#0F8C86" : (resolvedTheme === "dark" ? "#1e3a5f" : "#DCEFF3"))
        : (resolvedTheme === "dark" ? "#38bdf8" : "#3299C6");
      return <Rectangle {...rest} fill={fill} fillOpacity={0.9} radius={[2, 2, 0, 0]} />;
    },
    [currentIndex, resolvedTheme]
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
      <div className="analytics-panel-title flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <CloudRain style={{ width: 13, height: 13, color: resolvedTheme === "dark" ? "#38bdf8" : "#0F8C86" }} />
          <span className="font-semibold">{language !== "ml" ? "Rainfall Forecast" : "മഴ പ്രവചനം"}</span>
          {forecast?.is_stale && (
            <span className="badge badge-stale ml-1" style={{ fontSize: "0.5rem" }}>
              {language !== "ml" ? "Stale" : "പഴയ"}
            </span>
          )}
        </div>
        <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
          Chalakudy Basin
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 6, bottom: 2, left: -20 }}>
            <defs>
              <linearGradient id="rainfall-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#38bdf8" />
                <stop offset="100%" stopColor="#0284c7" />
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
              radius={[2, 2, 0, 0]}
              maxBarSize={14}
              shape={renderBarShape}
              fill="url(#rainfall-gradient)"
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
            <span><span style={{ color: "#38bdf8" }}>█</span> {language !== "ml" ? "Observed" : "നിരീക്ഷണം"}</span>
          )}
          <span><span style={{ color: resolvedTheme === "dark" ? "#1e3a5f" : "#DCEFF3", border: "1px solid #64748b" }}>█</span> {language !== "ml" ? "Forecast" : "പ്രവചനം"}</span>
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
      <div className="analytics-panel-title">
        <TrendingUp style={{ width: 12, height: 12, color: "#E7A23B" }} />
        {language !== "ml" ? "Top Areas at Risk" : "ഉയർന്ന അപകടസാധ്യത"}
        <button
          onClick={() => setActiveRoute("infrastructure")}
          style={{ marginLeft: "auto", fontSize: "0.5625rem", color: "#155E59", fontWeight: 500, background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          {language !== "ml" ? "View all →" : "എല്ലാം →"}
        </button>
      </div>
      {inundationRun?.status === "completed" && (
        <div style={{ fontSize: "0.5625rem", color: "#155E59", marginBottom: 4 }}>
          Flooded area: {(inundationRun.result?.areas_km2?.candidate_inundation_final ?? 0).toFixed(2)} km² · Exposed population: {(inundationRun.result?.exposed_population ?? 0).toLocaleString()}
        </div>
      )}

      {/* Table header */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: "1fr auto 80px",
          gap: 8,
          fontSize: "0.5rem",
          color: "#9ca3af",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.03em",
          paddingBottom: 3,
          borderBottom: "1px solid #DCE4DD",
        }}
      >
        <span>{language !== "ml" ? "Location" : "സ്ഥലം"}</span>
        <span style={{ textAlign: "center" }}>Risk</span>
        <span>{language !== "ml" ? "Key Assets" : "സ്ഥാപനം"}</span>
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin" style={{ minHeight: 0 }}>
        {isLoading
          ? [1,2,3,4].map(i => (
              <div key={i} className="skeleton" style={{ height: 18, marginTop: 4, borderRadius: 3 }} />
            ))
          : items.map((item, i) => {
              const riskColors: Record<string, { bg: string; text: string }> = {
                critical: { bg: "#fef2f2", text: "#b91c1c" },
                high:     { bg: "#fff7ed", text: "#c2410c" },
                medium:   { bg: "#fffbeb", text: "#92400e" },
                low:      { bg: "#f0fdf4", text: "#15803d" },
              };
              const c = riskColors[item.risk_category] ?? { bg: "#f3f4f6", text: "#6b7280" };
              return (
                <div
                  key={item.asset_id}
                  className="grid rounded-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-teal-600"
                  style={{
                    gridTemplateColumns: "1fr auto 80px",
                    gap: 8,
                    alignItems: "center",
                    padding: "4px 0",
                    borderBottom: "1px solid #F7F8F4",
                    cursor: "pointer",
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`Show ${item.asset_name || item.asset_type} on the 3D map`}
                  onClick={() => focusMap(item.lat, item.lon, item.asset_id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      focusMap(item.lat, item.lon, item.asset_id);
                    }
                  }}
                >
                  <span style={{ fontSize: "0.625rem", fontWeight: 500, color: "#26332F", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.asset_name || `${item.asset_type} #${i + 1}`}
                  </span>
                  <span
                    style={{
                      fontSize: "0.5rem",
                      fontWeight: 700,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                      padding: "1px 4px",
                      borderRadius: 3,
                      background: c.bg,
                      color: c.text,
                      textTransform: "uppercase",
                      marginRight: 6,
                    }}
                  >
                    {item.risk_category} · {Math.round(item.risk_score * 100)}%
                  </span>
                  <span style={{ fontSize: "0.5625rem", color: "#155E59", textTransform: "capitalize", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.asset_type.replace(/_/g, " ")}
                  </span>
                </div>
              );
            })
        }

        {!isLoading && items.length === 0 && (
          <div style={{ fontSize: "0.6875rem", color: "#9ca3af", textAlign: "center", padding: "12px 0" }}>
            {language !== "ml" ? "No exposure data available" : "ഡാറ്റ ലഭ്യമല്ല"}
          </div>
        )}
      </div>

      {exposure?.warnings && exposure.warnings.length > 0 && (
        <div style={{ fontSize: "0.5rem", color: "#92400e", marginTop: 3 }}>
          ⚠ {exposure.warnings[0]}
        </div>
      )}
    </div>
  );
}

// ─── Bottom Analytics Strip ────────────────────────────────────────────────────
export function BottomAnalyticsStrip() {
  const language = useStore((s) => s.language);
  const [collapsed, setCollapsed] = useState(false);
  const STRIP_HEIGHT = 240;

  return (
    <div
      className="analytics-strip flex-shrink-0 relative"
      style={{ height: collapsed ? 0 : STRIP_HEIGHT, overflow: collapsed ? "hidden" : "visible", transition: "height 200ms ease" }}
    >
      {/* Collapse toggle */}
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="absolute -top-5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 rounded-t-md"
        style={{ background: "white", border: "1px solid #DCE4DD", borderBottom: "none", padding: "1px 10px", fontSize: "0.5625rem", color: "#687770", cursor: "pointer" }}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand analytics" : "Collapse analytics"}
      >
        <ChevronDown style={{ width: 10, height: 10, transform: collapsed ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 200ms" }} />
        {collapsed ? (language !== "ml" ? "Show Analytics" : "വിശകലനം") : (language !== "ml" ? "Analytics" : "വിശകലനം")}
      </button>

      {!collapsed && (
        <div className="flex h-full">
          {/* Rainfall Forecast */}
          <div className="analytics-panel" style={{ flex: 1.2 }}>
            <RainfallForecastPanel />
          </div>

          {/* Elevation Cross-section */}
          <div className="analytics-panel" style={{ flex: 1.3 }}>
            <TerrainSectionPanel />
          </div>

          {/* Exposure Ranking */}
          <div className="analytics-panel" style={{ flex: 1.4 }}>
            <ExposureRankingPanel />
          </div>
        </div>
      )}
    </div>
  );
}
