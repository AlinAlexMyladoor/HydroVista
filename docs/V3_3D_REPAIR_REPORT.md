# HydroVista v3 — 3D / buttons repair report

## Root causes found in the uploaded code
1. **No real terrain.** The "terrain" source was a Stamen map-image tile (not elevation), and `setTerrain()` was never called on load. Only the 2D/3D button called it, and only if that source existed.
2. **Map ignored most layer toggles.** The sidebar had 11 layer checkboxes; the map only reacted to 2 ids (`assets`, `reports`), neither of which was in the sidebar. The map's own layer menu had empty `onChange` handlers.
3. **Map used local state** for 3D/exaggeration instead of the shared store.
4. **"3D cross-section" was a 2D recharts bar chart** over 8 hardcoded numbers.
5. Map showed only the first 50 assets (no `page_size`), and popups injected OSM names as unescaped HTML.

## Changed
- `lib/dem.ts` — Terrarium DEM decode, tile fetch/cache, bilinear sampling, swath sampling (free, no key).
- `components/map/FloodMap.tsx` — raster-dem terrain + hillshade, real tile success/failure accounting, DEM-sourced elevation hover, pitch/bearing/exaggeration sliders, working zoom/compass/reset/2D-3D, every layer toggle wired to a real layer, error/retry states, escaped popups, 200 assets.
- `lib/layers.ts` — one layer list; layers with no data source (rainfall raster, Sentinel) are disabled with the reason.
- `lib/section-mesh.ts` + `components/panels/TerrainSectionPanel.tsx` — raw WebGL 3D block (9 parallel DEM transects, 96 samples each): drag-rotate, wheel-zoom, hover elevation, vertical exaggeration, reset, resize, GPU cleanup.
- Tests: `npm run test:unit`.

## Not verified here (sandbox had no network and only a darwin SWC binary)
`next build`, the running app, live DEM/Open-Meteo/Overpass requests, backend tests (no FastAPI installed).

## Known remaining problems
- Backend falls back to hand-written asset fixtures (`openstreetmap_cached_fixture`) if Overpass is unreachable.
- `ReportsView` ships hardcoded sample citizen reports.
- Forecast-hour slider does not change map/exposure (backend `/exposure` has no forecast-hour parameter).
- Pre-existing lint errors elsewhere (21 errors: `any`, impure `Date.now` in render).
