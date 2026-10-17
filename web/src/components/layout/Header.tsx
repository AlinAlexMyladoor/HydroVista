"use client";

import React, { useState, useRef, useEffect } from "react";
import { useStore, AppRoute } from "@/lib/store";
import { translations } from "@/lib/translations";
import {
  Search,
  Languages,
  Wifi,
  WifiOff,
  ChevronDown,
  Map,
  BarChart2,
  Sliders,
  Building2,
  FileText,
  Info,
  Home,
  RefreshCw,
  Moon,
  Sun,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
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
    setSelectedAssetId,
    activeRoute,
    setActiveRoute,
    searchQuery,
    setSearchQuery,
  } = useStore();
  const { resolvedTheme, setTheme } = useTheme();

  const t = translations[language];
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
    { id: "overview",        label: "Overview",        mlLabel: "അവലോകനം",       icon: Home },
    { id: "map",             label: "3D Map",           mlLabel: "3D ഭൂപടം",       icon: Map },
    { id: "analytics",       label: "Analytics",        mlLabel: "വിശകലനം",       icon: BarChart2 },
    { id: "analysis",        label: "Flood Analysis",   mlLabel: "വെള്ളപ്പൊക്ക വിശകലനം", icon: Map },
    { id: "modellab",        label: "Model Lab",        mlLabel: "മോഡൽ ലാബ്",     icon: BarChart2 },
    { id: "scenarios",       label: "Scenarios",        mlLabel: "സാഹചര്യം",       icon: Sliders },
    { id: "infrastructure",  label: "Infrastructure",   mlLabel: "അടിസ്ഥാനം",     icon: Building2 },
    { id: "reports",         label: "Reports",          mlLabel: "റിപ്പോർട്ടുകൾ", icon: FileText },
    { id: "methodology",     label: "Methodology",      mlLabel: "രീതിശാസ്ത്രം",   icon: FileText },
    { id: "about",           label: "About",            mlLabel: "വിശദാംശം",       icon: Info },
  ];

  const modeLabel = status?.current_mode === "live"
    ? t.liveMode
    : status?.current_mode === "degraded"
    ? t.degradedMode
    : t.demoMode;

  const modeColor = status?.current_mode === "live"
    ? "text-green-700"
    : status?.current_mode === "degraded"
    ? "text-amber-700"
    : "text-gray-600";

  return (
    <header
      className="flex-shrink-0 bg-white border-b border-[#DCE4DD] z-30 relative"
      style={{ boxShadow: "0 1px 4px 0 rgba(21,94,89,0.06)" }}
    >
      {/* Main Header Bar */}
      <div className="px-4 flex items-center gap-0" style={{ height: 48 }}>

        {/* ─── Logo & Wordmark ─── */}
        <div className="flex items-center gap-2.5 flex-shrink-0 mr-5">
          {/* SVG waterwave logo */}
          <div
            className="flex items-center justify-center rounded-md flex-shrink-0"
            style={{
              width: 32, height: 32,
              background: "linear-gradient(135deg, #155E59 0%, #1E7A73 100%)",
            }}
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path
                d="M2 12 Q5 8, 8 12 Q11 16, 14 12 Q17 8, 20 12"
                stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round"
              />
              <path
                d="M2 8 Q5 4, 8 8 Q11 12, 14 8 Q17 4, 20 8"
                stroke="rgba(255,255,255,0.55)" strokeWidth="1.4" fill="none" strokeLinecap="round"
              />
              <circle cx="10" cy="5" r="2.2" fill="rgba(255,255,255,0.85)" />
            </svg>
          </div>

          <div>
            <div style={{ fontSize: "0.9375rem", fontWeight: 700, letterSpacing: "-0.02em", color: "#26332F", lineHeight: 1.2 }}>
              HydroVista
            </div>
            <div style={{ fontSize: "0.5625rem", fontWeight: 500, color: "#687770", letterSpacing: "0.03em", textTransform: "uppercase", lineHeight: 1 }}>
              River Basin Intelligence for Safer Communities
            </div>
          </div>
        </div>

        {/* ─── Navigation Items ─── */}
        <nav className="flex items-center gap-0.5 flex-shrink-0" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeRoute === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveRoute(item.id)}
                className="flex items-center gap-1.5 rounded-md transition-all"
                style={{
                  padding: "0.3125rem 0.625rem",
                  fontSize: "0.8125rem",
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? "#155E59" : "#687770",
                  background: isActive ? "#E8F0EA" : "transparent",
                  border: "none",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
                aria-current={isActive ? "page" : undefined}
                title={language === "ml" ? item.mlLabel : item.label}
              >
                <Icon
                  style={{
                    width: 14,
                    height: 14,
                    flexShrink: 0,
                    color: isActive ? "#155E59" : "#9ca3af",
                  }}
                />
                <span className="hidden lg:inline">
                  {language === "ml" ? item.mlLabel : item.label}
                </span>
              </button>
            );
          })}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* ─── Search Bar ─── */}
        <div className="relative hidden md:block" style={{ width: 240 }}>
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
            style={{
              width: "100%",
              paddingLeft: 28,
              paddingRight: 8,
              paddingTop: 5,
              paddingBottom: 5,
              background: "#F7F8F4",
              border: "1px solid #DCE4DD",
              borderRadius: 6,
              fontSize: "0.75rem",
              color: "#26332F",
              outline: "none",
            }}
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
              className="absolute top-full left-0 right-0 mt-1 bg-white border border-[#DCE4DD] rounded-md overflow-hidden z-50"
              style={{ boxShadow: "0 4px 16px rgba(21,94,89,0.12)" }}
            >
              {searchResults.map((asset) => (
                <button
                  key={asset.osm_id}
                  onMouseDown={() => {
                    setSelectedAssetId(asset.osm_id);
                    setActiveRoute("map");
                    setSearchQuery("");
                  }}
                  className="w-full text-left px-3 py-2 hover:bg-[#E8F0EA] transition-colors flex items-center justify-between"
                  style={{ fontSize: "0.75rem", border: "none", cursor: "pointer" }}
                >
                  <div>
                    <div style={{ fontWeight: 500, color: "#26332F" }}>
                      {asset.name || "Unnamed Infrastructure"}
                    </div>
                    <div style={{ fontSize: "0.6875rem", color: "#687770", textTransform: "capitalize" }}>
                      {asset.asset_type.replace(/_/g, " ")}
                    </div>
                  </div>
                  <span style={{ fontSize: "0.6875rem", color: "#155E59", fontWeight: 500 }}>
                    Map →
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ─── Status & Controls ─── */}
        <div className="flex items-center gap-2 ml-3">
          {/* Data freshness / system status */}
          <div
            className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer"
            style={{
              background: "#F7F8F4",
              border: "1px solid #DCE4DD",
              fontSize: "0.6875rem",
            }}
            onClick={() => setActiveRoute("about")}
            title="View data freshness and system status"
          >
            <span
              className="status-dot"
              style={{
                backgroundColor:
                  isOffline ? "#9ca3af"
                  : status?.current_mode === "live" ? "#22c55e"
                  : status?.current_mode === "degraded" ? "#E7A23B"
                  : "#9ca3af",
              }}
            />
            {isFetching && <RefreshCw style={{ width: 10, height: 10, color: "#687770" }} className="animate-spin" />}
            <span className={`font-medium hidden lg:inline ${modeColor}`}>{modeLabel}</span>
          </div>

          {/* Offline indicator */}
          {isOffline && (
            <span className="flex items-center gap-1" style={{ fontSize: "0.6875rem", color: "#C83F3A" }}>
              <WifiOff style={{ width: 13, height: 13 }} />
              <span className="hidden sm:inline">Offline</span>
            </span>
          )}

          {/* Language Toggle */}
          <button
            onClick={() => setLanguage(language === "en" ? "ml" : "en")}
            className="flex items-center gap-1 rounded transition-colors"
            style={{
              padding: "0.3125rem 0.5rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              color: "#26332F",
              background: "#FFFFFF",
              border: "1px solid #DCE4DD",
              cursor: "pointer",
              letterSpacing: "0.01em",
            }}
            title="Toggle between English and Malayalam (മലയാളം)"
            aria-label="Toggle language"
          >
            <Languages style={{ width: 13, height: 13, color: "#155E59", flexShrink: 0 }} />
            <span>
              {language === "en" ? "EN" : "ML"}
            </span>
            {/* Show flag-like accent text */}
            <span style={{ color: "#687770", fontWeight: 400, fontSize: "0.625rem" }}>
              {language === "en" ? "| മല" : "| EN"}
            </span>
          </button>

          {/* User avatar placeholder */}
          <div
            className="flex items-center justify-center rounded-full flex-shrink-0"
            style={{
              width: 28, height: 28,
              background: "#155E59",
              color: "white",
              fontSize: "0.6875rem",
              fontWeight: 700,
            }}
            aria-hidden="true"
          >
            A
          </div>
        </div>
      </div>
    </header>
  );
}
