"use client";

import React, { useState } from "react";
import { Info } from "lucide-react";
import { useStore } from "@/lib/store";
import { getTranslations } from "@/lib/translations";
import { AnalysisView } from "@/components/views/AnalysisView";
import { useQuery } from "@tanstack/react-query";
import { api, APIError, ModelEvaluation } from "@/lib/api";
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
  const featureNames = Object.keys(ev?.feature_importance ?? {});
  const isTopographyProxy = featureNames.length > 0 && featureNames.every((name) => ["elevation", "slope"].includes(name.toLowerCase()));
  const { data: terrain, isLoading: terrainLoading, isError: terrainError } = useQuery({
    queryKey: ["model-terrain-distribution"],
    queryFn: () => api.model.terrainDistribution(),
    enabled: ev?.status === "evaluated" && isTopographyProxy,
    staleTime: 86_400_000,
    retry: 1,
  });
  if (isLoading) return <div className="text-xs text-text-secondary">Loading model evaluation…</div>;
  if (isError) return <div role="alert" className="rounded-xl border border-border bg-white p-5 text-sm text-text-secondary dark:bg-slate-900">Model evaluation is unavailable.</div>;
  if (!ev) return <div className="rounded-xl border border-border bg-white p-5 text-sm text-text-secondary dark:bg-slate-900">No model evaluation is available.</div>;
  if (ev.status !== "evaluated") {
    return (
      <div className="bg-white border border-dashed border-[#CBD5E1] rounded-xl p-5 text-sm text-[#26332F]">
        <b>No evaluation available.</b>
        <details className="ux-disclosure mt-2 text-xs text-text-secondary">
          <summary>Training requirements</summary>
          <p className="pt-2">Provide independently labelled <code>data/labeled_flood_features.csv</code> with <code>label, region_id, vv</code> and optional <code>vh, elevation, slope</code>, then run <code>python -m app.analysis.ml_lab train --csv data/labeled_flood_features.csv</code> from <code>backend/</code>.</p>
        </details>
      </div>
    );
  }
  if (isTopographyProxy) {
    const elevations = terrain?.hypsometric.map((point) => point.elevation_m) ?? [];
    const minElevationTick = elevations.length ? Math.floor(Math.min(...elevations) / 100) * 100 : 0;
    const maxElevationTick = elevations.length ? Math.max(minElevationTick + 100, Math.ceil(Math.max(...elevations) / 100) * 100) : 400;
    const elevationTicks = Array.from({ length: Math.max(2, (maxElevationTick - minElevationTick) / 100 + 1) }, (_, index) => minElevationTick + index * 100);
    return (
      <div className="space-y-4">
        <section className="rounded-xl border border-border bg-white p-5 shadow-xs dark:bg-slate-900 dark:border-slate-800">
          <h3 className="text-base font-semibold text-[#1E292B] dark:text-slate-50">Baseline Topography Model</h3>
          <p className="mt-1 text-sm leading-relaxed text-text-secondary dark:text-slate-400">
            Elevation and slope describe static terrain susceptibility. These terrain summaries are not flood-event predictions; independent radar validation is unavailable.
          </p>
        </section>
        {terrainLoading ? <div className="grid min-h-72 place-items-center rounded-xl border border-border bg-white text-sm text-text-secondary dark:bg-slate-900">Loading study-area DEM samples…</div>
          : terrainError || !terrain ? <div role="status" className="grid min-h-72 place-items-center rounded-xl border border-border bg-white text-sm text-text-secondary dark:bg-slate-900">Study-area terrain samples are temporarily unavailable.</div>
          : <>
            {terrain.fallback_reason && <p role="status" className="rounded-lg border border-border bg-white px-4 py-3 text-xs text-text-secondary dark:bg-slate-900">{terrain.fallback_reason}</p>}
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <article className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs dark:bg-slate-900 dark:border-slate-800">
                <h4 className="flex items-center text-sm font-semibold text-[#1E292B] dark:text-slate-50">Hypsometric Curve <InfoTip text={`${terrain.source} · ${terrain.sampled_cells.toLocaleString()} point samples. The curve describes the sample distribution; it is not area-weighted basin hypsometry. ${terrain.known_limitations}`} /></h4>
                <p className="mt-1 text-xs text-text-secondary">{terrain.measurement_basis === "sample_points" ? "Share of DEM sample points below each elevation" : "Share of sampled study-area surface below each elevation"}</p>
                <div className="mt-3 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={terrain.hypsometric} margin={{ top: 8, right: 10, bottom: 2, left: -12 }}>
                      <defs><linearGradient id="hypsometricFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0D9488" stopOpacity={0.28} /><stop offset="95%" stopColor="#0D9488" stopOpacity={0.03} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94A3B8" strokeOpacity={0.1} />
                      <XAxis dataKey="elevation_m" type="number" domain={[minElevationTick, maxElevationTick]} ticks={elevationTicks} tick={{ fontSize: 10, fill: "#687770" }} tickFormatter={(value) => `${value} m`} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#687770" }} unit="%" />
                      <Tooltip contentStyle={{ backgroundColor: "#1E292B", borderRadius: 8, border: "none", color: "#fff", fontSize: 12 }} formatter={(value) => [`${Number(value).toFixed(1)}%`, terrain.measurement_basis === "sample_points" ? "Sample points below elevation" : "Area below elevation"]} labelFormatter={(value) => `${Number(value).toFixed(0)} m`} />
                      <Area type="monotone" dataKey="area_below_pct" stroke="#0D9488" strokeWidth={2.5} fill="url(#hypsometricFill)" name="Area below elevation" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </article>
              <article className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs dark:bg-slate-900 dark:border-slate-800">
                <h4 className="flex items-center text-sm font-semibold text-[#1E292B] dark:text-slate-50">Slope Distribution <InfoTip text={`${terrain.source} · ${terrain.sampled_cells.toLocaleString()} point samples. Slope shares describe the available samples, not basin-area proportions. ${terrain.known_limitations}`} /></h4>
                <p className="mt-1 text-xs text-text-secondary">Share of sampled terrain by slope class</p>
                <div className="mt-3 h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={terrain.slope_histogram} margin={{ top: 8, right: 10, bottom: 2, left: -12 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94A3B8" strokeOpacity={0.1} />
                      <XAxis dataKey="slope_bin" tick={{ fontSize: 10, fill: "#687770" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#687770" }} unit="%" />
                      <Tooltip contentStyle={{ backgroundColor: "#1E292B", borderRadius: 8, border: "none", color: "#fff", fontSize: 12 }} formatter={(value) => [`${Number(value).toFixed(1)}%`, terrain.measurement_basis === "sample_points" ? "Sample points" : "Sampled area"]} />
                      <Bar dataKey="share_pct" fill="#2563EB" fillOpacity={0.82} radius={[5, 5, 0, 0]} name={terrain.measurement_basis === "sample_points" ? "Samples by slope" : "Area by slope"} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </article>
            </div>
            <p className="text-[11px] leading-relaxed text-text-secondary">{terrain.source} · {terrain.sampled_cells.toLocaleString()} terrain samples{terrain.is_stale ? " · cached data" : ""}</p>
          </>}
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
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs">
        <h3 className="text-sm font-bold text-[#1E292B] mb-1">Random Forest — held-out evaluation</h3>
        <p className="text-xs text-[#687770] mb-4">{ev.n_test} test rows · {ev.label_source === "vv_threshold_pseudo_label" ? "provided holdout; spatial split unverified" : `${ev.split?.test_regions.length ?? 0} held-out regions`} · {ev.csv_name}</p>
        {ev.label_source === "vv_threshold_pseudo_label" && <p role="alert" className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">These metrics measure agreement with labels defined by a VV threshold. VV/VH are excluded from predictors; this is a topography proxy, not independent flood validation.</p>}
        <div className="grid grid-cols-3 gap-3 text-xs mb-4">
          {kpis.map(([k, v]) => (
            <div key={k} className="p-3 bg-[#F7F8F4] rounded-lg border border-[#E2E8F0]">
              <div className="text-[#687770]">{k}</div>
              <div className="text-lg font-bold text-[#1E292B]">{v}</div>
            </div>
          ))}
        </div>
        {cm && (
          <table className="text-xs mb-3" style={{ borderCollapse: "separate", borderSpacing: 2 }}>
            <thead><tr><th /><th className="font-medium text-[#687770]">pred. dry</th><th className="font-medium text-[#687770]">pred. flood</th></tr></thead>
            <tbody>
              <tr><th className="font-medium text-[#687770] text-right pr-2">true dry</th><td className="text-center p-2 font-semibold bg-[#E7F6EC]">{cm[0][0]}</td><td className="text-center p-2 font-semibold bg-[#FDECEC]">{cm[0][1]}</td></tr>
              <tr><th className="font-medium text-[#687770] text-right pr-2">true flood</th><td className="text-center p-2 font-semibold bg-[#FDECEC]">{cm[1][0]}</td><td className="text-center p-2 font-semibold bg-[#E7F6EC]">{cm[1][1]}</td></tr>
            </tbody>
          </table>
        )}
        {ev.baseline_comparison && (
          <div className="text-[11px] text-[#687770]">
            Same rows, radar-threshold baseline ({ev.baseline_comparison.rule.replace("threshold_db", `${ev.baseline_comparison.threshold_db} dB`)}):
            F1 {fmt(ev.baseline_comparison.metrics.f1)}, IoU {fmt(ev.baseline_comparison.metrics.iou)}.
          </div>
        )}
        <details className="ux-disclosure mt-2 text-[11px] text-text-secondary"><summary>Metric interpretation</summary><p className="pt-2">A metric is undefined when its denominator is zero. {ev.probability_calibration?.available ? (ev.probability_calibration.grouped_oof ? "Sigmoid calibration uses group-separated out-of-fold predictions from training regions only." : "Sigmoid calibration uses training-fold predictions; spatial independence within the training file is unverified.") : "This saved model has no verified probability calibration; do not treat output scores as confidence."} Scores are not guarantees of local flood conditions.</p></details>
      </div>
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs">
        <h3 className="text-sm font-bold text-[#1E292B] mb-1">Feature importance (impurity-based)</h3>
        <div className="space-y-3">
          {imp.map(([name, v]) => (
            <div key={name} className="space-y-1">
              <div className="flex justify-between text-xs"><span className="font-medium text-[#1E292B]">{name}</span><span className="font-bold text-[#687770]">{(v * 100).toFixed(1)}%</span></div>
              <div className="h-2 w-full bg-[#F1F5F9] rounded-full overflow-hidden"><div className="h-full rounded-full bg-[#0D9488]" style={{ width: `${v * 100}%` }} /></div>
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
    staleTime: 900_000,
    retry: false,
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
  const isTopographyProxy = modelFeatures.length > 0 && modelFeatures.every((name) => ["elevation", "slope"].includes(name.toLowerCase()));
  const kpiCards = activeTab === "precipitation" ? [
    [t.rainfall24h, rainfall24h == null ? "—" : `${rainfall24h.toFixed(1)} mm`, forecastError || !forecast ? t.forecastUnavailable : forecast.is_stale ? t.staleForecast : "Open-Meteo forecast"],
    [t.rainfall72h, rainfall72h == null ? "—" : `${rainfall72h.toFixed(1)} mm`, forecastError || !forecast ? t.forecastUnavailable : forecast.is_stale ? t.staleForecast : "Open-Meteo forecast"],
    [t.highRiskInfrastructure, exposureLoading || exposureError || !exposure ? "—" : String(riskCounts.critical + riskCounts.high), exposureLoading || exposureError || !exposure ? t.riskUnavailable : `${riskCounts.critical} critical · ${riskCounts.high} high`],
    [t.observedStage, stage?.observed_stage_m == null ? "—" : `${stage.observed_stage_m.toFixed(2)} m`, stage?.observed_at ? `Gauge · ${new Date(stage.observed_at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} IST` : t.liveGaugeUnavailable],
  ] : activeTab === "risk_model" && !isTopographyProxy ? [
    ["Held-out rows", modelEval?.status === "evaluated" ? String(modelEval.n_test ?? "—") : "—", "Spatially separated test set"],
    ["Flood test samples", evaluationFloodCount == null ? "—" : String(evaluationFloodCount), "Positive examples in held-out set"],
    ["F1 score", modelEval?.status === "evaluated" ? fmt(modelEval.metrics.f1) : "—", "Held-out classification metric"],
    ["Brier score", modelEval?.status === "evaluated" ? fmt(modelEval.metrics.brier_score) : "—", "Held-out probability error · lower is better"],
  ] : activeTab === "historical" ? historicalKpis : [];

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-[#F7F8F4] p-6 text-[#26332F]">
      {/* Title & Subheader */}
      <div className="flex items-center justify-between pb-6 border-b border-[#E2E8F0]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold text-[#1E292B]">
              {t.analyticsTitle}
            </h1>
          </div>
        </div>

        {/* Tab switchers */}
        <div className="flex items-center bg-white border border-[#E2E8F0] rounded-lg p-1 shadow-xs text-xs font-semibold">
          <button
            onClick={() => setActiveTab("precipitation")}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              activeTab === "precipitation" ? "bg-teal-600 text-white dark:bg-teal-500 dark:text-slate-950" : "text-[#687770] hover:text-[#1E292B]"
            }`}
          >
            {t.analyticsPrecipitation}
          </button>
          <button
            onClick={() => setActiveTab("risk_model")}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              activeTab === "risk_model" ? "bg-teal-600 text-white dark:bg-teal-500 dark:text-slate-950" : "text-[#687770] hover:text-[#1E292B]"
            }`}
          >
            {t.analyticsRisk}
          </button>
          <button
            onClick={() => setActiveTab("historical")}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              activeTab === "historical" ? "bg-teal-600 text-white dark:bg-teal-500 dark:text-slate-950" : "text-[#687770] hover:text-[#1E292B]"
            }`}
          >
            {t.analyticsHistorical}
          </button>
          <button
            onClick={() => setActiveTab("flood_processing")}
            className={`px-3 py-1.5 rounded-md transition-colors ${activeTab === "flood_processing" ? "bg-teal-600 text-white dark:bg-teal-500 dark:text-slate-950" : "text-[#687770] hover:text-[#1E292B]"}`}
          >
            {t.analyticsFloodProcessing}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {kpiCards.length > 0 && <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 my-6">
        {kpiCards.map(([label, value, hint], index) => (
          <div key={`${activeTab}-${label}`} className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-xs dark:bg-slate-900 dark:border-slate-800">
            <div className="text-[11px] font-semibold text-[#687770] uppercase tracking-wider dark:text-slate-400">{label}</div>
            <div className={`text-2xl font-bold mt-1 ${index === 1 && activeTab === "risk_model" && evaluationFloodCount != null && evaluationFloodCount < 30 ? "text-amber-700 dark:text-amber-300" : "text-[#1E292B] dark:text-slate-50"}`}>{value}</div>
            <div className="text-[11px] text-[#687770] font-medium mt-1 dark:text-slate-400">{hint}</div>
          </div>
        ))}
      </div>}


      {/* Main Content Tab Panes */}
      {activeTab === "precipitation" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="h-[25rem] bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs dark:bg-slate-900 dark:border-slate-800">
            <h3 className="text-sm font-bold text-[#1E292B] mb-1">
              {language !== "ml" ? "48-Hour Hourly Precipitation Distribution" : "48 മണിക്കൂർ മണിക്കൂർ തോറുമുള്ള മഴ"}
            </h3>
            {hourlyData.length === 0 ? <div className="grid h-72 place-items-center text-sm text-text-secondary">Forecast data unavailable.</div> : <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={hourlyData} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94A3B8" strokeOpacity={0.1} />
                  <XAxis dataKey="time" interval={11} minTickGap={24} tickFormatter={(value) => {
                    const date = new Date(String(value));
                    return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
                  }} tick={{ fontSize: 10, fill: "#687770" }} />
                  <YAxis yAxisId="rain" tick={{ fontSize: 10, fill: "#687770" }} unit=" mm" />
                  <YAxis yAxisId="total" orientation="right" tick={{ fontSize: 10, fill: "#687770" }} unit=" mm" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1E292B", borderRadius: "8px", border: "none", color: "#fff", fontSize: "12px" }}
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
            </div>}
          </div>

          <section className="h-[25rem] rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs dark:bg-slate-900 dark:border-slate-800">
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-[#1E292B] dark:text-slate-50">{stage?.forecast?.length ? t.stageForecast : discharge?.daily?.length ? "GloFAS Daily River Discharge" : "48-hour hydrology guidance · Arangaly"}</h3>
                <p className="text-[11px] text-[#687770] dark:text-slate-400">{stage?.forecast?.length ? stage.model : discharge?.daily?.length ? t.modeledDischarge : "Gauge stage unavailable · displaying Open-Meteo rainfall forcing"}</p>
              </div>
              {!!stage?.forecast?.length && stage.validation && <span className="rounded-full bg-sky-50 px-2 py-1 text-[10px] font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-200">Holdout MAE {stage.validation.mae_m.toFixed(2)} m</span>}
              {!stage?.forecast?.length && <button type="button" onClick={() => void refetchStage()} className="rounded-md border border-slate-300 px-2.5 py-1.5 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">{t.retryGauge}</button>}
            </div>
            {stage?.observed_stage_m != null && <div className="mb-2 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-950 dark:border-teal-900 dark:bg-teal-950/60 dark:text-teal-100"><span className="font-semibold">Latest CWC Arangali gauge reading</span><span className="font-mono font-bold">{stage.observed_stage_m.toFixed(2)} m · {stage.observed_at ? new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(stage.observed_at)) : "time unavailable"} IST</span></div>}
            {stageLoading && dischargeLoading ? <div className="grid h-72 place-items-center text-sm text-text-secondary">Loading gauge and river forecast data…</div> : stage?.forecast?.length ? <>
              <div className="h-[16rem]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={[{ time: stage.observed_at!, stage_m: stage.observed_stage_m!, lower_m: stage.observed_stage_m!, upper_m: stage.observed_stage_m! }, ...stage.forecast]} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                    <defs><linearGradient id="stageFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0284C7" stopOpacity={0.28} /><stop offset="95%" stopColor="#0284C7" stopOpacity={0.02} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94A3B8" strokeOpacity={0.1} />
                    <XAxis dataKey="time" interval={7} minTickGap={28} tickFormatter={(value) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(String(value)))} tick={{ fontSize: 10, fill: "#687770" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#687770" }} unit=" m" width={48} domain={["auto", "auto"]} />
                    <Tooltip contentStyle={{ backgroundColor: "#1E292B", borderRadius: "8px", border: "none", color: "#fff", fontSize: "12px" }} labelFormatter={(value) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(String(value)))} formatter={(value, name) => [`${Number(value).toFixed(2)} m`, String(name)]} />
                    <Legend wrapperStyle={{ fontSize: "11px" }} />
                    <Area type="monotone" dataKey="upper_m" stroke="#7DD3FC" strokeWidth={1} strokeDasharray="4 3" fill="none" name="Empirical upper range" connectNulls />
                    <Area type="monotone" dataKey="lower_m" stroke="#7DD3FC" strokeWidth={1} strokeDasharray="4 3" fill="none" name="Empirical lower range" connectNulls />
                    <Area type="monotone" dataKey="stage_m" stroke="#0284C7" strokeWidth={2.5} fill="url(#stageFill)" name="Gauge stage forecast" connectNulls />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-text-secondary">CWC Arangaly gauge via NWIC · Open-Meteo rainfall · validation MAE {stage.validation?.mae_m.toFixed(2) ?? "—"} m. Forecast is model guidance, not an official warning.</p>
            </> : discharge?.daily?.length ? <>
              <div className="h-[16rem]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={discharge.daily} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                    <defs><linearGradient id="dischargeFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563EB" stopOpacity={0.3} /><stop offset="95%" stopColor="#2563EB" stopOpacity={0.02} /></linearGradient></defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94A3B8" strokeOpacity={0.1} />
                    <XAxis dataKey="date" interval="preserveStartEnd" minTickGap={24} tickFormatter={(date) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))} tick={{ fontSize: 10, fill: "#687770" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#687770" }} unit=" m³/s" width={58} />
                    <Tooltip contentStyle={{ backgroundColor: "#1E292B", borderRadius: "8px", border: "none", color: "#fff", fontSize: "12px" }} formatter={(value) => [`${Number(value).toFixed(1)} m³/s`, "Discharge"]} />
                    <Area type="monotone" dataKey="river_discharge_m3s" stroke="#2563EB" strokeWidth={2} fill="url(#dischargeFill)" name="Modelled discharge" connectNulls />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-text-secondary">{stage?.unavailable_reason ?? (stageErrorDetail instanceof APIError ? stageErrorDetail.detail : "Arangaly gauge data is unavailable.")} {discharge.model} · discharge is model guidance in m³/s, not observed water level.{discharge.is_stale ? " Showing cached data." : ""}</p>
            </> : hourlyData.length ? <>
              <div className="h-[16rem]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={hourlyData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94A3B8" strokeOpacity={0.1} />
                    <XAxis dataKey="time" interval={7} minTickGap={28} tickFormatter={(value) => { const date = new Date(String(value)); return Number.isNaN(date.getTime()) ? String(value) : new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(date); }} tick={{ fontSize: 10, fill: "#687770" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#687770" }} unit=" mm" width={48} />
                    <Tooltip contentStyle={{ backgroundColor: "#1E292B", borderRadius: "8px", border: "none", color: "#fff", fontSize: "12px" }} labelFormatter={(value) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" }).format(new Date(String(value)))} formatter={(value) => [`${Number(value ?? 0).toFixed(1)} mm`, "Forecast rainfall"]} />
                    <Bar dataKey="precipitation" fill="#0072B2" fillOpacity={0.88} radius={[3, 3, 0, 0]} name="Forecast rainfall (mm)" />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-text-secondary">{stage?.unavailable_reason ?? "Arangali gauge telemetry is unavailable."} The chart shows Open-Meteo rainfall forcing; it is not an observed or predicted river stage.</p>
            </> : <div className="flex h-72 flex-col items-center justify-center gap-3 text-center">
              <p className="max-w-lg text-sm text-text-secondary">{stage?.unavailable_reason ?? (stageErrorDetail instanceof APIError ? stageErrorDetail.detail : "Gauge stage and modelled discharge are currently unavailable.")}</p>
              <div className="flex gap-2"><button type="button" onClick={() => void refetchStage()} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">{t.retryGauge}</button><button type="button" onClick={() => void refetchDischarge()} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">{t.retryDischarge}</button></div>
            </div>}
          </section>
          </div>
        </div>
      )}

      {activeTab === "risk_model" && <ModelEvalPanel ev={modelEval} isLoading={modelEvalLoading} isError={modelEvalError} />}

      {activeTab === "historical" && (
        <section className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs dark:bg-slate-900 dark:border-slate-800">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-[#1E292B] dark:text-slate-50">Event Reanalysis Comparison</h3>
            </div>
            <a href="https://open-meteo.com/en/docs/historical-weather-api" target="_blank" rel="noreferrer" className="text-xs text-teal-700 underline dark:text-teal-400">Open-Meteo ERA5 archive</a>
          </div>
          {historicalRainfallLoading || historicalLoading ? <div className="grid h-72 place-items-center text-sm text-text-secondary">Loading historical rainfall…</div>
            : historicalRainfallError || historicalError ? <div role="status" className="grid h-72 place-items-center text-sm text-text-secondary">Historical rainfall is temporarily unavailable.</div>
            : historicalRainData.length > 0 ? <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={historicalRainData} margin={{ top: 12, right: 18, left: 0, bottom: 4 }}>
                  <defs>
                    <linearGradient id="rain2018" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#0D9488" stopOpacity={0.3} /><stop offset="95%" stopColor="#0D9488" stopOpacity={0.02} /></linearGradient>
                    <linearGradient id="rain2019" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563EB" stopOpacity={0.24} /><stop offset="95%" stopColor="#2563EB" stopOpacity={0.02} /></linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94A3B8" strokeOpacity={0.1} />
                  <XAxis dataKey="dayOffset" tickFormatter={(day) => Number(day) > 0 ? `+${day}` : `${day}`} tick={{ fontSize: 10, fill: "#687770" }}>
                    <Label value="Days from Peak Daily Rainfall" position="insideBottom" offset={-2} style={{ fill: "#687770", fontSize: 10 }} />
                  </XAxis>
                  <YAxis tick={{ fontSize: 10, fill: "#687770" }} unit=" mm" />
                  {(() => {
                    const startOffset = historicalRainData.find((point) => point.date2018 === "2018-08-15")?.dayOffset;
                    const endOffset = historicalRainData.find((point) => point.date2018 === "2018-08-17")?.dayOffset;
                    return startOffset == null || endOffset == null ? null : <ReferenceArea x1={startOffset} x2={endOffset} fill="#F59E0B" fillOpacity={0.14} stroke="#D97706" strokeDasharray="5 4" label={{ value: "CWC peak rainfall · 15–17 Aug 2018", position: "insideTop", fill: "#92400E", fontSize: 10 }} />;
                  })()}
                  <Tooltip content={<HistoricalRainTooltip />} formatter={(value, name) => [`${Number(value).toFixed(1)} mm`, name]} />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  <Area type="monotone" dataKey="year2018" stroke="#0D9488" strokeWidth={2} fill="url(#rain2018)" name="2018 event" connectNulls />
                  <Area type="monotone" dataKey="year2019" stroke="#2563EB" strokeWidth={2} fill="url(#rain2019)" name="2019 event" connectNulls />
                </AreaChart>
              </ResponsiveContainer>
            </div> : null}
          <p className="mt-3 text-[11px] leading-relaxed text-text-secondary">ERA5 reanalysis is not a gauge record (~25 km grid). The shaded 15–17 Aug 2018 period marks Kerala’s peak-rainfall window documented in the <a className="underline" href="https://spb.kerala.gov.in/sites/default/files/inline-files/Final_Report.pdf" target="_blank" rel="noreferrer">Central Water Commission report</a>; the marker is aligned to the 2018 event days.</p>
        </section>
      )}

      {activeTab === "flood_processing" && <div className="-mx-6 -mb-6 min-h-0 flex-1"><AnalysisView /></div>}
    </div>
  );
}
