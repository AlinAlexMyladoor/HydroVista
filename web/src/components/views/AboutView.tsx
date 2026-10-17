"use client";

import React from "react";
import { useStore } from "@/lib/store";
import { translations } from "@/lib/translations";

export function AboutView() {
  const { language } = useStore();
  const t = translations[language];

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-[#F7F8F4] p-6 text-[#26332F]">
      {/* Title */}
      <div className="pb-6 border-b border-[#E2E8F0] max-w-4xl mx-auto w-full">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#26332F] text-white flex items-center justify-center font-bold text-lg shadow-sm">
            HV
          </div>
          <div>
            <h1 className="text-xl font-bold text-[#1E292B]">
              HydroVista — River Basin Intelligence for Safer Communities
            </h1>
            <p className="text-xs text-[#687770] mt-0.5">
              {language === "en"
                ? "Next-generation 3D geospatial intelligence, ensemble meteorology, and lifeline isolation forecasting."
                : "ചാലക്കുടി നദീതട സംരക്ഷണത്തിനും മുൻകരുതലുകൾക്കുമുള്ള ആധുനിക സാങ്കേതിക സംവിധാനം."}
            </p>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto w-full py-6 space-y-6">
        {/* Basin Profile Card */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-[#1E292B] uppercase tracking-wider flex items-center gap-2">
            <span>🌊</span> Chalakudy River Basin Context
          </h2>
          <p className="text-xs text-[#475569] leading-relaxed">
            The Chalakudy River originates in the Anamalai Hills of the Western Ghats at an elevation of over 2,000 meters and travels approximately 144 kilometers through Thrissur and Ernakulam districts before joining the Periyar River near Puthenvelikkara and draining into the Arabian Sea.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
              <div className="text-[10px] text-[#687770] uppercase font-bold">Catchment Area</div>
              <div className="text-lg font-bold text-[#1E292B] mt-0.5">1,704 km²</div>
              <div className="text-[10px] text-[#687770]">Spanning steep ghats to coastal plains</div>
            </div>
            <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
              <div className="text-[10px] text-[#687770] uppercase font-bold">Key Reservoirs</div>
              <div className="text-lg font-bold text-[#1E292B] mt-0.5">Sholayar & Poringal</div>
              <div className="text-[10px] text-[#687770]">Cascading hydropower & flood storage</div>
            </div>
            <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0]">
              <div className="text-[10px] text-[#687770] uppercase font-bold">Monsoon Vulnerability</div>
              <div className="text-lg font-bold text-[#DC2626] mt-0.5">High Flash Spate</div>
              <div className="text-[10px] text-[#687770]">Severe historical deluges (2018, 2019)</div>
            </div>
          </div>
        </div>

        {/* Methodology & Architecture */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-[#1E292B] uppercase tracking-wider flex items-center gap-2">
            <span>🔬</span> Scientific & Computational Pipeline
          </h2>

          <div className="space-y-3 text-xs text-[#475569]">
            <div className="flex gap-3 items-start">
              <span className="w-6 h-6 rounded-full bg-[#E0F2FE] text-[#0284C7] font-bold text-xs flex items-center justify-center shrink-0">1</span>
              <div>
                <strong className="text-[#1E292B]">High-Resolution 3D Terrain & HAND Hydrology:</strong>
                <p className="mt-0.5 text-[11px] leading-relaxed">
                  Digital Elevation Models (SRTM/NASADEM) are processed to calculate Height Above Nearest Drainage (HAND), slope gradient, and flow accumulation pathways along every tributary.
                </p>
              </div>
            </div>

            <div className="flex gap-3 items-start">
              <span className="w-6 h-6 rounded-full bg-[#E0F2FE] text-[#0284C7] font-bold text-xs flex items-center justify-center shrink-0">2</span>
              <div>
                <strong className="text-[#1E292B]">Ensemble Atmospheric Forcing:</strong>
                <p className="mt-0.5 text-[11px] leading-relaxed">
                  Multi-model weather telemetry from ECMWF and Open-Meteo provides hourly precipitation, convective probability, and catchment-wide 24h, 72h, and 7-day quantitative precipitation forecasts.
                </p>
              </div>
            </div>

            <div className="flex gap-3 items-start">
              <span className="w-6 h-6 rounded-full bg-[#E0F2FE] text-[#0284C7] font-bold text-xs flex items-center justify-center shrink-0">3</span>
              <div>
                <strong className="text-[#1E292B]">Calibrated ML Inundation & Isolation Engine:</strong>
                <p className="mt-0.5 text-[11px] leading-relaxed">
                  Gradient-boosted decision trees (LightGBM/XGBoost) calculate asset-level vulnerability, route cutoffs, and road segment submersion hours before water overtopping occurs.
                </p>
              </div>
            </div>

            <div className="flex gap-3 items-start">
              <span className="w-6 h-6 rounded-full bg-[#E0F2FE] text-[#0284C7] font-bold text-xs flex items-center justify-center shrink-0">4</span>
              <div>
                <strong className="text-[#1E292B]">Ground-Truth Verification:</strong>
                <p className="mt-0.5 text-[11px] leading-relaxed">
                  Field observations from local panchayats and Copernicus Sentinel-1 SAR flood extent masks provide continuous empirical calibration.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Open Data Sources & Attribution */}
        <div className="bg-white border border-[#E2E8F0] rounded-xl p-6 shadow-xs space-y-3">
          <h2 className="text-sm font-bold text-[#1E292B] uppercase tracking-wider flex items-center gap-2">
            <span>🌐</span> Data Sources & Attributions
          </h2>
          <ul className="text-xs text-[#475569] space-y-2 list-disc list-inside leading-relaxed">
            <li><strong>Map & Geospatial Features:</strong> MapLibre GL JS, OpenStreetMap contributors (ODbL), MapTiler Cloud terrain-RGB.</li>
            <li><strong>Atmospheric Telemetry:</strong> ECMWF IFS & Open-Meteo API.</li>
            <li><strong>Digital Elevation Model:</strong> NASA SRTM 30m & Copernicus DEM.</li>
            <li><strong>Satellite Radar:</strong> European Space Agency (ESA) Copernicus Sentinel-1 SAR.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
