/**
 * HydroVista — Global application store (Zustand).
 * Manages UI state, map state, data, filters, scenario and language.
 */
import { create } from "zustand";
import { DEFAULT_LAYER_IDS } from "@/lib/layers";
import type { ExposureScore, ForecastResponse, Asset, ScenarioResponse, InundationGeoJSON } from "@/lib/api";
import type { Language } from "@/lib/translations";

// Top-level route (maps to Next.js routes)
export type AppRoute = "overview" | "map" | "analytics" | "scenarios" | "infrastructure" | "reports" | "about" | "analysis" | "modellab" | "methodology";

// Legacy panel switcher (kept for backward compat with existing panels)
export type ActivePanel = "map" | "exposure" | "isolation" | "rain-dial" | "explain" | "reports" | "status";

export type RiskCategory = "all" | "low" | "medium" | "high" | "critical";

export type ForecastHorizon = 24 | 72 | 168; // hours

interface AppState {
  // Route / navigation
  activeRoute: AppRoute;
  setActiveRoute: (route: AppRoute) => void;

  // Legacy panel switcher (used by existing panel components)
  activePanel: ActivePanel;
  setActivePanel: (panel: ActivePanel) => void;

  // Map state
  mapIs3D: boolean;
  setMapIs3D: (v: boolean) => void;
  mapPitch: number;
  setMapPitch: (v: number) => void;
  mapBearing: number;
  setMapBearing: (v: number) => void;
  terrainStatus: "idle" | "loading" | "ready" | "error";
  terrainInfo: string;
  setTerrainStatus: (s: "idle" | "loading" | "ready" | "error", info?: string) => void;
  terrainExaggeration: number;
  setTerrainExaggeration: (v: number) => void;
  visibleLayers: Set<string>;
  toggleLayer: (layerId: string) => void;
  setLayerVisible: (layerId: string, visible: boolean) => void;
  inundationRunId: string | null;
  setInundationRunId: (id: string | null) => void;
  drapedInundation: { runId: string; geojson: InundationGeoJSON } | null;
  setDrapedInundation: (value: { runId: string; geojson: InundationGeoJSON } | null) => void;
  selectedAssetId: string | null;
  setSelectedAssetId: (id: string | null) => void;
  hoveredAssetId: string | null;
  setHoveredAssetId: (id: string | null) => void;
  mapFocusRequest: { lat: number; lon: number; assetId: string | null; bounds?: [[number, number], [number, number]]; requestId: number } | null;
  focusMap: (lat: number, lon: number, assetId?: string | null) => boolean;
  focusMapBounds: (west: number, south: number, east: number, north: number) => boolean;
  forecastHour: number;
  setForecastHour: (hour: number) => void;
  forecastHorizon: ForecastHorizon;
  setForecastHorizon: (h: ForecastHorizon) => void;
  isPlayingTimeline: boolean;
  setIsPlayingTimeline: (v: boolean) => void;
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  bottomAnalyticsCollapsed: boolean;
  setBottomAnalyticsCollapsed: (v: boolean) => void;
  transectHoverPoint: { lon: number; lat: number; elevM: number; distKm: number } | null;
  setTransectHoverPoint: (pt: { lon: number; lat: number; elevM: number; distKm: number } | null) => void;

  // Left sidebar collapse
  leftSidebarOpen: boolean;
  setLeftSidebarOpen: (v: boolean) => void;
  rightRailOpen: boolean;
  setRightRailOpen: (v: boolean) => void;

  // Data
  forecast: ForecastResponse | null;
  setForecast: (f: ForecastResponse | null) => void;
  assets: Asset[];
  setAssets: (a: Asset[]) => void;
  exposureScores: ExposureScore[];
  setExposureScores: (e: ExposureScore[]) => void;

  // Filters
  riskFilter: RiskCategory;
  setRiskFilter: (r: RiskCategory) => void;
  assetTypeFilter: string;
  setAssetTypeFilter: (t: string) => void;

  // Scenario (Rain Dial)
  activeScenario: ScenarioResponse | null;
  setActiveScenario: (s: ScenarioResponse | null) => void;
  scenarioRainfall: number;
  setScenarioRainfall: (mm: number) => void;
  scenarioDuration: number;
  setScenarioDuration: (h: number) => void;

  // Language
  language: Language;
  setLanguage: (l: Language) => void;

  // Status
  isOffline: boolean;
  setIsOffline: (v: boolean) => void;

  // Satellite Scene Info
  satelliteInfo: string | null;
  setSatelliteInfo: (info: string | null) => void;

  // Search
  searchQuery: string;
  setSearchQuery: (q: string) => void;

  // Assistant Chat
  assistantOpen: boolean;
  setAssistantOpen: (open: boolean | ((v: boolean) => boolean)) => void;

  // Analysis Drawer
  analysisDrawerOpen: boolean;
  setAnalysisDrawerOpen: (open: boolean) => void;
}

const DEFAULT_LAYERS = new Set(DEFAULT_LAYER_IDS);

export const useStore = create<AppState>((set) => ({
  activeRoute: "overview",
  setActiveRoute: (route) => set({ activeRoute: route }),

  activePanel: "map",
  setActivePanel: (panel) => set({ activePanel: panel }),

  mapIs3D: true,
  setMapIs3D: (v) => set({ mapIs3D: v }),
  mapPitch: 62,
  setMapPitch: (v) => set({ mapPitch: v }),
  mapBearing: 70,
  setMapBearing: (v) => set({ mapBearing: v }),
  terrainStatus: "idle",
  terrainInfo: "",
  setTerrainStatus: (s, info = "") => set({ terrainStatus: s, terrainInfo: info }),
  terrainExaggeration: 2.0,
  setTerrainExaggeration: (v) => set({ terrainExaggeration: v }),
  visibleLayers: DEFAULT_LAYERS,
  toggleLayer: (layerId) =>
    set((state) => {
      const next = new Set(state.visibleLayers);
      if (next.has(layerId)) next.delete(layerId);
      else next.add(layerId);
      return { visibleLayers: next };
    }),
  setLayerVisible: (layerId, visible) =>
    set((state) => {
      const next = new Set(state.visibleLayers);
      if (visible) next.add(layerId);
      else next.delete(layerId);
      return { visibleLayers: next };
    }),
  inundationRunId: null,
  setInundationRunId: (id) => set({ inundationRunId: id }),
  drapedInundation: null,
  setDrapedInundation: (value) => set({ drapedInundation: value }),
  selectedAssetId: null,
  setSelectedAssetId: (id) => set({ selectedAssetId: id }),
  hoveredAssetId: null,
  setHoveredAssetId: (id) => set({ hoveredAssetId: id }),
  mapFocusRequest: null,
  focusMap: (lat, lon, assetId = null) => {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) return false;
    set((state) => ({
      activeRoute: state.activeRoute === "overview" ? "overview" : "map",
      mapIs3D: true,
      mapPitch: 60,
      mapBearing: 30,
      selectedAssetId: assetId,
      mapFocusRequest: { lat, lon, assetId, requestId: (state.mapFocusRequest?.requestId ?? 0) + 1 },
    }));
    return true;
  },
  focusMapBounds: (west, south, east, north) => {
    if (![west, south, east, north].every(Number.isFinite) || west < -180 || east > 180 || south < -90 || north > 90 || west >= east || south >= north) return false;
    set((state) => ({
      activeRoute: state.activeRoute === "overview" ? "overview" : "map",
      mapIs3D: true,
      mapPitch: 60,
      mapBearing: 30,
      selectedAssetId: null,
      mapFocusRequest: {
        lat: (south + north) / 2,
        lon: (west + east) / 2,
        assetId: null,
        bounds: [[west, south], [east, north]],
        requestId: (state.mapFocusRequest?.requestId ?? 0) + 1,
      },
    }));
    return true;
  },
  forecastHour: 6,
  setForecastHour: (hour) => set({ forecastHour: hour }),
  forecastHorizon: 24,
  setForecastHorizon: (h) => set({ forecastHorizon: h }),
  isPlayingTimeline: false,
  setIsPlayingTimeline: (v) => set({ isPlayingTimeline: v }),
  playbackSpeed: 1,
  setPlaybackSpeed: (speed) => set({ playbackSpeed: speed }),
  bottomAnalyticsCollapsed: false,
  setBottomAnalyticsCollapsed: (v) => set({ bottomAnalyticsCollapsed: v }),
  transectHoverPoint: null,
  setTransectHoverPoint: (pt) => set({ transectHoverPoint: pt }),

  leftSidebarOpen: true,
  setLeftSidebarOpen: (v) => set({ leftSidebarOpen: v }),
  rightRailOpen: true,
  setRightRailOpen: (v) => set({ rightRailOpen: v }),

  forecast: null,
  setForecast: (f) => set({ forecast: f }),
  assets: [],
  setAssets: (a) => set({ assets: a }),
  exposureScores: [],
  setExposureScores: (e) => set({ exposureScores: e }),

  riskFilter: "all",
  setRiskFilter: (r) => set({ riskFilter: r }),
  assetTypeFilter: "all",
  setAssetTypeFilter: (t) => set({ assetTypeFilter: t }),

  activeScenario: null,
  setActiveScenario: (s) => set({ activeScenario: s }),
  scenarioRainfall: 60,
  setScenarioRainfall: (mm) => set({ scenarioRainfall: mm }),
  scenarioDuration: 6,
  setScenarioDuration: (h) => set({ scenarioDuration: h }),

  language: "en",
  setLanguage: (l) => set({ language: l }),

  isOffline: false,
  setIsOffline: (v) => set({ isOffline: v }),

  satelliteInfo: null,
  setSatelliteInfo: (info) => set({ satelliteInfo: info }),

  searchQuery: "",
  setSearchQuery: (q) => set({ searchQuery: q }),

  assistantOpen: false,
  setAssistantOpen: (open) =>
    set((state) => ({
      assistantOpen: typeof open === "function" ? open(state.assistantOpen) : open,
    })),

  analysisDrawerOpen: false,
  setAnalysisDrawerOpen: (open) => set({ analysisDrawerOpen: open }),
}));
