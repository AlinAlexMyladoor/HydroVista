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
  Menu,
  X,
  Bot,
  Info,
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
    setAssistantOpen,
  } = useStore();
  const t = getTranslations(language);
  const { resolvedTheme, setTheme } = useTheme();
  const [searchFocused, setSearchFocused] = useState(false);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
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
    { id: "about", label: "About", mlLabel: "വിവരങ്ങൾ", icon: Info },
  ];

  const modeLabel = status?.current_mode === "live"
    ? t.liveMode
    : status?.current_mode === "degraded"
    ? t.degradedMode
    : t.demoMode;

  const modeColor = status?.current_mode === "live"
    ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800"
    : status?.current_mode === "degraded"
    ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800"
    : "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700";

  return (
    <header
      className="flex-shrink-0 bg-white border-b border-[#DCE4DD] z-30 relative dark:bg-[#0d111a] dark:border-[#1e2d3d]"
      style={{ boxShadow: "0 1px 4px 0 rgba(21,94,89,0.06)" }}
    >
      {/* Main Header Bar */}
      <div className="px-3 sm:px-4 flex items-center justify-between" style={{ height: 48 }}>

        {/* ─── Logo & Wordmark ─── */}
        <div className="flex items-center shrink-0 pr-2">
          <BrandLogo className="h-7 w-[124px] sm:h-8 sm:w-[142px] xl:h-9 xl:w-[156px]" />
        </div>

        {/* ─── Navigation Items — Desktop (Hidden on mobile/tablet) ─── */}
        <nav className="hidden lg:flex flex-1 items-center justify-center gap-1 xl:gap-1.5 px-1 min-w-0" aria-label="Primary navigation">
          {navItems.filter(item => item.id !== "about").map((item) => {
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

        {/* ─── Utilities Right-Aligned ─── */}
        <div className="flex items-center justify-end gap-1.5 sm:gap-2 shrink-0">

          {/* Desktop Search Bar */}
          <div className="relative hidden lg:block" style={{ width: 170 }}>
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
              className="hidden xl:inline"
            >
              ⌘K
            </span>

            {/* Desktop Search Dropdown */}
            {searchFocused && searchResults.length > 0 && (
              <div
                className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#DCE4DD] rounded-md overflow-hidden z-50 dark:bg-slate-900 dark:border-slate-700 shadow-xl"
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

          {/* Mobile Search Toggle Button */}
          <button
            type="button"
            onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
            className="lg:hidden inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-teal-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
            aria-label="Search"
          >
            <Search className="h-3.5 w-3.5" />
          </button>

          {/* Language selector — compact on mobile */}
          <label className="flex items-center gap-1 rounded border border-slate-200 bg-white px-1.5 sm:px-2 py-1 dark:border-slate-700 dark:bg-slate-900">
            <Languages className="h-3.5 w-3.5 shrink-0 text-teal-700 dark:text-teal-300" />
            <select
              value={language}
              onChange={(event) => setLanguage(event.target.value as typeof language)}
              className="w-14 sm:max-w-24 cursor-pointer bg-transparent text-[11px] sm:text-xs font-semibold text-slate-800 outline-none dark:text-slate-100"
              aria-label="Select language"
            >
              <option value="en">English</option>
              <option value="ml">മലയാളം</option>
              <option value="hi">हिन्दी</option>
              <option value="ta">தமிழ்</option>
            </select>
          </label>

          {/* Offline indicator */}
          {isOffline && (
            <span className="flex items-center gap-1 text-[11px] text-red-600 font-semibold">
              <WifiOff className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Offline</span>
            </span>
          )}

          {/* Theme toggle */}
          <button
            type="button"
            onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-xs transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-teal-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            title={resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            aria-label={resolvedTheme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
          >
            {resolvedTheme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {/* Hamburger Menu Toggle (Mobile / Tablet only) */}
          <button
            type="button"
            onClick={() => setMobileDrawerOpen(!mobileDrawerOpen)}
            className="lg:hidden inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 shadow-xs transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-teal-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 cursor-pointer"
            aria-expanded={mobileDrawerOpen}
            aria-label={mobileDrawerOpen ? "Close navigation menu" : "Open navigation menu"}
          >
            {mobileDrawerOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>

        </div>
      </div>

      {/* ─── Mobile Expandable Search Bar ─── */}
      {mobileSearchOpen && (
        <div className="lg:hidden px-3 py-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/90 animate-in slide-in-from-top-1">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchPlaceholder}
              autoFocus
              className="w-full text-xs rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-8 text-slate-900 outline-none focus:border-teal-600 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X size={14} />
              </button>
            )}
          </div>
          {searchResults.length > 0 && (
            <div className="mt-1.5 bg-white border border-slate-200 rounded-lg overflow-hidden shadow-lg dark:bg-slate-900 dark:border-slate-700">
              {searchResults.map((asset) => (
                <button
                  key={asset.osm_id}
                  onClick={() => {
                    if (focusMap(asset.lat, asset.lon, asset.osm_id)) {
                      setSearchQuery("");
                      setMobileSearchOpen(false);
                    }
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 dark:border-slate-800 last:border-b-0 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-semibold text-slate-800 dark:text-slate-100">{asset.name}</div>
                    <div className="text-[10px] text-slate-500 capitalize">{asset.asset_type}</div>
                  </div>
                  <span className="text-[11px] font-bold text-teal-700 dark:text-teal-400">View Map →</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ─── Mobile Navigation Drawer Overlay ─── */}
      {mobileDrawerOpen && (
        <>
          <div
            className="fixed inset-0 top-12 z-40 bg-black/40 backdrop-blur-xs lg:hidden"
            onClick={() => setMobileDrawerOpen(false)}
          />
          <div className="fixed inset-x-0 top-12 max-h-[calc(100dvh-3rem)] z-50 overflow-y-auto bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 p-4 flex flex-col gap-3 shadow-2xl lg:hidden animate-in slide-in-from-top-2 duration-200">
            {/* Mode & Status Banner */}
            <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 text-xs">
              <span className="text-slate-600 dark:text-slate-400 font-medium">Chalakudy River Basin</span>
              <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border ${modeColor}`}>
                {modeLabel}
              </span>
            </div>

            {/* Navigation Links Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 pt-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeRoute === item.id || (item.id === "overview" && activeRoute === "map");
                const label = item.id === "overview" ? t.navOverview
                  : item.id === "analytics" ? t.navAnalytics
                  : item.id === "scenarios" ? t.navScenarios
                  : item.id === "infrastructure" ? t.navInfrastructure
                  : item.id === "reports" ? t.navReports
                  : item.id === "methodology" ? "System Overview"
                  : item.id === "about" ? "About HydroVista"
                  : t.navModelLab;

                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      setActiveRoute(item.id);
                      setMobileDrawerOpen(false);
                    }}
                    className={`flex items-center justify-between p-3 rounded-xl text-left transition-all cursor-pointer ${
                      isActive
                        ? "bg-teal-50 text-teal-900 dark:bg-teal-950/60 dark:text-teal-200 font-bold ring-1 ring-teal-500/30"
                        : "bg-slate-50/80 dark:bg-slate-900/60 text-slate-700 dark:text-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${isActive ? "bg-teal-600 text-white" : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 shadow-2xs"}`}>
                        <Icon size={16} />
                      </div>
                      <div>
                        <div className="text-xs font-semibold leading-tight">{label}</div>
                        {language !== "en" && item.mlLabel && (
                          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">{item.mlLabel}</div>
                        )}
                      </div>
                    </div>
                    {isActive && (
                      <span className="text-[10px] uppercase tracking-wider font-bold text-teal-700 dark:text-teal-400">
                        Active
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Quick Assistant Button in Drawer */}
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 mt-1">
              <button
                type="button"
                onClick={() => {
                  setMobileDrawerOpen(false);
                  setAssistantOpen(true);
                }}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-teal-700 hover:bg-teal-800 text-white text-xs font-semibold shadow-md cursor-pointer transition-all active:scale-[0.99]"
              >
                <Bot size={16} />
                <span>Ask HydroVista Assistant</span>
              </button>
            </div>
          </div>
        </>
      )}
    </header>
  );
}
