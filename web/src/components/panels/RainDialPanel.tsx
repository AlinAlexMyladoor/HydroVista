"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/store";
import { translations } from "@/lib/translations";
import { api, ScenarioResponse } from "@/lib/api";
import { useMutation } from "@tanstack/react-query";
import {
  Sliders,
  CloudRain,
  Droplets,
  TrendingUp,
  AlertOctagon,
  ArrowRight,
  Info,
  CheckCircle,
} from "lucide-react";

export function RainDialPanel() {
  const {
    language,
    scenarioRainfall,
    setScenarioRainfall,
    scenarioDuration,
    setScenarioDuration,
    activeScenario,
    setActiveScenario,
    setActivePanel,
  } = useStore();
  const t = translations[language];

  const [threshold, setThreshold] = useState<number>(0.6);

  // Mutation to run scenario against backend engine
  const mutation = useMutation({
    mutationFn: () =>
      api.scenario.create({
        rainfall_mm: scenarioRainfall,
        duration_hours: scenarioDuration,
        forecast_hour: 24,
        closure_threshold: threshold,
      }),
    onSuccess: (data: ScenarioResponse) => {
      setActiveScenario(data);
    },
  });

  const handleSimulate = () => {
    mutation.mutate();
  };

  const summary = activeScenario?.summary;

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden select-none">
      {/* Header */}
      <div className="p-4 border-b border-border bg-surface flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-serif font-bold text-text">
            {t.rainDialTitle}
          </h2>
          <span className="badge bg-surface-secondary text-primary font-mono text-[10px]">
            Hydrological Stress-Testing
          </span>
        </div>
        <p className="text-xs text-text-secondary">
          {t.rainDialSubtitle}
        </p>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4 scrollbar-thin">
        {/* Controls Card */}
        <div className="bg-surface p-4 rounded-md border border-border shadow-card space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-text uppercase tracking-wider">
              Simulation Inputs
            </span>
            <span className="text-2xs text-text-secondary font-mono">
              Synthetic Catchment Inflow
            </span>
          </div>

          {/* Added Rainfall Dial */}
          <div className="space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="text-text font-medium flex items-center gap-1.5">
                <CloudRain className="w-3.5 h-3.5 text-primary" />
                {t.addedRainfall}
              </span>
              <span className="font-mono font-bold text-base text-primary">
                +{scenarioRainfall} mm
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="250"
              step="10"
              value={scenarioRainfall}
              onChange={(e) => setScenarioRainfall(Number(e.target.value))}
              className="w-full h-2 bg-surface-secondary rounded-lg appearance-none cursor-pointer accent-primary"
            />
            <div className="flex justify-between text-[10px] text-text-secondary font-mono">
              <span>0 mm (Normal)</span>
              <span>+75 mm (Heavy)</span>
              <span>+150 mm (Severe)</span>
              <span>+250 mm (Catastrophic)</span>
            </div>
          </div>

          {/* Storm Duration */}
          <div className="space-y-1.5 pt-2 border-t border-border">
            <div className="flex justify-between items-center text-xs">
              <span className="text-text font-medium">
                {t.stormDuration}
              </span>
              <span className="font-mono font-bold text-text">
                {scenarioDuration} hours
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[3, 6, 12, 24].map((hours) => (
                <button
                  key={hours}
                  type="button"
                  onClick={() => setScenarioDuration(hours)}
                  className={`py-1.5 rounded text-xs font-mono font-semibold transition-colors ${
                    scenarioDuration === hours
                      ? "bg-primary text-white"
                      : "bg-surface-secondary text-text hover:bg-surface-secondary/80 border border-border"
                  }`}
                >
                  {hours}h
                </button>
              ))}
            </div>
          </div>

          {/* Run Simulation Button */}
          <button
            onClick={handleSimulate}
            disabled={mutation.isPending}
            className="w-full btn-primary py-2.5 flex items-center justify-center gap-2 font-medium shadow-xs"
          >
            {mutation.isPending ? (
              <span>Computing Hydrological Delta...</span>
            ) : (
              <>
                <Droplets className="w-4 h-4" />
                <span>{t.simulateButton}</span>
              </>
            )}
          </button>
        </div>

        {/* Results & Delta Comparison Card */}
        {activeScenario && summary && (
          <div className="bg-surface p-4 rounded-md border border-border shadow-card space-y-4 animate-fade-in">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h3 className="text-sm font-semibold text-text flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-primary" />
                Scenario Impact Summary
              </h3>
              <span className="text-2xs font-mono text-text-secondary">
                Run ID: {activeScenario.scenario_id.slice(0, 8)}
              </span>
            </div>

            {/* Impact Metric Cards Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Baseline High/Critical */}
              <div className="p-3 bg-background rounded border border-border">
                <span className="text-2xs text-text-secondary block">
                  {t.baselineHighCritical}
                </span>
                <span className="text-xl font-mono font-bold text-text">
                  {summary.baseline_high_critical_count}
                </span>
                <span className="text-2xs text-text-secondary block mt-0.5">
                  Pre-scenario baseline
                </span>
              </div>

              {/* Scenario High/Critical */}
              <div className="p-3 bg-red-50/40 rounded border border-red-200">
                <span className="text-2xs text-text-secondary block">
                  {t.scenarioHighCritical}
                </span>
                <span className="text-xl font-mono font-bold text-alert">
                  {summary.scenario_high_critical_count}
                </span>
                <span className="text-2xs text-alert font-mono block mt-0.5">
                  +{summary.delta_high_critical} assets at risk
                </span>
              </div>

              {/* Newly Escalated */}
              <div className="p-3 bg-amber-50/40 rounded border border-amber-200">
                <span className="text-2xs text-text-secondary block">
                  {t.escalatedAssets}
                </span>
                <span className="text-xl font-mono font-bold text-warning-dark">
                  {summary.escalated_count}
                </span>
                <span className="text-2xs text-text-secondary block mt-0.5">
                  Risk tier promoted
                </span>
              </div>
            </div>

            {/* Inflow Details */}
            <div className="p-3 bg-surface-secondary/40 rounded text-2xs space-y-1 font-mono">
              <div className="flex justify-between">
                <span>Baseline 24h Catchment Rainfall:</span>
                <strong className="text-text">{activeScenario.baseline_24h_mm?.toFixed(1) || "0.0"} mm</strong>
              </div>
              <div className="flex justify-between">
                <span>Scenario Synthetic Added Rainfall:</span>
                <strong className="text-primary">+{activeScenario.rainfall_mm.toFixed(1)} mm</strong>
              </div>
              <div className="flex justify-between border-t border-border pt-1">
                <span>Total Effective Catchment Inundation Depth:</span>
                <strong className="text-alert">{summary.combined_24h_mm?.toFixed(1) || "0.0"} mm</strong>
              </div>
            </div>

            {/* Quick Map Action */}
            <button
              onClick={() => setActivePanel("map")}
              className="w-full btn-secondary text-xs flex items-center justify-center gap-1.5 py-2"
            >
              <span>Inspect Affected Areas on Map</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Scientific Methodology & Assumptions */}
        <div className="bg-surface-secondary/30 p-3.5 rounded-md border border-border text-2xs space-y-2 text-text-secondary">
          <div className="flex items-center gap-1.5 font-semibold text-text">
            <Info className="w-3.5 h-3.5 text-primary" />
            <span>Scenario Engine Methodology</span>
          </div>
          <p>
            The Rain Dial evaluates non-linear flood hazard magnification across the Chalakudy basin using localized topographic wetness index (TWI), DEM elevation differentials, and catchment accumulation.
          </p>
          <ul className="list-disc pl-4 space-y-0.5">
            <li>Rainfall added uniformly over the specified duration.</li>
            <li>Infiltration and evapotranspiration treated as constant loss factors.</li>
            <li>Does not simulate reservoir dam gate release hydrographs (Poringalkuthu / Sholayar).</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
