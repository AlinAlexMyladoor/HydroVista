"use client";

import React from "react";
import { BrandLogo } from "@/components/layout/BrandLogo";

export function AboutView() {
  return (
    <div className="flex-1 overflow-y-auto bg-background text-text p-4 sm:p-6 pb-20 lg:pb-6">
      <div className="max-w-4xl mx-auto space-y-5">
        <header className="flex items-center gap-3 border-b border-border pb-4">
          <BrandLogo className="h-14 w-[250px]" />
          <span className="text-sm text-text-secondary">Chalakudy River Basin · Kerala</span>
        </header>

        <section className="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="Basin overview">
          <div className="rounded-xl border border-border bg-white p-4 dark:bg-slate-900">
            <div className="text-xs font-medium text-text-secondary">Catchment area</div>
            <div className="mt-1 text-xl font-semibold">1,704 km²</div>
          </div>
          <div className="rounded-xl border border-border bg-white p-4 dark:bg-slate-900">
            <div className="text-xs font-medium text-text-secondary">Key reservoirs</div>
            <div className="mt-1 text-xl font-semibold">Sholayar · Poringalkuthu</div>
          </div>
          <div className="rounded-xl border border-border bg-white p-4 dark:bg-slate-900">
            <div className="text-xs font-medium text-text-secondary">Platform</div>
            <div className="mt-1 text-xl font-semibold">Basin intelligence</div>
          </div>
        </section>

        <details className="ux-disclosure rounded-xl border border-border bg-white p-4 dark:bg-slate-900">
          <summary className="text-sm">Basin context</summary>
          <p className="pt-3 text-sm leading-relaxed text-text-secondary">
            The Chalakudy River flows from the Western Ghats through Thrissur and Ernakulam districts to the Periyar estuary and Arabian Sea. Its steep headwaters and lowland communities experience different flood conditions across the catchment.
          </p>
        </details>

        <details className="ux-disclosure rounded-xl border border-border bg-white p-4 dark:bg-slate-900">
          <summary className="text-sm">Data sources & attribution</summary>
          <ul className="mt-3 list-inside list-disc space-y-2 text-sm text-text-secondary">
            <li>MapLibre GL JS for mapping and OpenStreetMap contributors for infrastructure data.</li>
            <li>Open-Meteo for weather forecasts and, where needed, Copernicus GLO-90 elevation data.</li>
            <li>Central Water Commission river-level telemetry via the National Water Data Portal for the Arangaly stage outlook.</li>
            <li>Mapzen Terrarium terrain tiles and Copernicus Sentinel satellite datasets.</li>
          </ul>
        </details>
      </div>
    </div>
  );
}
