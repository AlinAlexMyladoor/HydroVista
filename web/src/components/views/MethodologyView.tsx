"use client";

import React, { useState } from "react";
import {
  Satellite, CloudRain, Gauge, Map, Database, Cpu, ChevronRight, ChevronDown,
  CheckCircle2, AlertTriangle, Layers, FlaskConical, Globe,
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
    powers: "SAR flood mapping · optical layer",
    color: "#6366f1",
    status: "on-demand",
  },
  {
    icon: CloudRain,
    name: "Open-Meteo NWP",
    provider: "Open-Meteo",
    powers: "Rainfall forecast · GloFAS discharge",
    color: "#0ea5e9",
    status: "live",
  },
  {
    icon: Gauge,
    name: "CWC Arangaly Gauge",
    provider: "NWIC · CWC",
    powers: "River stage telemetry · ML forecast",
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
    powers: "Elevation sampling · slope masking",
    color: "#f59e0b",
    status: "live",
  },
  {
    icon: Database,
    name: "WorldPop Population",
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
  const r = 16;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - value);
  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg width={42} height={42} viewBox="0 0 42 42" className="rotate-[-90deg]">
        <circle cx={21} cy={21} r={r} fill="none" stroke="currentColor" className="text-slate-200 dark:text-slate-800" strokeWidth={4} />
        <circle
          cx={21} cy={21} r={r}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 1s ease" }}
        />
      </svg>
      <div className="text-center -mt-0.5">
        <div className="text-[11px] font-bold leading-tight" style={{ color }}>{(value * 100).toFixed(0)}%</div>
        <div className="text-[9px] text-slate-500 dark:text-slate-400 font-medium">{label}</div>
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
    <div className="flex-1 w-full h-[calc(100vh-4rem)] overflow-y-auto overflow-x-hidden bg-slate-50 dark:bg-[#070b12] text-slate-800 dark:text-slate-100 p-2.5 sm:p-3.5 pb-24">
      <div className="max-w-6xl w-full mx-auto flex flex-col gap-3">

        {/* ── 1. Soft Atmospheric Top Banner with Unsquashed Elevation Chart ── */}
        <section
          className="relative overflow-hidden rounded-xl border border-teal-500/15 dark:border-teal-500/10 px-3 py-2 shadow-xs shadow-blue-900/5 dark:shadow-slate-950/20 shrink-0"
          style={{
            background: "linear-gradient(135deg, rgba(13, 148, 136, 0.07) 0%, rgba(14, 165, 233, 0.05) 50%, rgba(99, 102, 241, 0.04) 100%)",
          }}
        >
          <div className="relative flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2 min-w-0">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-md bg-teal-600 text-white shadow-2xs">
                <Waves size={12} />
              </span>
              <span className="text-xs sm:text-sm font-bold tracking-tight text-slate-900 dark:text-slate-50 truncate">
                Chalakudy River Basin Intelligence
              </span>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 hidden md:inline truncate">
                · Geospatial hydrology, Earth Engine SAR pipeline &amp; infrastructure exposure
              </span>
            </div>
            {/* Inline Stats on Right */}
            <div className="flex items-center gap-2.5 text-[11px] shrink-0">
              <div>
                <span className="text-[9.5px] text-slate-400 uppercase mr-1">Catchment:</span>
                <span className="font-bold text-slate-800 dark:text-slate-100">1,704 km²</span>
              </div>
              <span className="text-slate-300 dark:text-slate-700">•</span>
              <div>
                <span className="text-[9.5px] text-slate-400 uppercase mr-1">Reservoirs:</span>
                <span className="font-bold text-slate-800 dark:text-slate-100">Sholayar · Poringalkuthu</span>
              </div>
            </div>
          </div>

          {/* Basin Elevation Profile: Explicit height & headroom so labels float cleanly above peaks */}
          <div className="rounded-lg border border-white/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 px-3 py-1.5 backdrop-blur-xs shadow-2xs min-h-[76px] h-20 sm:h-22 flex flex-col justify-center">
            <svg viewBox="0 0 540 80" className="w-full h-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id="elevGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.45} />
                  <stop offset="100%" stopColor="#0ea5e9" stopOpacity={0.06} />
                </linearGradient>
              </defs>
              {/* Mountain & River profile path */}
              <path
                d="M0,70 L25,67 L65,48 L115,28 L145,36 L180,44 L210,36 L240,44 L280,53 L325,59 L375,63 L430,66 L485,68 L540,70 L540,70 L0,70 Z"
                fill="url(#elevGrad)"
                stroke="#6366f1"
                strokeWidth={1.5}
                strokeOpacity={0.8}
              />
              {/* Reservoir markers with vertical guide lines */}
              {[
                { x: 115, y: 28, label: "Sholayar (1,050m)", textY: 14 },
                { x: 210, y: 36, label: "Poringalkuthu (420m)", textY: 22 },
              ].map((res) => (
                <g key={res.label}>
                  <line x1={res.x} y1={res.y} x2={res.x} y2={70} stroke="#0ea5e9" strokeDasharray="2,2" strokeOpacity={0.55} strokeWidth={1} />
                  <circle cx={res.x} cy={res.y} r={3.5} fill="#0ea5e9" stroke="#ffffff" strokeWidth={1} className="dark:stroke-slate-900" />
                  <text x={res.x} y={res.textY} fontSize={7.5} fill="#475569" className="dark:fill-slate-300 font-bold" textAnchor="middle">
                    {res.label}
                  </text>
                </g>
              ))}
              {/* Geographic references */}
              <text x={8} y={62} fontSize={7} fill="#64748b" className="dark:fill-slate-400 font-medium">Western Ghats (1,200m+)</text>
              <text x={532} y={62} fontSize={7} fill="#64748b" className="dark:fill-slate-400 font-medium" textAnchor="end">Arabian Sea (0m)</text>
              <text x={310} y={50} fontSize={7} fill="#64748b" className="dark:fill-slate-400 font-medium" textAnchor="middle">Chalakudy River Descent (~130 km)</text>
            </svg>
          </div>
        </section>

        {/* ── 2. Data Architecture: Clean Relative Cards with Absolute Status Badge ── */}
        <section className="shrink-0">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-[10px] font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 uppercase tracking-wider">
              <Database size={12} className="text-teal-600 dark:text-teal-400" />
              Data Architecture
            </h2>
            <span className="text-[9px] text-slate-400 dark:text-slate-500">Telemetry, Imagery &amp; Demographics</span>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:gap-3 sm:grid-cols-3 lg:grid-cols-3">
            {DATA_SOURCES.map((src) => {
              const Icon = src.icon;
              const statusColor = STATUS_COLORS[src.status];
              return (
                <div
                  key={src.name}
                  className="relative rounded-xl border-0 bg-white dark:bg-slate-900 p-2 sm:p-2.5 shadow-xs hover:shadow-sm transition-all flex items-center gap-2.5 min-w-0 group"
                >
                  {/* Status badge: Pushed to absolute top-right corner */}
                  <span
                    className="absolute top-2 right-2 sm:top-2.5 sm:right-2.5 text-[7.5px] sm:text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded leading-none shrink-0"
                    style={{ background: `${statusColor}18`, color: statusColor }}
                  >
                    {src.status}
                  </span>

                  {/* Left: Icon */}
                  <div
                    className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-lg"
                    style={{ background: `${src.color}18` }}
                  >
                    <Icon size={14} style={{ color: src.color }} />
                  </div>

                  {/* Right: Text block (padded right to clear the badge) */}
                  <div className="flex-1 min-w-0 leading-tight pr-12 sm:pr-14">
                    <div className="text-[11px] sm:text-xs font-bold text-slate-800 dark:text-slate-100 truncate">{src.name}</div>
                    <div className="text-[9px] sm:text-[9.5px] text-slate-400 dark:text-slate-500 truncate">{src.provider}</div>
                    <div className="text-[9.5px] sm:text-[10px] text-slate-600 dark:text-slate-300 truncate mt-0.5">{src.powers}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── 3. Middle Section: Pipeline & Model Lab ────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch">
          
          {/* Left Column: Flood-Mapping Pipeline */}
          <section className="flex flex-col">
            <div className="flex items-center justify-between mb-1 shrink-0">
              <h2 className="text-[10px] font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 uppercase tracking-wider">
                <Cpu size={12} className="text-indigo-600 dark:text-indigo-400" />
                Flood-Mapping Pipeline
              </h2>
              <span className="text-[9px] text-slate-400 dark:text-slate-500">Sentinel-1 · GEE COPERNICUS/S1_GRD</span>
            </div>

            <div className="rounded-2xl border-0 bg-white dark:bg-slate-900 p-3 shadow-md shadow-slate-200/50 dark:shadow-slate-950/60 flex flex-col justify-between gap-2.5 h-full">
              
              {/* Pipeline Nodes: Strictly centered with negative top margin on arrows for vertical alignment */}
              <div className="w-full flex items-center justify-between gap-1 mb-1 shrink-0">
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
                          className={`relative text-center flex flex-col items-center justify-center gap-0.5 rounded-lg px-1 py-1 shadow-2xs transition-all w-full border ${
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
                            className="flex h-4.5 w-4.5 items-center justify-center rounded-md shrink-0 transition-transform group-hover:scale-110"
                            style={{ background: `${node.color}25` }}
                          >
                            <NodeIcon size={11} style={{ color: node.color }} />
                          </div>
                          <span className="text-[9px] font-semibold leading-tight text-slate-800 dark:text-slate-100 truncate w-full text-center">
                            {node.label}
                          </span>
                          <span className="text-[7.5px] text-slate-500 dark:text-slate-400 font-mono truncate w-full text-center">
                            {node.sublabel}
                          </span>
                        </div>
                      </button>
                      {i < PIPELINE.length - 1 && (
                        <ChevronRight size={10} className="shrink-0 text-slate-400 dark:text-slate-500 -mt-1.5 self-center" />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Active Stage Inspector: Dynamic Details */}
              <div className="rounded-xl bg-slate-50/90 dark:bg-slate-800/50 p-2.5 border border-slate-200/60 dark:border-slate-800/70 flex flex-col justify-start transition-all">
                <div className="flex items-center gap-2 mb-1 shrink-0">
                  <div
                    className="flex h-5.5 w-5.5 rounded-md items-center justify-center shrink-0 shadow-2xs"
                    style={{ background: `${selectedNode.color}25`, color: selectedNode.color }}
                  >
                    <SelectedIcon size={13} />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-bold text-slate-800 dark:text-slate-100">
                      {selectedNode.label}
                    </span>
                    <span
                      className="text-[8.5px] font-mono px-1.5 py-0.2 rounded font-semibold"
                      style={{ background: `${selectedNode.color}20`, color: selectedNode.color }}
                    >
                      {selectedNode.sublabel}
                    </span>
                  </div>
                  <span className="text-[8.5px] text-slate-400 dark:text-slate-500 ml-auto hidden sm:inline">
                    Hover / click to inspect
                  </span>
                </div>
                <p className="text-[10px] text-slate-600 dark:text-slate-300 leading-relaxed">
                  {selectedNode.tooltip}
                </p>
              </div>

            </div>
          </section>

          {/* Right Column: Machine Learning Model Lab */}
          <section className="flex flex-col">
            <div className="flex items-center justify-between mb-1 shrink-0">
              <h2 className="text-[10px] font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 uppercase tracking-wider">
                <FlaskConical size={12} className="text-purple-600 dark:text-purple-400" />
                Random Forest Model Lab
              </h2>
              <span className="text-[9px] text-slate-400 dark:text-slate-500">Evaluation Metrics</span>
            </div>

            <div className="rounded-2xl border-0 bg-white dark:bg-slate-900 p-3 sm:p-4 shadow-md shadow-slate-200/50 dark:shadow-slate-950/60 flex flex-col justify-center gap-4 sm:gap-6 h-full">
              
              {/* Gauges row */}
              <div className="flex items-center justify-around gap-2 pb-3 border-b border-slate-100 dark:border-slate-800/80 shrink-0">
                {ML_METRICS.map((m) => (
                  <CircleGauge key={m.label} label={m.label} value={m.value} color={m.color} />
                ))}
              </div>

              {/* Bulleted text: Naturally grouped without dead space */}
              <div className="space-y-1.5 text-[9.5px] sm:text-[10px] text-slate-600 dark:text-slate-400 leading-snug">
                <div className="flex items-start gap-1.5">
                  <CheckCircle2 size={11} className="mt-0.5 shrink-0 text-teal-600 dark:text-teal-400" />
                  <span>Trained from a labelled table split by <code className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.2 font-mono text-[8.5px]">region_id</code> (disjoint train/test sets).</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <CheckCircle2 size={11} className="mt-0.5 shrink-0 text-teal-600 dark:text-teal-400" />
                  <span>Compared with threshold baseline on identical test rows (Precision, Recall, F1, IoU).</span>
                </div>
                <div className="flex items-start gap-1.5">
                  <AlertTriangle size={11} className="mt-0.5 shrink-0 text-amber-500" />
                  <span>Probabilities are <strong>uncalibrated</strong>. Evaluates candidate radar backscatter features.</span>
                </div>
              </div>
            </div>
          </section>

        </div>

        {/* ── 4. Product Definitions & Limitations: Safe Assistant Margin ──── */}
        <section>
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-[10px] font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 uppercase tracking-wider">
              <Database size={12} className="text-teal-600 dark:text-teal-400" />
              Product Definitions &amp; Limitations
            </h2>
            <span className="text-[9px] text-slate-400 dark:text-slate-500 mr-24 sm:mr-48">Click pill to toggle definitions</span>
          </div>

          {/* Right margin (pr-24 sm:pr-48) stops content safely before the floating assistant button */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 pr-24 sm:pr-48">
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
                className="group rounded-lg border-0 bg-white dark:bg-slate-900 shadow-xs hover:shadow-sm transition-all overflow-hidden"
              >
                <summary className="flex items-center justify-between px-3 py-1.5 cursor-pointer select-none list-none text-[11px] font-semibold text-slate-800 dark:text-slate-100 hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="h-1.5 w-1.5 rounded-full bg-teal-500 shrink-0" />
                    <span className="truncate">{item.term}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[8.5px] px-1 py-0.2 rounded bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300 font-mono">
                      {item.tag}
                    </span>
                    <ChevronDown size={11} className="text-slate-400 transition-transform duration-200 group-open:rotate-180" />
                  </div>
                </summary>
                <div className="px-3 pb-2 pt-0.5 border-t border-slate-100 dark:border-slate-800/60 text-[9.5px] text-slate-500 dark:text-slate-400 leading-relaxed bg-slate-50/40 dark:bg-slate-950/30">
                  {item.def}
                </div>
              </details>
            ))}
          </div>
        </section>

        {/* ── 5. Seamless Bottom Footer with Assistant Clearance ───────────── */}
        <footer className="mt-2 -mx-2.5 sm:-mx-3 border-t border-slate-200/80 dark:border-slate-800 bg-slate-100/90 dark:bg-slate-900/80 px-4 sm:px-5 py-2 flex flex-col sm:flex-row items-center justify-between gap-2 text-[9.5px] text-slate-500 dark:text-slate-400 pr-52 sm:pr-56 rounded-lg">
          <div className="flex items-center gap-2 min-w-0">
            <CheckCircle2 size={12} className="text-teal-600 dark:text-teal-400 shrink-0" />
            <span className="truncate sm:overflow-visible"><strong>Reproducibility:</strong> Each analysis run logs scene dates, processing scale, GEE asset IDs, and runtime parameters. Reuses cached result within 24 hours.</span>
          </div>
          <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 whitespace-nowrap shrink-0">
            Research prototype · Not an official warning service
          </span>
        </footer>

      </div>
    </div>
  );
}
