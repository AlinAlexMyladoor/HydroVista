"use client";

import React from "react";
import { useStore, ActivePanel } from "@/lib/store";
import { translations } from "@/lib/translations";
import {
  Map,
  ListFilter,
  Clock,
  Sliders,
  Cpu,
  Users,
  Compass,
  FileText
} from "lucide-react";

export function Sidebar() {
  const { activePanel, setActivePanel, language } = useStore();
  const t = translations[language];

  const navItems: { id: ActivePanel; label: string; icon: React.ElementType; badge?: string }[] = [
    { id: "map", label: t.navMap, icon: Map },
    { id: "exposure", label: t.navExposure, icon: ListFilter },
    { id: "isolation", label: t.navIsolation, icon: Clock, badge: "Algorithmic" },
    { id: "rain-dial", label: t.navRainDial, icon: Sliders, badge: "Sim" },
    { id: "explain", label: t.navModelHealth, icon: Cpu },
    { id: "reports", label: t.navReports, icon: Users },
  ];

  return (
    <aside className="w-16 md:w-56 bg-surface border-r border-border flex flex-col justify-between select-none z-20 flex-shrink-0">
      <div className="py-3 px-2 md:px-3 space-y-1">
        <div className="px-2 py-1 hidden md:block text-2xs uppercase tracking-wider text-text-secondary font-semibold">
          Intelligence Modules
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = activePanel === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setActivePanel(item.id)}
              className={`w-full flex items-center gap-3 px-2.5 py-2.5 rounded-md text-xs font-medium transition-all group relative ${
                isActive
                  ? "bg-surface-secondary text-primary font-semibold shadow-xs"
                  : "text-text-secondary hover:text-text hover:bg-surface-secondary/50"
              }`}
              title={item.label}
            >
              <Icon
                className={`w-4 h-4 flex-shrink-0 transition-colors ${
                  isActive ? "text-primary" : "text-text-secondary group-hover:text-text"
                }`}
              />
              <span className="hidden md:inline truncate">{item.label}</span>
              {item.badge && (
                <span className="hidden md:inline-block ml-auto text-[9px] bg-background border border-border px-1.5 py-0.2 rounded text-text-secondary font-mono">
                  {item.badge}
                </span>
              )}

              {/* Tooltip on collapsed mobile view */}
              <div className="md:hidden absolute left-full ml-2 px-2 py-1 bg-text text-white text-xs rounded opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity z-50 whitespace-nowrap shadow-md">
                {item.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* Basin telemetry snippet at bottom */}
      <div className="p-3 border-t border-border hidden md:block bg-background/50">
        <div className="text-2xs text-text-secondary font-mono space-y-1">
          <div className="flex justify-between">
            <span>Basin:</span>
            <span className="font-semibold text-text">Chalakudy River</span>
          </div>
          <div className="flex justify-between">
            <span>Area:</span>
            <span className="text-text">~1,704 km²</span>
          </div>
          <div className="flex justify-between">
            <span>Dams:</span>
            <span className="text-text">Sholayar, Poringalkuthu</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
