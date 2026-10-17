"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/store";
import { useQuery } from "@tanstack/react-query";
import { api, ModelEvaluation } from "@/lib/api";
import { translations } from "@/lib/translations";
import {
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

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
  const m = ev.metrics;
  const cm = ev.confusion_matrix?.matrix;
  const imp = Object.entries(ev.feature_importance ?? {}).sort((a, b) => b[1] - a[1]);
  const kpis: [string, string][] = [
    ["Precision", fmt(m.precision)], ["Recall", fmt(m.recall)], ["F1", fmt(m.f1)],
    ["IoU", fmt(m.iou)], ["ROC-AUC", fmt(m.roc_auc)], ["Brier score", fmt(m.brier_score)],
  ];
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs">
        <h3 className="text-sm font-bold text-[#1E292B] mb-1">Random Forest — held-out regions</h3>
        <p className="text-xs text-[#687770] mb-4">{ev.n_test} held-out rows · {ev.split?.test_regions.length} test regions · {ev.csv_name}</p>
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
        <details className="ux-disclosure mt-2 text-[11px] text-text-secondary"><summary>Metric interpretation</summary><p className="pt-2">A metric is undefined when its denominator is zero. Model probabilities are uncalibrated.</p></details>
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
        {ev.notes.length > 0 && <ul className="mt-4 text-[11px] text-[#92400e] list-disc pl-4">{ev.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
      </div>
    </div>
  );
}

export function AnalyticsView() {
  const { language, forecastHour, setForecastHour } = useStore();
  const t = translations[language];

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

  // Prepare precipitation data
  const hourlyData = (forecast?.hourly || []).slice(0, 48).map((h, i) => ({
    hour: `+${i}h`,
    time: h.time ? new Date(h.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : `+${i}h`,
    precipitation: h.precipitation_mm,
    temp: h.temperature_2m,
    humidity: h.relative_humidity_2m,
  }));

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

  const riskPieData = [
    { name: t.riskCritical, value: riskCounts.critical, color: "#EF4444" },
    { name: t.riskHigh, value: riskCounts.high, color: "#F97316" },
    { name: t.riskMedium, value: riskCounts.medium, color: "#F59E0B" },
    { name: t.riskLow, value: riskCounts.low, color: "#10B981" },
  ];
  const rainfall24h = forecast?.rainfall_accumulations?.find((a) => a.window_hours === 24)?.accumulation_mm;
  const rainfall72h = forecast?.rainfall_accumulations?.find((a) => a.window_hours === 72)?.accumulation_mm;

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-[#F7F8F4] p-6 text-[#26332F]">
      {/* Title & Subheader */}
      <div className="flex items-center justify-between pb-6 border-b border-[#E2E8F0]">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">📊</span>
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 my-6">
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-xs">
          <div className="text-[11px] font-semibold text-[#687770] uppercase tracking-wider">
            {language === "en" ? "24h rainfall" : "24 മണിക്കൂർ മഴ"}
          </div>
          <div className="text-2xl font-bold text-[#1E292B] mt-1">
            {rainfall24h?.toFixed(1) ?? "—"} <span className="text-xs font-normal text-[#687770]">mm</span>
          </div>
          <div className="text-[11px] text-[#0D9488] font-medium mt-1 flex items-center gap-1">
            <span>●</span> {forecastError || !forecast ? "Forecast unavailable" : forecast.is_stale ? "Stale forecast" : "Open-Meteo forecast"}
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-xs">
          <div className="text-[11px] font-semibold text-[#687770] uppercase tracking-wider">
            {language === "en" ? "72h rainfall" : "72 മണിക്കൂർ ശേഖരണം"}
          </div>
          <div className="text-2xl font-bold text-[#1E292B] mt-1">
            {rainfall72h?.toFixed(1) ?? "—"} <span className="text-xs font-normal text-[#687770]">mm</span>
          </div>
          <div className="text-[11px] text-[#F59E0B] font-medium mt-1 flex items-center gap-1">
            <span>●</span> {forecastError || !forecast ? "Forecast unavailable" : forecast.is_stale ? "Stale forecast" : "Open-Meteo forecast"}
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-xs">
          <div className="text-[11px] font-semibold text-[#687770] uppercase tracking-wider">
            {language === "en" ? "High Risk Infrastructure" : "അപകടസാധ്യതയുള്ള സ്ഥാപനങ്ങൾ"}
          </div>
          <div className="text-2xl font-bold text-[#EF4444] mt-1">
            {exposureLoading || exposureError || !exposure ? "—" : riskCounts.critical + riskCounts.high} <span className="text-xs font-normal text-[#687770]">high risk</span>
          </div>
          <div className="text-[11px] text-[#687770] font-medium mt-1">
            {exposureLoading || exposureError || !exposure ? "Risk data unavailable" : `${riskCounts.critical} critical · ${riskCounts.high} high`}
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-xs">
          <div className="text-[11px] font-semibold text-[#687770] uppercase tracking-wider">
            {language === "en" ? "Flood Model (held-out F1)" : "മോഡൽ കൃത്യത"}
          </div>
          {modelEval?.status === "evaluated" ? (
            <>
              <div className="text-2xl font-bold text-[#10B981] mt-1">
                {fmt(modelEval.metrics.f1)} <span className="text-xs font-normal text-[#687770]">F1</span>
              </div>
              <div className="text-[11px] text-[#687770] font-medium mt-1">
                IoU {fmt(modelEval.metrics.iou)} · ROC-AUC {fmt(modelEval.metrics.roc_auc)} · n={modelEval.n_test}
              </div>
            </>
          ) : (
            <>
              <div className="text-2xl font-bold text-[#687770] mt-1">Not trained</div>
              <div className="text-[11px] text-[#687770] font-medium mt-1">No evaluation exists yet</div>
            </>
          )}
        </div>
      </div>

      {/* Main Content Tab Panes */}
      {activeTab === "precipitation" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs">
            <h3 className="text-sm font-bold text-[#1E292B] mb-1">
              {language === "en" ? "48-Hour Hourly Precipitation Distribution" : "48 മണിക്കൂർ മണിക്കൂർ തോറുമുള്ള മഴ"}
            </h3>
            {hourlyData.length === 0 ? <div className="grid h-64 place-items-center text-sm text-text-secondary">Forecast data unavailable.</div> : <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={hourlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorPrecip" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0D9488" stopOpacity={0.6}/>
                      <stop offset="95%" stopColor="#0D9488" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#94A3B8" strokeOpacity={0.1} />
                  <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "#687770" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#687770" }} unit=" mm" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1E292B", borderRadius: "8px", border: "none", color: "#fff", fontSize: "12px" }}
                  />
                  <Area type="monotone" dataKey="precipitation" stroke="#0D9488" strokeWidth={2} fillOpacity={1} fill="url(#colorPrecip)" name="Rainfall (mm)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>}
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs flex flex-col">
            <h3 className="text-sm font-bold text-[#1E292B] mb-1">
              {language === "en" ? "Risk Exposure Distribution" : "അപകടസാധ്യതാ അനുപാതം"}
            </h3>
            {exposureLoading ? <div className="grid h-56 place-items-center text-sm text-text-secondary">Loading asset risk…</div> : exposureError ? <div role="alert" className="grid h-56 place-items-center text-sm text-text-secondary">Asset risk data unavailable.</div> : exposure?.items?.length ? <div className="h-56 flex-1">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={riskPieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {riskPieData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "#1E292B", borderRadius: "8px", border: "none", color: "#fff", fontSize: "12px" }} />
                  <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: "11px" }} />
                </PieChart>
              </ResponsiveContainer>
            </div> : <div className="grid h-56 place-items-center text-sm text-text-secondary">No asset risk data available.</div>}
          </div>
        </div>
      )}

      {activeTab === "risk_model" && <ModelEvalPanel ev={modelEval} isLoading={modelEvalLoading} isError={modelEvalError} />}

      {activeTab === "historical" && (
        <div className="space-y-3">
          {historical?.events?.map((event) => (
            <article key={event.event_id} className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-xs">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-[#1E292B]">{event.name}</h3>
                  <p className="mt-1 text-xs text-text-secondary">{event.start_date} – {event.end_date}</p>
                </div>
                <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
                  {event.flood_extent_available ? "Extent available" : "No processed extent"}
                </span>
              </div>
              <p className="mt-3 text-sm text-text-secondary">{event.description}</p>
              <details className="ux-disclosure mt-3 text-xs text-text-secondary">
                <summary>Source & notes</summary>
                <p className="pt-2">{event.source}{event.notes ? ` · ${event.notes}` : ""}</p>
                {event.source_url && <a className="mt-1 inline-block text-teal-700 underline dark:text-teal-400" href={event.source_url} target="_blank" rel="noreferrer">Open source</a>}
              </details>
            </article>
          ))}
          {historicalLoading && <div className="rounded-xl border border-border bg-white p-5 text-sm text-text-secondary dark:bg-slate-900">Loading historical events…</div>}
          {historicalError && <div className="rounded-xl border border-border bg-white p-5 text-sm text-text-secondary dark:bg-slate-900">Historical event records are unavailable.</div>}
          {!historicalLoading && !historicalError && !historical?.events?.length && <div className="rounded-xl border border-border bg-white p-5 text-sm text-text-secondary dark:bg-slate-900">No historical events are available.</div>}
        </div>
      )}
    </div>
  );
}
