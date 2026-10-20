"use client";

import React, { useState } from "react";
import {
  Satellite, CloudRain, Gauge, Map, Database, Cpu, ChevronRight, ChevronDown,
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
    label: "Sentinel-1",
    sublabel: "SAR VV",
    icon: Satellite,
    color: "#6366f1",
    tooltip:
      "Copernicus Sentinel-1 C-band synthetic aperture radar (GRD, IW mode, VV polarisation). One orbit direction (default descending) from Google Earth Engine COPERNICUS/S1_GRD. Median composites for pre-event and event windows; scene counts and acquisition dates are reported. Zero scenes fails the run — nothing is substituted.",
  },
  {
    id: "classify",
    label: "Water Class",
    sublabel: "−16 dB",
    icon: Layers,
    color: "#0ea5e9",
    tooltip:
      "Candidate water pixels: event VV backscatter below a dB threshold (exploratory default −16 dB). This threshold is exploratory and must be tuned and validated per area and season. Smooth surfaces such as tarmac and wet sand can produce false positives.",
  },
  {
    id: "permanent",
    label: "Perm. Water",
    sublabel: "JRC ≥ 90%",
    icon: Waves,
    color: "#14b8a6",
    tooltip:
      "JRC Global Surface Water occurrence mask: pixels with water occurrence ≥ chosen % (default 90 %) are excluded as permanent water so they are not counted as new flood pixels.",
  },
  {
    id: "terrain",
    label: "Slope Mask",
    sublabel: "SRTM > 5°",
    icon: TreePine,
    color: "#22c55e",
    tooltip:
      "SRTM-derived slope mask removes pixels above a slope limit (default 5°), reducing radar-shadow false positives on hillsides. Urban double-bounce and vegetation canopy remain known error sources.",
  },
  {
    id: "extent",
    label: "Flood Extent",
    sublabel: "Candidate",
    icon: Map,
    color: "#f59e0b",
    tooltip:
      "Final candidate inundation map: pixels that pass water classification, permanent-water exclusion, and terrain masking. Area is summed using ee.Image.pixelArea() at the chosen processing scale. This is a candidate output — not independently validated flood extent.",
  },
  {
    id: "risk",
    label: "Asset Risk",
    sublabel: "Heuristic",
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
    powers: "Rainfall forecast · archive · GloFAS discharge",
    color: "#0ea5e9",
    status: "live",
  },
  {
    icon: Gauge,
    name: "CWC Arangaly Gauge",
    provider: "NWIC · CWC",
    powers: "River stage telemetry · stage-forecast input",
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
    powers: "Elevation sampling · cross-section · slope mask",
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
  const r = 18;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - value);
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={50} height={50} viewBox="0 0 50 50" className="rotate-[-90deg]">
        <circle cx={25} cy={25} r={r} fill="none" stroke="currentColor" className="text-slate-200 dark:text-slate-800" strokeWidth={4.5} />
        <circle
          cx={25} cy={25} r={r}
          fill="none"
          stroke={color}
          strokeWidth={4.5}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
      </svg>
      <div className="text-center -mt-0.5">
        <div className="text-xs font-bold leading-tight" style={{ color }}>{(value * 100).toFixed(0)}%</div>
        <div className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">{label}</div>
      </div>
    </div>
  );
}

/* ─── Main View ──────────────────────────────────────────────────────────── */
export function MethodologyView() {
  const [selectedNodeId, setSelectedNodeId] = useState<string>("sar");
  const selectedNode = PIPELINE.find((n) => n.id === selectedNodeId) || PIPELINE[0];
  const SelectedIcon = selectedNode.icon;

  return (
    <div className="flex-1 w-full h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)] overflow-y-auto bg-slate-50 dark:bg-[#070b12] text-slate-800 dark:text-slate-100">
      <div className="max-w-6xl mx-auto p-4 sm:p-5 space-y-4">

        {/* ── 1. High-Contrast Top Intelligence Banner ─────────────────────── */}
        <section
          className="relative overflow-hidden rounded-2xl border border-teal-500/35 dark:border-teal-500/25 px-4 py-3.5 sm:px-5 sm:py-4 shadow-lg shadow-teal-900/10 dark:shadow-teal-950/40"
          style={{
            background: "linear-gradient(135deg, rgba(13, 148, 136, 0.22) 0%, rgba(14, 165, 233, 0.20) 45%, rgba(99, 102, 241, 0.18) 100%)",
          }}
        >
          {/* Ambient Decorative Glows */}
          <div
            className="pointer-events-none absolute -top-10 -right-10 h-44 w-44 rounded-full opacity-20"
            style={{ background: "radial-gradient(circle, #0ea5e9 0%, transparent 70%)" }}
          />
          <div
            className="pointer-events-none absolute -bottom-8 -left-8 h-36 w-36 rounded-full opacity-20"
            style={{ background: "radial-gradient(circle, #6366f1 0%, transparent 70%)" }}
          />

          <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-2 mb-2.5">
            <div>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-teal-600 text-white shadow-xs shadow-teal-700/20">
                  <Waves size={14} />
                </span>
                <span className="text-sm sm:text-base font-bold tracking-tight text-slate-900 dark:text-slate-50">
                  Chalakudy River Basin Intelligence
                </span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                Geospatial hydrology, Earth Engine SAR pipeline, and infrastructure exposure · Kerala, India
              </p>
            </div>
          </div>

          {/* Elevation Profile Graphic with Inline Stats in Top-Right */}
          <div className="rounded-xl border border-white/60 dark:border-slate-800/80 bg-white/80 dark:bg-slate-900/85 p-2.5 sm:px-3.5 sm:py-2.5 backdrop-blur-md shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 mb-1.5">
              <p className="text-[10px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <span>Basin Elevation Profile</span>
                <span className="text-slate-300 dark:text-slate-600 font-normal">|</span>
                <span className="font-normal text-slate-500 dark:text-slate-400">Western Ghats → Arabian Sea</span>
              </p>

              {/* Merged clean text stats across the top-right corner */}
              <div className="flex items-center gap-3 text-xs">
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-medium">Catchment:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">1,704 km²</span>
                </div>
                <span className="text-slate-300 dark:text-slate-700">•</span>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-medium">Reservoirs:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">Sholayar · Poringalkuthu</span>
                </div>
                <span className="text-slate-300 dark:text-slate-700 hidden md:inline">•</span>
                <div className="items-center gap-1 hidden md:flex">
                  <span className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-medium">Platform:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-100">Basin Intelligence</span>
                </div>
              </div>
            </div>

            {/* Compact Elevation Profile Graphic */}
            <svg viewBox="0 0 520 54" className="w-full h-10 sm:h-11" preserveAspectRatio="none">
              <defs>
                <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.12} />
                </linearGradient>
              </defs>
              <path
                d="M0,50 L30,46 L70,22 L110,7 L140,15 L170,26 L200,11 L230,19 L260,28 L295,36 L330,32 L370,42 L410,44 L450,48 L490,49 L520,50 Z"
                fill="url(#elevGrad)"
                stroke="#6366f1"
                strokeWidth={1.5}
                strokeOpacity={0.75}
              />
              {[110, 200].map((x) => (
                <g key={x}>
                  <circle cx={x} cy={x === 110 ? 7 : 11} r={3.5} fill="#0ea5e9" opacity={0.95} />
                  <line x1={x} y1={x === 110 ? 10 : 14} x2={x} y2={50} stroke="#0ea5e9" strokeDasharray="2,2" strokeOpacity={0.5} strokeWidth={1} />
                </g>
              ))}
              <text x={105} y={6} fontSize={6.5} fill="#64748b" className="dark:fill-slate-400" textAnchor="middle" fontWeight="bold">Sholayar</text>
              <text x={200} y={10} fontSize={6.5} fill="#64748b" className="dark:fill-slate-400" textAnchor="middle" fontWeight="bold">Poringalkuthu</text>
              <text x={5} y={47} fontSize={6.5} fill="#64748b" className="dark:fill-slate-400">Ghats</text>
              <text x={515} y={47} fontSize={6.5} fill="#64748b" className="dark:fill-slate-400" textAnchor="end">Sea</text>
              <text x={260} y={34} fontSize={6.5} fill="#64748b" className="dark:fill-slate-400" textAnchor="middle">Chalakudy River</text>
            </svg>
          </div>
        </section>

        {/* ── 2. Data Architecture: Clean Borderless Floating Cards ────────── */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 uppercase tracking-wider">
              <Database size={14} className="text-teal-600 dark:text-teal-400" />
              Data Architecture
            </h2>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">Telemetry, Imagery &amp; Demographics</span>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3">
            {DATA_SOURCES.map((src) => {
              const Icon = src.icon;
              const statusColor = STATUS_COLORS[src.status];
              return (
                <div
                  key={src.name}
                  className="group rounded-2xl border-0 bg-white dark:bg-slate-900 py-3 px-3.5 shadow-md shadow-slate-200/50 dark:shadow-slate-950/60 hover:shadow-lg transition-all"
                >
                  {/* Inlined Status Badge with Title */}
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md" style={{ background: `${src.color}18` }}>
                        <Icon size={13} style={{ color: src.color }} />
                      </div>
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">{src.name}</span>
                    </div>
                    <span
                      className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md shrink-0"
                      style={{ background: `${statusColor}18`, color: statusColor }}
                    >
                      {src.status}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-400 dark:text-slate-500 mb-0.5 pl-8 truncate">
                    {src.provider}
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-300 leading-tight pl-8">
                    {src.powers}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── 3. Side-by-Side: Pipeline & Model Lab (Matched Height) ──────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
          
          {/* Left Column: Flood-Mapping Pipeline */}
          <section className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <h2 className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 uppercase tracking-wider">
                <Cpu size={14} className="text-indigo-600 dark:text-indigo-400" />
                Flood-Mapping Pipeline
              </h2>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">Sentinel-1 · GEE COPERNICUS/S1_GRD</span>
            </div>

            {/* Card wrapper: borderless floating with flex-col h-full justify-between */}
            <div className="rounded-2xl border-0 bg-white dark:bg-slate-900 p-4 shadow-md shadow-slate-200/50 dark:shadow-slate-950/60 flex-1 flex flex-col h-full justify-between">
              
              {/* Pipeline Nodes: Strictly centered and evenly distributed across 100% width */}
              <div className="w-full flex items-center justify-between gap-1 mb-2">
                {PIPELINE.map((node, i) => {
                  const isSelected = selectedNodeId === node.id;
                  const NodeIcon = node.icon;
                  return (
                    <React.Fragment key={node.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedNodeId(node.id)}
                        onMouseEnter={() => setSelectedNodeId(node.id)}
                        className="relative text-center flex flex-col items-center justify-center flex-1 min-w-0 px-0.5 transition-all cursor-pointer group"
                        title={`Click to inspect ${node.label}`}
                      >
                        <div
                          className={`relative text-center flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 shadow-2xs transition-all w-full border ${
                            isSelected
                              ? "ring-2 ring-teal-500/80 dark:ring-teal-400/80 shadow-xs scale-[1.03]"
                              : "opacity-85 hover:opacity-100 hover:scale-[1.02]"
                          }`}
                          style={{
                            borderColor: isSelected ? node.color : `${node.color}40`,
                            background: isSelected ? `${node.color}22` : `${node.color}12`,
                          }}
                        >
                          <div
                            className="flex h-5 w-5 items-center justify-center rounded-md shrink-0 transition-transform group-hover:scale-110"
                            style={{ background: `${node.color}25` }}
                          >
                            <NodeIcon size={12} style={{ color: node.color }} />
                          </div>
                          <span className="text-[9.5px] font-semibold leading-tight text-slate-800 dark:text-slate-100 truncate w-full text-center">
                            {node.label}
                          </span>
                          <span className="text-[7.5px] text-slate-500 dark:text-slate-400 font-mono truncate w-full text-center">
                            {node.sublabel}
                          </span>
                        </div>
                      </button>
                      {i < PIPELINE.length - 1 && (
                        <ChevronRight size={11} className="shrink-0 text-slate-400 dark:text-slate-500" />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Active Stage Inspector: fills the card with rich, dynamic details */}
              <div className="rounded-xl bg-slate-50/90 dark:bg-slate-800/50 p-3.5 border border-slate-200/60 dark:border-slate-800/70 flex-1 flex flex-col justify-between transition-all mt-3">
                <div>
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <div
                      className="flex h-7 w-7 rounded-lg items-center justify-center shrink-0 shadow-2xs"
                      style={{ background: `${selectedNode.color}25`, color: selectedNode.color }}
                    >
                      <SelectedIcon size={14} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-800 dark:text-slate-100">
                        {selectedNode.label}
                      </span>
                      <span
                        className="text-[9px] font-mono px-1.5 py-0.5 rounded font-semibold"
                        style={{ background: `${selectedNode.color}20`, color: selectedNode.color }}
                      >
                        {selectedNode.sublabel}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-auto hidden sm:inline">
                      Hover / click stage to inspect
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed mt-1">
                    {selectedNode.tooltip}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* Right Column: Machine Learning Model Lab */}
          <section className="flex flex-col h-full">
            <div className="flex items-center justify-between mb-2 shrink-0">
              <h2 className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 uppercase tracking-wider">
                <FlaskConical size={14} className="text-purple-600 dark:text-purple-400" />
                Random Forest Model Lab
              </h2>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">Evaluation Metrics</span>
            </div>

            {/* Card wrapper: borderless floating with flex-col h-full justify-between */}
            <div className="rounded-2xl border-0 bg-white dark:bg-slate-900 p-4 shadow-md shadow-slate-200/50 dark:shadow-slate-950/60 flex-1 flex flex-col h-full justify-between">
              
              {/* Gauges row with shrunk SVG radius */}
              <div className="flex items-center justify-around gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800/80">
                {ML_METRICS.map((m) => (
                  <CircleGauge key={m.label} label={m.label} value={m.value} color={m.color} />
                ))}
              </div>

              {/* Bulleted text positioned directly underneath */}
              <div className="mt-2.5 space-y-1.5 text-[10px] text-slate-600 dark:text-slate-400 leading-relaxed">
                <div className="flex items-start gap-1.5">
                  <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-teal-600 dark:text-teal-400" />
                  <span>Trained from a labelled table split by <code className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 font-mono text-[9px]">region_id</code> (disjoint train/test sets).</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-teal-600 dark:text-teal-400" />
                  <span>Compared with threshold baseline on identical test rows (Precision, Recall, F1, IoU).</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-500" />
                  <span>Probabilities are <strong>uncalibrated</strong>. Evaluates candidate radar backscatter features.</span>
                </div>
              </div>
            </div>
          </section>

        </div>

        {/* ── 4. Product Definitions & Limitations: Floating Pills ────────── */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 uppercase tracking-wider">
              <Database size={14} className="text-teal-600 dark:text-teal-400" />
              Product Definitions &amp; Limitations
            </h2>
            <span className="text-[10px] text-slate-400 dark:text-slate-500">Click pill to toggle definitions</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {[
              {
                term: "Candidate Inundation",
                tag: "Sentinel-1 SAR",
                def: "Pixels classified as water by thresholding backscatter (default −16 dB) after JRC permanent-water and SRTM slope exclusions. Exploratory output; not an independently ground-validated flood map.",
              },
              {
                term: "Heuristic Asset Risk Score",
                tag: "Terrain + NWP",
                def: "Relative risk score derived from elevation proxy and NWP rainfall intensity. Serves as a screening tool, not a calibrated flood probability or flood depth estimate.",
              },
              {
                term: "River Stage Outlook",
                tag: "XGBoost 48h",
                def: "48-hour machine-learned forecast trained on Arangaly gauge history and basin rainfall forcing. Guidance tool only; not an official hydraulic warning.",
              },
              {
                term: "Asset Elevation Proxy",
                tag: "Terrarium DEM",
                def: "Terrain elevation sampled from Mapzen Terrarium / Copernicus GLO-90 DEM tiles. Absolute elevation does not equate to inundation depth.",
              },
              {
                term: "River Discharge",
                tag: "GloFAS 5km",
                def: "Open-Meteo GloFAS daily discharge at nearby 5 km grid cell. Modelled runoff guidance, not an in-situ streamflow measurement.",
              },
              {
                term: "Population Exposure",
                tag: "WorldPop GEE",
                def: "Zonal population count intersecting candidate flood pixels from WorldPop raster data. Subject to census disaggregation tolerances.",
              },
            ].map((item) => (
              <details
                key={item.term}
                className="group rounded-xl border-0 bg-white dark:bg-slate-900 shadow-sm shadow-slate-200/50 dark:shadow-slate-950/50 hover:shadow-md transition-all overflow-hidden"
              >
                <summary className="flex items-center justify-between px-3.5 py-2 cursor-pointer select-none list-none text-xs font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="h-1.5 w-1.5 rounded-full bg-teal-500 shrink-0" />
                    <span className="truncate">{item.term}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 font-mono">
                      {item.tag}
                    </span>
                    <ChevronDown size={12} className="text-slate-400 transition-transform duration-200 group-open:rotate-180" />
                  </div>
                </summary>
                <div className="px-3.5 pb-2.5 pt-1 border-t border-slate-100 dark:border-slate-800/60 text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed bg-slate-50/40 dark:bg-slate-950/30">
                  {item.def}
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* ── 5. Seamless Full-Width Footer ───────────────────────────────── */}
        <footer className="mt-4 -mx-4 sm:-mx-5 -mb-4 sm:-mb-5 border-t border-slate-200/80 dark:border-slate-800 bg-slate-100/80 dark:bg-slate-900/70 px-4 sm:px-6 py-2.5 flex flex-col sm:flex-row items-center justify-between gap-2 text-[10px] sm:text-[11px] text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={13} className="text-teal-600 dark:text-teal-400 shrink-0" />
            <span><strong>Reproducibility:</strong> Each analysis run logs scene dates, processing scale, GEE asset IDs, and runtime parameters. Reuses cached result within 24 hours.</span>
          </div>
          <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 whitespace-nowrap">
            Research prototype · Not an official warning service
          </span>
        </footer>

      </div>
    </div>
  );
}
