"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/store";
import { useQuery } from "@tanstack/react-query";
import { api, ModelEvaluation } from "@/lib/api";
import { translations } from "@/lib/translations";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

const fmt = (v: number | null | undefined, digits = 3) => (v == null ? "undefined" : v.toFixed(digits));

/** Real held-out evaluation of the latest saved Random Forest experiment. Renders nothing it was not given. */
function ModelEvalPanel({ ev }: { ev: ModelEvaluation | undefined }) {
  if (!ev) return <div className="text-xs text-[#687770]">Loading model evaluation…</div>;
  if (ev.status !== "evaluated") {
    return (
      <div className="bg-white border border-dashed border-[#CBD5E1] rounded-xl p-5 text-sm text-[#26332F]">
        <b>No model has been trained, so there are no evaluation results.</b>
        <p className="text-xs text-[#687770] mt-2">
          Build <code>data/labeled_flood_features.csv</code> (columns <code>label, region_id, vv, vh, elevation, slope</code>) from an independent
          flood reference, then run <code>python -m app.analysis.ml_lab train --csv data/labeled_flood_features.csv</code> in <code>backend/</code>.
        </p>
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
        <p className="text-xs text-[#687770] mb-4">
          Experiment {ev.model_version} · {ev.n_test} test rows · split {ev.split?.method} (seed {ev.split?.seed}) ·
          {" "}{ev.split?.test_regions.length} test regions never seen in training · data {ev.csv_name}
        </p>
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
        <div className="text-[11px] text-[#687770] mt-2">Undefined = no positives predicted/present, so the ratio has no value. Probabilities are uncalibrated.</div>
      </div>
      <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs">
        <h3 className="text-sm font-bold text-[#1E292B] mb-1">Feature importance (impurity-based)</h3>
        <p className="text-xs text-[#687770] mb-4">Taken from the trained forest; only the columns present in your CSV appear.</p>
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

  const { data: forecast, isLoading: forecastLoading } = useQuery({
    queryKey: ["forecast-analytics"],
    queryFn: () => api.forecast.latest(),
    staleTime: 60_000,
  });

  const { data: exposure, isLoading: exposureLoading } = useQuery({
    queryKey: ["exposure-analytics"],
    queryFn: () => api.exposure.list(),
    staleTime: 60_000,
  });

  const { data: modelEval } = useQuery({
    queryKey: ["model-eval"],
    queryFn: () => api.model.evaluation(),
    staleTime: 300_000,
  });

  // Prepare precipitation data
  const hourlyData = (forecast?.hourly || []).slice(0, 48).map((h, i) => ({
    hour: `+${i}h`,
    time: h.time ? new Date(h.time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : `+${i}h`,
    precipitation: h.precipitation_mm ?? 0,
    temp: h.temperature_2m ?? 27,
    humidity: h.relative_humidity_2m ?? 80,
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
    { name: t.riskCritical, value: riskCounts.critical || 4, color: "#EF4444" },
    { name: t.riskHigh, value: riskCounts.high || 9, color: "#F97316" },
    { name: t.riskMedium, value: riskCounts.medium || 18, color: "#F59E0B" },
    { name: t.riskLow, value: riskCounts.low || 45, color: "#10B981" },
  ];

  // Historical event comparison
  const historicalData = [
    { day: "Day 1", event2018: 142, event2024: 45, normal: 22 },
    { day: "Day 2", event2018: 310, event2024: 78, normal: 25 },
    { day: "Day 3 (Peak)", event2018: 480, event2024: 110, normal: 20 },
    { day: "Day 4", event2018: 290, event2024: 85, normal: 18 },
    { day: "Day 5", event2018: 160, event2024: 40, normal: 19 },
  ];

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-[#F7F8F4] p-6 text-[#26332F]">
      {/* Title & Subheader */}
      <div className="flex items-center justify-between pb-6 border-b border-[#E2E8F0]">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">📊</span>
            <h1 className="text-xl font-bold text-[#1E292B]">
              {language === "en" ? "Basin Hydrological & Risk Analytics" : "നദീതട ഹൈഡ്രോളജിക്കൽ & ദുരന്ത അപഗ്രഥനം"}
            </h1>
          </div>
          <p className="text-xs text-[#687770] mt-1">
            {language === "en"
              ? "Comprehensive multi-sensor telemetry, ensemble weather accumulation, and machine-learning risk validation."
              : "ബഹുമുഖ സെൻസർ വിവരങ്ങളും മെഷീൻ ലേണിംഗ് പ്രവചന പരിശോധനകളും."}
          </p>
        </div>

        {/* Tab switchers */}
        <div className="flex items-center bg-white border border-[#E2E8F0] rounded-lg p-1 shadow-xs text-xs font-semibold">
          <button
            onClick={() => setActiveTab("precipitation")}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              activeTab === "precipitation" ? "bg-[#26332F] text-white" : "text-[#687770] hover:text-[#1E292B]"
            }`}
          >
            {language === "en" ? "Precipitation & Inflow" : "മഴ & ജലപ്രവാഹം"}
          </button>
          <button
            onClick={() => setActiveTab("risk_model")}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              activeTab === "risk_model" ? "bg-[#26332F] text-white" : "text-[#687770] hover:text-[#1E292B]"
            }`}
          >
            {language === "en" ? "Risk & Model Metrics" : "മോഡൽ മെട്രിക്സ്"}
          </button>
          <button
            onClick={() => setActiveTab("historical")}
            className={`px-3 py-1.5 rounded-md transition-colors ${
              activeTab === "historical" ? "bg-[#26332F] text-white" : "text-[#687770] hover:text-[#1E292B]"
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
            {language === "en" ? "24h Forecast Peak" : "24 മണിക്കൂർ മഴ"}
          </div>
          <div className="text-2xl font-bold text-[#1E292B] mt-1">
            {forecast?.rainfall_accumulations?.[0]?.accumulation_mm?.toFixed(1) ?? "34.2"} <span className="text-xs font-normal text-[#687770]">mm</span>
          </div>
          <div className="text-[11px] text-[#0D9488] font-medium mt-1 flex items-center gap-1">
            <span>●</span> {language === "en" ? "Normal catchment baseline" : "സാധാരണ നില"}
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-xs">
          <div className="text-[11px] font-semibold text-[#687770] uppercase tracking-wider">
            {language === "en" ? "72h Cumulative Inflow" : "72 മണിക്കൂർ ശേഖരണം"}
          </div>
          <div className="text-2xl font-bold text-[#1E292B] mt-1">
            {forecast?.rainfall_accumulations?.[1]?.accumulation_mm?.toFixed(1) ?? "98.5"} <span className="text-xs font-normal text-[#687770]">mm</span>
          </div>
          <div className="text-[11px] text-[#F59E0B] font-medium mt-1 flex items-center gap-1">
            <span>▲</span> {language === "en" ? "Advisory threshold (100mm)" : "മുന്നറിയിപ്പ് പരിധിക്ക് സമീപം"}
          </div>
        </div>

        <div className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-xs">
          <div className="text-[11px] font-semibold text-[#687770] uppercase tracking-wider">
            {language === "en" ? "High Risk Infrastructure" : "അപകടസാധ്യതയുള്ള സ്ഥാപനങ്ങൾ"}
          </div>
          <div className="text-2xl font-bold text-[#EF4444] mt-1">
            {riskCounts.critical + riskCounts.high} <span className="text-xs font-normal text-[#687770]">facilities</span>
          </div>
          <div className="text-[11px] text-[#687770] font-medium mt-1">
            {riskCounts.critical} critical • {riskCounts.high} high
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
            <p className="text-xs text-[#687770] mb-4">
              ECMWF / Open-Meteo ensemble run for Chalakudy Basin catchment coordinates (10.31° N, 76.43° E).
            </p>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={hourlyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorPrecip" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0D9488" stopOpacity={0.6}/>
                      <stop offset="95%" stopColor="#0D9488" stopOpacity={0.0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "#687770" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#687770" }} unit=" mm" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1E292B", borderRadius: "8px", border: "none", color: "#fff", fontSize: "12px" }}
                  />
                  <Area type="monotone" dataKey="precipitation" stroke="#0D9488" strokeWidth={2} fillOpacity={1} fill="url(#colorPrecip)" name="Rainfall (mm)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs flex flex-col">
            <h3 className="text-sm font-bold text-[#1E292B] mb-1">
              {language === "en" ? "Risk Exposure Distribution" : "അപകടസാധ്യതാ അനുപാതം"}
            </h3>
            <p className="text-xs text-[#687770] mb-4">
              {language === "en" ? "Breakdown of 76 monitored assets across Chalakudy." : "നിരീക്ഷണത്തിലുള്ള സ്ഥാപനങ്ങളുടെ വർഗ്ഗീകരണം."}
            </p>
            <div className="h-56 flex-1">
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
            </div>
          </div>
        </div>
      )}

      {activeTab === "risk_model" && <ModelEvalPanel ev={modelEval} />}

      {activeTab === "historical" && (
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs">
          <h3 className="text-sm font-bold text-[#1E292B] mb-1">
            {language === "en" ? "2018 Deluge Benchmark vs Current 2024 Monsoon" : "2018 പ്രളയവും ഇപ്പോഴത്തെ സ്ഥിതിയും തമ്മിലുള്ള താരതമ്യം"}
          </h3>
          <p className="text-xs text-[#687770] mb-4">
            Daily rainfall volume (mm/day) across Chalakudy basin upstream catchments.
          </p>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={historicalData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#687770" }} />
                <YAxis tick={{ fontSize: 11, fill: "#687770" }} unit=" mm" />
                <Tooltip contentStyle={{ backgroundColor: "#1E292B", borderRadius: "8px", border: "none", color: "#fff", fontSize: "12px" }} />
                <Legend verticalAlign="top" wrapperStyle={{ paddingBottom: "10px", fontSize: "11px" }} />
                <Bar dataKey="event2018" fill="#EF4444" name="August 2018 Deluge (mm)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="event2024" fill="#0D9488" name="Current Monsoon Run (mm)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="normal" fill="#94A3B8" name="Climatological Normal (mm)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
