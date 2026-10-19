"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Asset } from "@/lib/api";
import { getTranslations } from "@/lib/translations";
import { Building2, RefreshCw, Search } from "lucide-react";

export function InfrastructureView() {
  const { language, focusMap } = useStore();
  const t = getTranslations(language);
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedRisk, setSelectedRisk] = useState<string>("all");
  const [focusError, setFocusError] = useState<string | null>(null);

  const { data: assetsData, isLoading: assetsLoading } = useQuery({
    queryKey: ["all-assets"],
    queryFn: () => api.assets.list({ page_size: 100 }),
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

  // No fabricated fallback: if the backend has no assets, the list is empty and the UI says so.
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
    const risk = exposure?.risk_category?.toLowerCase() || (elevation != null && elevation < 12 ? "critical" : elevation != null && elevation < 15 ? "high" : "low");
    const matchesRisk = selectedRisk === "all" || risk === selectedRisk;
    return matchesSearch && matchesType && matchesRisk;
  });

  const handleSelectAsset = (assetId: string, lat: number, lon: number) => {
    setFocusError(focusMap(lat, lon, assetId) ? null : "This asset has no valid map coordinates.");
  };

  const getRiskBadge = (asset: any) => {
    const assetId = asset.osm_id || asset.id;
    const exp = exposureMap.get(assetId);
    const elevation = asset.elevation_m ?? exp?.terrain_elevation_m;
    const risk = exp?.risk_category?.toLowerCase() || (elevation != null && elevation < 12 ? "critical" : elevation != null && elevation < 15 ? "high" : "low");
    if (risk === "critical") return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#FEE2E2] text-[#DC2626]">CRITICAL</span>;
    if (risk === "high") return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#FFEDD5] text-[#EA580C]">HIGH</span>;
    if (risk === "medium") return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#FEF3C7] text-[#D97706]">MEDIUM</span>;
    return <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#D1FAE5] text-[#059669]">LOW</span>;
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-[#F7F8F4] p-6 text-[#26332F]">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-[#E2E8F0] gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-teal-700" aria-hidden="true" />
            <h1 className="text-xl font-bold text-[#1E292B]">
              {language !== "ml" ? "Infrastructure risk" : "അടിസ്ഥാന സൗകര്യ അപകടസാധ്യത"}
            </h1>
          </div>
        </div>

        <button
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
          className="self-start sm:self-auto px-3.5 py-2 bg-white hover:bg-[#F1F5F9] border border-[#CBD5E1] text-[#26332F] text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshMutation.isPending ? "animate-spin" : ""}`} aria-hidden="true" />
          <span>
            {refreshMutation.isPending
              ? (language !== "ml" ? "Syncing OpenStreetMap..." : "വിവരങ്ങൾ പുതുക്കുന്നു...")
              : (language !== "ml" ? "Refresh from OpenStreetMap" : "വിവരങ്ങൾ പുതുക്കുക")}
          </span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 my-6">
        <div className="md:col-span-5 relative">
          <input
            type="text"
            placeholder={language !== "ml" ? "Search asset by name, panchayat or locality..." : "തിരയുക..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-xs placeholder-[#94A3B8] focus:outline-none focus:border-[#0D9488]"
          />
          <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-[#94A3B8]" aria-hidden="true" />
        </div>

        <div className="md:col-span-4 flex gap-2">
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="w-full bg-white border border-[#E2E8F0] rounded-lg text-xs px-2.5 py-2 text-[#26332F] focus:outline-none focus:border-[#0D9488]"
          >
            <option value="all">{language !== "ml" ? "All Facility Types" : "എല്ലാ വിഭാഗങ്ങളും"}</option>
            <option value="hospital">{language !== "ml" ? "Hospitals & Health Centers" : "ആശുപത്രികൾ"}</option>
            <option value="shelter">{language !== "ml" ? "Relief Shelters & Camps" : "ക്യാമ്പുകൾ"}</option>
            <option value="bridge">{language !== "ml" ? "Bridges & River Crossings" : "പാലങ്ങൾ"}</option>
            <option value="substation">{language !== "ml" ? "Power Substations" : "വൈദ്യുതി നിലയങ്ങൾ"}</option>
            <option value="school">{language !== "ml" ? "Schools" : "സ്കൂളുകൾ"}</option>
          </select>
        </div>

        <div className="md:col-span-3 flex gap-2">
          <select
            value={selectedRisk}
            onChange={(e) => setSelectedRisk(e.target.value)}
            className="w-full bg-white border border-[#E2E8F0] rounded-lg text-xs px-2.5 py-2 text-[#26332F] focus:outline-none focus:border-[#0D9488]"
          >
            <option value="all">{language !== "ml" ? "All Risk Levels" : "എല്ലാ അപായ നിലകളും"}</option>
            <option value="critical">{language !== "ml" ? "Critical Risk" : "തീവ്ര അപായം"}</option>
            <option value="high">{language !== "ml" ? "High Risk" : "ഉയർന്ന അപായം"}</option>
            <option value="medium">{language !== "ml" ? "Medium Risk" : "മിതമായ അപായം"}</option>
            <option value="low">{language !== "ml" ? "Low Risk" : "കുറഞ്ഞ അപായം"}</option>
          </select>
        </div>
      </div>

      {/* Asset Table */}
      {focusError && <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200" role="alert">{focusError}</div>}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#687770] font-semibold">
                <th className="py-3 px-4">Facility / Infrastructure</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Elevation</th>
                <th className="py-3 px-4">Vulnerability Tier</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {filteredAssets.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-10 text-center text-[#94A3B8]">
                    {language !== "ml" ? "No infrastructure matching filter criteria." : "വിവരങ്ങൾ ലഭ്യമല്ല."}
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
                      className="cursor-pointer hover:bg-[#F8FAFC] transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-teal-600"
                      role="link"
                      tabIndex={0}
                      aria-label={`Show ${asset.name || "asset"} on 3D map`}
                      onClick={() => handleSelectAsset(assetId, Number(asset.lat), Number(asset.lon))}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          handleSelectAsset(assetId, Number(asset.lat), Number(asset.lon));
                        }
                      }}
                    >
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[#1E292B]">{asset.name}</div>
                        {asset.address && <div className="text-[11px] text-[#687770]">{asset.address}</div>}
                      </td>
                      <td className="py-3 px-4">
                        <span className="capitalize px-2 py-0.5 rounded text-[11px] font-medium bg-[#F1F5F9] text-[#475569]">
                          {asset.asset_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[#1E292B]" title={exp?.terrain_source || undefined}>
                        {elevation != null ? `${Math.round(Number(elevation))} m` : "—"}
                      </td>
                      <td className="py-3 px-4">{getRiskBadge(asset)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
