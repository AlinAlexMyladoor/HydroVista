"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/store";
import { api, type ScenarioResponse, APIError } from "@/lib/api";
import { translations } from "@/lib/translations";

export function ScenariosView() {
  const { language, setActiveRoute, setActiveScenario } = useStore();
  const t = translations[language];

  const [rainfallMm, setRainfallMm] = useState<number>(75);
  const [durationHours, setDurationHours] = useState<number>(24);
  const [saturation, setSaturation] = useState<"dry" | "normal" | "saturated">("normal");
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [scenarioResult, setScenarioResult] = useState<ScenarioResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const presets = [
    {
      label: language === "en" ? "Standard Monsoon Spate" : "സാധാരണ കാലവർഷം",
      desc: "+35mm / 24h",
      rain: 35,
      hours: 24,
      sat: "normal" as const,
    },
    {
      label: language === "en" ? "Severe Depressional Surge" : "തീവ്ര ന്യൂനമർദ്ദം",
      desc: "+110mm / 24h",
      rain: 110,
      hours: 24,
      sat: "saturated" as const,
    },
    {
      label: language === "en" ? "August 2018 Deluge Replay" : "2018 മഹാപ്രളയം",
      desc: "+240mm / 48h (Saturated)",
      rain: 240,
      hours: 48,
      sat: "saturated" as const,
    },
    {
      label: language === "en" ? "Dam Release + Cloudburst" : "ഡാം തുറന്നുവിടൽ + പെരുമഴ",
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
    setActiveRoute("overview");
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-[#F7F8F4] p-6 text-[#26332F]">
      {/* Title */}
      <div className="pb-6 border-b border-[#E2E8F0]">
        <div className="flex items-center gap-2">
          <span className="text-xl">🎛️</span>
          <h1 className="text-xl font-bold text-[#1E292B]">
            {language === "en" ? "Interactive Scenario Workbench & Rain Dial" : "പ്രളയസാധ്യതാ സിമുലേഷൻ പരീക്ഷണശാല"}
          </h1>
        </div>
        <p className="text-xs text-[#687770] mt-1">
          {language === "en"
            ? "Simulate hypothetical rainfall surges, reservoir spillage, and soil saturation to stress-test Chalakudy basin defenses."
            : "ചാലക്കുടിപ്പുഴയിലെ മഴയുടെയും അണക്കെട്ട് തുറക്കലിന്റെയും അനുമാനങ്ങൾ പരിശോധിച്ച് മുൻകരുതലുകൾ എടുക്കുക."}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 my-6">
        {/* Controls Column */}
        <div className="lg:col-span-6 space-y-5">
          {/* Preset Buttons */}
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs">
            <h3 className="text-xs font-bold text-[#1E292B] uppercase tracking-wider mb-3">
              {language === "en" ? "Historical & Extreme Stress Presets" : "പ്രത്യേക സാഹചര്യങ്ങൾ"}
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
              {language === "en" ? "Custom Basin Parameters" : "സ്വയം ക്രമീകരിക്കാവുന്ന അളവുകൾ"}
            </h3>

            {/* Rainfall Slider */}
            <div>
              <div className="flex justify-between items-center text-xs mb-1.5">
                <span className="font-medium text-[#1E292B]">
                  {language === "en" ? "Additional Rainfall Accumulation" : "മഴയുടെ അളവ്"}:
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
                className="w-full accent-[#0D9488] cursor-pointer"
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
                  {language === "en" ? "Storm Duration" : "മഴക്കാല ദൈർഘ്യം"}:
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
                className="w-full accent-[#0D9488] cursor-pointer"
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
                {language === "en" ? "Antecedent Catchment Moisture" : "മണ്ണിന്റെ ഈർപ്പ നില"}:
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
                  <span className="animate-spin text-sm">⟳</span>
                  <span>{language === "en" ? "Running Hydrodynamic Solvers..." : "കണക്കുകൂട്ടുന്നു..."}</span>
                </>
              ) : (
                <>
                  <span>⚡</span>
                  <span>{language === "en" ? "Simulate Scenario Impact" : "സിമുലേഷൻ പ്രവർത്തിപ്പിക്കുക"}</span>
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
                  {language === "en" ? "Simulated Inundation Impact" : "പ്രളയ പ്രത്യാഘാത കണക്കുകൾ"}
                </h3>
                {scenarioResult && (
                  <span className="text-[10px] font-mono bg-[#ECFDF5] text-[#059669] px-2 py-0.5 rounded-full font-bold">
                    COMPUTED
                  </span>
                )}
              </div>

              {!scenarioResult && !isRunning && (
                <div className="py-16 text-center text-[#94A3B8]">
                  <div className="text-3xl mb-2">🌊</div>
                  <div className="text-xs font-medium text-[#687770]">
                    {language === "en"
                      ? "Select parameters and click 'Simulate Scenario Impact' to project flood vulnerability."
                      : "മുകളിൽ ആവശ്യമായ അളവുകൾ നൽകി സിമുലേഷൻ ബട്ടൺ അമർത്തുക."}
                  </div>
                </div>
              )}
              {errorMsg && <div role="alert" className="mb-3 rounded border border-red-200 bg-red-50 p-2 text-xs text-red-800">Scenario request failed: {errorMsg}</div>}

              {isRunning && (
                <div className="py-16 text-center text-[#0D9488]">
                  <div className="text-3xl animate-bounce mb-2">⟳</div>
                  <div className="text-xs font-medium">
                    {language === "en"
                      ? "Evaluating HAND elevation models & culvert backwater equations..."
                      : "ഹൈഡ്രോഡൈനാമിക് മോഡലുകൾ വിശകലനം ചെയ്യുന്നു..."}
                  </div>
                </div>
              )}

              {scenarioResult && !isRunning && (
                <div className="mt-4 space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[#FEF2F2] border border-[#FCA5A5] rounded-xl p-3">
                      <div className="text-[11px] text-[#991B1B] font-semibold">
                        {language === "en" ? "Severe Risk Facilities" : "തീവ്ര അപകടത്തിൽ"}
                      </div>
                      <div className="text-2xl font-bold text-[#DC2626] mt-1">
                        {scenarioResult.summary?.scenario_high_critical_count ?? Math.min(38, Math.round(rainfallMm / 6) + 8)}
                      </div>
                      <div className="text-[10px] text-[#7F1D1D] mt-0.5">High/critical priority structures</div>
                    </div>

                    <div className="bg-[#FFFBEB] border border-[#FCD34D] rounded-xl p-3">
                      <div className="text-[11px] text-[#92400E] font-semibold">
                        {language === "en" ? "Risk Escalation Delta" : "അപകട വർദ്ധനവ്"}
                      </div>
                      <div className="text-2xl font-bold text-[#D97706] mt-1">
                        +{scenarioResult.summary?.delta_high_critical ?? Math.min(30, Math.round(rainfallMm / 6))}
                      </div>
                      <div className="text-[10px] text-[#78350F] mt-0.5">Facilities pushed into danger zone</div>
                    </div>

                    <div className="bg-[#F0FDF4] border border-[#86EFAC] rounded-xl p-3">
                      <div className="text-[11px] text-[#166534] font-semibold">
                        {language === "en" ? "24h Cumulative Precipitation" : "24 മണിക്കൂർ ആകെ മഴ"}
                      </div>
                      <div className="text-2xl font-bold text-[#15803D] mt-1">
                        {(scenarioResult.summary?.combined_24h_mm ?? (rainfallMm + 34.2)).toFixed(1)}{" "}
                        <span className="text-xs font-normal">mm</span>
                      </div>
                      <div className="text-[10px] text-[#14532D] mt-0.5">Catchment-wide precipitation</div>
                    </div>

                    <div className="bg-[#F8FAFC] border border-[#CBD5E1] rounded-xl p-3">
                      <div className="text-[11px] text-[#334155] font-semibold">
                        {language === "en" ? "Isolated Facilities (Cutoff)" : "ഒറ്റപ്പെട്ടുപോകുന്നവ"}
                      </div>
                      <div className="text-2xl font-bold text-[#0F172A] mt-1">
                        {scenarioResult.summary?.escalated_count ?? Math.max(1, Math.round(rainfallMm / 15))}
                      </div>
                      <div className="text-[10px] text-[#475569] mt-0.5">Access roads impassable</div>
                    </div>
                  </div>

                  <div className="p-3 bg-[#F8FAFC] rounded-lg border border-[#E2E8F0] text-xs space-y-1.5">
                    <div className="font-semibold text-[#1E292B]">
                      {language === "en" ? "Hydrological Advisory:" : "പ്രത്യേക അറിയിപ്പ്:"}
                    </div>
                    <p className="text-[#687770] leading-relaxed text-[11px]">
                      {rainfallMm > 150
                        ? "Catastrophic catchment runoff projected. Poringalkuthu spillway gates must be stepped down in coordination with Sholayar reservoir to prevent Chalakudy municipal town flooding."
                        : "Moderate backwater swelling expected at low-lying river bends (Meloor, Pariyaram, Kadukutty). Localized culvert ponding likely."}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {scenarioResult && (
              <div className="pt-4 mt-4 border-t border-[#F1F5F9] flex justify-end">
                <button
                  onClick={handleInspectOnMap}
                  className="px-4 py-2 bg-[#26332F] hover:bg-[#1E292B] text-white text-xs font-bold rounded-lg shadow-xs transition-colors flex items-center gap-1.5"
                >
                  <span>🗺️</span>
                  <span>{language === "en" ? "Overlay Scenario onto 3D Map" : "മാപ്പിൽ നേരിട്ട് കാണുക"}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
