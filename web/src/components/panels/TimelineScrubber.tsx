"use client";

import React, { useState, useEffect } from "react";
import { useStore } from "@/lib/store";
import { useQuery } from "@tanstack/react-query";
import { api, ForecastResponse } from "@/lib/api";
import { Play, Pause, RotateCcw, CloudRain, Clock, AlertCircle } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Rectangle,
} from "recharts";

export function TimelineScrubber() {
  const { forecastHour, setForecastHour } = useStore();
  const [isPlaying, setIsPlaying] = useState(false);

  const { data: forecast, isLoading } = useQuery<ForecastResponse>({
    queryKey: ["forecast-latest"],
    queryFn: () => api.forecast.latest(),
    refetchInterval: 300000,
  });

  // Playback timer (loops 0h to 72h)
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      const current = useStore.getState().forecastHour;
      setForecastHour(current >= 72 ? 0 : current + 3);
    }, 1200);
    return () => clearInterval(interval);
  }, [isPlaying, setForecastHour]);

  const hourlyData = (forecast?.hourly || []).slice(0, 73).map((item, idx) => {
    const date = new Date(item.time);
    const label = `${date.getHours().toString().padStart(2, "0")}:00`;
    return {
      hourIndex: idx,
      time: label,
      precip: item.precipitation_mm || 0,
      isCurrent: idx === forecastHour,
    };
  });

  // Calculate cumulative rain up to selected hour
  const currentAccumulation = hourlyData
    .slice(0, forecastHour + 1)
    .reduce((sum, d) => sum + d.precip, 0);

  return (
    <div className="bg-surface border-t border-border px-4 py-2 select-none z-20 flex flex-col gap-2 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Playback Controls & Current Time Badge */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-1.5 rounded-full bg-primary text-white hover:bg-primary-dark transition-colors shadow-xs"
            title={isPlaying ? "Pause timeline" : "Play 72h forecast"}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 translate-x-0.5" />}
          </button>

          <button
            onClick={() => {
              setIsPlaying(false);
              setForecastHour(0);
            }}
            className="p-1.5 rounded-full text-text-secondary hover:bg-surface-secondary hover:text-text transition-colors"
            title="Reset to 0h"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>

          <div className="flex items-center gap-2 pl-2 border-l border-border">
            <span className="badge bg-surface-secondary text-primary font-mono text-xs font-semibold px-2 py-0.5">
              +{forecastHour}h Forecast
            </span>
            <span className="text-2xs text-text-secondary flex items-center gap-1 font-mono">
              <CloudRain className="w-3 h-3 text-primary" />
              Accumulated: <strong className="text-text">{currentAccumulation.toFixed(1)} mm</strong>
            </span>
          </div>
        </div>

        {/* 24h, 48h, 72h benchmark badges */}
        <div className="flex items-center gap-2 text-2xs font-mono">
          <span className="text-text-secondary">Precipitation Horizons:</span>
          <button
            onClick={() => setForecastHour(24)}
            className={`px-2 py-0.5 rounded border transition-colors ${
              forecastHour === 24
                ? "bg-primary text-white border-primary font-semibold"
                : "bg-surface text-text-secondary border-border hover:bg-surface-secondary"
            }`}
          >
            24h ({forecast?.rainfall_accumulations?.find((a) => a.window_hours === 24)?.accumulation_mm?.toFixed(0) || "—"}mm)
          </button>
          <button
            onClick={() => setForecastHour(48)}
            className={`px-2 py-0.5 rounded border transition-colors ${
              forecastHour === 48
                ? "bg-primary text-white border-primary font-semibold"
                : "bg-surface text-text-secondary border-border hover:bg-surface-secondary"
            }`}
          >
            48h ({forecast?.rainfall_accumulations?.find((a) => a.window_hours === 48)?.accumulation_mm?.toFixed(0) || "—"}mm)
          </button>
          <button
            onClick={() => setForecastHour(72)}
            className={`px-2 py-0.5 rounded border transition-colors ${
              forecastHour === 72
                ? "bg-primary text-white border-primary font-semibold"
                : "bg-surface text-text-secondary border-border hover:bg-surface-secondary"
            }`}
          >
            72h ({forecast?.rainfall_accumulations?.find((a) => a.window_hours === 72)?.accumulation_mm?.toFixed(0) || "—"}mm)
          </button>
        </div>
      </div>

      {/* Hyetograph Chart & Slider */}
      <div className="relative w-full">
        {/* Recharts Precipitation Hyetograph */}
        <div className="h-10 w-full mb-1">
          {hourlyData.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                <Tooltip
                  cursor={{ fill: "rgba(36, 107, 98, 0.1)" }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const data = payload[0].payload;
                      return (
                        <div className="bg-surface border border-border p-1.5 rounded shadow-panel text-2xs font-mono">
                          <div>+{data.hourIndex}h ({data.time})</div>
                          <div className="text-primary font-semibold">{Number(data.precip).toFixed(1)} mm/hr</div>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Bar
                  dataKey="precip"
                  radius={[2, 2, 0, 0]}
                  shape={(props: any) => {
                    const { hourIndex, ...rest } = props;
                    const fill = hourIndex <= forecastHour ? "#246B62" : "#DCE4DD";
                    return <Rectangle {...rest} fill={fill} radius={[2, 2, 0, 0]} />;
                  }}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-2xs text-text-secondary">
              Loading weather hyetograph...
            </div>
          )}
        </div>

        {/* Range Slider */}
        <input
          type="range"
          min="0"
          max="72"
          step="1"
          value={forecastHour}
          onChange={(e) => setForecastHour(Number(e.target.value))}
          className="w-full h-1.5 bg-border rounded-lg appearance-none cursor-pointer accent-primary"
        />
        <div className="flex justify-between text-[10px] text-text-secondary font-mono mt-0.5">
          <span>Now (0h)</span>
          <span>+24h</span>
          <span>+48h</span>
          <span>+72h Forecast Horizon</span>
        </div>
      </div>
    </div>
  );
}
