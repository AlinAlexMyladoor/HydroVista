# FloodLens AI — Architecture & System Design

## 1. Executive Summary

FloodLens AI is an end-to-end geospatial decision-support platform designed for the **Chalakudy River basin** in central Kerala, India. The basin spans ~1,704 km², originating in the Western Ghats (Anamalai Hills / Parambikulam plateau) and discharging into the Arabian Sea / Periyar backwaters.

The system addresses six critical operational questions for regional disaster response:
1. **Exposure Forecasting:** Where flood exposure is elevated over a 72-hour horizon.
2. **Infrastructure Impact:** Which hospitals, schools, bridges, and power substations are vulnerable.
3. **Isolation Clock:** Whether critical facilities retain a drivable road route to designated safe-access hubs (Thrissur, Angamaly).
4. **Rain Dial Scenario Engine:** How synthetic storm surges (+0mm to +250mm) scale inundation risk and cutoff probability.
5. **Explainability & Attribution:** Why an area or asset is flagged (elevation susceptibility, rainfall exposure, asset criticality, river proximity).
6. **Data Lineage & Health:** Operational status, staleness, and transparent uncertainty bounds.

---

## 2. High-Level Architecture Diagram

```
                                      ┌──────────────────────────────────────────────┐
                                      │             External Data Ingestion          │
                                      │  - Open-Meteo (72h GFS/ECMWF NWP Forecast)   │
                                      │  - OpenStreetMap (Overpass API Infrastructure)│
                                      │  - Copernicus GLO-30 / SRTM-30 DEM           │
                                      │  - Sentinel-1 SAR (CDSE Ingestion Pipeline)  │
                                      └──────────────────────┬───────────────────────┘
                                                             │
                                                             ▼
                                      ┌──────────────────────────────────────────────┐
                                      │           Automated ETL & Pipelines          │
                                      │  - pipelines/ingest_weather.py               │
                                      │  - pipelines/update_exposure.py              │
                                      └──────────────────────┬───────────────────────┘
                                                             │
                                                             ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                              FastAPI Core Backend Engine                                       │
│                                                                                                                │
│   ┌───────────────────────────┐    ┌───────────────────────────┐    ┌──────────────────────────────────────┐   │
│   │   Hydrological Exposure   │    │  Road Network Routing     │    │       Scenario Engine                │   │
│   │   Multi-criteria Heuristic│    │  - NetworkX Graph         │    │  - Synthetic Inflow Simulation       │   │
│   │   - Elevation factor      │    │  - Edge Susceptibility    │    │  - Delta Risk Quantification         │   │
│   │   - Rainfall factor (24h) │    │  - Isolation Clock (Time  │    │  - Escalation Statistics             │   │
│   │   - Criticality weighting │    │    to Cutoff)             │    │                                      │   │
│   └─────────────┬─────────────┘    └─────────────┬─────────────┘    └──────────────────┬───────────────────┘   │
│                 │                                │                                     │                       │
│                 ▼                                ▼                                     ▼                       │
│   ┌────────────────────────────────────────────────────────────────────────────────────────────────────────┐   │
│   │                                       RESTful API Layer (v1)                                           │   │
│   │   /health   /status   /forecast/latest   /assets   /exposure   /isolation   /scenario   /reports   /brief │   │
│   └──────────────────────────────────────────────────┬─────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────┼─────────────────────────────────────────────────────────┘
                                                       │ (JSON / GeoJSON over HTTP)
                                                       ▼
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                  Next.js 16 (React 19, Tailwind CSS v4) Web Workspace                          │
│                                                                                                                │
│   - Header with Live Engine Telemetry, Offline Detector, Language Switcher (EN / ML), Disclaimer               │
│   - Interactive MapLibre GL Map Canvas (OpenFreeMap / OSM raster, River Centerline, Risk Markers, Corridors)    │
│   - 72-Hour Hyetograph Timeline Scrubber (Recharts Hourly Hyetograph + Horizon Accumulations)                  │
│   - Exposure Ledger (Filterable Table with Search, Risk Categorization, and Dynamic CSV Export)                │
│   - Isolation Clock Panel (Node Reachability, Severed Corridors, Alternative Route Counting)                   │
│   - Rain Dial Panel (Synthetic Rainfall Slider, Convective Duration Selector, Real-time Delta Impact Cards)   │
│   - Explainability & Governance Panel (Honest ML State Banner, Feature Weight Breakdown, Data Freshness)       │
│   - Citizen Reports Panel (Crowdsourced Ground Observation Form + Live Feed with Unverified Flags)             │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Core Subsystems

### 3.1 Geospatial Engine (`geospatial/`)
- **DEM & Terrain:** Calibrated elevation retrieval spanning 1m MSL (coastal outflow at Munambam) to 1,200m MSL (Anamalai escarpment). Computes slope gradients and Height Above Nearest Drainage (HAND).
- **Network Routing:** Graph representation using `networkx.Graph`. Nodes represent intersections and critical hubs; edges represent road corridors with calculated flood susceptibility and distance weights.

### 3.2 Machine Learning & Governance (`ml/`)
- **Honest Heuristic Baseline:** Operates an interpretable multi-criteria evaluation score:
  $$\text{Risk Score} = 0.40 \cdot S_{\text{elevation}} + 0.35 \cdot F_{\text{rainfall}} + 0.25 \cdot W_{\text{criticality}}$$
- **XGBoost Pipeline:** Documented in `ml/models/train.py`. Gated from claiming trained status until ground-truth Sentinel-1 SAR water masks and Copernicus DEM rasters are ingested into disk.
- **Evaluation:** Evaluates PR-AUC, ROC-AUC, Brier calibration scores, and spatial block cross-validation (preventing geographic autocorrelation leakage).

### 3.3 Backend API (`backend/`)
- Asynchronous FastAPI server supporting SQLite (`sqlite+aiosqlite`) for zero-dependency local development and PostgreSQL / PostGIS for enterprise deployment.
- Resilient retry logic via Tenacity for external HTTP adapters.

### 3.4 Web Workspace (`web/`)
- Built with Next.js 16, React 19, and Tailwind CSS v4.
- Implements custom warm light-theme palette: `#F7F8F4` background, `#246B62` primary forest green, `#D7EAF2` river water accent, `#D99A28` warning amber, and `#C0392B` emergency crimson.
- Tabular numeral support for hydrological measurements.
- Bilingual English and Malayalam (മലയാളം) localization.
