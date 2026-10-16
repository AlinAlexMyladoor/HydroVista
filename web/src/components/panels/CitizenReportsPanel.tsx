"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/store";
import { translations } from "@/lib/translations";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, ReportCreate } from "@/lib/api";
import {
  Users,
  AlertTriangle,
  Send,
  MapPin,
  Clock,
  CheckCircle,
  ExternalLink,
  ShieldAlert,
} from "lucide-react";

export function CitizenReportsPanel() {
  const { language, setSelectedAssetId, setActivePanel } = useStore();
  const t = translations[language];
  const queryClient = useQueryClient();

  const [lat, setLat] = useState<number>(10.307);
  const [lon, setLon] = useState<number>(76.332);
  const [depth, setDepth] = useState<number>(30);
  const [description, setDescription] = useState("");
  const [reporterName, setReporterName] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const { data: reports, isLoading } = useQuery({
    queryKey: ["reports-list"],
    queryFn: () => api.reports.list(),
  });

  const mutation = useMutation({
    mutationFn: (body: ReportCreate) => api.reports.submit(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports-list"] });
      setDescription("");
      setSubmitSuccess(true);
      setTimeout(() => setSubmitSuccess(false), 4000);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;
    mutation.mutate({
      lat,
      lon,
      reported_depth_cm: depth,
      description: description.trim(),
      reporter_name: reporterName.trim() || undefined,
    });
  };

  const reportList = Array.isArray(reports) ? reports : [];

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden select-none">
      {/* Header */}
      <div className="p-4 border-b border-border bg-surface flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-serif font-bold text-text">
            {t.reportsTitle}
          </h2>
          <span className="badge bg-amber-50 text-warning-dark border border-amber-200 font-mono text-[10px]">
            Unverified Crowdsourced
          </span>
        </div>
        <p className="text-xs text-text-secondary">
          {t.reportsNotice}
        </p>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4 scrollbar-thin">
        {/* Submit Report Form Card */}
        <div className="bg-surface p-4 rounded-md border border-border shadow-card space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h3 className="text-xs font-semibold text-text uppercase tracking-wider flex items-center gap-1.5">
              <Send className="w-3.5 h-3.5 text-primary" />
              {t.submitReport}
            </h3>
            <span className="text-2xs text-text-secondary font-mono">
              Basin Ground Observations
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-text-secondary mb-1">
                  Latitude (°N)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={lat}
                  onChange={(e) => setLat(parseFloat(e.target.value))}
                  className="w-full bg-background border border-border rounded px-2.5 py-1.5 text-xs text-text font-mono focus:outline-none focus:border-primary"
                  required
                />
              </div>
              <div>
                <label className="block text-text-secondary mb-1">
                  Longitude (°E)
                </label>
                <input
                  type="number"
                  step="0.0001"
                  value={lon}
                  onChange={(e) => setLon(parseFloat(e.target.value))}
                  className="w-full bg-background border border-border rounded px-2.5 py-1.5 text-xs text-text font-mono focus:outline-none focus:border-primary"
                  required
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="text-text-secondary">
                  {t.waterDepth}
                </label>
                <span className="font-mono font-bold text-primary">{depth} cm</span>
              </div>
              <input
                type="range"
                min="5"
                max="250"
                step="5"
                value={depth}
                onChange={(e) => setDepth(parseInt(e.target.value))}
                className="w-full h-1.5 bg-border rounded cursor-pointer accent-primary"
              />
            </div>

            <div>
              <label className="block text-text-secondary mb-1">
                {t.notes}
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="E.g., Water spilling over service road near Chalakudy Railway Bridge..."
                rows={2}
                className="w-full bg-background border border-border rounded px-2.5 py-1.5 text-xs text-text focus:outline-none focus:border-primary placeholder:text-text-secondary"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <div>
                <label className="block text-text-secondary mb-1">
                  {t.reporterName}
                </label>
                <input
                  type="text"
                  value={reporterName}
                  onChange={(e) => setReporterName(e.target.value)}
                  placeholder="Optional name / affiliation"
                  className="w-full bg-background border border-border rounded px-2.5 py-1.5 text-xs text-text focus:outline-none focus:border-primary placeholder:text-text-secondary"
                />
              </div>
              <button
                type="submit"
                disabled={mutation.isPending || !description.trim()}
                className="btn-primary py-2 flex items-center justify-center gap-1.5 text-xs disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{mutation.isPending ? "Posting..." : t.submitBtn}</span>
              </button>
            </div>

            {submitSuccess && (
              <div className="p-2 bg-green-50 text-green-800 text-2xs rounded border border-green-200 flex items-center gap-1.5 font-medium animate-fade-in">
                <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                <span>Report successfully posted as unverified community observation.</span>
              </div>
            )}
          </form>
        </div>

        {/* Existing Community Reports List */}
        <div className="bg-surface p-4 rounded-md border border-border shadow-card space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h3 className="text-xs font-semibold text-text uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-primary" />
              Recent Field Observations ({reportList.length})
            </h3>
            <span className="text-2xs font-mono text-text-secondary">
              Crowdsourced log
            </span>
          </div>

          <div className="space-y-2.5">
            {isLoading ? (
              <div className="p-4 text-center text-xs text-text-secondary">
                Loading community reports...
              </div>
            ) : reportList.length === 0 ? (
              <div className="p-4 text-center text-xs text-text-secondary">
                No citizen reports logged yet. Post the first water observation above.
              </div>
            ) : (
              reportList.map((r: any) => (
                <div
                  key={r.id || r.report_id}
                  className="p-3 bg-background rounded border border-border space-y-1.5 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="badge badge-medium text-[10px] font-mono">
                      Unverified Community Observation
                    </span>
                    <span className="text-2xs text-text-secondary font-mono flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {r.created_at ? new Date(r.created_at).toLocaleTimeString() : "Recent"}
                    </span>
                  </div>

                  <p className="text-text font-medium leading-relaxed">
                    {r.description}
                  </p>

                  <div className="flex flex-wrap items-center justify-between text-2xs text-text-secondary font-mono pt-1 border-t border-border">
                    <div>
                      Depth: <strong className="text-primary">{r.reported_depth_cm || "—"} cm</strong> • Loc: {Number(r.lat).toFixed(4)}°N, {Number(r.lon).toFixed(4)}°E
                    </div>
                    {r.reporter_name && <div>By: {r.reporter_name}</div>}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
