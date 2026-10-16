"use client";

import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from "recharts";
import { api, ClassificationExperiment, Experiment, ForecastExperiment, ModelMetrics } from "@/lib/api";

const f = (v: number | null | undefined) => (v == null ? "undefined" : v.toFixed(3));

function Confusion({ title, m }: { title: string; m: ModelMetrics }) {
  const [[tn, fp], [fn, tp]] = m.confusion_matrix;
  const cell = (v: number, good: boolean) => (
    <td style={{ textAlign: "center", padding: 8, background: good ? "#E7F6EC" : "#FDECEC", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{v}</td>
  );
  return (
    <div>
      <div style={{ fontWeight: 600, fontSize: "0.75rem", marginBottom: 4 }}>{title}</div>
      <table style={{ fontSize: "0.75rem", borderCollapse: "separate", borderSpacing: 2 }}>
        <thead><tr><th /><th style={{ fontWeight: 500, color: "#687770" }}>pred. dry</th><th style={{ fontWeight: 500, color: "#687770" }}>pred. flood</th></tr></thead>
        <tbody>
          <tr><th style={{ fontWeight: 500, color: "#687770", textAlign: "right", paddingRight: 6 }}>true dry</th>{cell(tn, true)}{cell(fp, false)}</tr>
          <tr><th style={{ fontWeight: 500, color: "#687770", textAlign: "right", paddingRight: 6 }}>true flood</th>{cell(fn, false)}{cell(tp, true)}</tr>
        </tbody>
      </table>
    </div>
  );
}

function ExperimentCard({ e }: { e: ClassificationExperiment }) {
  const rf = e.models.random_forest, bl = e.models.threshold_baseline;
  const cmp = (["precision", "recall", "f1", "iou"] as const).map((k) => ({ metric: k.toUpperCase(), "Random Forest": rf.metrics[k] ?? 0, [`Threshold (${bl.threshold_db} dB)`]: bl.metrics[k] ?? 0 }));
  const imp = Object.entries(rf.feature_importance).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  const p = e.provenance;
  return (
    <div className="rounded-lg p-4 flex flex-col gap-4" style={{ background: "#fff", border: "1px solid #DCE4DD" }}>
      <div className="flex justify-between flex-wrap gap-2">
        <div style={{ fontWeight: 700 }}>Experiment {e.id}</div>
        <div style={{ fontSize: "0.6875rem", color: "#687770" }}>{p.csv_name} · {p.n_rows} rows · test n={rf.metrics.n}</div>
      </div>
      {e.warnings.length > 0 && <ul style={{ fontSize: "0.6875rem", color: "#92400e", paddingLeft: 16, listStyle: "disc" }}>{e.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
      <div className="grid gap-6" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: "0.75rem" }}>Model comparison (same held-out regions)</div>
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={cmp}><CartesianGrid vertical={false} stroke="#EEF2EF" /><XAxis dataKey="metric" tick={{ fontSize: 11 }} /><YAxis domain={[0, 1]} tick={{ fontSize: 11 }} /><Tooltip formatter={(v) => Number(v).toFixed(3)} /><Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Random Forest" fill="#2563EB" /><Bar dataKey={`Threshold (${bl.threshold_db} dB)`} fill="#F97316" /></BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ fontSize: "0.625rem", color: "#687770" }}>Undefined metrics (no positives predicted/present) are drawn as 0 here; exact values: RF F1 {f(rf.metrics.f1)}, baseline F1 {f(bl.metrics.f1)}, RF IoU {f(rf.metrics.iou)}, baseline IoU {f(bl.metrics.iou)}.</div>
        </div>
        <div className="flex gap-6 flex-wrap items-start"><Confusion title="Random Forest" m={rf.metrics} /><Confusion title="Threshold baseline" m={bl.metrics} /></div>
        <div>
          <div style={{ fontWeight: 600, fontSize: "0.75rem" }}>Feature importance (Random Forest, impurity-based)</div>
          <div style={{ height: 180 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={imp} layout="vertical"><XAxis type="number" tick={{ fontSize: 11 }} /><YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} /><Tooltip formatter={(v) => Number(v).toFixed(3)} /><Bar dataKey="value" fill="#16A34A" /></BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div style={{ fontSize: "0.6875rem", color: "#26332F" }}>
        <b>Provenance:</b> split {p.split.method}, seed {p.split.seed}, test fraction {p.split.test_size}; train regions {p.split.train_regions.length}, test regions {p.split.test_regions.length} ({p.split.test_regions.join(", ")}). Positive fraction train {p.class_balance.train_positive_fraction.toFixed(2)} / test {p.class_balance.test_positive_fraction.toFixed(2)}. Features: {p.features.join(", ")}. scikit-learn {p.versions["scikit-learn"]}. CSV sha256 {p.csv_sha256.slice(0, 16)}…
      </div>
    </div>
  );
}

function ForecastExperimentCard({ e }: { e: ForecastExperiment }) {
  const metrics = e.model.metrics;
  const p = e.provenance;
  return (
    <div className="rounded-lg p-4 flex flex-col gap-3" style={{ background: "#fff", border: "1px solid #DCE4DD" }}>
      <div className="flex justify-between flex-wrap gap-2">
        <div style={{ fontWeight: 700 }}>Future Flood Susceptibility · {e.model.type}</div>
        <div style={{ fontSize: "0.6875rem", color: "#687770" }}>{p.csv_name} · test n={p.n_test}</div>
      </div>
      <div className="grid grid-cols-4 gap-2">
        {(["precision", "recall", "f1", "iou"] as const).map((key) => (
          <div key={key} className="rounded p-2" style={{ background: "#F1F5F9" }}>
            <div style={{ fontSize: "0.5625rem", color: "#687770", textTransform: "uppercase" }}>{key}</div>
            <div style={{ fontSize: "1rem", fontWeight: 700 }}>{f(metrics[key])}</div>
          </div>
        ))}
      </div>
      <div style={{ fontSize: "0.6875rem", color: "#26332F" }}>
        <b>Predictors:</b> {p.features.join(", ")} · grouped test regions {p.split.test_regions.join(", ")}
      </div>
      {e.warnings.length > 0 && <div style={{ fontSize: "0.6875rem", color: "#92400e" }}>{e.warnings.join(" ")}</div>}
    </div>
  );
}

export function ModelLabView() {
  const q = useQuery({ queryKey: ["experiments"], queryFn: api.modelLab.experiments, retry: 1 });
  const [showAll, setShowAll] = useState(false);
  const list = q.data?.experiments ?? [];
  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "#F7F8F4", color: "#26332F" }}>
      <div className="max-w-5xl mx-auto p-6 flex flex-col gap-4">
        <div>
          <h1 style={{ fontSize: "1.125rem", fontWeight: 700 }}>Model Lab</h1>
          <p style={{ fontSize: "0.6875rem", color: "#687770" }}>Random Forest versus a radar-threshold baseline, evaluated on spatially separated regions. Everything shown is read from saved experiment files.</p>
        </div>
        {q.isLoading && <div style={{ fontSize: "0.75rem", color: "#687770" }}>Loading…</div>}
        {q.isError && <div role="alert" style={{ fontSize: "0.75rem", color: "#991b1b" }}>Backend unreachable: experiments could not be loaded.</div>}
        {q.data && list.length === 0 && (
          <div className="rounded-lg p-5" style={{ background: "#fff", border: "1px dashed #CBD5E1", fontSize: "0.8125rem" }}>
            <b>No experiments yet.</b> No model has been trained, so no accuracy figures exist or are shown.
            <div style={{ marginTop: 8, color: "#687770", fontSize: "0.75rem" }}>
              To produce one you need a labelled feature table (columns <code>label, region_id, vv</code> plus optional <code>vh, elevation, slope, vv_change</code>) built from an independent flood reference, then:
              <pre style={{ background: "#F1F5F9", padding: 8, borderRadius: 6, marginTop: 6, overflowX: "auto" }}>cd backend{"\n"}python -m app.analysis.ml_lab train --csv data/labeled_flood_features.csv</pre>
            </div>
          </div>
        )}
        {(showAll ? list : list.slice(0, 1)).map((e) => (
          e.task === "future_flood_susceptibility"
            ? <ForecastExperimentCard key={e.id} e={e} />
            : <ExperimentCard key={e.id} e={e} />
        ))}
        {list.length > 1 && <button onClick={() => setShowAll((s) => !s)} style={{ alignSelf: "flex-start", fontSize: "0.75rem", color: "#2563EB", background: "none", border: "none", cursor: "pointer" }}>{showAll ? "Show latest only" : `Show all ${list.length} experiments`}</button>}
      </div>
    </div>
  );
}
