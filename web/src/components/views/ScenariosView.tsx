"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/store";
import { api, type ScenarioResponse, APIError } from "@/lib/api";
import { getTranslations } from "@/lib/translations";
import { CloudRain, MapPinned, RefreshCw, SlidersHorizontal, Waves } from "lucide-react";
import { useQuery } from "@tanstack/react-query";

export function ScenariosView() {
  const { language, setActiveRoute, setActiveScenario } = useStore();
  const t = getTranslations(language);

  const [rainfallMm, setRainfallMm] = useState<number>(75);
  const [durationHours, setDurationHours] = useState<number>(24);
  const [saturation, setSaturation] = useState<"dry" | "normal" | "saturated">("normal");
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [scenarioResult, setScenarioResult] = useState<ScenarioResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const { data: baseline, isLoading: baselineLoading } = useQuery({
    queryKey: ["scenario-baseline-exposure"],
    queryFn: () => api.exposure.list({ page: 1, page_size: 200 }),
    staleTime: 60_000,
  });
  const baselineAssets = baseline?.items ?? [];
  const mapPoints = scenarioResult?.scenario_rankings?.length ? scenarioResult.scenario_rankings : baselineAssets;
  const elevatedIds = new Set(scenarioResult?.escalated_assets?.map((asset) => asset.asset_id) ?? []);
  const baselineSevere = baselineAssets.filter((asset) => asset.risk_category === "high" || asset.risk_category === "critical").length;
  const rainPercent = Math.max(0, Math.min(100, rainfallMm / 300 * 100));

  const presets = [
    {
      label: language !== "ml" ? "Standard Monsoon Spate" : "സാധാരണ കാലവർഷം",
      desc: "+35mm / 24h",
      rain: 35,
      hours: 24,
      sat: "normal" as const,
    },
    {
      label: language !== "ml" ? "Severe Depressional Surge" : "തീവ്ര ന്യൂനമർദ്ദം",
      desc: "+110mm / 24h",
      rain: 110,
      hours: 24,
      sat: "saturated" as const,
    },
    {
      label: language !== "ml" ? "August 2018 Deluge Replay" : "2018 മഹാപ്രളയം",
      desc: "+240mm / 48h (Saturated)",
      rain: 240,
      hours: 48,
      sat: "saturated" as const,
    },
    {
      label: language !== "ml" ? "Dam Release + Cloudburst" : "ഡാം തുറന്നുവിടൽ + പെരുമഴ",
      desc: "+180mm / 12h",
      rain: 180,
      hours: 12,
      sat: "saturated" as const,
    },
  ];

  const handleRun = async () => {
    setIsRunning(true);
    setErrorMsg(null);
    try {
      const res = await api.scenario.create({
        rainfall_mm: rainfallMm,
        duration_hours: durationHours,
        forecast_hour: 24,
        closure_threshold: 0.3,
      });
      setScenarioResult(res);
      setActiveScenario(res);
    } catch (err) {
      setErrorMsg(err instanceof APIError ? err.detail : (err as Error).message);
    } finally {
      setIsRunning(false);
    }
  };

  const handleInspectOnMap = () => {
    const scenario = scenarioResult;
    setActiveRoute("map");
    const points = scenario?.escalated_assets?.filter((asset) => Number.isFinite(asset.lat) && Number.isFinite(asset.lon)) ?? [];
    if (points.length) {
      const padding = 0.025;
      useStore.getState().focusMapBounds(
        Math.max(-180, Math.min(...points.map((point) => point.lon!)) - padding),
        Math.max(-90, Math.min(...points.map((point) => point.lat!)) - padding),
        Math.min(180, Math.max(...points.map((point) => point.lon!)) + padding),
        Math.min(90, Math.max(...points.map((point) => point.lat!)) + padding),
      );
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-[#F7F8F4] p-6 text-[#26332F]">
      {/* Title */}
      <div className="pb-6 border-b border-[#E2E8F0]">
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-5 w-5 text-teal-700" aria-hidden="true" />
          <h1 className="text-xl font-bold text-[#1E292B]">
            {t.rainDialTitle}
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 my-6">
        {/* Controls Column */}
        <div className="lg:col-span-6 space-y-5">
          {/* Preset Buttons */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs">
            <h3 className="text-xs font-bold text-[#1E292B] uppercase tracking-wider mb-3">
              {language !== "ml" ? "Historical & Extreme Stress Presets" : "പ്രത്യേക സാഹചര്യങ്ങൾ"}
            </h3>
            <div className="grid grid-cols-2 gap-2.5">
              {presets.map((p, idx) => (
                <button
                  key={idx}
                  onClick={() => {
                    setRainfallMm(p.rain);
                    setDurationHours(p.hours);
                    setSaturation(p.sat);
                  }}
                  className={`text-left p-3 rounded-lg border text-xs transition-all ${
                    rainfallMm === p.rain && durationHours === p.hours
                      ? "border-[#0D9488] bg-[#F0FDFA] text-[#0D9488] font-bold shadow-xs"
                      : "border-[#E2E8F0] hover:border-[#CBD5E1] bg-white text-[#26332F]"
                  }`}
                >
                  <div className="font-semibold">{p.label}</div>
                  <div className="text-[11px] text-[#687770] mt-0.5">{p.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Dial Parameter Sliders */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs space-y-4">
            <h3 className="text-xs font-bold text-[#1E292B] uppercase tracking-wider">
              {language !== "ml" ? "Custom Basin Parameters" : "സ്വയം ക്രമീകരിക്കാവുന്ന അളവുകൾ"}
            </h3>

            {/* Rainfall Slider */}
            <div>
              <div className="flex justify-between items-center text-xs mb-1.5">
                <span className="font-medium text-[#1E292B]">
                  {t.addedRainfall}:
                </span>
                <span className="font-mono font-bold text-[#0D9488] text-sm">{rainfallMm} mm</span>
              </div>
              <input
                type="range"
                min="0"
                max="300"
                step="5"
                value={rainfallMm}
                onChange={(e) => setRainfallMm(Number(e.target.value))}
                style={{ background: `linear-gradient(to right, #16a34a 0%, #eab308 ${Math.max(0, rainPercent - 20)}%, #dc2626 ${rainPercent}%, #e2e8f0 ${rainPercent}%, #e2e8f0 100%)` }}
                className="scenario-range w-full cursor-pointer accent-teal-600 dark:accent-teal-500"
              />
              <div className="flex justify-between text-[10px] text-[#94A3B8] mt-1 font-mono">
                <span>0 mm</span>
                <span>100 mm (Warning)</span>
                <span>200 mm (Danger)</span>
                <span>300 mm (Catastrophic)</span>
              </div>
            </div>

            {/* Duration Slider */}
            <div>
              <div className="flex justify-between items-center text-xs mb-1.5">
                <span className="font-medium text-[#1E292B]">
                  {t.stormDuration}:
                </span>
                <span className="font-mono font-bold text-[#0D9488] text-sm">{durationHours} hrs</span>
              </div>
              <input
                type="range"
                min="6"
                max="72"
                step="6"
                value={durationHours}
                onChange={(e) => setDurationHours(Number(e.target.value))}
                style={{ background: `linear-gradient(to right, #16a34a 0%, #eab308 ${Math.max(0, (durationHours - 6) / 66 * 80)}%, #dc2626 ${Math.max(0, (durationHours - 6) / 66 * 100)}%, #e2e8f0 ${Math.max(0, (durationHours - 6) / 66 * 100)}%, #e2e8f0 100%)` }}
                className="scenario-range w-full cursor-pointer accent-teal-600 dark:accent-teal-500"
              />
              <div className="flex justify-between text-[10px] text-[#94A3B8] mt-1 font-mono">
                <span>6h (Flash)</span>
                <span>24h (Standard)</span>
                <span>48h (Sustained)</span>
                <span>72h (Cyclonic)</span>
              </div>
            </div>

            {/* Soil Antecedent Wetness */}
            <div>
              <label className="text-xs font-medium text-[#1E292B] block mb-1.5">
                {language !== "ml" ? "Antecedent Catchment Moisture" : "മണ്ണിന്റെ ഈർപ്പ നില"}:
              </label>
              <div className="grid grid-cols-3 gap-2">
                {(["dry", "normal", "saturated"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSaturation(s)}
                    className={`py-1.5 text-xs rounded-md border text-center capitalize transition-colors ${
                      saturation === s
                        ? "bg-[#26332F] text-white border-[#26332F] font-semibold"
                        : "bg-white text-[#687770] border-[#E2E8F0] hover:border-[#CBD5E1]"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Run Button */}
            <button
              onClick={handleRun}
              disabled={isRunning}
              className="w-full py-2.5 mt-2 bg-[#0D9488] hover:bg-[#0F766E] disabled:bg-[#94A3B8] text-white text-xs font-bold rounded-lg shadow-sm transition-all flex items-center justify-center gap-2"
            >
              {isRunning ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span>{language !== "ml" ? "Running Hydrodynamic Solvers..." : "കണക്കുകൂട്ടുന്നു..."}</span>
                </>
              ) : (
                <>
                  <CloudRain className="h-4 w-4" aria-hidden="true" />
                  <span>{t.simulateButton}</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Results Column */}
        <div className="lg:col-span-6 flex flex-col">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs flex-1 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-[#F1F5F9]">
                <h3 className="text-sm font-bold text-[#1E292B]">
                  {language !== "ml" ? "Simulated Inundation Impact" : "പ്രളയ പ്രത്യാഘാത കണക്കുകൾ"}
                </h3>
                {scenarioResult && (
                  <span className="text-[10px] font-mono bg-[#ECFDF5] text-[#059669] px-2 py-0.5 rounded-full font-bold">
                    COMPUTED
                  </span>
                )}
              </div>

              {!scenarioResult && !isRunning && <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950"><div className="text-[11px] font-semibold text-slate-500">Current high / critical assets</div><div className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-50">{baselineLoading ? "…" : baselineSevere}</div></div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950"><div className="text-[11px] font-semibold text-slate-500">Current 24h rainfall</div><div className="mt-1 text-2xl font-bold text-slate-900 dark:text-slate-50">{baseline?.rainfall_24h_mm == null ? "—" : `${baseline.rainfall_24h_mm.toFixed(1)} mm`}</div></div>
              </div>}
              {errorMsg && <div role="alert" className="mb-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">Scenario request failed: {errorMsg}</div>}

              {isRunning && (
                <div className="py-16 text-center text-[#0D9488]">
                  <RefreshCw className="mx-auto mb-2 h-7 w-7 animate-spin" aria-hidden="true" />
                  <div className="text-xs font-medium">
                    {language !== "ml"
                      ? "Calculating scenario exposure..."
                      : "ഹൈഡ്രോഡൈനാമിക് മോഡലുകൾ വിശകലനം ചെയ്യുന്നു..."}
                  </div>
                </div>
              )}

              <section className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950" aria-label="Scenario asset map preview">
                <div className="flex items-center justify-between px-3 py-2"><span className="text-xs font-semibold text-slate-800 dark:text-slate-100">{scenarioResult ? "Scenario asset impact" : "Current asset baseline"}</span><span className="text-[10px] text-slate-500">{mapPoints.length} mapped assets</span></div>
                <svg viewBox="0 0 400 210" className="block h-44 w-full" role="img" aria-label="Map preview showing asset locations and scenario risk">
                  <rect width="400" height="210" fill="#e7f0ec" />
                  <path d="M-10 135 C70 105 95 165 165 130 S270 90 410 118" fill="none" stroke="#7db8bd" strokeWidth="8" opacity=".65" />
                  <path d="M-10 142 C70 112 95 172 165 137 S270 97 410 125" fill="none" stroke="#f8fafc" strokeWidth="2" opacity=".9" />
                  {mapPoints.filter((asset) => Number.isFinite(asset.lat) && Number.isFinite(asset.lon)).map((asset) => {
                    const x = Math.max(8, Math.min(392, ((asset.lon - 76) / 1.5) * 400));
                    const y = Math.max(8, Math.min(202, ((11.5 - asset.lat) / 2) * 210));
                    const escalated = elevatedIds.has(asset.asset_id);
                    const color = escalated ? "#dc2626" : asset.risk_category === "critical" ? "#b91c1c" : asset.risk_category === "high" ? "#ea580c" : asset.risk_category === "medium" ? "#ca8a04" : "#059669";
                    return <circle key={asset.asset_id} cx={x} cy={y} r={escalated ? 5 : 3.5} fill={color} stroke="white" strokeWidth="2"><title>{asset.asset_name ?? asset.asset_id} · {asset.risk_category}{escalated ? " · escalated" : ""}</title></circle>;
                  })}
                </svg>
                <div className="flex items-center gap-3 border-t border-slate-200 px-3 py-2 text-[10px] text-slate-600 dark:border-slate-800 dark:text-slate-400"><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-emerald-600"/>Low</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-amber-500"/>Moderate</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-orange-600"/>High</span><span><i className="mr-1 inline-block h-2 w-2 rounded-full bg-red-700"/>Critical / escalated</span></div>
              </section>

              {scenarioResult && !isRunning && (
                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[#FEF2F2] border border-[#FCA5A5] rounded-xl p-3">
                      <div className="text-[11px] text-[#991B1B] font-semibold">
                        {language !== "ml" ? "Severe Risk Facilities" : "തീവ്ര അപകടത്തിൽ"}
                      </div>
                      <div className="text-2xl font-bold text-[#DC2626] mt-1">
                        {scenarioResult.summary?.scenario_high_critical_count ?? "—"}
                      </div>
                    </div>

                    <div className="bg-[#FFFBEB] border border-[#FCD34D] rounded-xl p-3">
                      <div className="text-[11px] text-[#92400E] font-semibold">
                        {language !== "ml" ? "Net change in high / critical" : "ഉയർന്ന / ഗുരുതര അപകടത്തിലെ ആകെ മാറ്റം"}
                      </div>
                      <div className="text-2xl font-bold text-[#D97706] mt-1">
                        {scenarioResult.summary?.delta_high_critical ?? "—"}
                      </div>
                    </div>

                    <div className="bg-[#F0FDF4] border border-[#86EFAC] rounded-xl p-3">
                      <div className="text-[11px] text-[#166534] font-semibold">
                        {language !== "ml" ? "Scenario 24h rainfall" : "24 മണിക്കൂർ ആകെ മഴ"}
                      </div>
                      <div className="text-2xl font-bold text-[#15803D] mt-1">
                        {scenarioResult.summary?.combined_24h_mm?.toFixed(1) ?? "—"}{" "}
                        <span className="text-xs font-normal">mm</span>
                      </div>
                    </div>

                    <div className="bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl p-3">
                      <div className="text-[11px] text-[#334155] font-semibold">
                        {language !== "ml" ? "Facilities with any risk increase" : "അപകടസാധ്യത ഉയർന്ന സ്ഥാപനങ്ങൾ"}
                      </div>
                      <div className="text-2xl font-bold text-[#0F172A] mt-1">
                        {scenarioResult.summary?.escalated_count ?? "—"}
                      </div>
                    </div>
                  </div>

                  {!!scenarioResult.escalated_assets?.length && <div className="rounded-lg border border-slate-200 dark:border-slate-800">
                    <div className="border-b border-slate-200 px-3 py-2 text-xs font-semibold dark:border-slate-800">Facilities with higher scenario risk</div>
                    <ul className="max-h-52 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">{scenarioResult.escalated_assets.map((asset) => <li key={asset.asset_id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
                      <span className="min-w-0"><span className="block truncate font-medium">{asset.name || "Unnamed facility"}</span><span className="text-[10px] capitalize text-slate-500">{asset.type?.replaceAll("_", " ")} · {asset.baseline_category} → {asset.scenario_category}</span></span>
                      {Number.isFinite(asset.lat) && Number.isFinite(asset.lon) && <button type="button" onClick={() => useStore.getState().focusMap(asset.lat!, asset.lon!, asset.asset_id)} className="shrink-0 rounded border border-slate-300 px-2 py-1 text-[10px] font-semibold text-teal-800 hover:bg-teal-50 dark:border-slate-700 dark:text-teal-300 dark:hover:bg-slate-800">Focus</button>}
                    </li>)}</ul>
                  </div>}

                  <details className="ux-disclosure rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-xs text-text-secondary">
                    <summary>{language !== "ml" ? "Scenario interpretation" : "സാഹചര്യത്തിന്റെ വിശദീകരണം"}</summary>
                    <p className="pt-2">This is a rainfall stress test based on the displayed inputs, not a hydraulic forecast or reservoir operating instruction.</p>
                  </details>
                </div>
              )}
            </div>

            {scenarioResult && (
              <div className="pt-4 mt-4 border-t border-[#F1F5F9] flex justify-end">
                <button
                  onClick={handleInspectOnMap}
                  className="px-4 py-2 bg-[#26332F] hover:bg-[#1E292B] text-white text-xs font-bold rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
                >
                  <MapPinned className="h-4 w-4" aria-hidden="true" />
                  <span>{language !== "ml" ? "View scenario risk on 3D map" : "സാഹചര്യ അപകടസാധ്യത മാപ്പിൽ കാണുക"}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
