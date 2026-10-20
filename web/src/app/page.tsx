"use client";

import React, { Suspense, lazy, useEffect } from "react";
import { useStore } from "@/lib/store";
import { Header } from "@/components/layout/Header";
import { LeftRail } from "@/components/layout/LeftRail";
import { RightRail } from "@/components/layout/RightRail";
import { FloodMap } from "@/components/map/FloodMap";
import { BottomAnalyticsStrip } from "@/components/panels/BottomAnalytics";
import { getTranslations } from "@/lib/translations";
import { AssistantChat } from "@/components/panels/AssistantChat";
import { MobileNav } from "@/components/layout/MobileNav";
import { Layers, AlertTriangle, BarChart2 } from "lucide-react";

// ─── Lazy-loaded route views ──────────────────────────────────────────────────
const AnalyticsView    = lazy(() => import("@/components/views/AnalyticsView").then(m => ({ default: m.AnalyticsView })));
const ScenariosView    = lazy(() => import("@/components/views/ScenariosView").then(m => ({ default: m.ScenariosView })));
const InfrastructureView = lazy(() => import("@/components/views/InfrastructureView").then(m => ({ default: m.InfrastructureView })));
const ReportsView      = lazy(() => import("@/components/views/ReportsView").then(m => ({ default: m.ReportsView })));
const AnalysisView = lazy(() => import("@/components/views/AnalysisView").then(m => ({ default: m.AnalysisView })));
const ModelLabView = lazy(() => import("@/components/views/ModelLabView").then(m => ({ default: m.ModelLabView })));
const MethodologyView = lazy(() => import("@/components/views/MethodologyView").then(m => ({ default: m.MethodologyView })));
const AboutView        = lazy(() => import("@/components/views/AboutView").then(m => ({ default: m.AboutView })));

// ─── Loading fallback ─────────────────────────────────────────────────────────
function ViewSkeleton({ label }: { label: string }) {
  return (
    <div className="flex-1 flex items-center justify-center bg-[#F7F8F4] dark:bg-neutral-950">
      <div className="text-center">
        <div className="animate-spin text-2xl mb-3 text-teal-600">⟳</div>
        <div style={{ fontSize: "0.75rem", color: "#687770" }}>{label}</div>
      </div>
    </div>
  );
}

// ─── Command map: map with the familiar side and bottom analysis panels ───────
function OverviewDashboard() {
  const {
    leftSidebarOpen,
    setLeftSidebarOpen,
    rightRailOpen,
    setRightRailOpen,
    bottomAnalyticsCollapsed,
    setBottomAnalyticsCollapsed,
    language,
  } = useStore();

  // Auto-collapse sidebars and bottom drawer on initial mobile load (< 1024px)
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setLeftSidebarOpen(false);
      setRightRailOpen(false);
      setBottomAnalyticsCollapsed(true);
    }
  }, [setLeftSidebarOpen, setRightRailOpen, setBottomAnalyticsCollapsed]);

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-background relative">
      {/* Mobile Backdrop for Left Rail */}
      {leftSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={() => setLeftSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Left Rail (Desktop: inline sidebar; Mobile: slide-over drawer overlay) */}
      <div
        className={`${
          leftSidebarOpen
            ? "fixed inset-y-0 left-0 z-50 w-full sm:w-80 max-w-[85vw] lg:static lg:z-auto lg:w-[264px] flex"
            : "hidden lg:flex"
        }`}
      >
        <LeftRail />
      </div>

      {/* Central area: Map + Mobile Quick Toggle Pills + Bottom Analytics */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden relative">
        <div className="relative min-h-0 flex-1 overflow-hidden">
          <FloodMap />

          {/* Floating Mobile Map Quick-Action Controls (< lg) */}
          <div className="absolute top-3 left-3 z-20 flex lg:hidden items-center gap-1.5 pointer-events-auto">
            <button
              type="button"
              onClick={() => {
                setLeftSidebarOpen(!leftSidebarOpen);
                if (rightRailOpen) setRightRailOpen(false);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md shadow-md border transition-all cursor-pointer ${
                leftSidebarOpen
                  ? "bg-teal-600 text-white border-teal-500 shadow-teal-500/20"
                  : "bg-white/90 text-slate-700 border-slate-200/80 dark:bg-slate-900/90 dark:text-slate-200 dark:border-slate-700/80 hover:bg-white dark:hover:bg-slate-900"
              }`}
              aria-label="Toggle map layers"
            >
              <Layers className="h-3.5 w-3.5" />
              <span>{language !== "ml" ? "Layers" : "ലെയറുകൾ"}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setRightRailOpen(!rightRailOpen);
                if (leftSidebarOpen) setLeftSidebarOpen(false);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md shadow-md border transition-all cursor-pointer ${
                rightRailOpen
                  ? "bg-teal-600 text-white border-teal-500 shadow-teal-500/20"
                  : "bg-white/90 text-slate-700 border-slate-200/80 dark:bg-slate-900/90 dark:text-slate-200 dark:border-slate-700/80 hover:bg-white dark:hover:bg-slate-900"
              }`}
              aria-label="Toggle risk & telemetry panel"
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>{language !== "ml" ? "Risk & Telemetry" : "അപായ വിവരങ്ങൾ"}</span>
            </button>

            <button
              type="button"
              onClick={() => setBottomAnalyticsCollapsed(!bottomAnalyticsCollapsed)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md shadow-md border transition-all cursor-pointer ${
                !bottomAnalyticsCollapsed
                  ? "bg-teal-600 text-white border-teal-500 shadow-teal-500/20"
                  : "bg-white/90 text-slate-700 border-slate-200/80 dark:bg-slate-900/90 dark:text-slate-200 dark:border-slate-700/80 hover:bg-white dark:hover:bg-slate-900"
              }`}
              aria-label="Toggle bottom analytics"
            >
              <BarChart2 className="h-3.5 w-3.5" />
              <span>{language !== "ml" ? "Analytics" : "ഗ്രാഫുകൾ"}</span>
            </button>
          </div>
        </div>

        <BottomAnalyticsStrip />
      </div>

      {/* Mobile Backdrop for Right Rail */}
      {rightRailOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={() => setRightRailOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Right Intelligence Rail (Desktop: inline sidebar; Mobile: slide-over drawer overlay) */}
      <div
        className={`${
          rightRailOpen
            ? "fixed inset-y-0 right-0 z-50 w-full sm:w-80 max-w-[85vw] lg:static lg:z-auto lg:w-[270px] flex"
            : "hidden lg:flex"
        }`}
      >
        <RightRail />
      </div>
    </div>
  );
}

// ─── Map View (full-width map with collapsible left rail) ─────────────────────
function MapFullView() {
  const { leftSidebarOpen, setLeftSidebarOpen, language } = useStore();

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden bg-background relative">
      {/* Mobile Backdrop */}
      {leftSidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs lg:hidden transition-opacity"
          onClick={() => setLeftSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <div
        className={`${
          leftSidebarOpen
            ? "fixed inset-y-0 left-0 z-50 w-full sm:w-80 max-w-[85vw] lg:static lg:z-auto lg:w-[264px] flex"
            : "hidden lg:flex"
        }`}
      >
        <LeftRail />
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <FloodMap />

        {/* Floating Mobile Toggle for Layers */}
        <div className="absolute top-3 left-3 z-20 flex lg:hidden items-center gap-1.5 pointer-events-auto">
          <button
            type="button"
            onClick={() => setLeftSidebarOpen(!leftSidebarOpen)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md shadow-md border transition-all cursor-pointer ${
              leftSidebarOpen
                ? "bg-teal-600 text-white border-teal-500 shadow-teal-500/20"
                : "bg-white/90 text-slate-700 border-slate-200/80 dark:bg-slate-900/90 dark:text-slate-200 dark:border-slate-700/80 hover:bg-white dark:hover:bg-slate-900"
            }`}
          >
            <Layers className="h-3.5 w-3.5" />
            <span>{language !== "ml" ? "Layers" : "ലെയറുകൾ"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Root page component ──────────────────────────────────────────────────────
export default function Home() {
  const { activeRoute, language } = useStore();
  const t = getTranslations(language);

  return (
    <div className="app-shell flex h-screen h-[100dvh] w-screen flex-col overflow-hidden bg-background text-text">
      {/* Application Header */}
      <Header />

      {/* Main Workspace (bottom padded on mobile for bottom navigation bar) */}
      <div className="flex flex-1 overflow-hidden pb-14 lg:pb-0">
        {/* Route-based content rendering */}
        {activeRoute === "overview" && <OverviewDashboard />}

        {activeRoute === "map" && <MapFullView />}

        {activeRoute === "analytics" && (
          <Suspense fallback={<ViewSkeleton label={language === "en" ? "Loading Analytics..." : "ലോഡ് ചെയ്യുന്നു..."} />}>
            <AnalyticsView />
          </Suspense>
        )}

        {activeRoute === "scenarios" && (
          <Suspense fallback={<ViewSkeleton label={language === "en" ? "Loading Scenarios..." : "ലോഡ് ചെയ്യുന്നു..."} />}>
            <ScenariosView />
          </Suspense>
        )}

        {activeRoute === "infrastructure" && (
          <Suspense fallback={<ViewSkeleton label={language === "en" ? "Loading Infrastructure..." : "ലോഡ് ചെയ്യുന്നു..."} />}>
            <InfrastructureView />
          </Suspense>
        )}

        {activeRoute === "reports" && (
          <Suspense fallback={<ViewSkeleton label={language === "en" ? "Loading Reports..." : "ലോഡ് ചെയ്യുന്നു..."} />}>
            <ReportsView />
          </Suspense>
        )}

        {activeRoute === "analysis" && (<Suspense fallback={<ViewSkeleton label="Loading…" />}><AnalysisView /></Suspense>)}
        {activeRoute === "modellab" && (<Suspense fallback={<ViewSkeleton label="Loading…" />}><ModelLabView /></Suspense>)}
        {activeRoute === "methodology" && (<Suspense fallback={<ViewSkeleton label="Loading…" />}><MethodologyView /></Suspense>)}

        {activeRoute === "about" && (
          <Suspense fallback={<ViewSkeleton label={language === "en" ? "Loading..." : "ലോഡ് ചെയ്യുന്നു..."} />}>
            <AboutView />
          </Suspense>
        )}
      </div>

      {/* Mobile Bottom Navigation Bar (< lg) */}
      <MobileNav />

      {/* Assistant Floating Chat / Mobile Bottom Sheet */}
      <AssistantChat />
    </div>
  );
}
