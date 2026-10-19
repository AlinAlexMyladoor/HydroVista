"use client";

import React, { Suspense, lazy } from "react";
import { useStore } from "@/lib/store";
import { Header } from "@/components/layout/Header";
import { LeftRail } from "@/components/layout/LeftRail";
import { RightRail } from "@/components/layout/RightRail";
import { FloodMap } from "@/components/map/FloodMap";
import { BottomAnalyticsStrip } from "@/components/panels/BottomAnalytics";
import { getTranslations } from "@/lib/translations";
import { AssistantChat } from "@/components/panels/AssistantChat";

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
    <div className="flex-1 flex items-center justify-center bg-[#F7F8F4]">
      <div className="text-center">
        <div className="animate-spin text-2xl mb-3">⟳</div>
        <div style={{ fontSize: "0.75rem", color: "#687770" }}>{label}</div>
      </div>
    </div>
  );
}

// ─── Command map: map with the familiar side and bottom analysis panels ───────
function OverviewDashboard() {
  const { leftSidebarOpen, rightRailOpen } = useStore();

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden">
      {leftSidebarOpen && <LeftRail />}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="relative min-h-0 flex-1 overflow-hidden"><FloodMap /></div>
        <BottomAnalyticsStrip />
      </div>
      {rightRailOpen && <RightRail />}
    </div>
  );
}

// ─── Map View (full-width map, no right rail, collapsible left rail) ──────────
function MapFullView() {
  const { leftSidebarOpen } = useStore();

  return (
    <div className="flex flex-1 overflow-hidden">
      {leftSidebarOpen && <LeftRail />}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <div className="flex-1 relative overflow-hidden" style={{ minHeight: 0 }}>
          <FloodMap />
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
    <div className="app-shell flex h-screen w-screen flex-col overflow-hidden bg-background text-text">
      {/* Application Header */}
      <Header />

      {/* Main Workspace */}
      <div className="flex flex-1 overflow-hidden">
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
      <AssistantChat />
    </div>
  );
}
