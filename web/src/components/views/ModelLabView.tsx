"use client";

import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronDown, ChevronRight } from "lucide-react";
import { api, type ClassificationExperiment, type Experiment } from "@/lib/api";

type Metric = "precision" | "recall" | "f1" | "iou";
type SortKey = "name" | "dataset" | Metric | "n";
const metrics: Metric[] = ["precision", "recall", "f1", "iou"];

const value = (experiment: Experiment, metric: Metric) =>
  experiment.task === "flood_classification"
    ? experiment.models.random_forest.metrics[metric]
    : experiment.model.metrics[metric];

const testSize = (experiment: Experiment) =>
  experiment.task === "flood_classification"
    ? experiment.models.random_forest.metrics.n
    : experiment.provenance.n_test;

const datasetName = (experiment: Experiment) => experiment.provenance.csv_name;

const modelName = (experiment: Experiment) =>
  experiment.task === "flood_classification"
    ? `Random Forest · ${experiment.provenance.features.join(" + ")}`
    : `${experiment.model.type} · ${experiment.provenance.features.join(" + ")}`;

const autoName = (experiment: Experiment) => {
  const feature =
    experiment.provenance.features.slice(0, 2).map((item) => item.replace(/[^a-z0-9]/gi, "")).join("-") || "Model";
  return `${experiment.task === "flood_classification" ? "RF" : "Forecast"}-${feature}`;
};

/** Micro-chart component for metric progress bar */
function MetricCell({ value }: { value: number | null | undefined }) {
  if (value == null || Number.isNaN(value)) {
    return <span className="font-mono text-xs text-slate-300 dark:text-slate-600">—</span>;
  }
  const pct = Math.max(0, Math.min(100, value * 100));
  const formatted = `${pct.toFixed(1)}%`;
  const barColor = pct >= 80 ? "bg-teal-500" : pct >= 65 ? "bg-amber-500" : "bg-rose-500";

  return (
    <div className="flex flex-col min-w-[70px]">
      <span className="font-mono text-xs font-semibold tabular-nums text-slate-800 dark:text-slate-200">
        {formatted}
      </span>
      <div className="w-full bg-slate-100 dark:bg-slate-800 ring-1 ring-slate-200/50 dark:ring-slate-700/50 h-1.5 rounded-full mt-1 overflow-hidden">
        {pct > 0 && (
          <div
            className={`${barColor} h-1.5 rounded-full transition-all duration-300`}
            style={{ width: `${pct}%` }}
          />
        )}
      </div>
    </div>
  );
}

function ExperimentDetails({ experiment }: { experiment: ClassificationExperiment }) {
  const rf = experiment.models.random_forest;
  const matrix = rf.metrics.confusion_matrix;
  const importance = Object.entries(rf.feature_importance)
    .map(([feature, score]) => ({ feature, score }))
    .sort((a, b) => b.score - a.score);

  return (
    <div className="grid gap-5 border-t border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950/60 md:grid-cols-2">
      <div>
        <h3 className="mb-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
          Random Forest confusion matrix
        </h3>
        <table className="w-full max-w-sm border-separate border-spacing-1 text-xs">
          <thead>
            <tr>
              <th />
              <th className="text-slate-500">Predicted dry</th>
              <th className="text-slate-500">Predicted flood</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["True dry", matrix[0]?.[0], matrix[0]?.[1]],
              ["True flood", matrix[1]?.[0], matrix[1]?.[1]],
            ].map((row, i) => (
              <tr key={i}>
                <th className="pr-2 text-right font-medium text-slate-500">{row[0]}</th>
                <td className="rounded bg-emerald-100 p-2 text-center font-semibold dark:bg-emerald-950 text-slate-900 dark:text-slate-100">
                  {row[1] ?? "—"}
                </td>
                <td className="rounded bg-rose-100 p-2 text-center font-semibold dark:bg-rose-950 text-slate-900 dark:text-slate-100">
                  {row[2] ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-slate-500">
          Test size {rf.metrics.n} · Training regions {experiment.provenance.split.train_regions.length} · Test regions{" "}
          {experiment.provenance.split.test_regions.length}
        </p>
      </div>
      <div>
        <h3 className="mb-2 text-xs font-semibold text-slate-800 dark:text-slate-200">Feature importance</h3>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={importance} layout="vertical" margin={{ left: 8, right: 8 }}>
              <CartesianGrid horizontal={false} strokeOpacity={0.15} />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="feature" width={92} tick={{ fontSize: 10 }} />
              <Tooltip formatter={(score) => Number(score).toFixed(3)} />
              <Bar dataKey="score" fill="#0D9488" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 text-[11px] text-slate-500">
          {experiment.provenance.split.method} · {experiment.provenance.features.join(", ")}
        </p>
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

  const sorted = useMemo(
    () =>
      [...experiments].sort((a, b) => {
        let result = 0;
        if (sortKey === "name") result = (aliases[a.id] ?? autoName(a)).localeCompare(aliases[b.id] ?? autoName(b));
        else if (sortKey === "dataset") result = datasetName(a).localeCompare(datasetName(b));
        else if (sortKey === "n") result = testSize(a) - testSize(b);
        else result = (value(a, sortKey) ?? -Infinity) - (value(b, sortKey) ?? -Infinity);
        return ascending ? result : -result;
      }),
    [experiments, sortKey, ascending, aliases],
  );

  const changeSort = (key: SortKey) => {
    if (key === sortKey) setAscending((current) => !current);
    else {
      setSortKey(key);
      setAscending(false);
    }
  };

  const selectedA = experiments.find((item) => item.id === leftCompare);
  const selectedB = experiments.find((item) => item.id === rightCompare);

  const selectHeader = (label: string, key: SortKey) => (
    <button
      type="button"
      onClick={() => changeSort(key)}
      className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-slate-950 dark:text-slate-300 dark:hover:text-white transition-colors"
    >
      {label}
      {sortKey === key ? (
        ascending ? (
          <ArrowUp size={12} className="text-teal-600 dark:text-teal-400" />
        ) : (
          <ArrowDown size={12} className="text-teal-600 dark:text-teal-400" />
        )
      ) : null}
    </button>
  );

  return (
    <main className="flex-1 w-full h-[calc(100vh-4rem)] overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <div className="h-[calc(100vh-5rem)] flex flex-col max-w-7xl mx-auto px-4 pb-4 overflow-hidden gap-3 pt-3">
        
        {/* Top Info Header */}
        <div className="flex items-center justify-between pb-2 border-b border-slate-200/80 dark:border-slate-800 shrink-0">
          <div>
            <h1 className="text-sm font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              Model Lab Diagnostics
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Compare held-out experiments across validation splits. Select a row to inspect diagnostics.
            </p>
          </div>
        </div>

        {query.isLoading && <p className="text-sm text-slate-500">Loading experiments…</p>}
        {query.isError && (
          <p
            role="alert"
            className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-950 dark:bg-rose-950/40 dark:text-rose-200"
          >
            Experiments could not be loaded. Check backend connectivity and retry.
          </p>
        )}
        {query.data && experiments.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-sm dark:border-slate-800 dark:bg-slate-900">
            <b>No trained experiments.</b> Training reports appear here after an experiment has been run.
          </div>
        )}

        {experiments.length > 0 && (
          <>
            {/* Unified Diagnostics Interface: Consolidated Card */}
            <div className="flex-1 min-h-0 flex flex-col overflow-hidden rounded-xl border-0 bg-white dark:bg-slate-900 shadow-md shadow-slate-200/50 dark:shadow-slate-950/50">
              
              {/* Card Controls Header: Compare experiments */}
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800/80 px-4 py-3 text-xs shrink-0 bg-white dark:bg-slate-900 z-20">
                <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                  <span className="font-semibold text-slate-800 dark:text-slate-100">Compare experiments</span>
                  <select
                    value={leftCompare}
                    onChange={(event) => setLeftCompare(event.target.value)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 text-xs outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                  >
                    <option value="">Select baseline</option>
                    {experiments.map((e) => (
                      <option key={e.id} value={e.id}>
                        {aliases[e.id] ?? autoName(e)}
                      </option>
                    ))}
                  </select>
                  <span className="text-slate-400 font-medium">to</span>
                  <select
                    value={rightCompare}
                    onChange={(event) => setRightCompare(event.target.value)}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-slate-800 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 text-xs outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
                  >
                    <option value="">Select comparison</option>
                    {experiments.map((e) => (
                      <option key={e.id} value={e.id}>
                        {aliases[e.id] ?? autoName(e)}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedA && selectedB && selectedA.id !== selectedB.id && (
                  <div className="flex flex-wrap items-center gap-3 border-l border-slate-200 pl-3 dark:border-slate-700">
                    {metrics.map((metric) => {
                      const delta = (value(selectedB, metric) ?? 0) - (value(selectedA, metric) ?? 0);
                      return (
                        <span key={metric} className="font-medium text-slate-700 dark:text-slate-300">
                          {metric.toUpperCase()}{" "}
                          <b
                            className={
                              delta >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
                            }
                          >
                            {delta > 0 ? "+" : ""}
                            {(delta * 100).toFixed(1)} pp
                          </b>
                        </span>
                      );
                    })}
                    <span className="text-slate-700 dark:text-slate-300">
                      Test size{" "}
                      <b>
                        {testSize(selectedB) - testSize(selectedA) > 0 ? "+" : ""}
                        {testSize(selectedB) - testSize(selectedA)}
                      </b>
                    </span>
                  </div>
                )}
              </div>

              {/* Scrollable Table Container */}
              <div className="flex-1 min-h-0 overflow-y-auto overflow-x-auto">
                <table className="w-full min-w-[980px] border-separate border-spacing-0 text-left text-xs">
                  {/* Sticky Header */}
                  <thead className="sticky top-0 z-10 bg-white dark:bg-slate-900 text-[10px] uppercase tracking-wider shadow-sm">
                    <tr>
                      <th className="w-8 px-2 py-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800" />
                      <th className="px-3 py-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 min-w-[125px]">{selectHeader("Experiment", "name")}</th>
                      <th className="px-3 py-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 min-w-[170px] max-w-[210px]">{selectHeader("Dataset", "dataset")}</th>
                      <th className="px-3 py-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 min-w-[190px] max-w-[250px] font-semibold text-slate-600 dark:text-slate-300">
                        Model / predictors
                      </th>
                      {metrics.map((metric) => (
                        <th key={metric} className="px-2.5 py-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 min-w-[76px]">
                          {selectHeader(metric.toUpperCase(), metric)}
                        </th>
                      ))}
                      <th className="px-2.5 py-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 min-w-[65px]">{selectHeader("Test size", "n")}</th>
                      <th className="px-3 py-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 min-w-[95px] font-semibold text-slate-600 dark:text-slate-300">
                        Data quality
                      </th>
                      <th className="px-2.5 py-3 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800 min-w-[65px] text-center font-semibold text-slate-600 dark:text-slate-300">
                        Compared
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80">
                    {sorted.map((experiment) => {
                      const warnings = experiment.warnings;
                      const expanded = expandedId === experiment.id;
                      return (
                        <React.Fragment key={experiment.id}>
                          <tr
                            onClick={() => setExpandedId(expanded ? null : experiment.id)}
                            className="hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer group"
                          >
                            <td className="w-8 px-2 py-3.5 align-middle text-center">
                              <button
                                type="button"
                                aria-label={expanded ? "Hide experiment details" : "Show experiment details"}
                                className="text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-200 transition-colors"
                              >
                                {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                              </button>
                            </td>
                            <td className="px-3 py-3.5 align-middle" onClick={(e) => e.stopPropagation()}>
                              <input
                                aria-label="Experiment name"
                                value={aliases[experiment.id] ?? autoName(experiment)}
                                onChange={(event) =>
                                  setAliases((current) => ({ ...current, [experiment.id]: event.target.value }))
                                }
                                className="w-32 rounded border border-transparent bg-transparent px-1 py-0.5 font-semibold text-slate-900 dark:text-slate-100 hover:border-slate-300 focus:border-teal-600 focus:outline-none dark:hover:border-slate-700"
                              />
                              <div className="mt-0.5 text-[10px] text-slate-400">
                                {new Date(experiment.created_at).toLocaleString()}
                              </div>
                            </td>
                            <td
                              className="px-3 py-3.5 align-middle text-slate-700 dark:text-slate-300 font-mono text-[11px] min-w-[170px] max-w-[210px] break-all leading-relaxed"
                              title={datasetName(experiment)}
                            >
                              {datasetName(experiment)}
                            </td>
                            <td
                              className="px-3 py-3.5 align-middle text-slate-600 dark:text-slate-300 text-[11px] min-w-[190px] max-w-[250px] break-words leading-relaxed"
                              title={modelName(experiment)}
                            >
                              {modelName(experiment)}
                            </td>
                            {metrics.map((metric) => (
                              <td key={metric} className="px-2.5 py-3.5 align-middle">
                                <MetricCell value={value(experiment, metric)} />
                              </td>
                            ))}
                            <td className="px-2.5 py-3.5 align-middle font-mono text-xs text-slate-700 dark:text-slate-300">
                              {testSize(experiment)}
                            </td>
                            <td className="px-3 py-3.5 align-middle">
                              {warnings.length > 0 ? (
                                <span
                                  title={warnings.join("\n")}
                                  className="inline-flex cursor-help items-center gap-1.5 rounded-full bg-amber-50 text-amber-700 font-semibold px-2 py-0.5 text-xs dark:bg-amber-950/50 dark:text-amber-300"
                                >
                                  <AlertTriangle size={12} className="shrink-0" />
                                  {warnings.length} warning{warnings.length === 1 ? "" : "s"}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium text-xs">
                                  Clear
                                </span>
                              )}
                            </td>
                            <td className="px-2.5 py-3.5 align-middle text-center" onClick={(e) => e.stopPropagation()}>
                              <input
                                type="checkbox"
                                aria-label={`Include ${aliases[experiment.id] ?? autoName(experiment)} in comparison`}
                                checked={leftCompare === experiment.id || rightCompare === experiment.id}
                                onChange={(event) => {
                                  if (event.target.checked) {
                                    if (!leftCompare || leftCompare === experiment.id) setLeftCompare(experiment.id);
                                    else setRightCompare(experiment.id);
                                  } else {
                                    if (leftCompare === experiment.id) setLeftCompare("");
                                    if (rightCompare === experiment.id) setRightCompare("");
                                  }
                                }}
                                className="h-4 w-4 rounded accent-teal-600 cursor-pointer"
                              />
                            </td>
                          </tr>
                          {expanded && (
                            <tr>
                              <td colSpan={11} className="p-0">
                                {experiment.task === "flood_classification" ? (
                                  <ExperimentDetails experiment={experiment} />
                                ) : (
                                  <div className="border-t border-slate-200 bg-slate-50 p-4 text-xs dark:border-slate-800 dark:bg-slate-950/60">
                                    Validation split: {experiment.provenance.split.method} · Regions:{" "}
                                    {experiment.provenance.split.test_regions.join(", ") || "not specified"}
                                    <div className="mt-2">
                                      {warnings.length ? warnings.join(" · ") : "No recorded data-quality warnings."}
                                    </div>
                                  </div>
                                )}
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bottom helper text: Padded to ensure 100% clearance from the floating assistant button */}
            <p className="text-[11px] text-slate-500 dark:text-slate-400 pb-16 sm:pb-20 pr-48 shrink-0">
              Metrics are shown as percentages. Delta is comparison minus baseline, in percentage points.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
