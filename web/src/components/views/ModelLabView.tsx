"use client";

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown, ChevronRight } from "lucide-react";
import { api, type ClassificationExperiment, type Experiment, type ModelMetrics } from "@/lib/api";

type Metric = "precision" | "recall" | "f1" | "iou";
type SortKey = "name" | "dataset" | Metric | "n";
const metrics: Metric[] = ["precision", "recall", "f1", "iou"];
const fmt = (value: number | null | undefined) => value == null ? "—" : `${(value * 100).toFixed(1)}%`;
const value = (experiment: Experiment, metric: Metric) => experiment.task === "flood_classification"
  ? experiment.models.random_forest.metrics[metric]
  : experiment.model.metrics[metric];
const testSize = (experiment: Experiment) => experiment.task === "flood_classification"
  ? experiment.models.random_forest.metrics.n
  : experiment.provenance.n_test;
const datasetName = (experiment: Experiment) => experiment.provenance.csv_name;
const modelName = (experiment: Experiment) => experiment.task === "flood_classification"
  ? `Random Forest · ${experiment.provenance.features.join(" + ")}`
  : `${experiment.model.type} · ${experiment.provenance.features.join(" + ")}`;
const autoName = (experiment: Experiment) => {
  const feature = experiment.provenance.features.slice(0, 2).map((item) => item.replace(/[^a-z0-9]/gi, "")).join("-") || "Model";
  return `${experiment.task === "flood_classification" ? "RF" : "Forecast"}-${feature}`;
};

function ExperimentDetails({ experiment }: { experiment: ClassificationExperiment }) {
  const rf = experiment.models.random_forest;
  const matrix = rf.metrics.confusion_matrix;
  const importance = Object.entries(rf.feature_importance).map(([feature, score]) => ({ feature, score })).sort((a, b) => b.score - a.score);
  return (
    <div className="grid gap-5 border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60 md:grid-cols-2">
      <div>
        <h3 className="mb-2 text-xs font-semibold">Random Forest confusion matrix</h3>
        <table className="w-full max-w-sm border-separate border-spacing-1 text-xs">
          <thead><tr><th /><th className="text-slate-500">Predicted dry</th><th className="text-slate-500">Predicted flood</th></tr></thead>
          <tbody>{[["True dry", matrix[0]?.[0], matrix[0]?.[1]], ["True flood", matrix[1]?.[0], matrix[1]?.[1]]].map((row, i) => (
            <tr key={i}><th className="pr-2 text-right font-medium text-slate-500">{row[0]}</th><td className="rounded bg-emerald-100 p-2 text-center font-semibold dark:bg-emerald-950">{row[1] ?? "—"}</td><td className="rounded bg-rose-100 p-2 text-center font-semibold dark:bg-rose-950">{row[2] ?? "—"}</td></tr>
          ))}</tbody>
        </table>
        <p className="mt-2 text-[11px] text-slate-500">Test size {rf.metrics.n} · Training regions {experiment.provenance.split.train_regions.length} · Test regions {experiment.provenance.split.test_regions.length}</p>
      </div>
      <div>
        <h3 className="mb-2 text-xs font-semibold">Feature importance</h3>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%"><BarChart data={importance} layout="vertical" margin={{ left: 8, right: 8 }}><CartesianGrid horizontal={false} strokeOpacity={0.15} /><XAxis type="number" tick={{ fontSize: 10 }} /><YAxis type="category" dataKey="feature" width={92} tick={{ fontSize: 10 }} /><Tooltip formatter={(score) => Number(score).toFixed(3)} /><Bar dataKey="score" fill="#0D9488" radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">{experiment.provenance.split.method} · {experiment.provenance.features.join(", ")}</p>
      </div>
    </div>
  );
}

export function ModelLabView() {
  const query = useQuery({ queryKey: ["experiments"], queryFn: api.modelLab.experiments, retry: 1 });
  const experiments = query.data?.experiments ?? [];
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [ascending, setAscending] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [aliases, setAliases] = useState<Record<string, string>>({});
  const [leftCompare, setLeftCompare] = useState("");
  const [rightCompare, setRightCompare] = useState("");

  const sorted = useMemo(() => [...experiments].sort((a, b) => {
    let result = 0;
    if (sortKey === "name") result = (aliases[a.id] ?? autoName(a)).localeCompare(aliases[b.id] ?? autoName(b));
    else if (sortKey === "dataset") result = datasetName(a).localeCompare(datasetName(b));
    else if (sortKey === "n") result = testSize(a) - testSize(b);
    else result = (value(a, sortKey) ?? -Infinity) - (value(b, sortKey) ?? -Infinity);
    return ascending ? result : -result;
  }), [experiments, sortKey, ascending, aliases]);

  const changeSort = (key: SortKey) => {
    if (key === sortKey) setAscending((current) => !current);
    else { setSortKey(key); setAscending(false); }
  };
  const selectedA = experiments.find((item) => item.id === leftCompare);
  const selectedB = experiments.find((item) => item.id === rightCompare);
  const selectHeader = (label: string, key: SortKey) => <button type="button" onClick={() => changeSort(key)} className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white">{label}{sortKey === key ? ascending ? <ArrowUp size={12} /> : <ArrowDown size={12} /> : null}</button>;

  return (
    <main className="flex-1 overflow-y-auto bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <div className="mx-auto max-w-7xl space-y-4 p-5 md:p-6">
        <div className="flex items-center justify-between pb-2 border-b border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500 dark:text-slate-400">Compare held-out experiments across validation splits. Select a row to inspect diagnostics.</p>
        </div>
        {query.isLoading && <p className="text-sm text-slate-500">Loading experiments…</p>}
        {query.isError && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-950 dark:bg-rose-950/40 dark:text-rose-200">Experiments could not be loaded. Check backend connectivity and retry.</p>}
        {query.data && experiments.length === 0 && <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm dark:border-slate-800 dark:bg-slate-900"><b>No trained experiments.</b> Training reports appear here after an experiment has been run.</div>}
        {experiments.length > 0 && <>
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900">
            <span className="font-semibold">Compare experiments</span>
            <select value={leftCompare} onChange={(event) => setLeftCompare(event.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-950"><option value="">Select baseline</option>{experiments.map((e) => <option key={e.id} value={e.id}>{aliases[e.id] ?? autoName(e)}</option>)}</select>
            <span className="text-slate-400">to</span>
            <select value={rightCompare} onChange={(event) => setRightCompare(event.target.value)} className="rounded-md border border-slate-300 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-950"><option value="">Select comparison</option>{experiments.map((e) => <option key={e.id} value={e.id}>{aliases[e.id] ?? autoName(e)}</option>)}</select>
            {selectedA && selectedB && selectedA.id !== selectedB.id && <div className="flex flex-wrap gap-3 border-l border-slate-200 pl-3 dark:border-slate-700">{metrics.map((metric) => { const delta = (value(selectedB, metric) ?? 0) - (value(selectedA, metric) ?? 0); return <span key={metric} className="font-medium">{metric.toUpperCase()} <b className={delta >= 0 ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}>{delta > 0 ? "+" : ""}{(delta * 100).toFixed(1)} pp</b></span>; })}<span>Test size <b>{testSize(selectedB) - testSize(selectedA) > 0 ? "+" : ""}{testSize(selectedB) - testSize(selectedA)}</b></span></div>}
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-xs">
              <thead className="bg-slate-100 text-[10px] uppercase tracking-wide dark:bg-slate-800"><tr>
                <th className="w-9 px-3 py-3" /><th className="px-3 py-3">{selectHeader("Experiment", "name")}</th><th className="px-3 py-3">{selectHeader("Dataset", "dataset")}</th><th className="px-3 py-3">Model / predictors</th>
                {metrics.map((metric) => <th key={metric} className="px-3 py-3">{selectHeader(metric.toUpperCase(), metric)}</th>)}<th className="px-3 py-3">{selectHeader("Test size", "n")}</th><th className="px-3 py-3">Data quality</th><th className="px-3 py-3">Compared</th>
              </tr></thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">{sorted.map((experiment) => {
                const warnings = experiment.warnings;
                const expanded = expandedId === experiment.id;
                return <React.Fragment key={experiment.id}>
                  <tr className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-3 py-3"><button type="button" aria-label={expanded ? "Hide experiment details" : "Show experiment details"} onClick={() => setExpandedId(expanded ? null : experiment.id)}>{expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button></td>
                    <td className="px-3 py-3"><input aria-label="Experiment name" value={aliases[experiment.id] ?? autoName(experiment)} onChange={(event) => setAliases((current) => ({ ...current, [experiment.id]: event.target.value }))} className="w-36 rounded border border-transparent bg-transparent px-1 py-1 font-semibold hover:border-slate-300 focus:border-teal-600 focus:outline-none dark:hover:border-slate-700" /><div className="mt-1 text-[10px] text-slate-500">{new Date(experiment.created_at).toLocaleString()}</div></td>
                    <td className="max-w-48 truncate px-3 py-3" title={datasetName(experiment)}>{datasetName(experiment)}</td><td className="max-w-52 truncate px-3 py-3" title={modelName(experiment)}>{modelName(experiment)}</td>
                    {metrics.map((metric) => <td key={metric} className="px-3 py-3 font-mono tabular-nums">{fmt(value(experiment, metric))}</td>)}<td className="px-3 py-3 font-mono">{testSize(experiment)}</td>
                    <td className="px-3 py-3">{warnings.length > 0 ? <span title={warnings.join("\n")} className="inline-flex cursor-help items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200"><AlertTriangle size={13} />{warnings.length} warning{warnings.length === 1 ? "" : "s"}</span> : <span className="text-emerald-700 dark:text-emerald-300">Clear</span>}</td>
                    <td className="px-3 py-3"><input type="checkbox" aria-label={`Include ${aliases[experiment.id] ?? autoName(experiment)} in comparison`} checked={leftCompare === experiment.id || rightCompare === experiment.id} onChange={(event) => { if (event.target.checked) { if (!leftCompare || leftCompare === experiment.id) setLeftCompare(experiment.id); else setRightCompare(experiment.id); } else { if (leftCompare === experiment.id) setLeftCompare(""); if (rightCompare === experiment.id) setRightCompare(""); } }} className="accent-teal-600" /></td>
                  </tr>
                  {expanded && <tr><td colSpan={11} className="p-0">{experiment.task === "flood_classification" ? <ExperimentDetails experiment={experiment} /> : <div className="border-t border-slate-200 bg-slate-50 p-4 text-xs dark:border-slate-800 dark:bg-slate-950/60">Validation split: {experiment.provenance.split.method} · Regions: {experiment.provenance.split.test_regions.join(", ") || "not specified"}<div className="mt-2">{warnings.length ? warnings.join(" · ") : "No recorded data-quality warnings."}</div></div>}</td></tr>}
                </React.Fragment>;
              })}</tbody>
            </table></div>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">Metrics are shown as percentages. Delta is comparison minus baseline, in percentage points.</p>
        </>}
      </div>
    </main>
  );
}
