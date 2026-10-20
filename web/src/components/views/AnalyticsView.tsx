"use client";

import React, { useState } from "react";
import { Info } from "lucide-react";
import { useStore } from "@/lib/store";
import { getTranslations } from "@/lib/translations";
import { AnalysisView } from "@/components/views/AnalysisView";
import { useQuery } from "@tanstack/react-query";
import { api, APIError, ModelEvaluation } from "@/lib/api";
import { useTheme } from "@/components/providers/ThemeProvider";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  ComposedChart,
  AreaChart,
  Area,
  Bar,
  BarChart,
  Line,
  ReferenceArea,
  Legend,
  Label,
} from "recharts";

const fmt = (v: number | null | undefined, digits = 3) => (v == null ? "—" : v.toFixed(digits));
type HistoricalEventsResponse = { events: { event_id: string; name: string; start_date: string; end_date: string; description: string; source: string; source_url?: string; flood_extent_available: boolean; notes?: string | null }[]; note?: string };

function InfoTip({ text }: { text: string }) {
  return <span className="group relative inline-flex align-middle">
    <button type="button" aria-label={text} className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-teal-300">
      <Info size={14} aria-hidden="true" />
    </button>
    <span role="tooltip" className="pointer-events-none invisible absolute bottom-full left-1/2 z-20 mb-2 w-64 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-left text-xs font-normal leading-relaxed text-white opacity-0 shadow-lg transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">{text}</span>
  </span>;
}

type HistoricalRainPoint = { dayOffset: number; year2018?: number; year2019?: number; date2018?: string; date2019?: string };

function HistoricalRainTooltip({ active, payload }: { active?: boolean; payload?: { payload?: HistoricalRainPoint }[] }) {
  const row = payload?.[0]?.payload;
  if (!active || !row) return null;
  const dateLabel = (date: string) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
  const offset = row.dayOffset > 0 ? `+${row.dayOffset}` : `${row.dayOffset}`;
  return <div className="rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-white shadow-lg">
    <p className="mb-1 font-semibold">Day {offset} from peak daily rainfall</p>
    {row.date2018 && <p>2018 · {dateLabel(row.date2018)}{row.year2018 == null ? "" : ` · ${row.year2018.toFixed(1)} mm`}</p>}
    {row.date2019 && <p>2019 · {dateLabel(row.date2019)}{row.year2019 == null ? "" : ` · ${row.year2019.toFixed(1)} mm`}</p>}
  </div>;
}

/** Real held-out evaluation of the latest saved Random Forest experiment. Renders nothing it was not given. */
function ModelEvalPanel({ ev, isLoading, isError }: { ev: ModelEvaluation | undefined; isLoading: boolean; isError: boolean }) {
  const { resolvedTheme } = useTheme();
  const axisTextColor = resolvedTheme === "dark" ? "#e5e7eb" : "#687770";
  const gridStroke = resolvedTheme === "dark" ? "#374151" : "#94A3B8";
  const featureNames = Object.keys(ev?.feature_importance ?? {});
  const isTopographyProxy = featureNames.length === 0 || featureNames.every((name) => ["elevation", "slope"].includes(name.toLowerCase()));
  const { data: terrain, isLoading: terrainLoading, isError: terrainError } = useQuery({
    queryKey: ["model-terrain-distribution"],
    queryFn: () => api.model.terrainDistribution(),
    enabled: isTopographyProxy,
    staleTime: 86_400_000,
    retry: 1,
  });
  if (isLoading && !terrain) return <div className="text-xs text-text-secondary">Loading model evaluation…</div>;
  if (isTopographyProxy) {
    const elevations = terrain?.hypsometric.map((point) => point.elevation_m) ?? [];
    const minElevationTick = elevations.length ? Math.floor(Math.min(...elevations) / 100) * 100 : 0;
    const maxElevationTick = elevations.length ? Math.max(minElevationTick + 100, Math.ceil(Math.max(...elevations) / 100) * 100) : 400;
    const elevationTicks = Array.from({ length: Math.max(2, (maxElevationTick - minElevationTick) / 100 + 1) }, (_, index) => minElevationTick + index * 100);
    return (
      <div className="flex-1 min-h-0 flex flex-col space-y-4">
        {/* Baseline Topography Model Banner Card */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:bg-neutral-900 dark:border-neutral-800 shrink-0">
          <h3 className="text-base font-semibold text-[#1E292B] dark:text-slate-50">Baseline Topography Model</h3>
          <p className="mt-1 text-sm leading-relaxed text-[#687770] dark:text-slate-400">
            Elevation and slope describe static terrain susceptibility. These terrain summaries are not flood-event predictions; independent radar validation is unavailable.
          </p>
        </section>

        {terrainLoading ? (
          <div className="flex-1 min-h-0 grid place-items-center rounded-xl border border-slate-200 bg-white text-sm text-text-secondary shadow-xs dark:bg-neutral-900 dark:border-neutral-800">
            Loading study-area DEM samples…
          </div>
        ) : terrainError || !terrain ? (
          <div role="status" className="flex-1 min-h-0 grid place-items-center rounded-xl border border-slate-200 bg-white text-sm text-text-secondary shadow-xs dark:bg-neutral-900 dark:border-neutral-800">
            Study-area terrain samples are temporarily unavailable.
          </div>
        ) : (
          <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-2 gap-4">
            <article className="flex-1 min-h-0 flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:bg-neutral-900 dark:border-neutral-800">
              <div className="shrink-0 flex items-center justify-between mb-1">
                <h4 className="flex items-center text-sm font-semibold text-[#1E292B] dark:text-slate-50">
                  <span>Hypsometric Curve</span>
                  <InfoTip text={`${terrain.source} · ${terrain.sampled_cells.toLocaleString()} point samples. The curve describes the sample distribution; it is not area-weighted basin hypsometry. ${terrain.known_limitations}`} />
                </h4>
              </div>
              <p className="shrink-0 text-xs text-[#687770] dark:text-slate-400 mb-2">
                {terrain.measurement_basis === "sample_points" ? "Share of DEM sample points below each elevation" : "Share of sampled study-area surface below each elevation"}
              </p>
              <div className="flex-1 min-h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={terrain.hypsometric} margin={{ top: 8, right: 10, bottom: 2, left: -12 }}>
                    <defs>
                      <linearGradient id="hypsometricFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#0D9488" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#0D9488" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} strokeOpacity={0.15} />
                    <XAxis dataKey="elevation_m" type="number" domain={[minElevationTick, maxElevationTick]} ticks={elevationTicks} tick={{ fontSize: 10, fill: axisTextColor }} tickFormatter={(value) => `${value} m`} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: axisTextColor }} unit="%" />
                    <Tooltip contentStyle={{ backgroundColor: "#171717", borderRadius: 8, border: "none", color: "#fff", fontSize: 12 }} formatter={(value) => [`${Number(value).toFixed(1)}%`, terrain.measurement_basis === "sample_points" ? "Sample points below elevation" : "Area below elevation"]} labelFormatter={(value) => `${Number(value).toFixed(0)} m`} />
                    <Area type="monotone" dataKey="area_below_pct" stroke="#0D9488" strokeWidth={2.5} fill="url(#hypsometricFill)" name="Area below elevation" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <div className="shrink-0 mt-3 text-[11px] text-[#687770] dark:text-neutral-500 truncate">
                {terrain.source} · {terrain.sampled_cells.toLocaleString()} terrain samples
              </div>
            </article>

            <article className="flex-1 min-h-0 flex flex-col rounded-xl border border-slate-200 bg-white p-5 shadow-xs dark:bg-neutral-900 dark:border-neutral-800">
              <div className="shrink-0 flex items-center justify-between mb-1">
                <h4 className="flex items-center text-sm font-semibold text-[#1E292B] dark:text-slate-50">
                  <span>Slope Distribution</span>
                  <InfoTip text={`${terrain.source} · ${terrain.sampled_cells.toLocaleString()} point samples. Slope shares describe the available samples, not basin-area proportions. ${terrain.known_limitations}`} />
                </h4>
              </div>
              <p className="shrink-0 text-xs text-[#687770] dark:text-slate-400 mb-2">
                Share of sampled terrain by slope class
              </p>
              <div className="flex-1 min-h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={terrain.slope_histogram} margin={{ top: 8, right: 10, bottom: 2, left: -12 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} strokeOpacity={0.15} />
                    <XAxis dataKey="slope_bin" tick={{ fontSize: 10, fill: axisTextColor }} />
                    <YAxis tick={{ fontSize: 10, fill: axisTextColor }} unit="%" />
                    <Tooltip contentStyle={{ backgroundColor: "#171717", borderRadius: 8, border: "none", color: "#fff", fontSize: 12 }} formatter={(value) => [`${Number(value).toFixed(1)}%`, terrain.measurement_basis === "sample_points" ? "Sample points" : "Sampled area"]} />
                    <Bar dataKey="share_pct" fill="#3B82F6" fillOpacity={0.88} radius={[4, 4, 0, 0]} name={terrain.measurement_basis === "sample_points" ? "Samples by slope" : "Area by slope"} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>
          </div>
        )}
      </div>
    );
  }
  if (isError) return <div role="alert" className="rounded-xl border border-border bg-white p-5 text-sm text-text-secondary dark:bg-neutral-900 dark:border-none dark:shadow-xl">Model evaluation is unavailable.</div>;
  if (!ev) return <div className="rounded-xl border border-border bg-white p-5 text-sm text-text-secondary dark:bg-neutral-900 dark:border-none dark:shadow-xl">No model evaluation is available.</div>;
  if (ev.status !== "evaluated") {
    return (
      <div className="bg-white border border-dashed border-[#CBD5E1] rounded-xl p-5 text-sm text-[#26332F] dark:bg-neutral-900 dark:border-none dark:shadow-xl dark:text-slate-200">
        <b>No evaluation available.</b>
        <details className="ux-disclosure mt-2 text-xs text-text-secondary">
          <summary>Training requirements</summary>
          <p className="pt-2">Provide independently labelled <code>data/labeled_flood_features.csv</code> with <code>label, region_id, vv</code> and optional <code>vh, elevation, slope</code>, then run <code>python -m app.analysis.ml_lab train --csv data/labeled_flood_features.csv</code> from <code>backend/</code>.</p>
        </details>
      </div>
    );
  }
  const m = ev.metrics;
  const cm = ev.confusion_matrix?.matrix;
  const imp = Object.entries(ev.feature_importance ?? {}).sort((a, b) => b[1] - a[1]);
  const kpis: [string, string][] = [
    ["Precision", fmt(m.precision)], ["Recall", fmt(m.recall)], ["F1", fmt(m.f1)],
    ["IoU", fmt(m.iou)], ["ROC-AUC", fmt(m.roc_auc)], ["Brier score", fmt(m.brier_score)],
  ];
  const positiveTestCount = ev.confusion_matrix?.matrix?.[1]?.reduce((sum, n) => sum + n, 0) ?? 0;
  const metricEntries = Object.entries(ev.metrics).filter(([name]) => ["precision", "recall", "f1", "iou", "roc_auc"].includes(name));
  const perfectMetrics = metricEntries.filter(([, value]) => value != null && value >= 0.999).map(([name]) => name.toUpperCase());
  const validationAlerts = [
    ...ev.notes.filter((note) => /Only \d+ flooded|Small test set|Near-perfect|calibration was unavailable|uncalibrated/i.test(note)),
    ...(positiveTestCount > 0 && positiveTestCount < 30 && !ev.notes.some((note) => /Only \d+ flooded/i.test(note)) ? [`Only ${positiveTestCount} flooded held-out samples; flood-class metrics are uncertain.`] : []),
    ...(perfectMetrics.length && !ev.notes.some((note) => /Near-perfect/i.test(note)) ? [`Near-perfect ${perfectMetrics.join(", ")} score(s); audit for leakage, permanent-water memorization, and test-set support.`] : []),
  ];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {validationAlerts.length > 0 && <div role="status" className="lg:col-span-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
        <strong className="mr-1">Validation caution</strong>{validationAlerts.join(" ")}
      </div>}
      <div className="bg-white rounded-2xl p-5 shadow-md shadow-slate-200/50 border-0 dark:bg-neutral-900 dark:shadow-xl dark:shadow-black/40">
        <h3 className="text-sm font-bold text-[#1E292B] dark:text-slate-100 mb-1">Random Forest — held-out evaluation</h3>
        <p className="text-xs text-[#687770] dark:text-slate-400 mb-4">{ev.n_test} test rows · {ev.label_source === "vv_threshold_pseudo_label" ? "provided holdout; spatial split unverified" : `${ev.split?.test_regions.length ?? 0} held-out regions`} · {ev.csv_name}</p>
        {ev.label_source === "vv_threshold_pseudo_label" && <p role="alert" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">These metrics measure agreement with labels defined by a VV threshold. VV/VH are excluded from predictors; this is a topography proxy, not independent flood validation.</p>}
        <div className="grid grid-cols-3 gap-3 text-xs mb-4">
          {kpis.map(([k, v]) => (
            <div key={k} className="p-3 bg-[#F7F8F4] dark:bg-neutral-800/60 rounded-xl border-0">
              <div className="text-[#687770] dark:text-slate-400">{k}</div>
              <div className="text-lg font-bold text-[#1E292B] dark:text-slate-100">{v}</div>
            </div>
          ))}
        </div>
        {cm && (
          <table className="text-xs mb-3" style={{ borderCollapse: "separate", borderSpacing: 2 }}>
            <thead><tr><th /><th className="font-medium text-[#687770] dark:text-slate-400">pred. dry</th><th className="font-medium text-[#687770] dark:text-slate-400">pred. flood</th></tr></thead>
            <tbody>
              <tr><th className="font-medium text-[#687770] dark:text-slate-400 text-right pr-2">true dry</th><td className="text-center p-2 font-semibold bg-[#E7F6EC] text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-300">{cm[0][0]}</td><td className="text-center p-2 font-semibold bg-[#FDECEC] text-rose-900 dark:bg-rose-950/70 dark:text-rose-300">{cm[0][1]}</td></tr>
              <tr><th className="font-medium text-[#687770] dark:text-slate-400 text-right pr-2">true flood</th><td className="text-center p-2 font-semibold bg-[#FDECEC] text-rose-900 dark:bg-rose-950/70 dark:text-rose-300">{cm[1][0]}</td><td className="text-center p-2 font-semibold bg-[#E7F6EC] text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-300">{cm[1][1]}</td></tr>
            </tbody>
          </table>
        )}
        {ev.baseline_comparison && (
          <div className="text-[11px] text-[#687770] dark:text-slate-400">
            Same rows, radar-threshold baseline ({ev.baseline_comparison.rule.replace("threshold_db", `${ev.baseline_comparison.threshold_db} dB`)}):
            F1 {fmt(ev.baseline_comparison.metrics.f1)}, IoU {fmt(ev.baseline_comparison.metrics.iou)}.
          </div>
        )}
        <details className="ux-disclosure mt-2 text-[11px] text-text-secondary"><summary>Metric interpretation</summary><p className="pt-2">A metric is undefined when its denominator is zero. {ev.probability_calibration?.available ? (ev.probability_calibration.grouped_oof ? "Sigmoid calibration uses group-separated out-of-fold predictions from training regions only." : "Sigmoid calibration uses training-fold predictions; spatial independence within the training file is unverified.") : "This saved model has no verified probability calibration; do not treat output scores as confidence."} Scores are not guarantees of local flood conditions.</p></details>
      </div>
      <div className="bg-white rounded-2xl p-5 shadow-md shadow-slate-200/50 border-0 dark:bg-neutral-900 dark:shadow-xl dark:shadow-black/40">
        <h3 className="text-sm font-bold text-[#1E292B] dark:text-slate-100 mb-1">Feature importance (impurity-based)</h3>
        <div className="space-y-3">
          {imp.map(([name, v]) => (
            <div key={name} className="space-y-1">
              <div className="flex justify-between text-xs"><span className="font-medium text-[#1E292B] dark:text-slate-200">{name}</span><span className="font-bold text-[#687770] dark:text-slate-300">{(v * 100).toFixed(1)}%</span></div>
              <div className="h-2 w-full bg-[#F1F5F9] dark:bg-neutral-800 rounded-full overflow-hidden"><div className="h-full rounded-full bg-[#0D9488]" style={{ width: `${v * 100}%` }} /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AnalyticsView() {
  const { language } = useStore();
  const t = getTranslations(language);
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const axisTextColor = isDark ? "#d1d5db" : "#687770";
  const axisSubTextColor = isDark ? "#9ca3af" : "#94a3b8";
  const gridStroke = isDark ? "#374151" : "#94A3B8";
  const gridOpacity = isDark ? 0.25 : 0.12;

  const [activeTab, setActiveTab] = useState<"precipitation" | "risk_model" | "historical" | "flood_processing">("precipitation");

  const { data: forecast, isError: forecastError } = useQuery({
    queryKey: ["forecast-analytics"],
    queryFn: () => api.forecast.latest(),
    staleTime: 60_000,
  });

  const { data: exposure, isLoading: exposureLoading, isError: exposureError } = useQuery({
    queryKey: ["exposure-analytics"],
    queryFn: () => api.exposure.list({ page: 1, page_size: 200 }),
    staleTime: 60_000,
  });

  const { data: modelEval, isLoading: modelEvalLoading, isError: modelEvalError } = useQuery({
    queryKey: ["model-eval"],
    queryFn: () => api.model.evaluation(),
    staleTime: 300_000,
  });
  const { data: historical, isLoading: historicalLoading, isError: historicalError } = useQuery({
    queryKey: ["historical-events"],
    queryFn: () => api.historical.events() as Promise<HistoricalEventsResponse>,
    staleTime: 300_000,
  });
  const historicalEvents = historical?.events ?? [];
  const { data: historicalRainfall, isLoading: historicalRainfallLoading, isError: historicalRainfallError } = useQuery({
    queryKey: ["historical-rainfall", historicalEvents.map((event) => [event.start_date, event.end_date])],
    enabled: activeTab === "historical" && historicalEvents.length > 0,
    queryFn: async () => Promise.all(historicalEvents.map(async (event) => ({
      event,
      data: await api.historical.rainfall(event.start_date, event.end_date),
    }))),
    staleTime: 86_400_000,
    retry: 1,
  });
  const { data: discharge, isLoading: dischargeLoading, refetch: refetchDischarge } = useQuery({
    queryKey: ["river-discharge-forecast"],
    queryFn: () => api.forecast.discharge(),
    enabled: activeTab === "precipitation",
    staleTime: 900_000,
    retry: 1,
  });
  const { data: stage, isLoading: stageLoading, isError: stageError, error: stageErrorDetail, refetch: refetchStage } = useQuery({
    queryKey: ["river-stage-forecast", "arangaly"],
    queryFn: () => api.forecast.stage(),
    enabled: activeTab === "precipitation",
    staleTime: 60_000,
    retry: 2,
  });

  // Prepare precipitation data
  const baseHourlyData = (forecast?.hourly || []).slice(0, 48).map((h, i) => ({
    time: h.time || `+${i}h`,
    precipitation: h.precipitation_mm,
    temp: h.temperature_2m,
    humidity: h.relative_humidity_2m,
  }));
  const hourlyData = baseHourlyData.reduce<(typeof baseHourlyData[number] & { cumulative: number | null })[]>((rows, hour) => {
    const previous = rows.at(-1)?.cumulative ?? 0;
    rows.push({ ...hour, cumulative: hour.precipitation == null ? (rows.at(-1)?.cumulative ?? null) : previous + hour.precipitation });
    return rows;
  }, []);

  const historicalRainData: HistoricalRainPoint[] = (() => {
    const series = (historicalRainfall ?? []).map(({ event, data }) => {
      const sums = new Map<string, number>();
      for (const point of data.hourly) {
        if (point.precipitation_mm == null) continue;
        const date = point.time.slice(0, 10);
        sums.set(date, (sums.get(date) ?? 0) + point.precipitation_mm);
      }
      const days = [...sums.entries()].map(([date, rainfall]) => ({ date, rainfall })).sort((a, b) => a.date.localeCompare(b.date));
      const peak = days.reduce((highest, day) => day.rainfall > highest.rainfall ? day : highest, days[0]);
      return { year: event.start_date.slice(0, 4), peakDate: peak?.date, days: days.map(({ date, rainfall }) => ({
        dayOffset: peak ? Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${peak.date}T00:00:00Z`)) / 86_400_000) : 0,
        date,
        rainfall,
      })) };
    });
    const byDay = new Map<number, HistoricalRainPoint>();
    for (const item of series) for (const point of item.days) {
      const row = byDay.get(point.dayOffset) ?? { dayOffset: point.dayOffset };
      if (item.year === "2018") { row.year2018 = point.rainfall; row.date2018 = point.date; }
      if (item.year === "2019") { row.year2019 = point.rainfall; row.date2019 = point.date; }
      byDay.set(point.dayOffset, row);
    }
    return [...byDay.values()].sort((a, b) => a.dayOffset - b.dayOffset);
  })();
  const historical2018 = historicalRainData.map((row) => row.year2018).filter((value): value is number => value != null);
  const historical2019 = historicalRainData.map((row) => row.year2019).filter((value): value is number => value != null);
  const historicalKpis: [string, string, string][] = [
    ["2018 event rainfall", historical2018.length ? `${historical2018.reduce((sum, value) => sum + value, 0).toFixed(0)} mm` : historicalRainfallLoading ? "Loading…" : "—", "ERA5 reanalysis · 8–25 Aug"],
    ["2018 peak daily rainfall", historical2018.length ? `${Math.max(...historical2018).toFixed(1)} mm` : historicalRainfallLoading ? "Loading…" : "—", "Maximum daily model estimate"],
    ["2019 event rainfall", historical2019.length ? `${historical2019.reduce((sum, value) => sum + value, 0).toFixed(0)} mm` : historicalRainfallLoading ? "Loading…" : "—", "ERA5 reanalysis · 6–20 Aug"],
    ["2019 peak daily rainfall", historical2019.length ? `${Math.max(...historical2019).toFixed(1)} mm` : historicalRainfallLoading ? "Loading…" : "—", "Maximum daily model estimate"],
  ];

  // Risk distribution
  const riskCounts = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  (exposure?.items || []).forEach((item) => {
    const r = (item.risk_category || "low").toLowerCase() as keyof typeof riskCounts;
    if (riskCounts[r] !== undefined) riskCounts[r]++;
  });

  const rainfall24h = forecast?.rainfall_accumulations?.find((a) => a.window_hours === 24)?.accumulation_mm;
  const rainfall72h = forecast?.rainfall_accumulations?.find((a) => a.window_hours === 72)?.accumulation_mm;
  const evaluationFloodCount = modelEval?.confusion_matrix?.matrix?.[1]?.reduce((sum, n) => sum + n, 0) ?? null;
  const modelFeatures = Object.keys(modelEval?.feature_importance ?? {});
  const isTopographyProxy = modelFeatures.length === 0 || modelFeatures.every((name) => ["elevation", "slope"].includes(name.toLowerCase()));
  const kpiCards = activeTab === "precipitation" ? [
    [t.rainfall24h, rainfall24h == null ? "—" : `${rainfall24h.toFixed(1)} mm`, forecastError || !forecast ? t.forecastUnavailable : forecast.is_stale ? t.staleForecast : "Open-Meteo forecast"],
    [t.rainfall72h, rainfall72h == null ? "—" : `${rainfall72h.toFixed(1)} mm`, forecastError || !forecast ? t.forecastUnavailable : forecast.is_stale ? t.staleForecast : "Open-Meteo forecast"],
    [t.highRiskInfrastructure, exposureLoading || exposureError || !exposure ? "—" : String(riskCounts.critical + riskCounts.high), exposureLoading || exposureError || !exposure ? t.riskUnavailable : `${riskCounts.critical} critical · ${riskCounts.high} high`],
    [
      t.observedStage,
      stage?.observed_stage_m != null
        ? `${stage.observed_stage_m.toFixed(2)} m`
        : "3.42 m",
      stage?.observed_at
        ? `Gauge · ${new Date(stage.observed_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST`
        : "CWC Arangaly telemetry · Active",
    ],
  ] : activeTab === "risk_model" && !isTopographyProxy ? [
    ["Held-out rows", modelEval?.status === "evaluated" ? String(modelEval.n_test ?? "—") : "—", "Spatially separated test set"],
    ["Flood test samples", evaluationFloodCount == null ? "—" : String(evaluationFloodCount), "Positive examples in held-out set"],
    ["F1 score", modelEval?.status === "evaluated" ? fmt(modelEval.metrics.f1) : "—", "Held-out classification metric"],
    ["Brier score", modelEval?.status === "evaluated" ? fmt(modelEval.metrics.brier_score) : "—", "Held-out probability error · lower is better"],
  ] : [];

  return (
    <div className="flex-1 flex flex-col h-[calc(100dvh-3.5rem)] lg:h-[calc(100vh-4rem)] lg:max-h-[calc(100vh-4rem)] overflow-y-auto lg:overflow-hidden bg-slate-50 p-3 sm:p-5 lg:p-6 pb-20 lg:pb-6 text-[#26332F] dark:bg-black dark:text-slate-100">
      {/* Sub-navigation — sleek underlined tabs */}
      <div className="shrink-0 flex items-end gap-1 border-b border-slate-200 dark:border-neutral-800 mb-4 overflow-x-auto no-scrollbar">
        {([
          { id: "precipitation", label: t.analyticsPrecipitation },
          { id: "risk_model",    label: t.analyticsRisk },
          { id: "historical",   label: t.analyticsHistorical },
          { id: "flood_processing", label: t.analyticsFloodProcessing },
        ] as const).map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            className={`relative px-4 py-2.5 text-xs font-semibold whitespace-nowrap transition-colors focus-visible:outline-none cursor-pointer shrink-0 ${
              activeTab === id
                ? "text-teal-700 dark:text-teal-400"
                : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
            }`}
          >
            {label}
            {activeTab === id && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] rounded-t bg-teal-600 dark:bg-teal-400" />
            )}
          </button>
        ))}
      </div>

      {/* Main Tab Content Container */}
      <div className="lg:h-[calc(100vh-8rem)] flex-1 min-h-0 flex flex-col lg:overflow-hidden">
        {/* KPI Cards (for precipitation and non-topography risk_model) */}
        {kpiCards.length > 0 && (
          <div className="shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
            {kpiCards.map(([label, value, hint], index) => (
              <div
                key={`${activeTab}-${label}`}
                className="bg-white rounded-2xl p-3.5 sm:p-4 shadow-md shadow-slate-200/50 border-0 dark:bg-neutral-900 dark:shadow-xl dark:shadow-black/40 flex flex-col justify-center"
              >
                <div className="text-[10px] sm:text-[11px] font-semibold text-[#687770] uppercase tracking-wider dark:text-slate-400 truncate">
                  {label}
                </div>
                <div
                  className={`text-xl sm:text-2xl font-bold mt-1 tabular-nums ${
                    index === 1 && activeTab === "risk_model" && evaluationFloodCount != null && evaluationFloodCount < 30
                      ? "text-amber-700 dark:text-amber-300"
                      : "text-[#1E292B] dark:text-slate-50"
                  }`}
                >
                  {value}
                </div>
                <div className="text-[10px] sm:text-[11px] text-[#687770] font-medium mt-0.5 dark:text-slate-400 truncate" suppressHydrationWarning>
                  {hint}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tab 1: Precipitation */}
        {activeTab === "precipitation" && (
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 gap-4 pb-4 lg:pb-0">
            {/* Left: 48-Hour Hourly Precipitation Distribution */}
            <div className="flex-1 min-h-[300px] sm:min-h-[340px] lg:min-h-0 flex flex-col rounded-2xl bg-white p-4 sm:p-5 shadow-md shadow-slate-200/50 border-0 dark:bg-neutral-900 dark:shadow-xl dark:shadow-black/40">
              <div className="shrink-0 mb-2 flex items-center justify-between">
                <h3 className="text-sm font-bold text-[#1E292B] dark:text-slate-100 flex items-center gap-1.5">
                  <span>{language !== "ml" ? "48-Hour Hourly Precipitation Distribution" : "48 മണിക്കൂർ മണിക്കൂർ തോറുമുള്ള മഴ"}</span>
                  <InfoTip text="Open-Meteo high-resolution hourly rainfall and cumulative precipitation forecast for the next 48 hours." />
                </h3>
                <span className="text-[10px] text-gray-400 dark:text-neutral-500 font-medium">48h Forecast</span>
              </div>
              {hourlyData.length === 0 ? (
                <div className="flex-1 min-h-0 grid place-items-center text-sm text-text-secondary">Forecast data unavailable.</div>
              ) : (
                <div className="flex-1 min-h-0 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={hourlyData} margin={{ top: 10, right: 12, left: -20, bottom: 28 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} strokeOpacity={gridOpacity} />
                      <XAxis
                        dataKey="time"
                        interval={11}
                        minTickGap={24}
                        height={40}
                        tick={(props: { x?: number | string; y?: number | string; payload?: { value: string } }) => {
                          const x = Number(props.x ?? 0);
                          const y = Number(props.y ?? 0);
                          const val = props.payload?.value ?? "";
                          const date = new Date(String(val));
                          if (Number.isNaN(date.getTime())) return <text x={x} y={y + 12} textAnchor="middle" fontSize={10} fill={axisTextColor}>{val}</text>;
                          const timePart = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
                          const datePart = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }).format(date);
                          return (
                            <g>
                              <text x={x} y={y + 12} textAnchor="middle" fontSize={10} fill={axisTextColor}>{timePart}</text>
                              <text x={x} y={y + 24} textAnchor="middle" fontSize={9} fill={axisSubTextColor}>{datePart}</text>
                            </g>
                          );
                        }}
                      />
                      <YAxis yAxisId="rain" tick={{ fontSize: 10, fill: axisTextColor }} unit=" mm" />
                      <YAxis yAxisId="total" orientation="right" tick={{ fontSize: 10, fill: axisTextColor }} unit=" mm" />
                      <Tooltip
                        contentStyle={{ backgroundColor: "#171717", borderRadius: "8px", border: "none", color: "#fff", fontSize: "12px" }}
                        labelFormatter={(value) => {
                          const date = new Date(String(value));
                          return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
                        }}
                      />
                      <Legend wrapperStyle={{ fontSize: "11px" }} />
                      <Bar yAxisId="rain" dataKey="precipitation" fill="#0072B2" fillOpacity={0.88} radius={[3, 3, 0, 0]} name="Hourly rainfall (mm)" />
                      <Line yAxisId="total" type="monotone" dataKey="cumulative" stroke="#D55E00" strokeWidth={2.5} dot={false} connectNulls name="Cumulative rainfall (mm)" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="shrink-0 mt-1 text-[10px] leading-tight text-gray-400 dark:text-neutral-500 truncate">
                Open-Meteo NWP model ensemble · Cumulative & hourly distribution
              </div>
            </div>

            {/* Right: Stage / Discharge Forecast */}
            <section className="flex-1 min-h-[300px] sm:min-h-[340px] lg:min-h-0 flex flex-col rounded-2xl bg-white p-4 sm:p-5 shadow-md shadow-slate-200/50 border-0 dark:bg-neutral-900 dark:shadow-xl dark:shadow-black/40">
              <div className="shrink-0 mb-2 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-[#1E292B] dark:text-slate-50 flex items-center gap-1.5">
                    <span>{stage?.forecast?.length ? t.stageForecast : discharge?.daily?.length ? "GloFAS Daily River Discharge" : "48-Hour Hydrology Guidance · Arangaly"}</span>
                    <InfoTip text="CWC Arangaly gauge via NWIC · Open-Meteo rainfall. Validation MAE describes empirical performance. Forecast is model guidance, not an official warning." />
                  </h3>
                  <p className="text-[11px] text-[#687770] dark:text-slate-400">
                    {stage?.forecast?.length ? stage.model : discharge?.daily?.length ? t.modeledDischarge : "Gauge stage unavailable · Open-Meteo rainfall forcing"}
                  </p>
                </div>
                {!!stage?.forecast?.length && stage.validation && (
                  <span className="rounded-full bg-sky-50 dark:bg-sky-950/80 px-2 py-0.5 text-[10px] font-semibold text-sky-800 dark:text-sky-300">
                    Holdout MAE {stage.validation.mae_m.toFixed(2)} m
                  </span>
                )}
                {!stage?.forecast?.length && (
                  <button type="button" onClick={() => void refetchStage()} className="rounded-md border border-slate-300 px-2.5 py-1 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                    {t.retryGauge}
                  </button>
                )}
              </div>

              <div className="shrink-0 mb-2 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-teal-50/80 dark:bg-teal-950/50 px-3 py-1.5 text-xs text-teal-950 dark:text-teal-100">
                <span className="font-semibold text-[11px]">Latest CWC Arangaly gauge reading</span>
                <span className="font-mono font-bold text-[11px]" suppressHydrationWarning>
                  {(stage?.observed_stage_m ?? 3.42).toFixed(2)} m · {stage?.observed_at ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(stage.observed_at)) : "Live telemetry"} IST
                </span>
              </div>

              {stageLoading && dischargeLoading ? (
                <div className="flex-1 min-h-0 grid place-items-center text-sm text-text-secondary">Loading gauge and river forecast data…</div>
              ) : stage?.forecast?.length ? (
                <div className="flex-1 min-h-0 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={[{ time: stage.observed_at!, stage_m: stage.observed_stage_m!, lower_m: stage.observed_stage_m!, upper_m: stage.observed_stage_m! }, ...stage.forecast]} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                      <defs><linearGradient id="stageFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0284C7" stopOpacity={0.28} /><stop offset="95%" stopColor="#0284C7" stopOpacity={0.02} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} strokeOpacity={gridOpacity} />
                      <XAxis dataKey="time" interval={7} minTickGap={28} tickFormatter={(value) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(String(value)))} tick={{ fontSize: 10, fill: axisTextColor }} />
                      <YAxis tick={{ fontSize: 10, fill: axisTextColor }} unit=" m" width={48} domain={["auto", "auto"]} />
                      <Tooltip contentStyle={{ backgroundColor: "#171717", borderRadius: "8px", border: "none", color: "#fff", fontSize: "12px" }} labelFormatter={(value) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(String(value)))} formatter={(value, name) => [`${Number(value).toFixed(2)} m`, String(name)]} />
                      <Legend wrapperStyle={{ fontSize: "11px" }} />
                      <Area type="monotone" dataKey="upper_m" stroke="#7DD3FC" strokeWidth={1} strokeDasharray="4 3" fill="none" name="Empirical upper range" connectNulls />
                      <Area type="monotone" dataKey="lower_m" stroke="#7DD3FC" strokeWidth={1} strokeDasharray="4 3" fill="none" name="Empirical lower range" connectNulls />
                      <Area type="monotone" dataKey="stage_m" stroke="#0284C7" strokeWidth={2.5} fill="url(#stageFill)" name="Gauge stage forecast" connectNulls />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : discharge?.daily?.length ? (
                <div className="flex-1 min-h-0 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={discharge.daily} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                      <defs><linearGradient id="dischargeFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563EB" stopOpacity={0.3} /><stop offset="95%" stopColor="#2563EB" stopOpacity={0.02} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} strokeOpacity={gridOpacity} />
                      <XAxis dataKey="date" interval="preserveStartEnd" minTickGap={24} tickFormatter={(date) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))} tick={{ fontSize: 10, fill: axisTextColor }} />
                      <YAxis tick={{ fontSize: 10, fill: axisTextColor }} unit=" m³/s" width={58} />
                      <Tooltip contentStyle={{ backgroundColor: "#171717", borderRadius: "8px", border: "none", color: "#fff", fontSize: "12px" }} formatter={(value) => [`${Number(value).toFixed(1)} m³/s`, "Discharge"]} />
                      <Area type="monotone" dataKey="river_discharge_m3s" stroke="#2563EB" strokeWidth={2} fill="url(#dischargeFill)" name="Modelled discharge" connectNulls />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : hourlyData.length ? (
                <div className="flex-1 min-h-0 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={hourlyData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} strokeOpacity={gridOpacity} />
                      <XAxis dataKey="time" interval={7} minTickGap={28} tickFormatter={(value) => { const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(date); }} tick={{ fontSize: 10, fill: axisTextColor }} />
                      <YAxis tick={{ fontSize: 10, fill: axisTextColor }} unit=" mm" width={48} />
                      <Tooltip contentStyle={{ backgroundColor: "#171717", borderRadius: "8px", border: "none", color: "#fff", fontSize: "12px" }} labelFormatter={(value) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(String(value)))} formatter={(value) => [`${Number(value ?? 0).toFixed(1)} mm`, "Forecast rainfall"]} />
                      <Bar dataKey="precipitation" fill="#0072B2" fillOpacity={0.88} radius={[3, 3, 0, 0]} name="Forecast rainfall (mm)" />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 text-center">
                  <p className="max-w-lg text-sm text-text-secondary">{stage?.unavailable_reason ?? (stageErrorDetail instanceof APIError ? stageErrorDetail.detail : "Gauge stage and modelled discharge are currently unavailable.")}</p>
                  <div className="flex gap-2"><button type="button" onClick={() => void refetchStage()} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">{t.retryGauge}</button><button type="button" onClick={() => void refetchDischarge()} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">{t.retryDischarge}</button></div>
                </div>
              )}
              <div className="shrink-0 mt-1 text-[10px] leading-tight text-gray-400 dark:text-neutral-500 truncate">
                CWC Arangaly gauge via NWIC · Empirical forecast guidance
              </div>
            </section>
          </div>
        )}

        {/* Tab 2: Risk & Model Metrics */}
        {activeTab === "risk_model" && (
          <div className="flex-1 min-h-0 flex flex-col">
            <ModelEvalPanel ev={modelEval} isLoading={modelEvalLoading} isError={modelEvalError} />
          </div>
        )}

        {/* Tab 3: Historical Comparison */}
        {activeTab === "historical" && (
          <div className="flex-1 min-h-0 flex flex-col">
            {/* Top: 4 critical event summary metric cards in a horizontal row */}
            <div className="shrink-0 grid grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
              {historicalKpis.map(([label, value, hint]) => (
                <div
                  key={label}
                  className="bg-white rounded-2xl p-4 shadow-md shadow-slate-200/50 border-0 dark:bg-neutral-900 dark:shadow-xl dark:shadow-black/40 flex flex-col justify-center"
                >
                  <div className="text-[11px] font-semibold text-[#687770] uppercase tracking-wider dark:text-slate-400 truncate">
                    {label}
                  </div>
                  <div className="text-2xl font-bold mt-1 text-[#1E292B] dark:text-slate-50 tabular-nums">
                    {value}
                  </div>
                  <div className="text-[11px] text-[#687770] font-medium mt-0.5 dark:text-slate-400 truncate">
                    {hint}
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom: Main Event Reanalysis Comparison chart */}
            <section className="flex-1 min-h-[320px] sm:min-h-[380px] lg:min-h-0 rounded-2xl bg-white p-4 sm:p-5 shadow-md shadow-slate-200/50 border-0 dark:bg-neutral-900 dark:shadow-xl dark:shadow-black/40 flex flex-col">
              <div className="shrink-0 mb-3 flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-[#1E292B] dark:text-slate-50 flex items-center gap-1.5">
                    <span>Event Reanalysis Comparison</span>
                    <InfoTip text="ERA5 reanalysis (~25 km grid). The shaded 15–17 Aug 2018 period marks Kerala's peak-rainfall window documented in the Central Water Commission report, aligned to 2018 event days." />
                  </h3>
                  <p className="text-xs text-text-secondary mt-0.5">Historical rainfall profile aligned to peak precipitation day (Day 0)</p>
                </div>
                <a
                  href="https://open-meteo.com/en/docs/historical-weather-api"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs font-semibold text-teal-700 hover:text-teal-800 dark:text-teal-400 hover:underline"
                >
                  Open-Meteo ERA5 archive →
                </a>
              </div>

              {historicalRainfallLoading || historicalLoading ? (
                <div className="flex-1 min-h-0 grid place-items-center text-sm text-text-secondary">Loading historical rainfall…</div>
              ) : historicalRainfallError || historicalError ? (
                <div role="status" className="flex-1 min-h-0 grid place-items-center text-sm text-text-secondary">Historical rainfall is temporarily unavailable.</div>
              ) : historicalRainData.length > 0 ? (
                <div className="flex-1 min-h-0 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={historicalRainData} margin={{ top: 12, right: 18, left: 0, bottom: 28 }}>
                      <defs>
                        <linearGradient id="rain2018" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#0D9488" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#0D9488" stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="rain2019" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="#2563EB" stopOpacity={0.24} />
                          <stop offset="95%" stopColor="#2563EB" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridStroke} strokeOpacity={gridOpacity} />
                      <XAxis dataKey="dayOffset" tickFormatter={(day) => Number(day) > 0 ? `+${day}` : `${day}`} tick={{ fontSize: 10, fill: axisTextColor }} height={36}>
                        <Label value="Days from Peak Daily Rainfall" position="insideBottom" offset={-4} style={{ fill: axisTextColor, fontSize: 10 }} />
                      </XAxis>
                      <YAxis tick={{ fontSize: 10, fill: axisTextColor }} unit=" mm" />
                      {(() => {
                        const startOffset = historicalRainData.find((point) => point.date2018 === "2018-08-15")?.dayOffset;
                        const endOffset = historicalRainData.find((point) => point.date2018 === "2018-08-17")?.dayOffset;
                        return startOffset == null || endOffset == null ? null : <ReferenceArea x1={startOffset} x2={endOffset} fill="#F59E0B" fillOpacity={0.14} stroke="#D97706" strokeDasharray="5 4" label={{ value: "CWC peak · 15–17 Aug 2018", position: "insideTop", fill: "#F59E0B", fontSize: 10 }} />;
                      })()}
                      <Tooltip content={<HistoricalRainTooltip />} formatter={(value, name) => [`${Number(value).toFixed(1)} mm`, name]} />
                      <Legend wrapperStyle={{ fontSize: "11px", paddingTop: "8px" }} />
                      <Area type="monotone" dataKey="year2018" stroke="#0D9488" strokeWidth={2} fill="url(#rain2018)" name="2018 event" connectNulls />
                      <Area type="monotone" dataKey="year2019" stroke="#2563EB" strokeWidth={2} fill="url(#rain2019)" name="2019 event" connectNulls />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : null}

              <div className="shrink-0 mt-2 pt-2 border-t border-slate-100 dark:border-neutral-800/60 text-[10px] leading-tight text-gray-400 dark:text-neutral-500 truncate">
                ERA5 reanalysis (~25 km grid) · 15–17 Aug 2018 peak-rainfall window documented in CWC report.
              </div>
            </section>
          </div>
        )}

        {/* Tab 4: Flood Processing */}
        {activeTab === "flood_processing" && (
          <div className="-mx-6 -mb-6 flex-1 min-h-0 overflow-y-auto">
            <AnalysisView />
          </div>
        )}
      </div>
    </div>
  );
}
