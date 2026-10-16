/**
 * HydroVista — Global application store (Zustand).
 * Manages UI state, map state, data, filters, scenario and language.
 */
import { create } from "zustand";
import { DEFAULT_LAYER_IDS } from "@/lib/layers";
import type { ExposureScore, ForecastResponse, Asset, ScenarioResponse } from "@/lib/api";

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
  selectedAssetId: string | null;
  setSelectedAssetId: (id: string | null) => void;
  forecastHour: number;
  setForecastHour: (hour: number) => void;
  forecastHorizon: ForecastHorizon;
  setForecastHorizon: (h: ForecastHorizon) => void;
  isPlayingTimeline: boolean;
  setIsPlayingTimeline: (v: boolean) => void;

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
  language: "en" | "ml";
  setLanguage: (l: "en" | "ml") => void;

  // Status
  isOffline: boolean;
  setIsOffline: (v: boolean) => void;

  // Search
  searchQuery: string;
  setSearchQuery: (q: string) => void;
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
  selectedAssetId: null,
  setSelectedAssetId: (id) => set({ selectedAssetId: id }),
  forecastHour: 6,
  setForecastHour: (hour) => set({ forecastHour: hour }),
  forecastHorizon: 24,
  setForecastHorizon: (h) => set({ forecastHorizon: h }),
  isPlayingTimeline: false,
  setIsPlayingTimeline: (v) => set({ isPlayingTimeline: v }),

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

  searchQuery: "",
  setSearchQuery: (q) => set({ searchQuery: q }),
}));
