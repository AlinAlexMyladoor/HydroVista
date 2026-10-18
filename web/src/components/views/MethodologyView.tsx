"use client";

import React from "react";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <details className="ux-disclosure rounded-lg p-4 bg-white border border-[#DCE4DD]">
    <summary className="text-sm">{title}</summary>
    <div className="pt-3 text-xs leading-relaxed text-text-secondary">{children}</div>
  </details>
);

export function MethodologyView() {
  return (
    <div className="flex-1 overflow-y-auto bg-background text-text">
      <div className="max-w-4xl mx-auto p-6 flex flex-col gap-3">
        <h1 className="text-lg font-semibold">Methodology & data notes</h1>

        <Section title="Product definitions">
          <ul style={{ paddingLeft: 16, listStyle: "disc" }}>
            <li><b>Candidate inundation</b> — pixels the threshold algorithm classes as water after exclusions. Not validated.</li>
            <li><b>Validated flood area</b> — requires an independent reference dataset and a validation procedure. Not produced by this app.</li>
            <li><b>Heuristic asset risk score</b> — a relative ranking from elevation proxy and NWP rainfall. Not a probability, not flood depth.</li>
            <li><b>Asset elevation</b> — sampled from Mapzen Terrarium tiles, with Open-Meteo's Copernicus GLO-90 API as a live fallback. Elevation values include their source in the infrastructure ledger. Attribute Open-Meteo and Copernicus when using fallback values.</li>
            <li><b>River stage outlook</b> — a 48-hour XGBoost/gradient-boosted model for the CWC Arangaly gauge, trained on hourly gauge history and Open-Meteo precipitation, with chronological holdout error. It is model guidance, not an official warning or hydraulic flood forecast.</li>
          </ul>
        </Section>

        <Section title="Flood-mapping pipeline (Flood Analysis page)">
          <ol style={{ paddingLeft: 16, listStyle: "decimal" }}>
            <li>Validate study-area box (≤ 2,500 km²) and date windows (pre-event before event; ≤ 92 days each; not in the future).</li>
            <li>Sentinel-1 GRD, IW mode, VV, one orbit direction (default descending), from Google Earth Engine <code>COPERNICUS/S1_GRD</code>.</li>
            <li>Median composites for the pre-event and event windows; scene counts and acquisition dates are reported. Zero scenes fails the run; nothing is substituted.</li>
            <li>Candidate water: event VV below a dB threshold (exploratory default −16 dB; must be tuned/validated per area and season).</li>
            <li>Permanent-water exclusion: JRC Global Surface Water occurrence ≥ chosen % (default 90).</li>
            <li>Terrain mask: SRTM slope above a limit (default 5°) removed, reducing radar-shadow false positives.</li>
            <li>Area: sum of <code>ee.Image.pixelArea()</code> at the chosen processing scale.</li>
          </ol>
          <p style={{ marginTop: 6 }}>Missing observations are never counted as “not flooded” in the local calculation library, and unknown permanent-water baseline cells are tracked separately.</p>
        </Section>

        <Section title="Known sources of error">
          Radar shadow and layover in hilly terrain; smooth surfaces (tarmac, sand) that look like water; urban double-bounce hiding flooded streets; wind-roughened open water missed; wet soil; flooding beneath dense vegetation missed; median composites mixing dates; threshold sensitivity; coarse processing scale.
        </Section>

        <Section title="Machine learning (Model Lab)">
          A Random Forest is trained only from a labelled table you provide, split by <code>region_id</code> so train and test regions are disjoint, and compared with the threshold baseline on identical test rows (precision, recall, F1, IoU, confusion matrix, per-region F1). Probabilities are uncalibrated. No pre-trained model is shipped, and until you train one the Model Lab is empty.
        </Section>

        <Section title="Other data on the dashboard">
          <ul style={{ paddingLeft: 16, listStyle: "disc" }}>
            <li><b>Rainfall:</b> Open-Meteo NWP at the basin centroid — model output, not gauge data.</li>
            <li><b>Arangaly river stage:</b> CWC telemetry through NWIC, paired with Open-Meteo ERA5 rainfall history and NWP rainfall forecasts. Stale or missing gauge records suppress the stage forecast.</li>
            <li><b>River discharge:</b> Open-Meteo Flood API / GloFAS daily model at a nearby 5 km grid cell; not a gauge reading and not interchangeable with water level.</li>
            <li><b>Elevation (map and cross-section):</b> Terrarium DEM tiles (Mapzen / AWS Open Data; SRTM/ASTER/other mix), sampled in the browser. Elevation is not flood depth.</li>
            <li><b>Roads and assets:</b> OpenStreetMap via Overpass; completeness varies.</li>
            <li><b>Sentinel imagery layer:</b> Copernicus Data Space (Sentinel-2 L2A, cloud-masked), needs backend credentials; acquisition time is shown.</li>
            <li><b>Interpretation:</b> flood depth and independently validated flood extent are not produced. Population exposure is an estimate from available WorldPop data; asset risk is a relative heuristic, not a flood probability.</li>
          </ul>
        </Section>

        <Section title="Reproducibility">
          Each run stores its parameters, scene counts, dates, dataset IDs, processing scale, compute time and attempts. Identical parameters reuse a stored result for 24 hours (flagged in the UI). CSV export is available per run.
        </Section>
      </div>
    </div>
  );
}
