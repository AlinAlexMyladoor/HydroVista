# FloodLens AI — Integrated Data Sources & Provenance

This document records the provenance, licensing, spatial resolution, and operational limitations of all data sources used across the FloodLens AI platform.

---

## 1. Open-Meteo Weather Forecast API

- **Provider:** Open-Meteo (open-source weather API).
- **Endpoint:** `https://api.open-meteo.com/v1/forecast`
- **License:** Creative Commons Attribution 4.0 International (CC BY 4.0).
- **Variables Retrieved:**
  - `precipitation` (hourly rainfall in mm)
  - `temperature_2m` (air temperature at 2m in °C)
  - `relative_humidity_2m` (relative humidity at 2m in %)
  - `wind_speed_10m` (wind velocity at 10m in km/h)
- **Spatial Resolution:** ~1 to 11 km (depends on underlying ECMWF/GFS blend).
- **Coordinate Reference System:** WGS84 (EPSG:4326).
- **Temporal Horizon:** Hourly forecasts up to 7 days ahead (72 hours utilized in primary UI).
- **Engineering Limitations:**
  - Open-Meteo provides Numerical Weather Prediction (NWP) model outputs, not physical rain-gauge observations.
  - Sub-basin convective micro-bursts in the Western Ghats steep slopes may be underestimated.
  - Precipitation values represent grid-averaged totals, not localized gauge truth.

---

## 2. OpenStreetMap (OSM) Infrastructure

- **Provider:** OpenStreetMap Contributors via Overpass API.
- **License:** Open Database License (ODbL 1.0).
- **Feature Classes Extracted:**
  - Healthcare: `amenity=hospital`, `amenity=clinic`, `amenity=doctors`
  - Educational: `amenity=school`, `amenity=college`
  - Relief Shelters: `emergency=assembly_point`, `social_facility=shelter`
  - Utilities: `power=substation`, `substation=*`
  - Transport Network: `highway=motorway`, `trunk`, `primary`, `secondary`, `tertiary`
- **Basin Bounding Box:**
  - South: 10.0°N, West: 76.15°E, North: 10.45°N, East: 76.75°E
- **Engineering Limitations:**
  - Completeness depends on volunteer mapping density.
  - Relief shelters and auxiliary medical posts are often incomplete or sparsely tagged.
  - Ingestion pipeline maintains verified fallback fixtures for essential regional facilities (e.g., Chalakudy Taluk Hospital, St. James Hospital, Pariyaram relief hubs) to ensure system reliability even during Overpass rate-limiting.

---

## 3. Copernicus GLO-30 & SRTM Digital Elevation Models (DEM)

- **Provider:** European Space Agency (ESA) Copernicus Programme & NASA SRTM.
- **License:** Open Data policy (Copernicus / Public Domain NASA).
- **Spatial Resolution:** 30m horizontal grid spacing.
- **Vertical Accuracy:** ~2–4 meters in low relief areas, higher uncertainty in steep forested slopes.
- **Vertical Datum:** EGM96 (Mean Sea Level).
- **Engineering Limitations:**
  - Digital Surface Models (DSM) include tree canopy and urban structures; bare-earth DTM correction is not applied.
  - Narrow drainage culverts and road embankment micro-relief under 30m width may not be resolved.

---

## 4. Sentinel-1 SAR (Synthetic Aperture Radar)

- **Provider:** ESA Copernicus Data Space Ecosystem (CDSE).
- **Instrument:** C-band Synthetic Aperture Radar (SAR), Interferometric Wide (IW) swath mode, Ground Range Detected (GRD).
- **Polarization:** VV + VH dual polarization.
- **Operational Status:**
  - The offline ML feature extraction pipeline in `ml/models/train.py` accepts pre-processed water masks.
  - Live query pipeline requires Copernicus CDSE OAuth client credentials. In their absence, the system transparently reports the pipeline as configured but awaiting authentication keys, operating the calibrated baseline heuristic instead of fabricating predictions.

---

## 5. Citizen Ground Reports

- **Provider:** Crowdsourced community field observations.
- **License:** Open platform submission with unverified provenance notice.
- **Attributes:** Latitude, Longitude, Estimated Water Depth (cm), Description/Landmark, Timestamp.
- **Operational Status:**
  - Displayed with an unambiguous "Unverified Community Observation" badge.
  - Never directly overrides model physics or road closure calculations without administrative verification.
