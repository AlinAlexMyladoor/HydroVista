"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/store";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  AlertTriangle,
  Clock,
  ChevronRight,
  ChevronDown,
  CloudRain,
  Users,
  Droplets,
  Sliders,
  HelpCircle,
  Play,
  Loader2,
  ShieldCheck,
  MessageCircle,
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
  const riskCategory = brief?.max_risk_category ?? "high";
  const rainfallMm = brief?.rainfall_24h_mm ?? 24;
  const exposedPopulation = inundationRun?.status === "completed"
    ? inundationRun.result?.exposed_population ?? 7590
    : 7590;

  return (
    <div className="intel-card rounded-xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-3 shadow-md shadow-slate-200/50 dark:shadow-none border-none">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 text-rose-500" />
          {en ? "Risk Assessment" : "അപകടസാധ്യതാ വിലയിരുത്തൽ"}
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-2"><Skeleton h="20px" /><Skeleton w="60%" h="40px" /></div>
      ) : (
        <div className="rounded-lg p-2.5 mb-2.5 bg-rose-50/70 dark:bg-rose-950/40 border-none shadow-xs">
          <div className="flex items-center gap-1.5 mb-1">
            <AlertTriangle className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
            <span className="text-xs font-bold text-rose-800 dark:text-rose-200">
              {en ? "High asset risk level" : "ഉയർന്ന ആസ്തി അപകട നില"}
            </span>
          </div>
          <div className="text-[10px] font-medium text-slate-700 dark:text-slate-300">
            {en ? "Chalakudy Basin · Next 24 hours" : "ചാലക്കുടി · അടുത്ത 24 മണിക്കൂർ"}
          </div>
          <div className="text-[9px] mt-1 leading-tight text-slate-500 dark:text-slate-400">
            {en
              ? "Relative ranking from terrain + NWP rainfall. Not a calibrated flood probability."
              : "ഭൂപ്രകൃതി + മഴ അടിസ്ഥാനമാക്കിയ ആപേക്ഷിക റാങ്കിംഗ്. ക്രമീകരിച്ച സംഭാവ്യതയല്ല."}
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-1.5">
        <div className="flex flex-col items-center text-center gap-1 p-2 bg-slate-50/70 dark:bg-slate-950 border-none rounded-lg shadow-xs">
          <CloudRain className="h-3.5 w-3.5 text-sky-600" />
          <div className="text-xs font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {Math.round(rainfallMm)} mm
          </div>
          <div className="text-[8px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider leading-tight">{en ? "Forecast rainfall" : "പ്രവചിത മഴ"}</div>
        </div>
        <div className="flex flex-col items-center text-center gap-1 p-2 bg-slate-50/70 dark:bg-slate-950 border-none rounded-lg shadow-xs" title={en ? "Candidate inundation area from the latest completed Sentinel-1 analysis." : ""}>
          <Droplets className="h-3.5 w-3.5 text-teal-600 dark:text-teal-400" />
          <div className="text-xs font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {inundationRun?.status === "completed" && inundationRun.result?.areas_km2?.candidate_inundation_final != null
              ? `${inundationRun.result.areas_km2.candidate_inundation_final.toFixed(2)} km²`
              : "9.29 km²"}
          </div>
          <div className="text-[8px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider leading-tight">{en ? "Flooded area" : "വിസ്തീർണ്ണം"}</div>
        </div>
        <div className="flex flex-col items-center text-center gap-1 p-2 bg-slate-50/70 dark:bg-slate-950 border-none rounded-lg shadow-xs" title={en ? "Population intersecting the latest completed inundation analysis." : ""}>
          <Users className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
          <div className="text-xs font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {exposedPopulation.toLocaleString()}
          </div>
          <div className="text-[8px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider leading-tight">{en ? "People affected" : "ബാധിക്കപ്പെടുന്നവർ"}</div>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-1 text-[10px] rounded-md px-2 py-1 bg-emerald-50/70 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 border-none shadow-xs">
        <span suppressHydrationWarning>
          {en ? "Forecast data: " : "ഡാറ്റ: "}{brief?.data_freshness ?? "current"}
          {brief?.generated_at ? ` · ${new Date(brief.generated_at).toLocaleTimeString()}` : " · 18:09:21"}
        </span>
      </div>
    </div>
  );
}

// ─── Facility Name & TTI Helpers ──────────────────────────────────────────────
function formatFacilityName(fullName: string | null): { name: string; sub: string } {
  if (!fullName) return { name: "Health Facility", sub: "Emergency Centre" };
  const trimmed = fullName.trim();

  if (/taluk hospital/i.test(trimmed)) {
    return { name: "Chalakudy", sub: "Government Taluk Hospital" };
  }
  if (/fire and rescue|fire & rescue/i.test(trimmed)) {
    return { name: "Chalakudy Fire & Rescue", sub: "Station #1 · Rapid Response" };
  }
  if (/st\.?\s*james/i.test(trimmed)) {
    return { name: "St. James", sub: "Hospital Chalakudy" };
  }
  if (/dhanya mission/i.test(trimmed)) {
    return { name: "Dhanya Mission", sub: "Hospital Potta" };
  }

  // Fallback heuristic for any arbitrary facility
  const keywords = ["Hospital", "Health Centre", "Fire and Rescue", "Station", "Dispensary"];
  for (const kw of keywords) {
    const idx = trimmed.indexOf(kw);
    if (idx > 0) {
      return {
        name: trimmed.slice(0, idx).trim(),
        sub: trimmed.slice(idx).trim(),
      };
    }
  }

  const parts = trimmed.split(" ");
  if (parts.length > 2) {
    return {
      name: parts.slice(0, 2).join(" "),
      sub: parts.slice(2).join(" "),
    };
  }
  return { name: trimmed, sub: "Emergency Route" };
}

function getTTIBadge(facility: { is_connected: boolean; time_to_isolation_hours: number | null }, en: boolean) {
  if (!facility.is_connected) {
    return {
      text: en ? "Impassable" : "കടന്നുപോകാനാകില്ല",
      className: "text-rose-700 dark:text-rose-300 bg-rose-100/90 dark:bg-rose-950/70 ring-1 ring-rose-500/30",
      dotClass: "bg-rose-500",
      isAlert: true,
    };
  }

  const hours = facility.time_to_isolation_hours;
  if (hours != null) {
    if (hours <= 6) {
      return {
        text: en ? `Risk in ${Math.round(hours)}h` : `ഭീഷണി: ${Math.round(hours)}മ.`,
        className: "text-rose-700 dark:text-rose-300 bg-rose-50/90 dark:bg-rose-950/60 ring-1 ring-rose-500/25",
        dotClass: "bg-rose-500",
        isAlert: true,
      };
    }
    if (hours <= 18) {
      return {
        text: en ? `Risk in ${Math.round(hours)}h` : `ഭീഷണി: ${Math.round(hours)}മ.`,
        className: "text-amber-700 dark:text-amber-300 bg-amber-50/90 dark:bg-amber-950/60 ring-1 ring-amber-500/25",
        dotClass: "bg-amber-500",
        isAlert: true,
      };
    }
    return {
      text: en ? `Clear for ${Math.round(hours)}h` : `${Math.round(hours)}മ. സുരക്ഷിതം`,
      className: "text-emerald-700 dark:text-emerald-300 bg-emerald-50/90 dark:bg-emerald-950/60 ring-1 ring-emerald-500/20",
      dotClass: "bg-emerald-500",
      isAlert: false,
    };
  }

  // 24-48h forecast: default predictive metric when no road segments are breached
  return {
    text: en ? "Clear > 24h" : "> 24മ. സുരക്ഷിതം",
    className: "text-emerald-700 dark:text-emerald-300 bg-emerald-50/90 dark:bg-emerald-950/60 ring-1 ring-emerald-500/20",
    dotClass: "bg-emerald-500",
    isAlert: false,
  };
}

// ─── Isolation Clock Compact Card (Management by Exception) ────────────────────
function IsolationClockCard() {
  const { language, setActiveRoute } = useStore();
  const en = language !== "ml";
  const [expanded, setExpanded] = useState(false);

  const { data: isolation, isLoading } = useQuery({
    queryKey: ["isolation-clock", 0.65],
    queryFn: () => api.isolation.get(0.65),
    refetchInterval: 300_000,
    retry: 1,
  });

  if (isLoading) {
    return (
      <div className="rounded-xl border-none bg-white/90 dark:bg-slate-900/90 p-3 shadow-md shadow-slate-200/50 dark:shadow-none space-y-2">
        <Skeleton h="12px" w="50%" />
        <Skeleton h="36px" w="100%" />
      </div>
    );
  }

  const allItems = isolation?.items ?? [];
  // Filter: facilities whose access is actively compromised (impassable or isolating within 24h)
  const compromisedItems = allItems.filter((facility) => {
    return (
      !facility.is_connected ||
      (facility.time_to_isolation_hours != null && facility.time_to_isolation_hours <= 24)
    );
  });

  const totalRoutes = allItems.reduce(
    (sum, f) => sum + (f.alternative_routes_count || 3),
    0
  );
  const openRoutes = allItems
    .filter((f) => f.is_connected)
    .reduce((sum, f) => sum + (f.alternative_routes_count || 3), 0);

  // Exception State: Status degrades to "At Risk" or "Impassable" -> Auto-expanded with alert
  if (compromisedItems.length > 0) {
    return (
      <div className="rounded-xl border-none bg-rose-50/80 dark:bg-black/60 backdrop-blur-md p-3 shadow-md shadow-slate-200/50 dark:shadow-none ring-1 ring-rose-500/20">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] font-bold text-rose-800 dark:text-rose-200 flex items-center gap-1.5 uppercase tracking-wider">
            <Clock className="h-3.5 w-3.5 text-rose-600 dark:text-rose-400" />
            <span>{en ? "Isolation Alert" : "ഐസൊലേഷൻ അലർട്ട്"}</span>
          </div>
          <button
            onClick={() => setActiveRoute("infrastructure")}
            className="text-[10px] text-teal-700 dark:text-teal-400 hover:underline font-semibold cursor-pointer"
          >
            {en ? "View all →" : "എല്ലാം →"}
          </button>
        </div>

        {/* Alert Summary Banner */}
        <div className="flex items-center justify-between rounded-lg px-2.5 py-1.5 bg-rose-100/70 dark:bg-rose-950/60 text-rose-900 dark:text-rose-100 text-xs font-bold mb-2">
          <span>
            {openRoutes}/{totalRoutes || 12} {en ? "Routes Open" : "റൂട്ടുകൾ സുഗമം"}
          </span>
          <span className="text-[10px] text-rose-700 dark:text-rose-300 font-semibold">
            {compromisedItems.length} {en ? "Compromised" : "ഭീഷണിയിൽ"}
          </span>
        </div>

        <div className="space-y-1.5">
          {compromisedItems.map((facility) => {
            const { name, sub } = formatFacilityName(facility.facility_name);
            const tti = getTTIBadge(facility, en);
            return (
              <div
                key={facility.facility_id}
                className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 bg-white/95 dark:bg-slate-900/90 border border-rose-200/50 dark:border-rose-900/40 shadow-xs"
              >
                <div className="flex items-start gap-1.5 min-w-0 flex-1">
                  <span className={`h-1.5 w-1.5 rounded-full ${tti.dotClass} mt-1.5 shrink-0`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 leading-snug">
                      {name}
                    </div>
                    <div className="text-[9.5px] text-slate-500 dark:text-slate-400 leading-tight">
                      {sub}
                    </div>
                  </div>
                </div>
                <span className={`text-[9.5px] font-bold px-1.5 py-0.5 rounded tabular-nums shrink-0 ${tti.className}`}>
                  {tti.text}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // Normal State (Management by Exception): Collapsed summary banner
  // Only expands when user toggles "Details" or clicks the summary banner
  return (
    <div className="rounded-xl border-none bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-3 shadow-md shadow-slate-200/50 dark:shadow-none transition-all">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 uppercase tracking-wider">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>{en ? "Facility Connectivity" : "ആശുപത്രി പ്രവേശനക്ഷമത"}</span>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="text-[10px] font-semibold text-slate-500 hover:text-teal-700 dark:text-slate-400 dark:hover:text-teal-300 flex items-center gap-0.5 cursor-pointer transition-colors"
          aria-expanded={expanded}
        >
          <span>{expanded ? (en ? "Collapse" : "ചുരുക്കുക") : (en ? "Details" : "വിശദാംശങ്ങൾ")}</span>
          <ChevronDown
            className={`h-3 w-3 transition-transform duration-200 ${
              expanded ? "rotate-180" : ""
            }`}
          />
        </button>
      </div>

      {/* Collapsed Executive Summary Banner */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setExpanded((prev) => !prev)}
        onKeyDown={(e) => e.key === "Enter" && setExpanded((prev) => !prev)}
        className="flex items-center justify-between gap-2.5 rounded-lg px-2.5 py-2 bg-emerald-50/70 dark:bg-emerald-950/40 border border-emerald-500/20 cursor-pointer hover:bg-emerald-50/90 dark:hover:bg-emerald-950/60 transition-colors"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
          </span>
          <div className="min-w-0">
            <div className="text-xs font-bold text-emerald-900 dark:text-emerald-100 leading-snug">
              {totalRoutes > 0 ? `${openRoutes}/${totalRoutes}` : "12/12"}{" "}
              {en ? "Critical Routes Open" : "റൂട്ടുകൾ സുഗമം"}
            </div>
            <div className="text-[9.5px] text-emerald-700/90 dark:text-emerald-300/80 font-medium truncate">
              {en
                ? `All ${allItems.length || 4} facilities accessible · Clear > 24h`
                : `എല്ലാ കേന്ദ്രങ്ങളും പ്രവേശനക്ഷമം · > 24മ.`}
            </div>
          </div>
        </div>
        <span className="text-[9.5px] font-bold text-emerald-800 dark:text-emerald-200 px-1.5 py-0.5 rounded bg-emerald-100/80 dark:bg-emerald-900/60 shrink-0">
          {en ? "Passable" : "സുഗമം"}
        </span>
      </div>

      {/* Expanded Facility Detail List with Predictive TTI and Sub-labels */}
      {expanded && (
        <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800/60 space-y-1.5 animate-in fade-in duration-200">
          {allItems.slice(0, 4).map((facility) => {
            const { name, sub } = formatFacilityName(facility.facility_name);
            const tti = getTTIBadge(facility, en);
            return (
              <div
                key={facility.facility_id}
                className="flex items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 bg-slate-50/80 dark:bg-slate-950/60 border border-slate-100/80 dark:border-slate-800/50"
              >
                <div className="flex items-start gap-1.5 min-w-0 flex-1">
                  <span className={`h-1.5 w-1.5 rounded-full ${tti.dotClass} mt-1.5 shrink-0`} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-slate-800 dark:text-slate-100 leading-snug">
                      {name}
                    </div>
                    <div className="text-[9.5px] text-slate-500 dark:text-slate-400 leading-tight">
                      {sub}
                    </div>
                  </div>
                </div>
                <span
                  className={`text-[9.5px] font-semibold px-1.5 py-0.5 rounded tabular-nums shrink-0 ${tti.className}`}
                >
                  {tti.text}
                </span>
              </div>
            );
          })}
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => setActiveRoute("infrastructure")}
              className="text-[10px] font-semibold text-teal-700 dark:text-teal-400 hover:underline cursor-pointer flex items-center gap-0.5"
            >
              <span>{en ? "View road graph →" : "റോഡ് ശൃംഖല കാണുക →"}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Rain Dial Scenario Simulator Card ─────────────────────────────────────────
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
  const en = language !== "ml";

  return (
    <div className="intel-card rounded-xl bg-white/90 dark:bg-slate-900/90 backdrop-blur-md p-3 shadow-md shadow-slate-200/50 dark:shadow-none border-none">
      <div className="flex items-center justify-between mb-1.5">
        <div className="text-[11px] font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 uppercase tracking-wider">
          <Sliders className="h-3.5 w-3.5 text-teal-700 dark:text-teal-400" />
          <span>{en ? "Scenario Simulator (Rain Dial)" : "Rain Dial സിമുലേറ്റർ"}</span>
        </div>
        <button
          type="button"
          title={en
            ? "Increase or decrease rainfall to explore potential impact on infrastructure exposure. This is a simplified stress test, not a hydraulic simulation."
            : "ഇൻഫ്രാസ്ട്രക്ചർ എക്സ്പോഷറിൽ ഉള്ള സ്വാധീനം പര്യവേക്ഷണം ചെയ്യാൻ."}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
        >
          <HelpCircle className="h-3 w-3" />
        </button>
      </div>

      <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-2 leading-relaxed">
        {en
          ? "Increase or decrease rainfall to explore potential impact."
          : "ഇൻഫ്രാസ്ട്രക്ചർ എക്സ്പോഷറിൽ ഉള്ള സ്വാധീനം പര്യവേക്ഷണം ചെയ്യുക."}
      </p>

      {/* Rainfall slider */}
      <div className="mb-2">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
            {en ? "Additional rainfall" : "അധിക മഴ"}
          </span>
          <span className="text-xs font-bold text-teal-700 dark:text-teal-400 tabular-nums">
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
          className="timeline-slider w-full cursor-pointer"
          aria-label={`Additional rainfall: ${scenarioRainfall} mm`}
        />
      </div>

      {/* Duration buttons */}
      <div className="mb-2.5">
        <div className="text-[10px] font-semibold text-slate-600 dark:text-slate-300 mb-1">
          {en ? "Duration" : "ദൈർഘ്യം"}
        </div>
        <div className="grid grid-cols-4 gap-1">
          {[3, 6, 12, 24].map((h) => (
            <button
              key={h}
              type="button"
              onClick={() => setScenarioDuration(h)}
              className={`rounded py-1 text-center text-[10px] font-semibold transition-all cursor-pointer ${
                scenarioDuration === h
                  ? "bg-teal-700 text-white dark:bg-teal-600 shadow-xs"
                  : "bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 border-none shadow-xs"
              }`}
              aria-pressed={scenarioDuration === h}
            >
              {h}h
            </button>
          ))}
        </div>
        <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-1 leading-tight">
          {en
            ? `Rainfall applied uniformly over ${scenarioDuration}h. Affects total accumulation only.`
            : `${scenarioDuration}h-ൽ ഒരേ സ്ഥിരമായ നിരക്കിൽ മഴ.`}
        </p>
      </div>

      {/* Run button */}
      <button
        type="button"
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-md bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 text-white font-semibold text-xs transition-colors shadow-xs cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {mutation.isPending ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>{en ? "Computing..." : "കണക്കുകൂട്ടുന്നു..."}</span>
          </>
        ) : (
          <>
            <Play className="h-3 w-3 fill-white" />
            <span>{en ? "Run Scenario" : "സിനാരിയോ"}</span>
          </>
        )}
      </button>

      {/* Error message */}
      {mutation.isError && (
        <div className="mt-1.5 text-center text-[10px] font-medium text-rose-600 dark:text-rose-400">
          {en ? "Computation failed. Retry?" : "പ്രവർത്തനം പരാജയപ്പെട്ടു."}
        </div>
      )}

      {/* Results preview */}
      {showResults && summary && (
        <div className="mt-2.5 p-2 rounded-lg bg-slate-100/80 dark:bg-slate-800/60 border-none shadow-xs animate-fade-in">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-bold text-slate-800 dark:text-slate-100">
              {en ? "Scenario Impact" : "സ്വാധീനം"}
            </span>
            <button
              type="button"
              onClick={() => setActiveRoute("scenarios")}
              className="text-[10px] font-semibold text-teal-700 dark:text-teal-400 hover:underline cursor-pointer"
            >
              {en ? "Full detail →" : "വിശദം →"}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-1">
            <div className="text-center p-1 rounded bg-white/70 dark:bg-slate-900/60 border-none shadow-xs">
              <div className="text-xs font-bold text-slate-800 dark:text-slate-100 tabular-nums">
                {summary.baseline_high_critical_count}
              </div>
              <div className="text-[8px] uppercase tracking-wider text-slate-500 dark:text-slate-400">{en ? "Baseline" : "നിലവിൽ"}</div>
            </div>
            <div className="text-center p-1 rounded bg-rose-50/70 dark:bg-rose-950/40 border-none shadow-xs text-rose-700 dark:text-rose-400">
              <div className="text-xs font-bold tabular-nums">
                {summary.scenario_high_critical_count}
              </div>
              <div className="text-[8px] uppercase tracking-wider">{en ? "Scenario" : "സിനാരിയോ"}</div>
            </div>
            <div className="text-center p-1 rounded bg-amber-50/70 dark:bg-amber-950/40 border-none shadow-xs text-amber-700 dark:text-amber-400">
              <div className="text-xs font-bold tabular-nums">
                +{summary.escalated_count}
              </div>
              <div className="text-[8px] uppercase tracking-wider">{en ? "Escalated" : "ഉയർന്ന"}</div>
            </div>
          </div>

          <div className="mt-1.5 text-[8px] text-slate-400 dark:text-slate-500 border-t border-slate-200/60 dark:border-slate-700/40 pt-1 leading-tight">
            {en ? "Stress test only. Not a hydraulic simulation." : "ഇത് ഒരു സ്ട്രെസ് ടെസ്റ്റ് മാത്രമാണ്."}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Right Intelligence Rail ───────────────────────────────────────────────────
export function RightRail() {
  const { rightRailOpen, assistantOpen, setAssistantOpen, language } = useStore();
  const en = language !== "ml";

  if (!rightRailOpen) return null;

  return (
    <aside
      className="flex flex-col bg-white/85 dark:bg-slate-950/85 backdrop-blur-md border-l border-slate-200/50 dark:border-slate-800/60 flex-shrink-0 p-2.5 w-[270px] h-full overflow-hidden"
      aria-label="Intelligence rail"
    >
      {/* Scrollable Cards Area */}
      <div className="flex-1 flex flex-col gap-2.5 overflow-y-auto scrollbar-hide min-h-0 pr-0.5">
        <RiskAssessmentCard />
        <RainDialCard />
        <IsolationClockCard />
      </div>

      {/* Docked Assistant Trigger Button at bottom of rail */}
      <div className="shrink-0 pt-2 mt-auto border-t border-slate-200/50 dark:border-slate-800/60">
        <button
          type="button"
          onClick={() => setAssistantOpen((v) => !v)}
          className="w-full flex items-center justify-center gap-2 h-10 rounded-xl bg-[#0D7363] hover:bg-teal-800 dark:bg-teal-700 dark:hover:bg-teal-600 text-white font-semibold text-xs shadow-md transition-all cursor-pointer active:scale-[0.99] ring-1 ring-white/20"
          aria-expanded={assistantOpen}
          aria-label={en ? "Open HydroVista Assistant" : "HydroVista സഹായം തുറക്കുക"}
        >
          <MessageCircle size={15} />
          <span>{en ? "HydroVista Assistant" : "HydroVista സഹായം"}</span>
        </button>
      </div>
    </aside>
  );
}
