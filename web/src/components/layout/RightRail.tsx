"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/store";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  AlertTriangle,
  Clock,
  ChevronRight,
  Sliders,
  Play,
  HelpCircle,
  CloudRain,
  Users,
  Droplets,
} from "lucide-react";

// ─── Shared utility ────────────────────────────────────────────────────────────
function Skeleton({ w, h }: { w?: string; h?: string }) {
  return <div className="skeleton rounded" style={{ width: w ?? "100%", height: h ?? 14 }} />;
}

// ─── Risk Assessment Card ──────────────────────────────────────────────────────
function RiskAssessmentCard() {
  const { language, setActiveRoute, inundationRunId } = useStore();

  const { data: brief, isLoading } = useQuery({
    queryKey: ["brief"],
    queryFn: () => api.brief(),
    refetchInterval: 120_000,
    retry: 2,
  });

  const { data: exposure } = useQuery({
    queryKey: ["exposure-list", "all", "all"],
    queryFn: () => api.exposure.list({ page: 1 }),
    retry: 2,
  });

  const { data: cachedRuns } = useQuery({
    queryKey: ["analysis-runs"], queryFn: api.analysis.runs, staleTime: 60_000,
  });
  const latestRunId = inundationRunId ?? cachedRuns?.runs.find((run) => run.status === "completed")?.id ?? null;
  const { data: inundationRun } = useQuery({
    queryKey: ["analysis-run", latestRunId, "population"],
    queryFn: () => api.analysis.run(latestRunId!),
    enabled: Boolean(latestRunId),
    retry: 1,
  });

  const en = language !== "ml";
  const forecastOk = brief?.rainfall_24h_mm != null;
  const riskCategory = brief?.max_risk_category ?? "unknown";
  const isHighOrCritical = riskCategory === "high" || riskCategory === "critical";
  const rainfallMm = brief?.rainfall_24h_mm;
  const exposedPopulation = inundationRun?.status === "completed"
    ? inundationRun.result?.exposed_population ?? null
    : null;
  const catLabel: Record<string, string> = {
    critical: en ? "Critical" : "ഗുരുതര",
    high: en ? "High" : "ഉയർന്ന",
    medium: en ? "Moderate" : "മിതമായ",
    low: en ? "Low" : "കുറഞ്ഞ",
  };
  const tone = !forecastOk ? "#687770" : isHighOrCritical ? "#C83F3A" : "#b45309";
  const bg = !forecastOk ? "#f4f7f5" : isHighOrCritical ? "#fef2f2" : "#fffbeb";
  const bd = !forecastOk ? "#DCE4DD" : isHighOrCritical ? "#fecaca" : "#fde68a";

  return (
    <div className="intel-card">
      <div className="intel-card-header">
        <div className="intel-card-title">
          <AlertTriangle style={{ width: 13, height: 13, color: tone }} />
          {en ? "Risk Assessment" : "അപകടസാധ്യതാ വിലയിരുത്തൽ"}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2"><Skeleton h="20px" /><Skeleton w="60%" h="40px" /></div>
      ) : (
        <div className="rounded-md p-2.5 mb-3" style={{ background: bg, border: `1px solid ${bd}` }}>
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle style={{ width: 14, height: 14, color: tone }} />
            <span style={{ fontSize: "0.8125rem", fontWeight: 700, color: tone }}>
              {!forecastOk
                ? (en ? "Risk status unavailable" : "അപകട നില ലഭ്യമല്ല")
                : `${catLabel[riskCategory] ?? (en ? "Unknown" : "അജ്ഞാതം")} ${en ? "asset risk level" : "ആസ്തി അപകട നില"}`}
            </span>
          </div>
          <div style={{ fontSize: "0.625rem", color: "#687770" }}>
            {en ? "Chalakudy Basin · Next 24 hours" : "ചാലക്കുടി · അടുത്ത 24 മണിക്കൂർ"}
          </div>
          <div style={{ fontSize: "0.5625rem", color: "#687770", marginTop: 4 }}>
            {en
              ? "Relative ranking from terrain + NWP rainfall. Not a calibrated flood probability."
              : "ഭൂപ്രകൃതി + മഴ അടിസ്ഥാനമാക്കിയ ആപേക്ഷിക റാങ്കിംഗ്. ക്രമീകരിച്ച സംഭാവ്യതയല്ല."}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-1.5">
        <div className="metric-tile">
          <CloudRain style={{ width: 14, height: 14, color: "#3299C6", marginBottom: 2 }} />
          <div className="metric-value" style={{ fontSize: "0.8125rem" }}>
            {isLoading ? "…" : forecastOk ? `${Math.round(rainfallMm as number)} mm` : (en ? "No data" : "ഡാറ്റയില്ല")}
          </div>
          <div className="metric-label">{en ? "Forecast rainfall (24 h)" : "പ്രവചിത മഴ (24h)"}</div>
        </div>
        <div className="metric-tile" title={en ? "Candidate inundation area from the latest completed Sentinel-1 analysis." : ""}>
          <Droplets style={{ width: 14, height: 14, color: "#3299C6", marginBottom: 2 }} />
          <div className="metric-value" style={{ fontSize: "0.8125rem", color: inundationRun?.result ? "#155E59" : "#9ca3af" }}>
            {inundationRun?.status === "completed" && inundationRun.result?.areas_km2?.candidate_inundation_final != null
              ? `${inundationRun.result.areas_km2.candidate_inundation_final.toFixed(2)} km²`
              : en ? "Run analysis" : "വിശകലനം നടത്തുക"}
          </div>
          <div className="metric-label">{en ? "Candidate flooded area" : "പ്രളയ സാധ്യതാ വിസ്തീർണ്ണം"}</div>
        </div>
        <div className="metric-tile" title={en ? "Population intersecting the latest completed inundation analysis." : ""}>
          <Users style={{ width: 14, height: 14, color: "#9ca3af", marginBottom: 2 }} />
          <div className="metric-value" style={{ fontSize: "0.8125rem", color: exposedPopulation == null ? "#9ca3af" : "#155E59" }}>
            {exposedPopulation == null ? (en ? "Run analysis" : "വിശകലനം നടത്തുക") : exposedPopulation.toLocaleString()}
          </div>
          <div className="metric-label">{en ? "People affected" : "ബാധിക്കപ്പെടുന്നവർ"}</div>
        </div>
      </div>

      {!isLoading && (
        <div className="mt-2 flex items-center gap-1" style={{ fontSize: "0.5625rem", color: brief?.data_freshness === "current" ? "#155E59" : "#92400e", background: brief?.data_freshness === "current" ? "#f0f7f4" : "#fffbeb", border: `1px solid ${brief?.data_freshness === "current" ? "#cfe3d6" : "#fde68a"}`, borderRadius: 4, padding: "3px 6px" }}>
          <span>
            {en ? "Forecast data: " : "ഡാറ്റ: "}{brief?.data_freshness ?? "unavailable"}
            {brief?.generated_at ? ` · ${new Date(brief.generated_at).toLocaleTimeString()}` : ""}
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Isolation Clock Compact Card ─────────────────────────────────────────────
function IsolationClockCard() {
  const { language, setActiveRoute } = useStore();

  const { data: isolation, isLoading } = useQuery({
    queryKey: ["isolation-clock", 0.65],
    queryFn: () => api.isolation.get(0.65),
    refetchInterval: 300_000,
    retry: 1,
  });

  const items = (isolation?.items ?? []).slice(0, 4);
  return (
    <div className="intel-card">
      <div className="intel-card-header">
        <div className="intel-card-title">
          <Clock style={{ width: 13, height: 13, color: "#155E59" }} />
          {language !== "ml" ? "Isolation Clock (Hospitals)" : "ഐസൊലേഷൻ ക്ലോക്ക്"}
        </div>
        <button
          onClick={() => setActiveRoute("infrastructure")}
          className="intel-card-action"
        >
          {language !== "ml" ? "View all" : "എല്ലാം"} →
        </button>
      </div>

      <p style={{ fontSize: "0.5625rem", color: "#687770", marginBottom: 6 }}>
        {language !== "ml"
          ? "Earliest modeled access loss · simplified OSM road graph"
          : "മോഡൽ ആക്സസ് നഷ്ടം · ലളിതമായ OSM റോഡ് ശൃംഖല"}
      </p>

      <div className="space-y-1.5">
        {isLoading
          ? [1, 2, 3, 4].map(i => (
              <div key={i} className="facility-row" style={{ height: 32 }}>
                <Skeleton h="10px" w="60%" />
                <Skeleton h="10px" w="25%" />
              </div>
            ))
          : items.length === 0
          ? (
            <div style={{ fontSize: "0.6875rem", color: "#9ca3af", padding: "8px 0", textAlign: "center" }}>
              {language !== "ml" ? "No hospital data available" : "ആശുപത്രി ഡാറ്റ ലഭ്യമല്ല"}
            </div>
          )
          : items.map((facility) => {
              const isConnected = facility.is_connected;
              const hours = facility.time_to_isolation_hours;
              return (
                <div
                  key={facility.facility_id}
                  className={`facility-row ${!isConnected ? "at-risk" : ""}`}
                  style={{ alignItems: "flex-start" }}
                >
                  <div className="flex flex-1 items-start gap-1.5 min-w-0">
                    <span
                      className="flex-shrink-0"
                      style={{
                        width: 7, height: 7, borderRadius: "50%",
                        background: isConnected ? "#22c55e" : "#C83F3A",
                        border: `1.5px solid ${isConnected ? "#bbf7d0" : "#fecaca"}`,
                        marginTop: 3,
                      }}
                    />
                    <span
                      style={{
                        fontSize: "0.6875rem",
                        fontWeight: 500,
                        color: "#26332F",
                        flex: 1,
                        minWidth: 0,
                        whiteSpace: "normal",
                        overflowWrap: "anywhere",
                        lineHeight: 1.3,
                      }}
                    >
                      {facility.facility_name ?? "Health Facility"}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: "0.6875rem",
                      fontWeight: 600,
                      color: hours != null && hours <= 18 ? "#C83F3A" : "#687770",
                      fontVariantNumeric: "tabular-nums",
                      flexShrink: 0,
                      maxWidth: 94,
                      textAlign: "right",
                    }}
                  >
                    {hours != null
                      ? `~ ${Math.round(hours)} h`
                      : isConnected
                        ? (language !== "ml" ? "> 24 h · Passable" : "> 24 മ · തുറന്നിരിക്കുന്നു")
                        : (language !== "ml" ? "Impassable" : "കടന്നുപോകാനാകില്ല")}
                  </span>
                </div>
              );
            })
        }
      </div>
    </div>
  );
}

// ─── Rain Dial Compact Card ────────────────────────────────────────────────────
function RainDialCard() {
  const {
    language,
    scenarioRainfall,
    setScenarioRainfall,
    scenarioDuration,
    setScenarioDuration,
    activeScenario,
    setActiveScenario,
    forecastHorizon,
    setActiveRoute,
  } = useStore();

  const [showResults, setShowResults] = useState(false);

  const mutation = useMutation({
    mutationFn: () =>
      api.scenario.create({
        rainfall_mm: scenarioRainfall,
        duration_hours: scenarioDuration,
        forecast_hour: forecastHorizon,
        closure_threshold: 0.65,
      }),
    onSuccess: (data) => {
      setActiveScenario(data);
      setShowResults(true);
    },
  });

  const summary = activeScenario?.summary;

  return (
    <div className="intel-card">
      <div className="intel-card-header">
        <div className="intel-card-title">
          <Sliders style={{ width: 13, height: 13, color: "#155E59" }} />
          {language !== "ml" ? "Scenario Simulator (Rain Dial)" : "Rain Dial സിമുലേറ്റർ"}
          <button
            title={language !== "ml"
              ? "Increase or decrease rainfall to explore potential impact on infrastructure exposure. This is a simplified stress test, not a hydraulic simulation."
              : "ഇൻഫ്രാസ്ട്രക്ചർ എക്സ്പോഷറിൽ ഉള്ള സ്വാധീനം പര്യവേക്ഷണം ചെയ്യാൻ."}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1 }}
          >
            <HelpCircle style={{ width: 11, height: 11, color: "#9ca3af" }} />
          </button>
        </div>
      </div>

      <p style={{ fontSize: "0.5625rem", color: "#687770", marginBottom: 8 }}>
        {language !== "ml"
          ? "Increase or decrease rainfall to explore potential impact."
          : "ഇൻഫ്രാസ്ട്രക്ചർ എക്സ്പോഷറിൽ ഉള്ള സ്വാധീനം പര്യവേക്ഷണം ചെയ്യുക."}
      </p>

      {/* Rainfall slider */}
      <div className="mb-2.5">
        <div className="flex items-center justify-between mb-1">
          <span style={{ fontSize: "0.6875rem", color: "#687770" }}>
            {language !== "ml" ? "Additional rainfall" : "അധിക മഴ"}
          </span>
          <span style={{ fontSize: "0.875rem", fontWeight: 700, color: "#155E59", fontVariantNumeric: "tabular-nums" }}>
            +{scenarioRainfall} mm
          </span>
        </div>
        <input
          type="range"
          min={0}
          max={250}
          step={5}
          value={scenarioRainfall}
          onChange={(e) => setScenarioRainfall(Number(e.target.value))}
          className="timeline-slider w-full"
          aria-label={`Additional rainfall: ${scenarioRainfall} mm`}
        />
      </div>

      {/* Duration buttons */}
      <div className="mb-3">
        <div style={{ fontSize: "0.6875rem", color: "#687770", marginBottom: 4 }}>
          {language !== "ml" ? "Duration" : "ദൈർഘ്യം"}
        </div>
        <div className="grid grid-cols-4 gap-1">
          {[3, 6, 12, 24].map((h) => (
            <button
              key={h}
              onClick={() => setScenarioDuration(h)}
              className="rounded text-center transition-all"
              style={{
                padding: "0.25rem 0",
                fontSize: "0.625rem",
                fontWeight: scenarioDuration === h ? 600 : 500,
                color: scenarioDuration === h ? "white" : "#687770",
                background: scenarioDuration === h ? "#155E59" : "#F7F8F4",
                border: `1px solid ${scenarioDuration === h ? "#155E59" : "#DCE4DD"}`,
                cursor: "pointer",
              }}
              aria-pressed={scenarioDuration === h}
            >
              {h}h
            </button>
          ))}
        </div>
        {/* Duration meaning note */}
        <p style={{ fontSize: "0.5625rem", color: "#9ca3af", marginTop: 3 }}>
          {language !== "ml"
            ? `Rainfall applied uniformly over ${scenarioDuration}h. Affects total accumulation only.`
            : `${scenarioDuration}h-ൽ ഒരേ സ്ഥിരമായ നിരക്കിൽ മഴ.`}
        </p>
      </div>

      {/* Run button */}
      <button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="btn-primary w-full"
        style={{ fontSize: "0.8125rem", fontWeight: 600 }}
      >
        {mutation.isPending
          ? <><span className="animate-spin" style={{ fontSize: 14 }}>⟳</span> Computing...</>
          : <><Play style={{ width: 13, height: 13 }} /> {language !== "ml" ? "Run Scenario" : "സിനാരിയോ"}</>
        }
      </button>

      {/* Results */}
      {mutation.isError && (
        <div className="mt-2 text-center" style={{ fontSize: "0.625rem", color: "#C83F3A" }}>
          {language !== "ml" ? "Computation failed. Retry?" : "​പ്രവർത്തനം പരാജയപ്പെട്ടു."}
        </div>
      )}

      {showResults && summary && (
        <div className="mt-3 p-2.5 rounded animate-fade-in" style={{ background: "#F7F8F4", border: "1px solid #DCE4DD" }}>
          <div className="flex items-center justify-between mb-2">
            <span style={{ fontSize: "0.6875rem", fontWeight: 600, color: "#26332F" }}>
              {language !== "ml" ? "Scenario Impact" : "സ്വാധീനം"}
            </span>
            <button
              onClick={() => setActiveRoute("scenarios")}
              style={{ fontSize: "0.5625rem", color: "#155E59", fontWeight: 500, background: "none", border: "none", cursor: "pointer" }}
            >
              {language !== "ml" ? "Full detail →" : "വിശദം →"}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1">
            <div className="text-center">
              <div style={{ fontSize: "1rem", fontWeight: 700, color: "#26332F", fontVariantNumeric: "tabular-nums" }}>
                {summary.baseline_high_critical_count}
              </div>
              <div style={{ fontSize: "0.5625rem", color: "#687770" }}>{language !== "ml" ? "Baseline" : "നിലവിൽ"}</div>
            </div>
            <div className="text-center" style={{ color: "#C83F3A" }}>
              <div style={{ fontSize: "1rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {summary.scenario_high_critical_count}
              </div>
              <div style={{ fontSize: "0.5625rem" }}>{language !== "ml" ? "Scenario" : "സിനാരിയോ"}</div>
            </div>
            <div className="text-center" style={{ color: "#E7A23B" }}>
              <div style={{ fontSize: "1rem", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                +{summary.escalated_count}
              </div>
              <div style={{ fontSize: "0.5625rem" }}>{language !== "ml" ? "Escalated" : "ഉയർന്ന"}</div>
            </div>
          </div>

          <div className="mt-2" style={{ fontSize: "0.5625rem", color: "#9ca3af", borderTop: "1px solid #DCE4DD", paddingTop: 4 }}>
            {language !== "ml"
              ? "Stress test only. Not a hydraulic simulation."
              : "ഇത് ഒരു സ്ട്രെസ് ടെസ്റ്റ് മാത്രമാണ്."}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Right Intelligence Rail ───────────────────────────────────────────────────
export function RightRail() {
  const { rightRailOpen } = useStore();

  if (!rightRailOpen) return null;

  return (
    <aside
      className="flex flex-col gap-2.5 bg-[#F7F8F4] border-l border-[#DCE4DD] overflow-y-auto scrollbar-thin flex-shrink-0 p-2.5"
      style={{ width: 260 }}
      aria-label="Intelligence rail"
    >
      <RiskAssessmentCard />
      <IsolationClockCard />
      <RainDialCard />
    </aside>
  );
}
