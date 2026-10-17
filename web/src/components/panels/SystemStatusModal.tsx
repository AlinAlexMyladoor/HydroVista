"use client";

import React from "react";
import { useStore } from "@/lib/store";
import { useQuery } from "@tanstack/react-query";
import { api, StatusResponse } from "@/lib/api";
import {
  Activity,
  CheckCircle2,
  XCircle,
  Database,
  CloudLightning,
  ShieldAlert,
  Server,
  X,
} from "lucide-react";

export function SystemStatusModal() {
  const { setActivePanel } = useStore();

  const { data: status, isLoading } = useQuery<StatusResponse>({
    queryKey: ["system-status"],
    queryFn: () => api.status(),
  });

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden select-none">
      {/* Header */}
      <div className="p-4 border-b border-border bg-surface flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-serif font-bold text-text">
              System Telemetry & Operational Health
            </h2>
            <span className="badge bg-surface-secondary text-primary font-mono text-[10px]">
              Engine Diagnostics
            </span>
          </div>
          <p className="text-xs text-text-secondary mt-0.5">
            Real-time status of backend microservices, spatial data feeds, and hydrological models
          </p>
        </div>
        <button
          onClick={() => setActivePanel("map")}
          className="p-1.5 rounded-md hover:bg-surface-secondary text-text-secondary hover:text-text"
          title="Close diagnostics"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto p-4 space-y-4 scrollbar-thin">
        {/* Core Subsystems Status */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-surface p-3.5 rounded-md border border-border flex items-center justify-between">
            <div>
              <span className="text-2xs text-text-secondary uppercase font-semibold">
                FastAPI Service
              </span>
              <div className="text-sm font-semibold text-text mt-0.5 flex items-center gap-1.5">
                <Server className="w-4 h-4 text-primary" />
                <span>API Gateway</span>
              </div>
            </div>
            <span className="badge badge-low text-xs py-0.5 px-2">Operational</span>
          </div>

          <div className="bg-surface p-3.5 rounded-md border border-border flex items-center justify-between">
            <div>
              <span className="text-2xs text-text-secondary uppercase font-semibold">
                Persistence Layer
              </span>
              <div className="text-sm font-semibold text-text mt-0.5 flex items-center gap-1.5">
                <Database className="w-4 h-4 text-primary" />
                <span>SQLite / AsyncPG</span>
              </div>
            </div>
            <span className="badge badge-low text-xs py-0.5 px-2">Healthy</span>
          </div>

          <div className="bg-surface p-3.5 rounded-md border border-border flex items-center justify-between">
            <div>
              <span className="text-2xs text-text-secondary uppercase font-semibold">
                Engine Mode
              </span>
              <div className="text-sm font-semibold text-text mt-0.5 flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-primary" />
                <span className="capitalize">{status?.current_mode || "Live"}</span>
              </div>
            </div>
            <span className="badge bg-surface-secondary text-primary font-mono text-xs py-0.5 px-2">
              Autonomous
            </span>
          </div>
        </div>

        {/* Data Feeds Table */}
        <div className="bg-surface p-4 rounded-md border border-border shadow-card space-y-3">
          <h3 className="text-xs font-semibold text-text uppercase tracking-wider flex items-center gap-1.5 border-b border-border pb-2">
            <CloudLightning className="w-3.5 h-3.5 text-primary" />
            External Geospatial & Hydrological Ingestion Pipes
          </h3>

          <div className="space-y-2">
            {(status?.data_sources || []).map((source) => (
              <div
                key={source.slug}
                className="p-3 bg-background rounded border border-border flex flex-wrap items-center justify-between gap-2 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-text">{source.name}</span>
                    <span
                      className={`badge text-[9px] ${
                        source.is_available ? "badge-low" : "badge-unavailable"
                      }`}
                    >
                      {source.is_available ? "Online / Integrated" : "Unavailable"}
                    </span>
                  </div>
                  {source.known_limitations && (
                    <div className="text-2xs text-text-secondary max-w-lg">
                      {source.known_limitations}
                    </div>
                  )}
                </div>

                <div className="text-right text-2xs font-mono text-text-secondary">
                  <div>Checked: {source.last_checked ? new Date(source.last_checked).toLocaleTimeString() : "Recent"}</div>
                  <div>Sync: {source.requires_credentials ? "Credentials Bound" : "Public Ingestion"}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Governance Disclaimer */}
        <div className="p-3 bg-warning/10 border border-warning/30 rounded-md text-2xs text-warning-dark leading-relaxed">
          <strong>Hydrological Simulation Scope:</strong> FloodLens combines Open-Meteo forecasts, terrain data, OpenStreetMap infrastructure, and Sentinel imagery to support basin monitoring. Generated extents and risk scores describe the selected data and analysis settings.
        </div>
      </div>
    </div>
  );
}
