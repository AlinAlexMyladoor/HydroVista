"use client";

import React from "react";
import { useStore } from "@/lib/store";
import { translations } from "@/lib/translations";
import { useQuery } from "@tanstack/react-query";
import { api, ExposureScore } from "@/lib/api";
import {
  Cpu,
  ShieldCheck,
  AlertCircle,
  Database,
  Satellite,
  BarChart2,
  Info,
  Calendar,
  Layers,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";

export function ExplainabilityPanel() {
  const { language, selectedAssetId, setSelectedAssetId } = useStore();
  const t = translations[language];

  // Fetch status and data sources
  const { data: status } = useQuery({
    queryKey: ["system-status"],
    queryFn: () => api.status(),
  });

  // Fetch model metadata
  const { data: modelMeta } = useQuery({
    queryKey: ["model-metadata"],
    queryFn: () => api.model.metadata(),
  });

  // Fetch exposure scores to pick selected or top critical asset
  const { data: exposureData } = useQuery({
    queryKey: ["exposure-list"],
    queryFn: () => api.exposure.list({ page: 1 }),
  });

  // Fetch historical flood events
  const { data: historicalEvents } = useQuery({
    queryKey: ["historical-events"],
    queryFn: () => api.historical.events(),
  });

  const selectedAsset =
    (exposureData?.items || []).find((a) => a.asset_id === selectedAssetId) ||
    exposureData?.items?.[0];

  // Feature contribution breakdown for selected asset
  const featureData = selectedAsset
    ? [
        {
          name: "Elevation Susceptibility",
          value: Number(((selectedAsset.flood_susceptibility || 0.5) * 100).toFixed(0)),
          desc: "Lower terrain elevation relative to base river stage increases pooling risk",
        },
        {
          name: "Rainfall Exposure",
          value: Math.min(
            100,
            Number((((selectedAsset.rainfall_accumulation_mm || 20) / 100) * 100).toFixed(0))
          ),
          desc: "Forecasted or simulated 24h precipitation over local catchment",
        },
        {
          name: "Facility Criticality",
          value:
            selectedAsset.asset_type === "hospital"
              ? 100
              : selectedAsset.asset_type === "substation"
              ? 95
              : selectedAsset.asset_type === "bridge"
              ? 90
              : selectedAsset.asset_type === "shelter"
              ? 85
              : 70,
          desc: "Operational priority weighting for life safety and community response",
        },
      ]
    : [];

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden select-none">
      {/* Header */}
      <div className="p-4 border-b border-border bg-surface flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-serif font-bold text-text">
            {t.explainTitle}
          </h2>
          <span className="badge bg-surface-secondary text-primary font-mono text-[10px]">
            Model Governance & Data Lineage
          </span>
        </div>
        <p className="text-xs text-text-secondary">
          Explainable risk factor attribution and rigorous dataset health transparency
        </p>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-auto p-4 space-y-4 scrollbar-thin">
        {/* Honest Model Status Banner */}
        <div className="bg-amber-50/50 border border-amber-200/80 rounded-md p-3.5 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs">
            <div className="font-semibold text-text">
              Honest Engineering Governance: Heuristic Model In Operation
            </div>
            <p className="text-text-secondary leading-relaxed">
              {(modelMeta as any)?.notes ||
                "The XGBoost gradient-boosted flood classifier is not claimed as trained without verified Sentinel-1 SAR ground-truth labels. The platform operates a transparent, scientifically calibrated multi-criteria heuristic combining SRTM elevation, Open-Meteo precipitation, and OSM infrastructure criticality."}
            </p>
          </div>
        </div>

        {/* Selected Asset Risk Breakdown Card */}
        {selectedAsset ? (
          <div className="bg-surface p-4 rounded-md border border-border shadow-card space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
              <div>
                <span className="text-2xs text-text-secondary uppercase tracking-wider font-semibold block">
                  Attribution Analysis for:
                </span>
                <h3 className="font-semibold text-text text-sm">
                  {selectedAsset.asset_name || "Infrastructure Facility"}
                </h3>
                <span className="text-2xs text-text-secondary capitalize font-mono">
                  {selectedAsset.asset_type.replace(/_/g, " ")} • ID: {selectedAsset.asset_id}
                </span>
              </div>
              <div className="text-right">
                <span
                  className={`badge uppercase font-mono font-bold text-xs ${
                    selectedAsset.risk_category === "critical"
                      ? "badge-critical"
                      : selectedAsset.risk_category === "high"
                      ? "badge-high"
                      : selectedAsset.risk_category === "medium"
                      ? "badge-medium"
                      : "badge-low"
                  }`}
                >
                  {selectedAsset.risk_category} Risk
                </span>
                <div className="text-2xs text-text-secondary font-mono mt-0.5">
                  Index: {selectedAsset.risk_score.toFixed(3)}
                </div>
              </div>
            </div>

            {/* Feature Weight Chart */}
            <div className="h-36 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={featureData} layout="vertical" margin={{ left: 30, right: 20, top: 0, bottom: 0 }}>
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                  <YAxis dataKey="name" type="category" tick={{ fontSize: 10 }} width={140} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload;
                        return (
                          <div className="bg-surface border border-border p-2 rounded shadow-panel text-2xs">
                            <div className="font-semibold text-text">{d.name}: {d.value}%</div>
                            <div className="text-text-secondary mt-0.5">{d.desc}</div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="value" fill="#246B62" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Evidence details list */}
            <div className="bg-surface-secondary/40 p-2.5 rounded border border-border text-2xs space-y-1">
              <span className="font-semibold text-text block">Model Explanatory Evidence:</span>
              <ul className="list-disc pl-4 space-y-0.5 text-text-secondary">
                {(selectedAsset.evidence || []).map((e, idx) => (
                  <li key={idx}>{e}</li>
                ))}
              </ul>
            </div>
          </div>
        ) : (
          <div className="p-4 bg-surface rounded border border-border text-xs text-text-secondary">
            Select an asset from the Map or Exposure Ledger to inspect its risk attribution breakdown.
          </div>
        )}

        {/* Data Sources Health & Freshness Ledger */}
        <div className="bg-surface p-4 rounded-md border border-border shadow-card space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h3 className="text-xs font-semibold text-text uppercase tracking-wider flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-primary" />
              Integrated Data Sources & Freshness
            </h3>
            <span className="text-2xs font-mono text-text-secondary">
              Auto-monitored telemetry
            </span>
          </div>

          <div className="space-y-2">
            {(status?.data_sources || []).map((src) => (
              <div
                key={src.slug}
                className="p-2.5 rounded border border-border bg-background flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div className="space-y-0.5">
                  <div className="font-medium text-text flex items-center gap-1.5">
                    <span>{src.name}</span>
                    <span
                      className={`badge text-[9px] py-0 px-1.5 ${
                        src.is_available ? "badge-low" : "badge-unavailable"
                      }`}
                    >
                      {src.is_available ? "Active" : "Unavailable / Offline"}
                    </span>
                  </div>
                  {src.known_limitations && (
                    <div className="text-2xs text-text-secondary max-w-md">
                      {src.known_limitations}
                    </div>
                  )}
                </div>

                <div className="text-right text-2xs font-mono text-text-secondary">
                  <div>Checked: {src.last_checked ? new Date(src.last_checked).toLocaleTimeString() : "Recent"}</div>
                  <div>Auth: {src.requires_credentials ? "Key Required" : "Public API"}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Historical Flood Events Context */}
        <div className="bg-surface p-4 rounded-md border border-border shadow-card space-y-3">
          <h3 className="text-xs font-semibold text-text uppercase tracking-wider flex items-center gap-1.5 border-b border-border pb-2">
            <Calendar className="w-3.5 h-3.5 text-primary" />
            Historical Flood Benchmarks (Chalakudy Basin)
          </h3>
          <div className="space-y-2 text-xs">
            {((historicalEvents as any)?.events || [
              {
                id: "2018-kerala-flood",
                name: "2018 Great Kerala Flood (Chalakudy Basin Inundation)",
                dates: "August 14 - August 19, 2018",
                peak_24h_mm: 398.0,
                summary:
                  "Extreme rainfall caused Sholayar and Poringalkuthu dam overflows, submerging Chalakudy town and cutting off the NH 544 arterial bridge.",
              },
              {
                id: "2019-kerala-flood",
                name: "2019 Chalakudy River Flash Floods",
                dates: "August 8 - August 12, 2019",
                peak_24h_mm: 245.0,
                summary:
                  "High-intensity convective rainfall triggered localized landslips in upper catchment and rapid river stage rise.",
              },
            ]).map((ev: any) => (
              <div key={ev.id} className="p-2.5 bg-surface-secondary/30 rounded border border-border space-y-1">
                <div className="flex justify-between items-center">
                  <span className="font-semibold text-text">{ev.name}</span>
                  <span className="font-mono text-2xs text-primary font-bold">
                    Peak 24h: {ev.peak_24h_mm} mm
                  </span>
                </div>
                <div className="text-2xs text-text-secondary">{ev.dates}</div>
                <p className="text-2xs text-text leading-relaxed mt-1">{ev.summary}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
