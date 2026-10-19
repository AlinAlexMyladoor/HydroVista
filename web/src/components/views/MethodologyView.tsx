"use client";

import React, { useState } from "react";
import {
  Satellite, CloudRain, Gauge, Map, Database, Cpu, ChevronRight,
  Info, CheckCircle2, AlertTriangle, Layers, FlaskConical, Globe,
  Waves, Building2, TreePine,
} from "lucide-react";

/* ─── Types ─────────────────────────────────────────────────────────────── */
interface PipelineNode {
  id: string;
  label: string;
  sublabel?: string;
  icon: React.ElementType;
  color: string;
  tooltip: string;
}

interface DataSource {
  icon: React.ElementType;
  name: string;
  provider: string;
  powers: string;
  color: string;
  status: "live" | "on-demand" | "cached";
}

/* ─── Data ───────────────────────────────────────────────────────────────── */
const PIPELINE: PipelineNode[] = [
  {
    id: "sar",
    label: "Sentinel-1 SAR",
    sublabel: "GRD · IW · VV",
    icon: Satellite,
    color: "#6366f1",
    tooltip:
      "Copernicus Sentinel-1 C-band synthetic aperture radar (GRD, IW mode, VV polarisation). One orbit direction (default descending) from Google Earth Engine COPERNICUS/S1_GRD. Median composites for pre-event and event windows; scene counts and acquisition dates are reported. Zero scenes fails the run — nothing is substituted.",
  },
  {
    id: "classify",
    label: "Water Classification",
    sublabel: "Threshold −16 dB",
    icon: Layers,
    color: "#0ea5e9",
    tooltip:
      "Candidate water pixels: event VV backscatter below a dB threshold (exploratory default −16 dB). This threshold is exploratory and must be tuned and validated per area and season. Smooth surfaces such as tarmac and wet sand can produce false positives.",
  },
  {
    id: "permanent",
    label: "Permanent Water Exclusion",
    sublabel: "JRC GSW ≥ 90 %",
    icon: Waves,
    color: "#14b8a6",
    tooltip:
      "JRC Global Surface Water occurrence mask: pixels with water occurrence ≥ chosen % (default 90 %) are excluded as permanent water so they are not counted as new flood pixels.",
  },
  {
    id: "terrain",
    label: "Terrain Mask",
    sublabel: "SRTM slope > 5°",
    icon: TreePine,
    color: "#22c55e",
    tooltip:
      "SRTM-derived slope mask removes pixels above a slope limit (default 5°), reducing radar-shadow false positives on hillsides. Urban double-bounce and vegetation canopy remain known error sources.",
  },
  {
    id: "extent",
    label: "Flood Extent",
    sublabel: "Candidate pixels",
    icon: Map,
    color: "#f59e0b",
    tooltip:
      "Final candidate inundation map: pixels that pass water classification, permanent-water exclusion, and terrain masking. Area is summed using ee.Image.pixelArea() at the chosen processing scale. This is a candidate output — not independently validated flood extent.",
  },
  {
    id: "risk",
    label: "Asset Risk Score",
    sublabel: "Heuristic ranking",
    icon: Building2,
    color: "#ef4444",
    tooltip:
      "Heuristic asset risk score derived from elevation proxy (Terrarium/Copernicus DEM tiles) and NWP rainfall intensity. It is a relative ranking, not a calibrated flood probability or flood depth estimate. Population exposure uses WorldPop raster data via Google Earth Engine.",
  },
];

const DATA_SOURCES: DataSource[] = [
  {
    icon: Satellite,
    name: "Sentinel-1 & Sentinel-2",
    provider: "Copernicus / GEE",
    powers: "SAR flood mapping · optical imagery layer",
    color: "#6366f1",
    status: "on-demand",
  },
  {
    icon: CloudRain,
    name: "Open-Meteo NWP",
    provider: "Open-Meteo",
    powers: "Rainfall forecast · historical archive · GloFAS discharge",
    color: "#0ea5e9",
    status: "live",
  },
  {
    icon: Gauge,
    name: "CWC Arangaly Gauge",
    provider: "NWIC · CWC",
    powers: "River stage telemetry · stage-forecast model input",
    color: "#14b8a6",
    status: "cached",
  },
  {
    icon: Map,
    name: "OpenStreetMap / Overpass",
    provider: "OSM contributors",
    powers: "Infrastructure assets · road network",
    color: "#22c55e",
    status: "live",
  },
  {
    icon: Globe,
    name: "Terrarium / Copernicus DEM",
    provider: "Mapzen · AWS Open Data",
    powers: "Elevation sampling · terrain cross-section · slope mask",
    color: "#f59e0b",
    status: "live",
  },
  {
    icon: Database,
    name: "WorldPop Population Raster",
    provider: "WorldPop / GEE",
    powers: "Exposed population estimation",
    color: "#8b5cf6",
    status: "on-demand",
  },
];

const ML_METRICS = [
  { label: "Precision", value: 0.84, color: "#0ea5e9" },
  { label: "Recall", value: 0.78, color: "#14b8a6" },
  { label: "F1 Score", value: 0.81, color: "#6366f1" },
];

const STATUS_COLORS: Record<string, string> = {
  live: "#22c55e",
  "on-demand": "#f59e0b",
  cached: "#6366f1",
};

/* ─── Sub-components ─────────────────────────────────────────────────────── */

/** Circular gauge for ML metrics */
function CircleGauge({ label, value, color }: { label: string; value: number; color: string }) {
  const r = 30;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - value);
  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={80} height={80} viewBox="0 0 80 80" className="rotate-[-90deg]">
        <circle cx={40} cy={40} r={r} fill="none" stroke="#1e2d3d" strokeWidth={7} />
        <circle
          cx={40} cy={40} r={r}
          fill="none"
          stroke={color}
          strokeWidth={7}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
      </svg>
      <div className="text-center -mt-1">
        <div className="text-base font-bold" style={{ color }}>{(value * 100).toFixed(0)}%</div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400">{label}</div>
      </div>
    </div>
  );
}

/** Pipeline node with tooltip */
function PNode({ node, isLast }: { node: PipelineNode; isLast: boolean }) {
  const [tip, setTip] = useState(false);
  const Icon = node.icon;
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex flex-col items-center">
        {/* Card */}
        <div
          className="relative flex flex-col items-center gap-1 rounded-xl border px-3 py-3 text-center cursor-default shadow-sm transition-transform hover:-translate-y-0.5"
          style={{ borderColor: `${node.color}44`, background: `${node.color}12`, minWidth: 110 }}
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ background: `${node.color}22` }}>
            <Icon size={16} style={{ color: node.color }} />
          </div>
          <span className="text-[11px] font-semibold leading-tight text-slate-800 dark:text-slate-100">{node.label}</span>
          {node.sublabel && <span className="text-[9px] text-slate-500 dark:text-slate-400">{node.sublabel}</span>}
          {/* Info icon */}
          <button
            type="button"
            aria-label={`Info: ${node.label}`}
            className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-white border border-slate-200 shadow-sm hover:bg-slate-50 dark:bg-slate-800 dark:border-slate-700"
            onMouseEnter={() => setTip(true)}
            onMouseLeave={() => setTip(false)}
            onFocus={() => setTip(true)}
            onBlur={() => setTip(false)}
          >
            <Info size={10} className="text-slate-500" />
          </button>
          {/* Tooltip */}
          {tip && (
            <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-2 w-64 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-left text-[11px] leading-relaxed text-white shadow-xl">
              {node.tooltip}
              <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-slate-900" />
            </div>
          )}
        </div>
      </div>
      {!isLast && (
        <ChevronRight size={16} className="shrink-0 text-slate-400 dark:text-slate-500" />
      )}
    </div>
  );
}

/* ─── Main View ──────────────────────────────────────────────────────────── */
export function MethodologyView() {
  return (
    <div className="flex-1 overflow-y-auto bg-background text-text">
      <div className="max-w-5xl mx-auto p-6 space-y-8">

        {/* ── Profile Banner ─────────────────────────────────────────── */}
        <section
          className="relative overflow-hidden rounded-2xl border border-border p-6"
          style={{
            background: "linear-gradient(135deg, #0f8c8622 0%, #0ea5e920 50%, #6366f118 100%)",
          }}
        >
          {/* Decorative circles */}
          <div className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full opacity-10"
            style={{ background: "radial-gradient(circle, #0ea5e9 0%, transparent 70%)" }} />
          <div className="pointer-events-none absolute -bottom-8 -left-8 h-32 w-32 rounded-full opacity-10"
            style={{ background: "radial-gradient(circle, #6366f1 0%, transparent 70%)" }} />

          <div className="relative flex flex-wrap items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-teal-500/20">
                  <Waves size={15} className="text-teal-500" />
                </span>
                <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                  System Overview
                </h1>
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-400 max-w-lg">
                HydroVista · Chalakudy River Basin Intelligence Platform · Kerala, India
              </p>
            </div>

            {/* Stat chips */}
            <div className="flex flex-wrap gap-3">
              {[
                { label: "Catchment", value: "1,704 km²" },
                { label: "Key Reservoirs", value: "Sholayar · Poringalkuthu" },
                { label: "Platform", value: "Basin Intelligence" },
              ].map((s) => (
                <div key={s.label} className="rounded-xl border border-border bg-white/70 dark:bg-slate-900/70 px-4 py-2 backdrop-blur-sm">
                  <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400">{s.label}</div>
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-100">{s.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Elevation cross-section graphic */}
          <div className="mt-5 rounded-xl border border-border/60 bg-white/50 dark:bg-slate-900/50 p-3 overflow-x-auto backdrop-blur-sm">
            <p className="text-[10px] font-medium text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">Basin Elevation Profile — Western Ghats → Arabian Sea</p>
            <svg viewBox="0 0 520 70" className="w-full h-14" preserveAspectRatio="none">
              <defs>
                <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.1} />
                </linearGradient>
              </defs>
              {/* Mountain profile path */}
              <path
                d="M0,65 L30,60 L70,30 L110,10 L140,20 L170,35 L200,15 L230,25 L260,38 L295,48 L330,42 L370,55 L410,58 L450,63 L490,64 L520,65 Z"
                fill="url(#elevGrad)"
                stroke="#6366f1"
                strokeWidth={1.5}
                strokeOpacity={0.6}
              />
              {/* Reservoir markers */}
              {[110, 200].map((x) => (
                <g key={x}>
                  <circle cx={x} cy={x === 110 ? 10 : 15} r={4} fill="#0ea5e9" opacity={0.9} />
                  <line x1={x} y1={x === 110 ? 14 : 19} x2={x} y2={65} stroke="#0ea5e9" strokeDasharray="3,2" strokeOpacity={0.5} strokeWidth={1} />
                </g>
              ))}
              <text x={105} y={8} fontSize={7} fill="#94a3b8" textAnchor="middle">Sholayar</text>
              <text x={200} y={13} fontSize={7} fill="#94a3b8" textAnchor="middle">Poringalkuthu</text>
              {/* Labels */}
              <text x={5} y={61} fontSize={7} fill="#94a3b8">Ghats</text>
              <text x={495} y={62} fontSize={7} fill="#94a3b8" textAnchor="end">Sea</text>
              <text x={260} y={45} fontSize={7} fill="#94a3b8" textAnchor="middle">Chalakudy R.</text>
            </svg>
          </div>
        </section>

        {/* ── Data Architecture Grid ─────────────────────────────────── */}
        <section>
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2">
            <Database size={15} className="text-teal-600 dark:text-teal-400" />
            Data Architecture
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3">
            {DATA_SOURCES.map((src) => {
              const Icon = src.icon;
              const statusColor = STATUS_COLORS[src.status];
              return (
                <div
                  key={src.name}
                  className="group rounded-xl border border-border bg-white dark:bg-slate-900 p-4 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg" style={{ background: `${src.color}18` }}>
                      <Icon size={17} style={{ color: src.color }} />
                    </div>
                    <span
                      className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                      style={{ background: `${statusColor}18`, color: statusColor }}
                    >
                      {src.status}
                    </span>
                  </div>
                  <div className="text-[12px] font-semibold text-slate-800 dark:text-slate-100 leading-tight mb-0.5">{src.name}</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 mb-1.5">{src.provider}</div>
                  <div className="text-[10px] text-slate-600 dark:text-slate-300 leading-relaxed">{src.powers}</div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Pipeline Flowchart ─────────────────────────────────────── */}
        <section>
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-1 flex items-center gap-2">
            <Cpu size={15} className="text-indigo-600 dark:text-indigo-400" />
            Flood-Mapping Pipeline
            <span className="ml-1 text-[10px] font-normal text-slate-500">(hover <Info size={10} className="inline" /> for technical definitions)</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
            Sentinel-1 Analysis View · Source: Google Earth Engine COPERNICUS/S1_GRD
          </p>

          {/* Scrollable horizontal pipeline */}
          <div className="overflow-x-auto rounded-xl border border-border bg-white/60 dark:bg-slate-900/60 p-4 backdrop-blur-sm">
            <div className="flex items-center gap-2 min-w-max">
              {PIPELINE.map((node, i) => (
                <PNode key={node.id} node={node} isLast={i === PIPELINE.length - 1} />
              ))}
            </div>
          </div>

          {/* Known errors */}
          <details className="mt-3 rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/30 p-3">
            <summary className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300 select-none">
              <AlertTriangle size={13} />
              Known sources of error
            </summary>
            <p className="mt-2 text-[11px] text-amber-700 dark:text-amber-400 leading-relaxed">
              Radar shadow and layover in hilly terrain · smooth surfaces (tarmac, sand) that look like water · urban double-bounce hiding flooded streets · wind-roughened open water missed · wet soil · flooding beneath dense vegetation missed · median composites mixing dates · threshold sensitivity · coarse processing scale.
            </p>
          </details>
        </section>

        {/* ── ML Performance Gauges ──────────────────────────────────── */}
        <section>
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3 flex items-center gap-2">
            <FlaskConical size={15} className="text-purple-600 dark:text-purple-400" />
            Machine Learning · Random Forest Model Lab
          </h2>

          <div className="rounded-xl border border-border bg-white dark:bg-slate-900 p-5">
            <div className="flex flex-wrap items-center gap-8">
              {/* Gauges */}
              <div className="flex gap-6">
                {ML_METRICS.map((m) => (
                  <CircleGauge key={m.label} label={m.label} value={m.value} color={m.color} />
                ))}
              </div>

              {/* Explanation */}
              <div className="flex-1 min-w-[220px] space-y-2 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                <div className="flex items-start gap-2">
                  <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-teal-500" />
                  <span>Trained from a labelled table split by <code className="rounded bg-slate-100 dark:bg-slate-800 px-1">region_id</code> so train and test regions are disjoint.</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 size={13} className="mt-0.5 shrink-0 text-teal-500" />
                  <span>Compared with the threshold baseline on identical test rows (precision, recall, F1, IoU, confusion matrix, per-region F1).</span>
                </div>
                <div className="flex items-start gap-2">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-500" />
                  <span>Probabilities are <strong>uncalibrated</strong>. No pre-trained model is shipped — the Model Lab is empty until you supply labelled data.</span>
                </div>
                <p className="pt-1 text-[10px] text-slate-400 dark:text-slate-500 italic">
                  Indicative metrics shown. Run <code className="rounded bg-slate-100 dark:bg-slate-800 px-1">python -m app.analysis.ml_lab train --csv data/labeled_flood_features.csv</code> from <code className="rounded bg-slate-100 dark:bg-slate-800 px-1">backend/</code> to generate real scores.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Other Data Notes ───────────────────────────────────────── */}
        <section>
          <h2 className="text-sm font-bold text-slate-800 dark:text-slate-100 mb-3">
            Product Definitions &amp; Limitations
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              { term: "Candidate Inundation", def: "Pixels the threshold algorithm classes as water after exclusions. Not independently validated." },
              { term: "Heuristic Asset Risk Score", def: "Relative ranking from elevation proxy and NWP rainfall. Not a probability or flood depth." },
              { term: "River Stage Outlook", def: "48-hour XGBoost model for the CWC Arangaly gauge. Model guidance — not an official hydraulic forecast." },
              { term: "Asset Elevation", def: "Sampled from Mapzen Terrarium tiles, falling back to Open-Meteo Copernicus GLO-90 API. Elevation ≠ flood depth." },
              { term: "River Discharge", def: "Open-Meteo GloFAS daily model at a nearby 5 km grid cell. Not a gauge reading; not interchangeable with water level." },
              { term: "Population Exposure", def: "Estimate from WorldPop raster. Asset risk is a relative heuristic, not a validated flood probability." },
            ].map((item) => (
              <div key={item.term} className="rounded-xl border border-border bg-white dark:bg-slate-900 px-4 py-3">
                <div className="text-[11px] font-semibold text-slate-800 dark:text-slate-100 mb-0.5">{item.term}</div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">{item.def}</div>
              </div>
            ))}
          </div>
        </section>

        {/* ── Reproducibility ────────────────────────────────────────── */}
        <section className="rounded-xl border border-border bg-white/60 dark:bg-slate-900/60 px-5 py-4 backdrop-blur-sm">
          <h2 className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1 flex items-center gap-1.5">
            <CheckCircle2 size={13} className="text-teal-500" />
            Reproducibility
          </h2>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            Each analysis run stores its parameters, scene counts, dates, dataset IDs, processing scale, compute time, and attempts. Identical parameters reuse a stored result for 24 hours (flagged in the UI). CSV export is available per run.
          </p>
          <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
            HydroVista is a research prototype. It is <strong>NOT</strong> an officially validated flood-warning service.
          </p>
        </section>

      </div>
    </div>
  );
}
