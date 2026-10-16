"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type Asset } from "@/lib/api";
import { translations } from "@/lib/translations";

export function InfrastructureView() {
  const { language, setSelectedAssetId, setActiveRoute } = useStore();
  const t = translations[language];
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedType, setSelectedType] = useState<string>("all");
  const [selectedRisk, setSelectedRisk] = useState<string>("all");

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

  const handleSelectAsset = (assetId: string) => {
    setSelectedAssetId(assetId);
    setActiveRoute("overview");
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
            <span className="text-xl">🏥</span>
            <h1 className="text-xl font-bold text-[#1E292B]">
              {language === "en" ? "Critical Lifeline & Infrastructure Registry" : "അത്യാവശ്യ സേവനങ്ങളും അടിസ്ഥാന സൗകര്യങ്ങളും"}
            </h1>
          </div>
          <p className="text-xs text-[#687770] mt-1">
            {language === "en"
              ? "Geo-referenced hospitals, relief camps, electrical substations, and bridges monitored for inundation cutoff."
              : "ആശുപത്രികൾ, ദുരിതാശ്വാസ ക്യാമ്പുകൾ, സബ് സ്റ്റേഷനുകൾ, പാലങ്ങൾ എന്നിവയുടെ വിവരങ്ങൾ."}
          </p>
        </div>

        <button
          onClick={() => refreshMutation.mutate()}
          disabled={refreshMutation.isPending}
          className="self-start sm:self-auto px-3.5 py-2 bg-white hover:bg-[#F1F5F9] border border-[#CBD5E1] text-[#26332F] text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
        >
          <span className={refreshMutation.isPending ? "animate-spin" : ""}>🔄</span>
          <span>
            {refreshMutation.isPending
              ? (language === "en" ? "Syncing OpenStreetMap..." : "വിവരങ്ങൾ പുതുക്കുന്നു...")
              : (language === "en" ? "Refresh from OpenStreetMap" : "വിവരങ്ങൾ പുതുക്കുക")}
          </span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 my-6">
        <div className="md:col-span-5 relative">
          <input
            type="text"
            placeholder={language === "en" ? "Search asset by name, panchayat or locality..." : "തിരയുക..."}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white border border-[#E2E8F0] rounded-lg text-xs placeholder-[#94A3B8] focus:outline-none focus:border-[#0D9488]"
          />
          <span className="absolute left-3 top-2.5 text-xs text-[#94A3B8]">🔍</span>
        </div>

        <div className="md:col-span-4 flex gap-2">
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value)}
            className="w-full bg-white border border-[#E2E8F0] rounded-lg text-xs px-2.5 py-2 text-[#26332F] focus:outline-none focus:border-[#0D9488]"
          >
            <option value="all">{language === "en" ? "All Facility Types" : "എല്ലാ വിഭാഗങ്ങളും"}</option>
            <option value="hospital">{language === "en" ? "Hospitals & Health Centers" : "ആശുപത്രികൾ"}</option>
            <option value="shelter">{language === "en" ? "Relief Shelters & Camps" : "ക്യാമ്പുകൾ"}</option>
            <option value="bridge">{language === "en" ? "Bridges & River Crossings" : "പാലങ്ങൾ"}</option>
            <option value="substation">{language === "en" ? "Power Substations" : "വൈദ്യുതി നിലയങ്ങൾ"}</option>
            <option value="school">{language === "en" ? "Schools" : "സ്കൂളുകൾ"}</option>
          </select>
        </div>

        <div className="md:col-span-3 flex gap-2">
          <select
            value={selectedRisk}
            onChange={(e) => setSelectedRisk(e.target.value)}
            className="w-full bg-white border border-[#E2E8F0] rounded-lg text-xs px-2.5 py-2 text-[#26332F] focus:outline-none focus:border-[#0D9488]"
          >
            <option value="all">{language === "en" ? "All Risk Levels" : "എല്ലാ അപായ നിലകളും"}</option>
            <option value="critical">{language === "en" ? "Critical Risk" : "തീവ്ര അപായം"}</option>
            <option value="high">{language === "en" ? "High Risk" : "ഉയർന്ന അപായം"}</option>
            <option value="medium">{language === "en" ? "Medium Risk" : "മിതമായ അപായം"}</option>
            <option value="low">{language === "en" ? "Low Risk" : "കുറഞ്ഞ അപായം"}</option>
          </select>
        </div>
      </div>

      {/* Asset Table */}
      <div className="bg-white border border-[#E2E8F0] rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#F8FAFC] border-b border-[#E2E8F0] text-[#687770] font-semibold">
                <th className="py-3 px-4">Facility / Infrastructure</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Elevation (MSL)</th>
                <th className="py-3 px-4">HAND Metric</th>
                <th className="py-3 px-4">Vulnerability Tier</th>
                <th className="py-3 px-4">Isolation Estimate</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F1F5F9]">
              {filteredAssets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-10 text-center text-[#94A3B8]">
                    {language === "en" ? "No infrastructure matching filter criteria." : "വിവരങ്ങൾ ലഭ്യമല്ല."}
                  </td>
                </tr>
              ) : (
                filteredAssets.map((asset: any, index: number) => {
                  const assetId = asset.osm_id || asset.id || `asset-${index}`;
                  const exp = exposureMap.get(assetId);
                  const elevation = asset.elevation_m ?? exp?.terrain_elevation_m;
                  const isLow = elevation != null && elevation < 12;
                  return (
                    <tr key={assetId} className="hover:bg-[#F8FAFC] transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[#1E292B]">{asset.name}</div>
                        <div className="text-[11px] text-[#687770]">{asset.address || "Chalakudy Basin"}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="capitalize px-2 py-0.5 rounded text-[11px] font-medium bg-[#F1F5F9] text-[#475569]">
                          {asset.asset_type}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-[#1E292B]">
                        {elevation != null ? `${Number(elevation).toFixed(1)} m` : "—"}
                      </td>
                      <td className="py-3 px-4 font-mono text-[#687770]">
                        {elevation != null ? `+${(Number(elevation) - 8.2).toFixed(1)} m` : "—"}
                      </td>
                      <td className="py-3 px-4">{getRiskBadge(asset)}</td>
                      <td className="py-3 px-4">
                        {isLow ? (
                          <span className="text-[#DC2626] font-semibold flex items-center gap-1">
                            <span>⚠️</span> 3.5 hrs (Cutoff)
                          </span>
                        ) : (
                          <span className="text-[#059669] font-medium">Safe access</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => handleSelectAsset(assetId)}
                          className="px-2.5 py-1 bg-[#26332F] hover:bg-[#1E292B] text-white rounded text-[11px] font-medium shadow-xs transition-colors"
                        >
                          {language === "en" ? "Map View →" : "മാപ്പ് →"}
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
  );
}
