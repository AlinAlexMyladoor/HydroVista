"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { getTranslations } from "@/lib/translations";
import {
  Building2,
  RefreshCw,
  Search,
  Crosshair,
  Hospital,
  Zap,
  Tent,
  School,
  Flame,
  Radio,
  SlidersHorizontal,
  X,
} from "lucide-react";

export function InfrastructureView() {
  const { language, focusMap, setActiveRoute } = useStore();
  const t = getTranslations(language);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedRisk, setSelectedRisk] = useState<string>("all");
  const [focusError, setFocusError] = useState<string | null>(null);

  const { data: assetsData, isLoading: assetsLoading } = useQuery({
    queryKey: ["all-assets"],
    queryFn: () => api.assets.list({ page_size: 150 }),
    staleTime: 60_000,
  });

  const { data: exposureData } = useQuery({
    queryKey: ["all-exposure"],
    queryFn: () => api.exposure.list(),
    staleTime: 60_000,
  });

  const refreshMutation = useMutation({
    mutationFn: () => api.assets.refresh(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["all-assets"] });
      queryClient.invalidateQueries({ queryKey: ["all-exposure"] });
    },
  });

  // Map exposure scores by asset_id
  const exposureMap = new Map<string, any>();
  (exposureData?.items || []).forEach((item) => {
    exposureMap.set(item.asset_id, item);
  });

  const rawAssets: any[] = assetsData?.items ?? [];

  // Filtering
  const filteredAssets = rawAssets.filter((asset: any) => {
    const assetId = asset.osm_id || asset.id;
    const matchesSearch =
      asset.name?.toLowerCase().includes(search.toLowerCase()) ||
      asset.address?.toLowerCase().includes(search.toLowerCase());
    const matchesType = selectedType === "all" || asset.asset_type === selectedType;
    const exposure = exposureMap.get(assetId);
    const elevation = asset.elevation_m ?? exposure?.terrain_elevation_m;
    const risk =
      exposure?.risk_category?.toLowerCase() ||
      (elevation != null && elevation < 12 ? "critical" : elevation != null && elevation < 15 ? "high" : "low");
    const matchesRisk = selectedRisk === "all" || risk === selectedRisk;
    return matchesSearch && matchesType && matchesRisk;
  });

  const handleFocusMap = (e: React.MouseEvent | React.KeyboardEvent, asset: any) => {
    e.stopPropagation();
    const assetId = asset.osm_id || asset.id;
    const lat = Number(asset.lat);
    const lon = Number(asset.lon);
    const success = focusMap(lat, lon, assetId);
    if (success) {
      setFocusError(null);
      setActiveRoute("overview");
    } else {
      setFocusError("This asset has no valid map coordinates.");
    }
  };

  // Visual Iconography for Asset Types
  const renderTypeBadge = (type: string) => {
    const norm = (type || "").toLowerCase();
    let Icon = Building2;
    const label = type ? type.replace(/_/g, " ") : "Facility";
    let colorStyles = "bg-slate-100 text-slate-700 border-slate-200/80 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";
    let iconColor = "text-slate-500 dark:text-slate-400";

    if (norm.includes("hospital") || norm.includes("health") || norm.includes("clinic")) {
      Icon = Hospital;
      colorStyles = "bg-rose-50 text-rose-800 border-rose-200/80 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-900/60";
      iconColor = "text-rose-600 dark:text-rose-400";
    } else if (norm.includes("substation") || norm.includes("power") || norm.includes("electric")) {
      Icon = Zap;
      colorStyles = "bg-amber-50 text-amber-900 border-amber-200/80 dark:bg-amber-950/40 dark:text-amber-200 dark:border-amber-900/60";
      iconColor = "text-amber-600 dark:text-amber-400";
    } else if (norm.includes("shelter") || norm.includes("camp")) {
      Icon = Tent;
      colorStyles = "bg-sky-50 text-sky-800 border-sky-200/80 dark:bg-sky-950/40 dark:text-sky-200 dark:border-sky-900/60";
      iconColor = "text-sky-600 dark:text-sky-400";
    } else if (norm.includes("school") || norm.includes("college") || norm.includes("education")) {
      Icon = School;
      colorStyles = "bg-indigo-50 text-indigo-800 border-indigo-200/80 dark:bg-indigo-950/40 dark:text-indigo-200 dark:border-indigo-900/60";
      iconColor = "text-indigo-600 dark:text-indigo-400";
    } else if (norm.includes("bridge") || norm.includes("crossing")) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-teal-50 text-teal-800 border-teal-200/80 dark:bg-teal-950/40 dark:text-teal-200 dark:border-teal-900/60 shadow-2xs">
          <svg className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 19V6" />
            <path d="M20 19V6" />
            <path d="M4 11h16" />
            <path d="M4 15h16" />
            <path d="M4 15c4 3 12 3 16 0" />
          </svg>
          <span className="capitalize">{label}</span>
        </span>
      );
    } else if (norm.includes("fire") || norm.includes("emergency") || norm.includes("rescue")) {
      Icon = Flame;
      colorStyles = "bg-orange-50 text-orange-900 border-orange-200/80 dark:bg-orange-950/40 dark:text-orange-200 dark:border-orange-900/60";
      iconColor = "text-orange-600 dark:text-orange-400";
    } else if (norm.includes("telecom") || norm.includes("communication") || norm.includes("radio")) {
      Icon = Radio;
      colorStyles = "bg-purple-50 text-purple-900 border-purple-200/80 dark:bg-purple-950/40 dark:text-purple-200 dark:border-purple-900/60";
      iconColor = "text-purple-600 dark:text-purple-400";
    }

    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border shadow-2xs ${colorStyles}`}>
        <Icon className={`h-3.5 w-3.5 shrink-0 ${iconColor}`} aria-hidden="true" />
        <span className="capitalize">{label}</span>
      </span>
    );
  };

  // Threat Badges with standardized disaster management semantic colors
  const getRiskBadge = (asset: any) => {
    const assetId = asset.osm_id || asset.id;
    const exp = exposureMap.get(assetId);
    const elevation = asset.elevation_m ?? exp?.terrain_elevation_m;
    const risk =
      exp?.risk_category?.toLowerCase() ||
      (elevation != null && elevation < 12 ? "critical" : elevation != null && elevation < 15 ? "high" : "low");

    if (risk === "critical") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider uppercase bg-[#881337] text-white shadow-xs dark:bg-rose-950 dark:text-rose-100 dark:border dark:border-rose-700">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-200"></span>
          </span>
          CRITICAL
        </span>
      );
    }
    if (risk === "high") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-red-100 text-red-700 border border-red-200/80 dark:bg-red-950/60 dark:text-red-300 dark:border-red-900/60 shadow-2xs">
          <span className="h-1.5 w-1.5 rounded-full bg-red-600 dark:bg-red-500"></span>
          HIGH
        </span>
      );
    }
    if (risk === "medium") {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-amber-100 text-amber-800 border border-amber-200/80 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900/60 shadow-2xs">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-600 dark:bg-amber-500"></span>
          MEDIUM
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-emerald-100 text-emerald-800 border border-emerald-200/80 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-900/60 shadow-2xs">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 dark:bg-emerald-500"></span>
        LOW
      </span>
    );
  };

  return (
    <div className="flex-1 w-full h-[calc(100vh-4rem)] max-h-[calc(100vh-4rem)] overflow-hidden flex flex-col bg-slate-50 dark:bg-[#070b12] p-4 sm:p-6 text-[#1E292B] dark:text-slate-100">
      {/* Centered Command Center Viewport Lock Container */}
      <div className="max-w-7xl mx-auto w-full h-[calc(100vh-6rem)] flex flex-col min-h-0">

        {/* Error notification if asset has invalid coords */}
        {focusError && (
          <div className="shrink-0 mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200 flex items-center justify-between" role="alert">
            <span>{focusError}</span>
            <button type="button" onClick={() => setFocusError(null)} className="text-amber-700 hover:text-amber-900 dark:text-amber-300">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Floating Glass Main Container: Holds Toolbar + Table, No Outer Borders, Wide Drop Shadow */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg shadow-slate-200/50 dark:shadow-slate-950/60 overflow-hidden flex flex-col flex-1 min-h-0 border-0">
          
          {/* Pinned Toolbar: Search, Filters & Softened Sync */}
          <div className="shrink-0 px-5 py-3.5 border-b border-slate-100 dark:border-slate-800/80 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 bg-white dark:bg-slate-900">
            <div className="flex flex-1 flex-col sm:flex-row items-center gap-2.5">
              {/* Search Input */}
              <div className="relative w-full sm:w-80">
                <input
                  type="text"
                  placeholder={language !== "ml" ? "Search facility, panchayat, road..." : "തിരയുക..."}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-8 py-2 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-xs placeholder-slate-400 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600 text-slate-800 dark:text-slate-100 transition-all"
                />
                <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Type Filter */}
              <div className="w-full sm:w-auto">
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value)}
                  className="w-full sm:w-48 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-xs px-3 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600 cursor-pointer transition-all"
                >
                  <option value="all">{language !== "ml" ? "All Facility Types" : "എല്ലാ വിഭാഗങ്ങളും"}</option>
                  <option value="hospital">{language !== "ml" ? "Hospitals & Health Centers" : "ആശുപത്രികൾ"}</option>
                  <option value="shelter">{language !== "ml" ? "Relief Shelters & Camps" : "ക്യാമ്പുകൾ"}</option>
                  <option value="bridge">{language !== "ml" ? "Bridges & Crossings" : "പാലങ്ങൾ"}</option>
                  <option value="substation">{language !== "ml" ? "Power Substations" : "വൈദ്യുതി നിലയങ്ങൾ"}</option>
                  <option value="school">{language !== "ml" ? "Schools & Colleges" : "സ്കൂളുകൾ"}</option>
                </select>
              </div>

              {/* Risk Filter */}
              <div className="w-full sm:w-auto">
                <select
                  value={selectedRisk}
                  onChange={(e) => setSelectedRisk(e.target.value)}
                  className="w-full sm:w-40 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-xs px-3 py-2 text-slate-800 dark:text-slate-100 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600 cursor-pointer transition-all"
                >
                  <option value="all">{language !== "ml" ? "All Risk Levels" : "എല്ലാ അപായ നിലകളും"}</option>
                  <option value="critical">{language !== "ml" ? "Critical Risk" : "തീവ്ര അപായം"}</option>
                  <option value="high">{language !== "ml" ? "High Risk" : "ഉയർന്ന അപായം"}</option>
                  <option value="medium">{language !== "ml" ? "Medium Risk" : "മിതമായ അപായം"}</option>
                  <option value="low">{language !== "ml" ? "Low Risk" : "കുറഞ്ഞ അപായം"}</option>
                </select>
              </div>

              {/* Matching Count Badge */}
              <span className="hidden xl:inline-flex items-center px-2.5 py-1 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                {filteredAssets.length} {language !== "ml" ? "assets" : "സ്ഥാപനങ്ങൾ"}
              </span>
            </div>

            {/* Softened Secondary Outline Sync Button */}
            <button
              type="button"
              onClick={() => refreshMutation.mutate()}
              disabled={refreshMutation.isPending}
              className="self-start sm:self-auto px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-300 dark:border-slate-700 text-slate-700 dark:bg-slate-800/80 dark:text-slate-200 dark:hover:bg-slate-800 text-xs font-semibold rounded-lg shadow-2xs transition-all flex items-center gap-2 shrink-0 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-slate-500 dark:text-slate-400 ${refreshMutation.isPending ? "animate-spin" : ""}`} aria-hidden="true" />
              <span>
                {refreshMutation.isPending
                  ? (language !== "ml" ? "Syncing OpenStreetMap..." : "വിവരങ്ങൾ പുതുക്കുന്നു...")
                  : (language !== "ml" ? "Sync OpenStreetMap" : "വിവരങ്ങൾ പുതുക്കുക")}
              </span>
            </button>
          </div>

          {/* Table Container */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <table className="w-full text-left border-collapse text-xs">
              {/* Pinned Sticky Header Row */}
              <thead className="sticky top-0 bg-white dark:bg-slate-900 z-10 border-b border-slate-100 dark:border-slate-800 shadow-2xs">
                <tr className="text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-5">Facility / Infrastructure</th>
                  <th className="py-3.5 px-4">Type</th>
                  <th className="py-3.5 px-4">Elevation</th>
                  <th className="py-3.5 px-4">Vulnerability Tier</th>
                  <th className="py-3.5 px-5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
                {filteredAssets.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-16 text-center text-slate-400 dark:text-slate-500">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <Building2 className="h-8 w-8 text-slate-300 dark:text-slate-600" />
                        <span className="text-sm font-medium">
                          {language !== "ml" ? "No infrastructure matching filter criteria." : "വിവരങ്ങൾ ലഭ്യമല്ല."}
                        </span>
                        <span className="text-xs text-slate-400">
                          {language !== "ml" ? "Try adjusting your search query or reset the risk/type filters." : "തിരച്ചിൽ മാറ്റങ്ങൾ വരുത്തുക."}
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredAssets.map((asset: any, index: number) => {
                    const assetId = asset.osm_id || asset.id || `asset-${index}`;
                    const exp = exposureMap.get(assetId);
                    const elevation = asset.elevation_m ?? exp?.terrain_elevation_m;
                    return (
                      <tr
                        key={assetId}
                        className="cursor-pointer even:bg-slate-50/70 dark:even:bg-slate-800/35 hover:bg-slate-100/90 dark:hover:bg-slate-800/90 transition-colors group focus-visible:outline-2 focus-visible:outline-teal-600"
                        role="button"
                        tabIndex={0}
                        aria-label={`Show ${asset.name || "asset"} on 3D map`}
                        onClick={(e) => handleFocusMap(e, asset)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            handleFocusMap(event, asset);
                          }
                        }}
                      >
                        {/* Facility / Infrastructure Name & Location */}
                        <td className="py-3.5 px-5">
                          <div className="font-semibold text-slate-900 dark:text-slate-100 group-hover:text-teal-700 dark:group-hover:text-teal-400 transition-colors">
                            {asset.name}
                          </div>
                          {asset.address && (
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-md mt-0.5">
                              {asset.address}
                            </div>
                          )}
                        </td>

                        {/* Type with Minimalist SVG Icon */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {renderTypeBadge(asset.asset_type)}
                        </td>

                        {/* Elevation */}
                        <td className="py-3.5 px-4 font-mono font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap" title={exp?.terrain_source || undefined}>
                          {elevation != null ? (
                            <span className="inline-flex items-center gap-1">
                              <span>{Math.round(Number(elevation))}</span>
                              <span className="text-[10px] text-slate-400 font-sans">m MSL</span>
                            </span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* Vulnerability Tier Badge */}
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          {getRiskBadge(asset)}
                        </td>

                        {/* Action: Focus Map with Crosshair Icon */}
                        <td className="py-3.5 px-5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => handleFocusMap(e, asset)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-teal-700 bg-teal-50 hover:bg-teal-600 hover:text-white border border-teal-200/80 dark:bg-teal-950/50 dark:text-teal-300 dark:border-teal-800 dark:hover:bg-teal-600 dark:hover:text-white transition-all shadow-xs cursor-pointer group-hover:border-teal-300"
                            title={language !== "ml" ? "Fly to facility on 3D Command Map" : "ഭൂപടത്തിൽ കാണിക്കുക"}
                            aria-label={`Focus ${asset.name} on map`}
                          >
                            <Crosshair className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            <span>{language !== "ml" ? "Focus Map" : "ഭൂപടത്തിൽ"}</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}

