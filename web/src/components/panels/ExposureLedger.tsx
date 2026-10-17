"use client";

import React, { useState } from "react";
import { useStore, RiskCategory } from "@/lib/store";
import { translations } from "@/lib/translations";
import { useQuery } from "@tanstack/react-query";
import { api, ExposureScore } from "@/lib/api";
import { 
  Download, 
  Search, 
  Filter, 
  ExternalLink, 
  AlertOctagon, 
  Sparkles, 
  ChevronRight,
  HelpCircle
} from "lucide-react";

export function ExposureLedger() {
  const { 
    language, 
    riskFilter, 
    setRiskFilter, 
    assetTypeFilter, 
    setAssetTypeFilter, 
    setSelectedAssetId,
    focusMap,
    setActivePanel 
  } = useStore();
  const t = translations[language];
  const [search, setSearch] = useState("");

  const { data: exposureData, isLoading } = useQuery({
    queryKey: ["exposure-ledger", riskFilter, assetTypeFilter],
    queryFn: () =>
      api.exposure.list({
        risk_category: riskFilter === "all" ? undefined : riskFilter,
        asset_type: assetTypeFilter === "all" ? undefined : assetTypeFilter,
        page: 1,
      }),
  });

  const items = (exposureData?.items || []).filter((item) =>
    search.trim() === ""
      ? true
      : item.asset_name?.toLowerCase().includes(search.toLowerCase()) ||
        item.asset_type.toLowerCase().includes(search.toLowerCase())
  );

  // CSV Export utility
  const exportCSV = () => {
    if (!items.length) return;
    const headers = [
      "Asset ID",
      "Name",
      "Type",
      "Latitude",
      "Longitude",
      "Risk Score",
      "Risk Level",
      "Elevation (m)",
      "Elevation source",
      "Rainfall 24h (mm)",
      "Evidence",
    ];
    const rows = items.map((i) => [
      i.asset_id,
      `"${i.asset_name || "N/A"}"`,
      i.asset_type,
      i.lat,
      i.lon,
      i.risk_score.toFixed(3),
      i.risk_category,
      i.terrain_elevation_m?.toFixed(1) || "",
      `"${i.terrain_source || ""}"`,
      i.rainfall_accumulation_mm?.toFixed(1) || "",
      `"${(i.evidence || []).join("; ")}"`,
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `floodlens_exposure_ledger_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden select-none">
      {/* Ledger Header & Filters */}
      <div className="p-4 border-b border-border bg-surface flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-serif font-bold text-text">
              {t.navExposure}
            </h2>
            <p className="text-xs text-text-secondary">
              Ranked critical infrastructure assets in Chalakudy basin by composite flood vulnerability
            </p>
          </div>
          <button
            onClick={exportCSV}
            disabled={!items.length}
            className="btn-secondary text-xs flex items-center gap-1.5 py-1.5 px-3 disabled:opacity-50"
            title="Export filtered items to CSV"
          >
            <Download className="w-3.5 h-3.5 text-primary" />
            <span>Export CSV</span>
          </button>
        </div>

        {/* Filter Controls Bar */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[180px]">
            <Search className="w-3.5 h-3.5 text-text-secondary absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by asset name..."
              className="w-full pl-8 pr-3 py-1.5 bg-background border border-border rounded text-xs text-text placeholder:text-text-secondary focus:outline-none focus:border-primary"
            />
          </div>

          {/* Risk Level Filter */}
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value as RiskCategory)}
            className="bg-background border border-border rounded px-2.5 py-1.5 text-xs text-text focus:outline-none focus:border-primary"
          >
            <option value="all">{t.riskAll}</option>
            <option value="critical">{t.riskCritical}</option>
            <option value="high">{t.riskHigh}</option>
            <option value="medium">{t.riskMedium}</option>
            <option value="low">{t.riskLow}</option>
          </select>

          {/* Asset Type Filter */}
          <select
            value={assetTypeFilter}
            onChange={(e) => setAssetTypeFilter(e.target.value)}
            className="bg-background border border-border rounded px-2.5 py-1.5 text-xs text-text focus:outline-none focus:border-primary"
          >
            <option value="all">{t.typeAll}</option>
            <option value="hospital">{t.typeHospital}</option>
            <option value="shelter">{t.typeShelter}</option>
            <option value="bridge">{t.typeBridge}</option>
            <option value="substation">{t.typeSubstation}</option>
            <option value="school">{t.typeSchool}</option>
          </select>
        </div>
      </div>

      {/* Ledger Table */}
      <div className="flex-1 overflow-auto scrollbar-thin">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-text-secondary">
            Loading exposure data from engine...
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-xs text-text-secondary">
            No assets found matching the selected filter criteria.
          </div>
        ) : (
          <table className="w-full text-left text-xs border-collapse">
            <thead className="bg-surface-secondary/60 text-text font-semibold border-b border-border sticky top-0 z-10 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-3">Asset & Type</th>
                <th className="py-2.5 px-3">Elevation</th>
                <th className="py-2.5 px-3">24h Rain</th>
                <th className="py-2.5 px-3">Risk Level</th>
                <th className="py-2.5 px-3">Evidence / Drivers</th>
                <th className="py-2.5 px-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-surface">
              {items.map((item) => (
                <tr
                  key={item.asset_id}
                  className="hover:bg-surface-secondary/40 transition-colors group cursor-pointer"
                  onClick={() => {
                    focusMap(item.lat, item.lon, item.asset_id);
                  }}
                >
                  <td className="py-2.5 px-3">
                    <div className="font-semibold text-text group-hover:text-primary transition-colors">
                      {item.asset_name || "Unnamed Infrastructure"}
                    </div>
                    <div className="text-2xs text-text-secondary capitalize font-mono">
                      {item.asset_type.replace(/_/g, " ")}
                    </div>
                  </td>

                  <td className="py-2.5 px-3 tabular font-mono text-text" title={item.terrain_source || undefined}>
                    {item.terrain_elevation_m !== null
                      ? <>{item.terrain_elevation_m.toFixed(1)} m{item.terrain_source && <div className="text-[9px] text-text-secondary font-sans">{item.terrain_source}</div>}</>
                      : "—"}
                  </td>

                  <td className="py-2.5 px-3 tabular font-mono text-text">
                    {item.rainfall_accumulation_mm !== null
                      ? `${item.rainfall_accumulation_mm.toFixed(1)} mm`
                      : "—"}
                  </td>

                  <td className="py-2.5 px-3">
                    <span
                      className={`badge uppercase font-bold font-mono text-[10px] ${
                        item.risk_category === "critical"
                          ? "badge-critical"
                          : item.risk_category === "high"
                          ? "badge-high"
                          : item.risk_category === "medium"
                          ? "badge-medium"
                          : "badge-low"
                      }`}
                    >
                      {item.risk_category} ({item.risk_score.toFixed(2)})
                    </span>
                  </td>

                  <td className="py-2.5 px-3 text-2xs text-text-secondary max-w-xs truncate">
                    {(item.evidence || []).join(" • ")}
                  </td>

                  <td className="py-2.5 px-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedAssetId(item.asset_id);
                          setActivePanel("explain");
                        }}
                        className="px-2 py-1 text-2xs bg-surface border border-border rounded text-text hover:bg-surface-secondary flex items-center gap-1 transition-colors"
                        title="Explain risk factors"
                      >
                        <HelpCircle className="w-3 h-3 text-primary" />
                        <span>Explain</span>
                      </button>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          focusMap(item.lat, item.lon, item.asset_id);
                        }}
                        className="p-1 text-primary hover:bg-surface-secondary rounded transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
                        title="View on Map"
                        aria-label={`View ${item.asset_name || item.asset_type} on the 3D map`}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
