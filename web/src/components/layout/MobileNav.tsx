"use client";

import React from "react";
import { useStore, type AppRoute } from "@/lib/store";
import { getTranslations } from "@/lib/translations";
import {
  Home,
  BarChart2,
  Sliders,
  Building2,
  Bot,
  Menu,
} from "lucide-react";

interface MobileNavProps {
  onOpenMenu?: () => void;
}

export function MobileNav({ onOpenMenu }: MobileNavProps) {
  const { activeRoute, setActiveRoute, language, assistantOpen, setAssistantOpen } = useStore();
  const t = getTranslations(language);

  const tabs: {
    id: AppRoute | "assistant" | "menu";
    label: string;
    icon: React.ElementType;
    onClick: () => void;
    isActive: boolean;
    isAssistant?: boolean;
  }[] = [
    {
      id: "overview",
      label: t.navOverview,
      icon: Home,
      onClick: () => setActiveRoute("overview"),
      isActive: activeRoute === "overview" || activeRoute === "map",
    },
    {
      id: "analytics",
      label: t.navAnalytics,
      icon: BarChart2,
      onClick: () => setActiveRoute("analytics"),
      isActive: activeRoute === "analytics",
    },
    {
      id: "scenarios",
      label: t.navScenarios,
      icon: Sliders,
      onClick: () => setActiveRoute("scenarios"),
      isActive: activeRoute === "scenarios",
    },
    {
      id: "infrastructure",
      label: language !== "ml" ? "Assets" : "സൗകര്യങ്ങൾ",
      icon: Building2,
      onClick: () => setActiveRoute("infrastructure"),
      isActive: activeRoute === "infrastructure",
    },
    {
      id: "assistant",
      label: language !== "ml" ? "Assistant" : "സഹായം",
      icon: Bot,
      onClick: () => setAssistantOpen((v) => !v),
      isActive: assistantOpen,
      isAssistant: true,
    },
  ];

  return (
    <nav
      aria-label="Mobile Navigation"
      className="fixed bottom-0 inset-x-0 z-40 lg:hidden bg-white/92 dark:bg-slate-950/92 backdrop-blur-xl border-t border-slate-200/70 dark:border-slate-800/80 px-2 py-1 shadow-[0_-4px_20px_rgba(0,0,0,0.06)] dark:shadow-[0_-4px_24px_rgba(0,0,0,0.4)] safe-area-bottom"
    >
      <div className="flex items-center justify-around h-12 max-w-lg mx-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={tab.onClick}
              type="button"
              className={`flex-1 flex flex-col items-center justify-center py-1 px-1 rounded-xl transition-all duration-150 relative cursor-pointer ${
                tab.isActive
                  ? "text-teal-700 dark:text-teal-400 font-semibold"
                  : "text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200"
              }`}
              aria-label={tab.label}
              aria-current={tab.isActive ? "page" : undefined}
            >
              <div className="relative">
                <Icon
                  size={19}
                  className={`transition-transform duration-150 ${
                    tab.isActive ? "scale-110 text-teal-600 dark:text-teal-400" : ""
                  }`}
                />
                {tab.isAssistant && (
                  <span className="absolute -top-0.5 -right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500" />
                  </span>
                )}
              </div>
              <span className="text-[10px] tracking-tight mt-0.5 truncate max-w-[64px] leading-tight">
                {tab.label}
              </span>
              {tab.isActive && !tab.isAssistant && (
                <span className="absolute top-0 w-8 h-0.5 bg-teal-600 dark:bg-teal-400 rounded-full" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
