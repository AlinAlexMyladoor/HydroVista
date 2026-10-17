"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/store";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, type ReportCreate } from "@/lib/api";
import { translations } from "@/lib/translations";

export function ReportsView() {
  const { language, focusMap } = useStore();
  const t = translations[language];
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
        text: language === "en" ? "Report submitted successfully! Thank you for ground-truth data." : "വിവരം വിജയകരമായി രേഖപ്പെടുത്തി!",
      });
      setDescription("");
      setDepthCm("");
      queryClient.invalidateQueries({ queryKey: ["citizen-reports"] });
    },
    onError: (err: any) => {
      setStatusMsg({
        type: "error",
        text: err?.message || (language === "en" ? "Could not submit the report. Please check the details and try again." : "സന്ദേശം അയക്കാൻ സാധിച്ചില്ല."),
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

  const rawItems = (reportsData as any)?.items || (Array.isArray(reportsData) ? reportsData : null);
  const reportsList = rawItems ?? [];

  return (
    <div className="flex-1 flex flex-col overflow-y-auto bg-[#F7F8F4] p-6 text-[#26332F]">
      {/* Title */}
      <div className="pb-6 border-b border-[#E2E8F0]">
        <div className="flex items-center gap-2">
          <span className="text-xl">📢</span>
          <h1 className="text-xl font-bold text-[#1E292B]">
            {language === "en" ? "Community field reports" : "തദ്ദേശീയ പ്രളയ വിവര ശേഖരണം"}
          </h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 my-6">
        {/* Form Column */}
        <div className="lg:col-span-5">
          <div className="bg-white border border-[#E2E8F0] rounded-xl p-5 shadow-xs">
            <h3 className="text-xs font-bold text-[#1E292B] uppercase tracking-wider mb-4">
              {language === "en" ? "Submit Field Observation" : "പുതിയ വിവരം അറിയിക്കുക"}
            </h3>

            {statusMsg && (
              <div
                className={`p-3 rounded-lg text-xs mb-4 font-medium ${
                  statusMsg.type === "success"
                    ? "bg-[#ECFDF5] text-[#065F46] border border-[#A7F3D0]"
                    : "bg-[#FEF2F2] text-[#991B1B] border border-[#FECACA]"
                }`}
              >
                {statusMsg.text}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              <div>
                <label className="block text-[#1E292B] font-semibold mb-1">
                  {language === "en" ? "Observer / Affiliation" : "പേര് / വിവരദാതാവ്"}
                </label>
                <input
                  type="text"
                  autoComplete="name"
                  maxLength={100}
                  placeholder={language === "en" ? "e.g., Ward 4 Volunteer / Suresh K." : "പേര് അല്ലെങ്കിൽ തസ്തിക"}
                  value={reporterName}
                  onChange={(e) => setReporterName(e.target.value)}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-[#26332F] focus:ring-2 focus:ring-teal-500 focus:border-teal-600 focus:outline-none"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                  <label className="text-[#1E292B] font-semibold">
                    {language === "en" ? "Location Presets" : "സ്ഥലങ്ങൾ"}
                  </label>
                  <span className="text-[10px] text-[#687770]">Quick select</span>
                </div>
                <div className="flex flex-wrap gap-1.5 mb-2">
                  <button
                    type="button"
                    onClick={() => setPresetLoc("10.3072", "76.3314")}
                    className="px-2 py-1 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[10px] rounded text-[#475569] font-medium"
                  >
                    Chalakudy Town
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresetLoc("10.2840", "76.3680")}
                    className="px-2 py-1 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[10px] rounded text-[#475569] font-medium"
                  >
                    Meloor
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresetLoc("10.3245", "76.3621")}
                    className="px-2 py-1 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[10px] rounded text-[#475569] font-medium"
                  >
                    Pariyaram
                  </button>
                  <button
                    type="button"
                    onClick={() => setPresetLoc("10.2710", "76.3190")}
                    className="px-2 py-1 bg-[#F1F5F9] hover:bg-[#E2E8F0] text-[10px] rounded text-[#475569] font-medium"
                  >
                    Kadukutty
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <span className="text-[10px] text-[#687770]">Latitude</span>
                    <input
                      type="number"
                      required
                      min="9.5"
                      max="11.5"
                      step="0.0001"
                      value={lat}
                      onChange={(e) => setLat(e.target.value)}
                      className="w-full rounded-md border border-[#E2E8F0] bg-white px-2.5 py-1.5 font-mono text-[11px] focus:ring-2 focus:ring-teal-500 focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] text-[#687770]">Longitude</span>
                    <input
                      type="number"
                      required
                      min="76"
                      max="77.5"
                      step="0.0001"
                      value={lon}
                      onChange={(e) => setLon(e.target.value)}
                      className="w-full rounded-md border border-[#E2E8F0] bg-white px-2.5 py-1.5 font-mono text-[11px] focus:ring-2 focus:ring-teal-500 focus:border-teal-600 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[#1E292B] font-semibold mb-1">
                  {language === "en" ? "Observed Water Depth (cm)" : "വെള്ളപ്പൊക്ക ഉയരം (സെ.മീ)"}
                </label>
                <input
                  type="number"
                  min="0"
                  max="500"
                  placeholder="e.g., 30"
                  value={depthCm}
                  onChange={(e) => setDepthCm(e.target.value)}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-[#26332F] focus:ring-2 focus:ring-teal-500 focus:border-teal-600 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[#1E292B] font-semibold mb-1">
                  {language === "en" ? "Field Observation Description" : "വിവരണം / നിലവിലെ അവസ്ഥ"}
                </label>
                <textarea
                  rows={3}
                  required
                  minLength={10}
                  maxLength={1000}
                  placeholder={language === "en" ? "Describe road condition, stranded households, or river overflow..." : "വിശദമായ വിവരങ്ങൾ നൽകുക..."}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full rounded-lg border border-[#E2E8F0] bg-white px-3 py-2 text-[#26332F] focus:ring-2 focus:ring-teal-500 focus:border-teal-600 focus:outline-none"
                />
              </div>

              {description.trim().length > 0 && description.trim().length < 10 && (
                <div className="text-[11px] text-amber-700">Please enter at least 10 characters.</div>
              )}
              <button
                type="submit"
                disabled={submitMutation.isPending || description.trim().length < 10}
                className="w-full rounded-lg bg-teal-600 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-teal-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 disabled:bg-slate-400 dark:bg-teal-500 dark:text-slate-950 dark:hover:bg-teal-400"
              >
                {submitMutation.isPending ? "Submitting..." : (language === "en" ? "Broadcast Field Report" : "വിവരം സമർപ്പിക്കുക")}
              </button>
            </form>
          </div>
        </div>

        {/* Live List Column */}
        <div className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-[#1E292B] uppercase tracking-wider">
              {language === "en" ? "Recent Basin Observations" : "ഏറ്റവും പുതിയ വിവരങ്ങൾ"} ({reportsList.length})
            </h3>
          </div>

          <div className="space-y-3">
            {reportsList.length === 0 && (
              <div className="text-xs text-[#687770] p-4 border border-dashed border-[#DCE4DD] rounded-lg">
                {language === "en"
                  ? "No community reports have been submitted yet. Reports appear here once submitted through the form; none are pre-loaded."
                  : "റിപ്പോർട്ടുകളൊന്നും സമർപ്പിച്ചിട്ടില്ല."}
              </div>
            )}
            {reportsList.map((rep: any) => (
              <div key={rep.id} className="bg-white border border-[#E2E8F0] rounded-xl p-4 shadow-xs">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-semibold text-xs text-[#1E292B] flex items-center gap-2">
                      <span>{rep.reporter_name || "Community Observer"}</span>
                      {rep.status === "unverified" && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-50 text-amber-700">
                          UNVERIFIED
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-[#687770] font-mono mt-0.5">
                      Lat {Number(rep.lat).toFixed(4)}, Lon {Number(rep.lon).toFixed(4)}
                    </div>
                  </div>

                  {rep.reported_depth_cm && (
                    <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-[#FEF3C7] text-[#B45309]">
                      {rep.reported_depth_cm} cm
                    </span>
                  )}
                </div>

                <p className="text-xs text-[#334155] mt-2.5 leading-relaxed bg-[#F8FAFC] p-2.5 rounded-lg border border-[#F1F5F9]">
                  {rep.description}
                </p>

                <div className="flex items-center justify-between mt-3 text-[10px] text-[#94A3B8]">
                  <span>
                    {rep.submitted_at ? new Date(rep.submitted_at).toLocaleString() : ""}
                  </span>
                  <button
                    onClick={() => {
                      if (!focusMap(Number(rep.lat), Number(rep.lon))) {
                        setStatusMsg({ type: "error", text: "This report has no valid map coordinates." });
                      }
                    }}
                    className="text-[#0D9488] hover:underline font-medium"
                  >
                    View on 3D Map →
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
