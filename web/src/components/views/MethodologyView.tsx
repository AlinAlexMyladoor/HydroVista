"use client";

import React from "react";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="rounded-lg p-4" style={{ background: "#fff", border: "1px solid #DCE4DD" }}>
    <h2 style={{ fontWeight: 700, fontSize: "0.9375rem", marginBottom: 6 }}>{title}</h2>
    <div style={{ fontSize: "0.75rem", lineHeight: 1.6 }}>{children}</div>
  </section>
);

export function MethodologyView() {
  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "#F7F8F4", color: "#26332F" }}>
      <div className="max-w-4xl mx-auto p-6 flex flex-col gap-4">
        <h1 style={{ fontSize: "1.125rem", fontWeight: 700 }}>Methodology, data and limitations</h1>

        <Section title="Product definitions">
          <ul style={{ paddingLeft: 16, listStyle: "disc" }}>
            <li><b>Candidate inundation</b> — pixels the threshold algorithm classes as water after exclusions. Not validated.</li>
            <li><b>Validated flood area</b> — requires an independent reference dataset and a validation procedure. Not produced by this app.</li>
            <li><b>Heuristic asset risk score</b> — a relative ranking from elevation proxy and NWP rainfall. Not a probability, not flood depth.</li>
            <li><b>Forecast</b> — rainfall forecast comes from Open-Meteo NWP. No flood forecast model is trained or evaluated here.</li>
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
            <li><b>Elevation (map and cross-section):</b> Terrarium DEM tiles (Mapzen / AWS Open Data; SRTM/ASTER/other mix), sampled in the browser. Elevation is not flood depth.</li>
            <li><b>Roads and assets:</b> OpenStreetMap via Overpass; completeness varies.</li>
            <li><b>Sentinel imagery layer:</b> Copernicus Data Space (Sentinel-2 L2A, cloud-masked), needs backend credentials; acquisition time is shown.</li>
            <li><b>Not implemented:</b> flood depth, population exposure, validated inundation, building/road exposure overlay, susceptibility model.</li>
          </ul>
        </Section>

        <Section title="Reproducibility">
          Each run stores its parameters, scene counts, dates, dataset IDs, processing scale, compute time and attempts. Identical parameters reuse a stored result for 24 hours (flagged in the UI). CSV export is available per run.
        </Section>
      </div>
    </div>
  );
}
