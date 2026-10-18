"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/store";
import { useQuery } from "@tanstack/react-query";
import { api, ModelEvaluation } from "@/lib/api";
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
  Line,
  Legend,
} from "recharts";
import { LineChart } from "lucide-react";

const fmt = (v: number | null | undefined, digits = 3) => (v == null ? "—" : v.toFixed(digits));
type HistoricalEventsResponse = { events: { event_id: string; name: string; start_date: string; end_date: string; description: string; source: string; source_url?: string; flood_extent_available: boolean; notes?: string | null }[]; note?: string };

/** Real held-out evaluation of the latest saved Random Forest experiment. Renders nothing it was not given. */
function ModelEvalPanel({ ev, isLoading, isError }: { ev: ModelEvaluation | undefined; isLoading: boolean; isError: boolean }) {
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
  const featureNames = Object.keys(ev.feature_importance ?? {});
  const isTopographyProxy = featureNames.length > 0 && featureNames.every((name) => ["elevation", "slope"].includes(name.toLowerCase()));
  if (isTopographyProxy) {
    return (
      <section className="rounded-xl border border-border bg-white p-6 shadow-xs dark:bg-slate-900 dark:border-slate-800">
        <h3 className="text-base font-semibold text-[#1E292B] dark:text-slate-50">Baseline Topography Model</h3>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-text-secondary dark:text-slate-400">
          This baseline uses elevation and slope to highlight low-lying terrain susceptibility. It is not a validated radar flood model; independent live radar validation is unavailable.
        </p>
      </section>
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
  const [activeTab, setActiveTab] = useState<"precipitation" | "risk_model" | "historical">("precipitation");

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
  const { data: discharge, isLoading: dischargeLoading, isError: dischargeError } = useQuery({
    queryKey: ["river-discharge-forecast"],
    queryFn: () => api.forecast.discharge(),
    enabled: activeTab === "precipitation",
    staleTime: 900_000,
    retry: 1,
  });

  // Prepare precipitation data
  const baseHourlyData = (forecast?.hourly || []).slice(0, 48).map((h, i) => ({
    time: h.time ? new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(h.time)) : `+${i}h`,
    precipitation: h.precipitation_mm,
    temp: h.temperature_2m,
    humidity: h.relative_humidity_2m,
  }));
  const hourlyData = baseHourlyData.reduce<(typeof baseHourlyData[number] & { cumulative: number | null })[]>((rows, hour) => {
    const previous = rows.at(-1)?.cumulative ?? 0;
    rows.push({ ...hour, cumulative: hour.precipitation == null ? (rows.at(-1)?.cumulative ?? null) : previous + hour.precipitation });
    return rows;
  }, []);

  const historicalRainData = (() => {
    const series = (historicalRainfall ?? []).map(({ event, data }) => {
      const sums = new Map<string, number>();
      for (const point of data.hourly) {
        if (point.precipitation_mm == null) continue;
        const date = point.time.slice(0, 10);
        sums.set(date, (sums.get(date) ?? 0) + point.precipitation_mm);
      }
      const start = Date.parse(`${event.start_date}T00:00:00Z`);
      return { year: event.start_date.slice(0, 4), days: [...sums.entries()].map(([date, rainfall]) => ({
        day: Math.round((Date.parse(`${date}T00:00:00Z`) - start) / 86_400_000) + 1,
        rainfall,
      })) };
    });
    const byDay = new Map<number, { day: number; year2018?: number; year2019?: number }>();
    for (const item of series) for (const point of item.days) {
      const row = byDay.get(point.day) ?? { day: point.day };
      if (item.year === "2018") row.year2018 = point.rainfall;
      if (item.year === "2019") row.year2019 = point.rainfall;
      byDay.set(point.day, row);
    }
    return [...byDay.values()].sort((a, b) => a.day - b.day);
  })();

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
    ["24h rainfall", rainfall24h == null ? "—" : `${rainfall24h.toFixed(1)} mm`, forecastError || !forecast ? "Forecast unavailable" : forecast.is_stale ? "Stale forecast" : "Open-Meteo forecast"],
    ["72h rainfall", rainfall72h == null ? "—" : `${rainfall72h.toFixed(1)} mm`, forecastError || !forecast ? "Forecast unavailable" : forecast.is_stale ? "Stale forecast" : "Open-Meteo forecast"],
    ["High-risk infrastructure", exposureLoading || exposureError || !exposure ? "—" : String(riskCounts.critical + riskCounts.high), exposureLoading || exposureError || !exposure ? "Risk data unavailable" : `${riskCounts.critical} critical · ${riskCounts.high} high`],
    ["Forecast hours", String(hourlyData.length), "Hourly precipitation records"],
  ] : activeTab === "risk_model" && !isTopographyProxy ? [
    ["Held-out rows", modelEval?.status === "evaluated" ? String(modelEval.n_test ?? "—") : "—", "Spatially separated test set"],
    ["Flood test samples", evaluationFloodCount == null ? "—" : String(evaluationFloodCount), "Positive examples in held-out set"],
    ["F1 score", modelEval?.status === "evaluated" ? fmt(modelEval.metrics.f1) : "—", "Held-out classification metric"],
    ["Brier score", modelEval?.status === "evaluated" ? fmt(modelEval.metrics.brier_score) : "—", "Held-out probability error · lower is better"],
  ] : [];

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-[#F7F8F4] p-6 text-[#26332F]">
      {/* Title & Subheader */}
      <div className="flex items-center justify-between pb-6 border-b border-[#E2E8F0]">
        <div>
          <div className="flex items-center gap-2">
            <LineChart className="h-5 w-5 text-teal-700 dark:text-teal-400" aria-hidden="true" />
            <h1 className="text-xl font-bold text-[#1E292B]">
              {language === "en" ? "Analytics" : "അപഗ്രഥനം"}
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
            {language === "en" ? "Precipitation & Inflow" : "മഴ & ജലപ്രവാഹം"}
          </button>
          <button
            onClick={() => setActiveTab("risk_model")}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              activeTab === "risk_model" ? "bg-teal-600 text-white dark:bg-teal-500 dark:text-slate-950" : "text-[#687770] hover:text-[#1E292B]"
            }`}
          >
            {language === "en" ? "Risk & Model Metrics" : "മോഡൽ മെട്രിക്സ്"}
          </button>
          <button
            onClick={() => setActiveTab("historical")}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              activeTab === "historical" ? "bg-teal-600 text-white dark:bg-teal-500 dark:text-slate-950" : "text-[#687770] hover:text-[#1E292B]"
            }`}
          >
            {language === "en" ? "Historical Comparison" : "ചരിത്രപരമായ താരതമ്യം"}
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs">
            <h3 className="text-sm font-bold text-[#1E292B] mb-1">
              {language === "en" ? "48-Hour Hourly Precipitation Distribution" : "48 മണിക്കൂർ മണിക്കൂർ തോറുമുള്ള മഴ"}
            </h3>
            {hourlyData.length === 0 ? <div className="grid h-64 place-items-center text-sm text-text-secondary">Forecast data unavailable.</div> : <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={hourlyData} margin={{ top: 10, right: 12, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94A3B8" strokeOpacity={0.1} />
                  <XAxis dataKey="time" interval={Math.max(0, Math.ceil(hourlyData.length / 8) - 1)} minTickGap={28} tick={{ fontSize: 10, fill: "#687770" }} />
                  <YAxis yAxisId="rain" tick={{ fontSize: 10, fill: "#687770" }} unit=" mm" />
                  <YAxis yAxisId="total" orientation="right" tick={{ fontSize: 10, fill: "#687770" }} unit=" mm" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1E292B", borderRadius: "8px", border: "none", color: "#fff", fontSize: "12px" }}
                  />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  <Bar yAxisId="rain" dataKey="precipitation" fill="#0D9488" fillOpacity={0.65} radius={[3, 3, 0, 0]} name="Hourly rainfall (mm)" />
                  <Line yAxisId="total" type="monotone" dataKey="cumulative" stroke="#1D4ED8" strokeWidth={2.5} dot={false} connectNulls name="Cumulative rainfall (mm)" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>}
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs flex flex-col">
            <h3 className="text-sm font-bold text-[#1E292B] mb-1">
              {language === "en" ? "Modeled River Discharge" : "മാതൃകയാക്കിയ നദീപ്രവാഹം"}
            </h3>
            {dischargeLoading ? <div className="grid h-56 place-items-center text-sm text-text-secondary">Loading river-flow forecast…</div> : dischargeError || !discharge?.daily?.length ? <div className="grid h-56 place-items-center text-sm text-text-secondary">River-flow forecast is temporarily unavailable.</div> : <><div className="h-56 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={discharge.daily} margin={{ top: 10, right: 8, left: -15, bottom: 0 }}>
                  <defs><linearGradient id="dischargeFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#2563EB" stopOpacity={0.3} /><stop offset="95%" stopColor="#2563EB" stopOpacity={0.02} /></linearGradient></defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94A3B8" strokeOpacity={0.1} />
                  <XAxis dataKey="date" interval="preserveStartEnd" minTickGap={24} tick={{ fontSize: 10, fill: "#687770" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#687770" }} unit=" m³/s" width={58} />
                  <Tooltip contentStyle={{ backgroundColor: "#1E292B", borderRadius: "8px", border: "none", color: "#fff", fontSize: "12px" }} formatter={(value) => [`${Number(value).toFixed(1)} m³/s`, "Discharge"]} />
                  <Area type="monotone" dataKey="river_discharge_m3s" stroke="#2563EB" strokeWidth={2} fill="url(#dischargeFill)" name="River discharge" connectNulls />
                </AreaChart>
              </ResponsiveContainer>
            </div><p className="mt-2 text-[11px] leading-relaxed text-text-secondary">{discharge.model} · {discharge.source} · modelled at a nearby river grid cell, not a gauge.{discharge.is_stale ? " Showing cached data." : ""}</p></>}
          </div>
        </div>
      )}

      {activeTab === "risk_model" && <ModelEvalPanel ev={modelEval} isLoading={modelEvalLoading} isError={modelEvalError} />}

      {activeTab === "historical" && (
        <section className="rounded-xl border border-[#E2E8F0] bg-white p-5 shadow-xs dark:bg-slate-900 dark:border-slate-800">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-[#1E292B] dark:text-slate-50">Historical Daily Rainfall</h3>
              <p className="mt-1 text-xs text-text-secondary">Kerala flood event windows · daily totals · basin-centroid reanalysis</p>
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
                  <XAxis dataKey="day" tickFormatter={(day) => `Day ${day}`} tick={{ fontSize: 10, fill: "#687770" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#687770" }} unit=" mm" />
                  <Tooltip labelFormatter={(day) => `Event day ${day}`} formatter={(value, name) => [`${Number(value).toFixed(1)} mm`, name]} contentStyle={{ backgroundColor: "#1E292B", borderRadius: "8px", border: "none", color: "#fff", fontSize: "12px" }} />
                  <Legend wrapperStyle={{ fontSize: "11px" }} />
                  <Area type="monotone" dataKey="year2018" stroke="#0D9488" strokeWidth={2} fill="url(#rain2018)" name="2018 event" connectNulls />
                  <Area type="monotone" dataKey="year2019" stroke="#2563EB" strokeWidth={2} fill="url(#rain2019)" name="2019 event" connectNulls />
                </AreaChart>
              </ResponsiveContainer>
            </div> : null}
          <p className="mt-3 text-[11px] leading-relaxed text-text-secondary">ERA5 is reanalysis, not a rain-gauge record; approximately 25 km grid resolution. Flood extents and observed discharge are not inferred from rainfall.</p>
        </section>
      )}
    </div>
  );
}
