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
    return forecast.hourly
      .filter((_, i) => i % 3 === 0)
      .slice(0, 24)
      .map((h, i) => {
        const date = new Date(h.time);
        const hLabel = `${date.getHours()}h`;
        return {
          hour: hLabel,
          precipitation: h.precipitation_mm ?? 0,
          isForecast: h.is_forecast,
          temp: h.temperature_2m,
          index: i,
        };
      });
  }, [forecast?.hourly]);

  const currentIndex = Math.floor(forecastHour / 3);

  const renderBarShape = React.useCallback(
    (props: any) => {
      const { isForecast, index, ...rest } = props;
      const isSelected = index === currentIndex;
      const fill = isForecast
        ? (isSelected ? "#155E59" : "#DCEFF3")
        : "#3299C6";
      return <Rectangle {...rest} fill={fill} fillOpacity={0.85} radius={[2, 2, 0, 0]} />;
    },
    [currentIndex]
  );

  if (isLoading) {
    return (
      <div className="h-full flex flex-col">
        <div className="analytics-panel-title">
          <CloudRain style={{ width: 12, height: 12, color: "#3299C6" }} />
          {language === "en" ? "Rainfall Forecast (Chalakudy Basin)" : "മഴ പ്രവചനം"}
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
          {language === "en" ? "Rainfall Forecast (Chalakudy Basin)" : "മഴ പ്രവചനം"}
        </div>
        <div style={{ fontSize: "0.6875rem", color: "#9ca3af", marginTop: 8, textAlign: "center" }}>
          {language === "en"
            ? "Forecast unavailable — Open-Meteo may be unreachable. Last known data will be shown when available."
            : "Open-Meteo ലഭ്യമല്ല."}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <div className="analytics-panel-title">
        <CloudRain style={{ width: 12, height: 12, color: "#3299C6" }} />
        {language === "en" ? "Rainfall Forecast (Chalakudy Basin)" : "മഴ പ്രവചനം"}
        {forecast?.is_stale && (
          <span className="badge badge-stale ml-1" style={{ fontSize: "0.5rem" }}>
            {language === "en" ? "Stale" : "പഴയ"}
          </span>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 2, right: 4, bottom: 0, left: -20 }}>
            <defs>
              <linearGradient id="rainfall-gradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#39BBD0" />
                <stop offset="100%" stopColor="#087F8C" />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="hour"
              tick={{ fill: chartText, fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              interval={3}
            />
            <YAxis
              tick={{ fill: chartText, fontSize: 9 }}
              axisLine={false}
              tickLine={false}
              unit=" mm"
            />
            <Tooltip
              formatter={(val: any) => [`${Number(val || 0).toFixed(1)} mm`, language === "en" ? "Precipitation" : "മഴ"]}
              labelFormatter={(l) => `${l} (${language === "en" ? "Forecast" : "പ്രവചനം"})`}
              contentStyle={{ fontSize: "0.6875rem", border: `1px solid ${chartBorder}`, borderRadius: 6, background: resolvedTheme === "dark" ? "#102832" : "#FFFFFF", color: resolvedTheme === "dark" ? "#F8FAFC" : "#26332F" }}
            />
            <ReferenceLine x={chartData[currentIndex]?.hour} stroke="#155E59" strokeDasharray="2 2" strokeWidth={1.5} />
            <Bar
              dataKey="precipitation"
              radius={[2, 2, 0, 0]}
              maxBarSize={12}
              shape={renderBarShape}
              fill="url(#rainfall-gradient)"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div style={{ fontSize: "0.5rem", color: "#9ca3af", marginTop: 2 }}>
        {language === "en" ? "Source: Open-Meteo NWP" : "ഉറവിടം: Open-Meteo NWP"} ·{" "}
        {chartData.some((d) => !d.isForecast) && (
          <><span style={{ color: "#3299C6" }}>█</span> {language === "en" ? "Past hours (model analysis, not gauge data)" : "കഴിഞ്ഞ മണിക്കൂറുകൾ (മോഡൽ)"}{" "}</>
        )}
        <span style={{ color: "#DCEFF3", border: "1px solid #9ca3af" }}>█</span> {language === "en" ? "Forecast" : "പ്രവചനം"}
        {forecast?.retrieved_at && <> · {language === "en" ? "retrieved" : "ശേഖരിച്ചത്"} {new Date(forecast.retrieved_at).toLocaleTimeString()}</>}
      </div>
    </div>
  );
}

// ─── Exposure Ranking Table ────────────────────────────────────────────────────
function ExposureRankingPanel() {
  const language = useStore((s) => s.language);
  const setSelectedAssetId = useStore((s) => s.setSelectedAssetId);
  const setActiveRoute = useStore((s) => s.setActiveRoute);
  const inundationRunId = useStore((s) => s.inundationRunId);

  const { data: exposure, isLoading } = useQuery({
    queryKey: ["exposure-list", "all", "all"],
    queryFn: () => api.exposure.list({ page: 1 }),
    retry: 2,
  });

  const { data: inundationRun } = useQuery({
    queryKey: ["analysis-run", inundationRunId, "population"],
    queryFn: () => api.analysis.run(inundationRunId!),
    enabled: Boolean(inundationRunId),
    retry: 1,
  });

  const items = exposure?.items?.slice(0, 8) ?? [];

  return (
    <div className="h-full flex flex-col">
      <div className="analytics-panel-title">
        <TrendingUp style={{ width: 12, height: 12, color: "#E7A23B" }} />
        {language === "en" ? "Top Areas at Risk" : "ഉയർന്ന അപകടസാധ്യത"}
        <button
          onClick={() => setActiveRoute("infrastructure")}
          style={{ marginLeft: "auto", fontSize: "0.5625rem", color: "#155E59", fontWeight: 500, background: "none", border: "none", cursor: "pointer", padding: 0 }}
        >
          {language === "en" ? "View all →" : "എല്ലാം →"}
        </button>
      </div>
      {inundationRun?.status === "completed" && (
        <div style={{ fontSize: "0.5625rem", color: "#155E59", marginBottom: 4 }}>
          Exposed population: {(inundationRun.result?.exposed_population ?? 0).toLocaleString()}
        </div>
      )}

      {/* Table header */}
      <div
        className="grid"
        style={{
          gridTemplateColumns: "1fr 48px 40px 80px",
          gap: 4,
          fontSize: "0.5rem",
          color: "#9ca3af",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.03em",
          paddingBottom: 3,
          borderBottom: "1px solid #DCE4DD",
        }}
      >
        <span>{language === "en" ? "Location" : "സ്ഥലം"}</span>
        <span style={{ textAlign: "center" }}>Risk</span>
        <span style={{ textAlign: "center" }}>Score</span>
        <span>{language === "en" ? "Key Assets" : "സ്ഥാപനം"}</span>
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
                  className="grid"
                  style={{
                    gridTemplateColumns: "1fr 48px 40px 80px",
                    gap: 4,
                    alignItems: "center",
                    padding: "4px 0",
                    borderBottom: "1px solid #F7F8F4",
                    cursor: "pointer",
                  }}
                  onClick={() => { setSelectedAssetId(item.asset_id); setActiveRoute("map"); }}
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
                    }}
                  >
                    {item.risk_category}
                  </span>
                  <span style={{ fontSize: "0.625rem", color: "#687770", textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                    {Math.round(item.risk_score * 100)}%
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
            {language === "en" ? "No exposure data available" : "ഡാറ്റ ലഭ്യമല്ല"}
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
        {collapsed ? (language === "en" ? "Show Analytics" : "വിശകലനം") : (language === "en" ? "Analytics" : "വിശകലനം")}
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
