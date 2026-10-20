"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type ReportCreate } from "@/lib/api";
import { getTranslations } from "@/lib/translations";
import { Megaphone, User, Crosshair, AlertTriangle, CheckCircle2, X } from "lucide-react";

export function ReportsView() {
  const { language, focusMap, setActiveRoute } = useStore();
  const t = getTranslations(language);
  const queryClient = useQueryClient();

  // Form state
  const [reporterName, setReporterName] = useState("");
  const [lat, setLat] = useState("10.3072");
  const [lon, setLon] = useState("76.3314");
  const [depthCm, setDepthCm] = useState("25");
  const [description, setDescription] = useState("");
  const [statusMsg, setStatusMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const { data: reportsData, isLoading } = useQuery({
    queryKey: ["citizen-reports"],
    queryFn: () => api.reports.list(),
    staleTime: 30_000,
    retry: false,
  });

  const submitMutation = useMutation({
    mutationFn: (body: ReportCreate) => api.reports.submit(body),
    onSuccess: () => {
      setStatusMsg({
        type: "success",
        text: language !== "ml" ? "Report submitted successfully! Thank you for ground-truth data." : "വിവരം വിജയകരമായി രേഖപ്പെടുത്തി!",
      });
      setDescription("");
      setDepthCm("");
      queryClient.invalidateQueries({ queryKey: ["citizen-reports"] });
    },
    onError: (err: any) => {
      setStatusMsg({
        type: "error",
        text: err?.message || (language !== "ml" ? "Could not submit the report. Please check the details and try again." : "സന്ദേശം അയക്കാൻ സാധിച്ചില്ല."),
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (description.trim().length < 10) return;
    const latitude = Number(lat);
    const longitude = Number(lon);
    if (!Number.isFinite(latitude) || latitude < 9.5 || latitude > 11.5) {
      setStatusMsg({ type: "error", text: "Latitude must be between 9.5° and 11.5° for this service area." });
      return;
    }
    if (!Number.isFinite(longitude) || longitude < 76 || longitude > 77.5) {
      setStatusMsg({ type: "error", text: "Longitude must be between 76° and 77.5° for this service area." });
      return;
    }
    submitMutation.mutate({
      lat: latitude,
      lon: longitude,
      reported_depth_cm: depthCm.trim() ? Number(depthCm) : undefined,
      description: description.trim(),
      reporter_name: reporterName.trim() || "Anonymous Field Observer",
    });
  };

  const setPresetLoc = (presetLat: string, presetLon: string) => {
    setLat(presetLat);
    setLon(presetLon);
  };

  const handleViewOnMap = (latitude: number, longitude: number) => {
    const success = focusMap(latitude, longitude);
    if (success) {
      setActiveRoute("overview");
    } else {
      setStatusMsg({ type: "error", text: "This report has no valid map coordinates." });
    }
  };

  // Severity-coded water depth badge: yellow for 20-50cm, orange for 50-100cm, red for >100cm
  const renderDepthBadge = (depth?: number) => {
    if (depth == null) return null;
    const d = Number(depth);

    if (d >= 100) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-bold font-mono uppercase bg-red-100 text-red-700 border border-red-200 dark:bg-red-950/60 dark:text-red-300 dark:border-red-900 shadow-2xs">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-red-600"></span>
          </span>
          <span>{d} CM</span>
        </span>
      );
    }
    if (d >= 50) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-bold font-mono uppercase bg-orange-100 text-orange-800 border border-orange-200 dark:bg-orange-950/60 dark:text-orange-300 dark:border-orange-900 shadow-2xs">
          <span className="h-2 w-2 rounded-full bg-orange-600"></span>
          <span>{d} CM</span>
        </span>
      );
    }
    if (d >= 20) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-sm font-bold font-mono uppercase bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-900 shadow-2xs">
          <span className="h-2 w-2 rounded-full bg-amber-600"></span>
          <span>{d} CM</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-bold font-mono uppercase bg-emerald-100 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900 shadow-2xs">
        <span className="h-2 w-2 rounded-full bg-emerald-600"></span>
        <span>{d} CM</span>
      </span>
    );
  };

  const rawItems = (reportsData as any)?.items || (Array.isArray(reportsData) ? reportsData : null);
  const reportsList = rawItems ?? [];

  return (
    <div className="flex-1 w-full h-[calc(100dvh-3.5rem)] lg:h-[calc(100vh-4rem)] lg:max-h-[calc(100vh-4rem)] flex flex-col lg:flex-row gap-4 sm:gap-6 p-3 sm:p-6 pb-20 lg:pb-6 overflow-y-auto lg:overflow-hidden bg-slate-50 dark:bg-[#070b12] text-[#1E292B] dark:text-slate-100">
      
      {/* Left Column: Submit Form */}
      <div className="w-full lg:w-1/3 lg:max-w-md shrink-0 flex flex-col min-h-0">
        <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 sm:p-5 shadow-md shadow-slate-200/50 dark:shadow-slate-950/60 border-0 flex flex-col flex-1 min-h-0 lg:overflow-y-auto">
          <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider mb-4 shrink-0 flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-teal-700 dark:text-teal-400" />
            <span>{language !== "ml" ? "Submit Field Observation" : "പുതിയ വിവരം അറിയിക്കുക"}</span>
          </h3>

          {statusMsg && (
            <div
              className={`p-3 rounded-xl text-xs mb-4 font-medium flex items-center justify-between shrink-0 ${
                statusMsg.type === "success"
                  ? "bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-200 dark:border-emerald-800/60"
                  : "bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-200 dark:border-rose-800/60"
              }`}
            >
              <div className="flex items-center gap-2">
                {statusMsg.type === "success" ? <CheckCircle2 className="h-4 w-4 shrink-0" /> : <AlertTriangle className="h-4 w-4 shrink-0" />}
                <span>{statusMsg.text}</span>
              </div>
              <button type="button" onClick={() => setStatusMsg(null)} className="text-slate-500 hover:text-slate-700">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs flex-1 flex flex-col justify-between">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  {language !== "ml" ? "Observer / Affiliation" : "പേര് / വിവരദാതാവ്"}
                </label>
                <input
                  type="text"
                  autoComplete="name"
                  maxLength={100}
                  placeholder={language !== "ml" ? "e.g., Ward 4 Volunteer / Suresh K." : "പേര് അല്ലെങ്കിൽ തസ്തിക"}
                  value={reporterName}
                  onChange={(e) => setReporterName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-teal-500 focus:border-teal-600 focus:outline-none transition-all"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    {language !== "ml" ? "Location Presets" : "സ്ഥലങ്ങൾ"}
                  </label>
                  <span className="text-xs text-slate-400 dark:text-slate-500">Quick select</span>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2.5">
                  <button
                    type="button"
                    onClick={() => setPresetLoc("10.3072", "76.3314")}
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs rounded-lg text-slate-700 dark:text-slate-300 font-medium transition-colors cursor-pointer"
                  >
                    Chalakudy Town
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresetLoc("10.2840", "76.3680")}
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs rounded-lg text-slate-700 dark:text-slate-300 font-medium transition-colors cursor-pointer"
                  >
                    Meloor
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresetLoc("10.3245", "76.3621")}
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs rounded-lg text-slate-700 dark:text-slate-300 font-medium transition-colors cursor-pointer"
                  >
                    Pariyaram
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresetLoc("10.2710", "76.3190")}
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-xs rounded-lg text-slate-700 dark:text-slate-300 font-medium transition-colors cursor-pointer"
                  >
                    Kadukutty
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Latitude</span>
                    <input
                      type="number"
                      required
                      min="9.5"
                      max="11.5"
                      step="0.0001"
                      value={lat}
                      onChange={(e) => setLat(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 py-2 font-mono text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <span className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">Longitude</span>
                    <input
                      type="number"
                      required
                      min="76"
                      max="77.5"
                      step="0.0001"
                      value={lon}
                      onChange={(e) => setLon(e.target.value)}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3 py-2 font-mono text-xs text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-teal-500 focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  {language !== "ml" ? "Observed Water Depth (cm)" : "വെള്ളപ്പൊക്ക ഉയരം (സെ.മീ)"}
                </label>
                <input
                  type="number"
                  min="0"
                  max="500"
                  placeholder="e.g., 30"
                  value={depthCm}
                  onChange={(e) => setDepthCm(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-teal-500 focus:border-teal-600 focus:outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
                  {language !== "ml" ? "Field Observation Description" : "വിവരണം / നിലവിലെ അവസ്ഥ"}
                </label>
                <textarea
                  rows={3}
                  required
                  minLength={10}
                  maxLength={1000}
                  placeholder={language !== "ml" ? "Describe road condition, stranded households, or river overflow..." : "വിശദമായ വിവരങ്ങൾ നൽകുക..."}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:ring-2 focus:ring-teal-500 focus:border-teal-600 focus:outline-none transition-all"
                />
              </div>

              {description.trim().length > 0 && description.trim().length < 10 && (
                <div className="text-xs text-amber-600 dark:text-amber-400 font-medium">Please enter at least 10 characters.</div>
              )}
            </div>

            {/* Primary Action Button Branded in Deep Teal */}
            <div className="pt-3">
              <button
                type="submit"
                disabled={submitMutation.isPending || description.trim().length < 10}
                className="w-full rounded-xl bg-teal-700 hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500 py-3 text-sm font-bold text-white shadow-md shadow-teal-900/20 active:scale-[0.99] transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
              >
                <Megaphone className={`h-4 w-4 ${submitMutation.isPending ? "animate-pulse" : ""}`} aria-hidden="true" />
                <span>
                  {submitMutation.isPending ? "Submitting..." : (language !== "ml" ? "Broadcast Field Report" : "വിവരം സമർപ്പിക്കുക")}
                </span>
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* Right Column: Observation Feed */}
      <div className="flex-1 flex flex-col min-h-[360px] lg:min-h-0">
        <div className="shrink-0 flex items-center justify-between mb-3 px-1">
          <h3 className="text-xs font-bold text-slate-800 dark:text-slate-100 uppercase tracking-wider flex items-center gap-2">
            <span>{language !== "ml" ? "Recent Basin Observations" : "ഏറ്റവും പുതിയ വിവരങ്ങൾ"}</span>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
              {reportsList.length}
            </span>
          </h3>
        </div>

        {/* Scrollable observation feed */}
        <div className="flex-1 min-h-0 lg:overflow-y-auto space-y-4 pr-0 lg:pr-1.5 pb-2">
          {reportsList.length === 0 && (
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-8 shadow-md shadow-slate-200/50 dark:shadow-slate-950/60 text-center text-slate-400 dark:text-slate-500">
              <User className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-600 mb-2" />
              <div className="text-sm font-semibold">
                {language !== "ml" ? "No community reports submitted yet." : "റിപ്പോർട്ടുകളൊന്നും സമർപ്പിച്ചിട്ടില്ല."}
              </div>
              <div className="text-xs mt-1">
                {language !== "ml" ? "Reports appear here live once broadcasted through the field form." : "വിവരങ്ങൾ ഇവിടെ തത്സമയം കാണാം."}
              </div>
            </div>
          )}

          {reportsList.map((rep: any) => (
            <div
              key={rep.id}
              className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-md shadow-slate-200/50 dark:shadow-slate-950/60 border-0 transition-all hover:shadow-lg hover:shadow-slate-200/60 dark:hover:shadow-slate-950/80 group"
            >
              {/* Header: Avatar, Name, Status, and Severity Depth Badge */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  {/* Circular User Avatar Placeholder */}
                  <div className="h-10 w-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 text-slate-500 dark:text-slate-400 shadow-2xs">
                    <User className="h-5 w-5" aria-hidden="true" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5">
                      {/* Observer Identity Header */}
                      <span className="text-base font-semibold text-slate-800 dark:text-slate-100">
                        {rep.reporter_name || "Community Observer"}
                      </span>
                      {/* Bold Status Badge */}
                      {rep.status === "unverified" ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-900/60 shadow-2xs">
                          UNVERIFIED
                        </span>
                      ) : rep.status === "verified" ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900/60 shadow-2xs">
                          VERIFIED
                        </span>
                      ) : null}
                    </div>
                    {/* Bumped Up Metadata */}
                    <div className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5 flex items-center gap-2">
                      <span>Lat {Number(rep.lat).toFixed(4)}, Lon {Number(rep.lon).toFixed(4)}</span>
                      <span>•</span>
                      <span>{rep.submitted_at ? new Date(rep.submitted_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "Recently"}</span>
                    </div>
                  </div>
                </div>

                {/* Bold Color-Coded Depth Badge */}
                {renderDepthBadge(rep.reported_depth_cm)}
              </div>

              {/* Elevated Core Message: text-base text-slate-900 bg-slate-50 */}
              <div className="mt-3.5 bg-slate-50 dark:bg-slate-800/50 p-3.5 rounded-xl border border-slate-100/80 dark:border-slate-800/50">
                <p className="text-base font-medium text-slate-900 dark:text-slate-100 leading-relaxed">
                  {rep.description}
                </p>
              </div>

              {/* Footer: Date & Upgraded 3D Map Ghost Pill Button */}
              <div className="flex items-center justify-between mt-3.5 pt-2 text-xs text-slate-500 dark:text-slate-400 font-mono font-medium">
                <span>
                  {rep.submitted_at ? new Date(rep.submitted_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : ""}
                </span>
                
                {/* High-Contrast Ghost Pill for Map Action */}
                <button
                  type="button"
                  onClick={() => handleViewOnMap(Number(rep.lat), Number(rep.lon))}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-teal-50 text-teal-700 hover:bg-teal-600 hover:text-white border border-teal-200/80 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800/80 dark:hover:bg-teal-600 dark:hover:text-white transition-all shadow-2xs cursor-pointer group/btn"
                  title={language !== "ml" ? "Fly camera to report location on 3D map" : "ഭൂപടത്തിൽ കാണിക്കുക"}
                >
                  <Crosshair className="h-3.5 w-3.5 transition-transform group-hover/btn:scale-110" aria-hidden="true" />
                  <span>{language !== "ml" ? "View on 3D Map" : "ഭൂപടത്തിൽ കാണുക"}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}

