"use client";

import React, { useState } from "react";
import { useStore } from "@/lib/store";
import { getTranslations } from "@/lib/translations";
import { useQuery } from "@tanstack/react-query";
import { api, IsolationResponse, IsolationResult } from "@/lib/api";
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  Route,
  Shield,
  HelpCircle,
  Sliders,
  ExternalLink,
} from "lucide-react";

export function IsolationClockPanel() {
  const { language, focusMap } = useStore();
  const t = getTranslations(language);
  const [threshold, setThreshold] = useState<number>(0.6);

  const { data: isolationData, isLoading, refetch } = useQuery<IsolationResponse>({
    queryKey: ["isolation-clock", threshold],
    queryFn: () => api.isolation.get(threshold),
  });

  const items = isolationData?.items || [];
  const safeAnchors = isolationData?.safe_access_anchors || [];

  const disconnectedCount = items.filter((i) => !i.is_connected).length;
  const connectedCount = items.filter((i) => i.is_connected).length;

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden select-none">
      {/* Header & Metric Banner */}
      <div className="p-4 border-b border-border bg-surface flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-serif font-bold text-text">
                {t.isolationTitle}
              </h2>
              <span className="badge bg-surface-secondary text-primary font-mono text-[10px]">
                Graph Shortest Path
              </span>
            </div>
            <p className="text-xs text-text-secondary mt-0.5">
              {t.isolationSubtitle}
            </p>
          </div>

          {/* Quick stats pills */}
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded bg-green-50 text-green-700 border border-green-200 font-medium flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{connectedCount} Connected</span>
            </span>
            <span className="px-2.5 py-1 rounded bg-red-50 text-alert border border-red-200 font-medium flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>{disconnectedCount} At Cutoff Risk</span>
            </span>
          </div>
        </div>

        {/* Threshold Slider & Safe Hubs */}
        <div className="p-3 bg-surface-secondary/40 rounded border border-border flex flex-wrap items-center justify-between gap-4 text-xs">
          <div className="flex items-center gap-3">
            <Sliders className="w-4 h-4 text-primary flex-shrink-0" />
            <div className="flex items-center gap-2">
              <span className="text-text font-medium">Road Inundation Closure Threshold:</span>
              <span className="font-mono font-bold text-primary bg-surface px-1.5 py-0.5 rounded border border-border">
                {threshold.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              min="0.3"
              max="0.9"
              step="0.05"
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              className="w-28 h-1.5 bg-border rounded cursor-pointer accent-primary"
            />
          </div>

          {/* Safe Access Hubs Badges */}
          <div className="flex items-center gap-2 text-2xs text-text-secondary">
            <span className="font-medium text-text">Safe Access Hubs:</span>
            {safeAnchors.map((anchor) => (
              <span
                key={anchor.id}
                className="bg-surface px-2 py-0.5 rounded border border-border font-mono text-text"
              >
                {anchor.name}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Facility Cards List */}
      <div className="flex-1 overflow-auto p-4 space-y-3 scrollbar-thin">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-text-secondary">
            Computing network routing accessibility graph...
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-xs text-text-secondary">
            No hospital or shelter facilities loaded.
          </div>
        ) : (
          items.map((facility) => {
            const isConnected = facility.is_connected;
            return (
              <div
                key={facility.facility_id}
                className={`p-3.5 rounded-md border transition-all ${
                  isConnected
                    ? "bg-surface border-border hover:border-primary/40"
                    : "bg-red-50/20 border-red-200 shadow-xs"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold text-text text-sm">
                        {facility.facility_name || "Regional Health Facility"}
                      </h4>
                      <span className="badge uppercase font-mono text-[9px] bg-surface-secondary text-text-secondary">
                        {facility.facility_type}
                      </span>
                    </div>
                    <div className="text-2xs text-text-secondary font-mono">
                      Coordinates: {facility.lat.toFixed(4)}°N, {facility.lon.toFixed(4)}°E
                    </div>
                  </div>

                  {/* Status Indicator Badge */}
                  <div className="flex items-center gap-2">
                    {isConnected ? (
                      <span className="badge badge-low text-xs py-1 px-2.5 flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-600" />
                        <span>{t.connectedStatus}</span>
                      </span>
                    ) : (
                      <span className="badge badge-critical text-xs py-1 px-2.5 flex items-center gap-1 font-semibold">
                        <AlertTriangle className="w-3.5 h-3.5 text-alert" />
                        <span>{t.cutoffStatus}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Algorithmic Details */}
                <div className="mt-3 pt-2.5 border-t border-border grid grid-cols-1 sm:grid-cols-3 gap-2 text-2xs">
                  <div className="bg-background p-2 rounded border border-border">
                    <span className="text-text-secondary block">Route Redundancy:</span>
                    <span className="font-mono font-bold text-text text-xs">
                      {facility.alternative_routes_count} valid alternative paths
                    </span>
                  </div>

                  <div className="bg-background p-2 rounded border border-border">
                    <span className="text-text-secondary block">{t.estimatedTimeToCutoff}:</span>
                    <span
                      className={`font-mono font-bold text-xs ${
                        facility.time_to_isolation_hours !== null && facility.time_to_isolation_hours <= 12
                          ? "text-alert"
                          : "text-text"
                      }`}
                    >
                      {facility.time_to_isolation_hours !== null
                        ? `~${facility.time_to_isolation_hours.toFixed(0)} hours`
                        : "Connectivity Maintained"}
                    </span>
                  </div>

                  <div className="bg-background p-2 rounded border border-border flex items-center justify-between">
                    <div>
                      <span className="text-text-secondary block">Inspect Node:</span>
                      <span className="font-mono text-text">Locate on Map</span>
                    </div>
                    <button
                      onClick={() => {
                        focusMap(facility.lat, facility.lon, facility.facility_id);
                      }}
                      className="p-1 text-primary hover:bg-surface-secondary rounded"
                      title="Inspect facility on Map"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Flagged edges warning if cut off */}
                {facility.flagged_edges && facility.flagged_edges.length > 0 && (
                  <div className="mt-2 text-2xs text-alert bg-red-50 p-2 rounded border border-red-200">
                    <strong>Severed Corridors:</strong>{" "}
                    {facility.flagged_edges.join(", ")}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
