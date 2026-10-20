"use client";

import React, { useState, useRef } from "react";
import { useStore, AppRoute } from "@/lib/store";
import { getTranslations } from "@/lib/translations";
import {
  Search,
  Languages,
  WifiOff,
  BarChart2,
  Sliders,
  Home,
  RefreshCw,
  Sun,
  Moon,
  Building2,
  FileText,
  BookOpen,
  FlaskConical,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { BrandLogo } from "@/components/layout/BrandLogo";
import { useTheme } from "@/components/providers/ThemeProvider";

interface NavItem {
  id: AppRoute;
  label: string;
  mlLabel: string;
  icon: React.ElementType;
}

export function Header() {
  const {
    language,
    setLanguage,
    isOffline,
    activeRoute,
    setActiveRoute,
    focusMap,
    searchQuery,
    setSearchQuery,
  } = useStore();
  const t = getTranslations(language);
  const { resolvedTheme, setTheme } = useTheme();
  const [searchFocused, setSearchFocused] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const { data: status, isFetching } = useQuery({
    queryKey: ["system-status"],
    queryFn: () => api.status(),
    refetchInterval: 60_000,
    retry: 2,
  });

  const { data: assetsData } = useQuery({
    queryKey: ["assets-list"],
    queryFn: () => api.assets.list({ page_size: 100 }),
    retry: 2,
  });

  const searchResults = searchQuery.trim().length > 1
    ? (assetsData?.items || [])
        .filter(
          (a) =>
            a.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
            a.asset_type.toLowerCase().includes(searchQuery.toLowerCase())
        )
        .slice(0, 6)
    : [];

  const navItems: NavItem[] = [
    { id: "overview", label: "Overview", mlLabel: "അവലോകനം", icon: Home },
    { id: "analytics", label: "Analytics", mlLabel: "വിശകലനം", icon: BarChart2 },
    { id: "scenarios", label: "Scenarios", mlLabel: "സാഹചര്യം", icon: Sliders },
    { id: "infrastructure", label: "Infrastructure", mlLabel: "അടിസ്ഥാനസൗകര്യം", icon: Building2 },
    { id: "reports", label: "Reports", mlLabel: "റിപ്പോർട്ടുകൾ", icon: FileText },
    { id: "methodology", label: "System Overview", mlLabel: "സിസ്റ്റം ഓവർവ്യൂ", icon: BookOpen },
    { id: "modellab", label: "Model Lab", mlLabel: "മോഡൽ ലാബ്", icon: FlaskConical },
  ];

  const modeLabel = status?.current_mode === "live"
    ? t.liveMode
    : status?.current_mode === "degraded"
    ? t.degradedMode
    : t.demoMode;

  const modeColor = status?.current_mode === "live"
    ? "text-green-700 dark:text-emerald-300"
    : status?.current_mode === "degraded"
    ? "text-amber-700 dark:text-amber-300"
    : "text-gray-600 dark:text-slate-300";

  return (
    <header
      className="flex-shrink-0 bg-white border-b border-[#DCE4DD] z-30 relative dark:bg-[#0d111a] dark:border-[#1e2d3d]"
      style={{ boxShadow: "0 1px 4px 0 rgba(21,94,89,0.06)" }}
    >
      {/* Main Header Bar */}
      <div className="px-4 flex items-center" style={{ height: 48 }}>

        {/* ─── Logo & Wordmark — natural width ─── */}
        <div className="flex items-center shrink-0 pr-3">
          <BrandLogo className="h-8 w-[142px] xl:h-9 xl:w-[156px]" />
        </div>

        {/* ─── Navigation Items — neatly aligned, no horizontal scroll ─── */}
        <nav className="flex flex-1 items-center justify-center gap-1 xl:gap-1.5 px-1 min-w-0" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeRoute === item.id || (item.id === "overview" && activeRoute === "map");
            const label = item.id === "overview" ? t.navOverview
              : item.id === "analytics" ? t.navAnalytics
              : item.id === "scenarios" ? t.navScenarios
              : item.id === "infrastructure" ? t.navInfrastructure
              : item.id === "reports" ? t.navReports
              : item.id === "methodology" ? "System Overview"
              : t.navModelLab;
            return (
              <button
                key={item.id}
                onClick={() => setActiveRoute(item.id)}
                className={`flex items-center gap-1.5 rounded-md px-2 xl:px-2.5 py-1 text-xs xl:text-[0.8125rem] transition-all focus-visible:outline-2 focus-visible:outline-teal-600 ${
                  isActive
                    ? "bg-teal-50 font-semibold text-teal-800 shadow-xs dark:bg-teal-400/20 dark:text-teal-200"
                    : "font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white"
                }`}
                style={{
                  border: "none",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
                aria-current={isActive ? "page" : undefined}
                aria-label={label}
                title={label}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-current" />
                <span>{label}</span>
              </button>
            );
          })}
        </nav>

        {/* ─── Utilities — natural width right-aligned ─── */}
        <div className="flex items-center justify-end gap-1.5 xl:gap-2 shrink-0 pl-2">

          {/* Search Bar */}
          <div className="relative hidden md:block" style={{ width: 170 }}>
            <Search
              style={{
                width: 13, height: 13,
                position: "absolute", left: 9, top: "50%",
                transform: "translateY(-50%)",
                color: "#9ca3af",
                pointerEvents: "none",
              }}
            />
            <input
              ref={searchRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setTimeout(() => setSearchFocused(false), 150)}
              placeholder={t.searchPlaceholder}
              aria-label="Search locations and infrastructure"
              className="w-full overflow-hidden text-ellipsis whitespace-nowrap rounded-md border border-slate-200 bg-slate-50 py-1.5 pl-7 pr-12 text-xs text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-50 dark:focus:border-teal-400"
            />
            <span
              style={{
                position: "absolute",
                right: 8,
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: "0.625rem",
                color: "#9ca3af",
                pointerEvents: "none",
              }}
              className="hidden lg:inline"
            >
              ⌘K
            </span>

            {/* Search Dropdown */}
            {searchFocused && searchResults.length > 0 && (
              <div
                className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#DCE4DD] rounded-md overflow-hidden z-50 dark:bg-slate-900 dark:border-slate-700"
                style={{ boxShadow: "0 4px 16px rgba(21,94,89,0.12)" }}
              >
                {searchResults.map((asset) => (
                  <button
                    key={asset.osm_id}
                    disabled={!Number.isFinite(asset.lat) || !Number.isFinite(asset.lon) || Math.abs(asset.lat) > 90 || Math.abs(asset.lon) > 180}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => {
                      if (focusMap(asset.lat, asset.lon, asset.osm_id)) setSearchQuery("");
                    }}
                    className="w-full text-left px-3 py-2 hover:bg-[#E8F0EA] focus-visible:outline-2 focus-visible:outline-teal-600 disabled:cursor-not-allowed disabled:opacity-50 transition-colors flex items-center justify-between dark:hover:bg-slate-800"
                    style={{ fontSize: "0.75rem", border: "none", cursor: "pointer" }}
                    title={!Number.isFinite(asset.lat) || !Number.isFinite(asset.lon) ? "Map coordinates unavailable" : undefined}
                  >
                    <div>
                      <div className="font-medium text-slate-800 dark:text-slate-100 text-xs">
                        {asset.name || "Unnamed Infrastructure"}
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 capitalize">
                        {asset.asset_type.replace(/_/g, " ")}
                      </div>
                    </div>
                    <span className="text-[11px] font-semibold text-teal-700 dark:text-teal-400">
                      Map →
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Language selector */}
          <label className="flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 dark:border-slate-700 dark:bg-slate-900">
            <Languages className="h-3.5 w-3.5 shrink-0 text-teal-700 dark:text-teal-300" />
            <select value={language} onChange={(event) => setLanguage(event.target.value as typeof language)} className="max-w-24 cursor-pointer bg-transparent text-xs font-semibold text-slate-800 outline-none dark:text-slate-100" aria-label="Select language">
              <option value="en">English</option><option value="ml">മലയാളം</option><option value="hi">हिन्दी</option><option value="ta">தமிழ்</option>
            </select>
          </label>

          {/* Offline indicator */}
          {isOffline && (
            <span className="flex items-center gap-1" style={{ fontSize: "0.6875rem", color: "#C83F3A" }}>
              <WifiOff style={{ width: 13, height: 13 }} />
              <span className="hidden sm:inline">Offline</span>
            </span>
          )}

          {/* Theme toggle */}
          <button
            type="button"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-sm transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-teal-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800"
            title={resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            aria-label={resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          >
            {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

        </div>
      </div>
    </header>
  );
}
