/**
 * FloodLens AI — API client
 * Typed fetch wrappers for all backend endpoints.
 */

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export class APIError extends Error {
  constructor(
    public status: number,
    public detail: string,
    public code?: string
  ) {
    super(detail);
    this.name = "APIError";
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers || {}),
      },
    });

    if (!res.ok) {
      let detail = `HTTP ${res.status}`;
      try {
        const err = await res.json();
        detail = err.detail?.message || err.detail || err.error || detail;
        const fe = err.detail?.errors;
        if (Array.isArray(fe) && fe.length) detail += " — " + fe.map((e: { field: string; message: string }) => `${e.field}: ${e.message}`).join("; ");
      } catch {}
      throw new APIError(res.status, detail);
    }

    return res.json();
  } catch (e) {
    if (e instanceof APIError) throw e;
    throw new APIError(0, `Network error: ${(e as Error).message}`);
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HealthResponse {
  status: string;
  version: string;
  environment: string;
  timestamp: string;
}

export interface StatusResponse {
  api: string;
  database: string;
  data_sources: DataSourceStatus[];
  current_mode: "live" | "degraded" | "demo";
  disclaimer: string;
}

export interface DataSourceStatus {
  slug: string;
  name: string;
  is_available: boolean;
  last_checked: string | null;
  last_success: string | null;
  requires_credentials: boolean;
  known_limitations: string | null;
}

export interface HourlyWeather {
  time: string;
  precipitation_mm: number | null;
  temperature_2m: number | null;
  relative_humidity_2m: number | null;
  wind_speed_10m: number | null;
  is_forecast: boolean;
}

export interface RainfallAccumulation {
  window_hours: number;
  accumulation_mm: number | null;
  computed_at: string;
  note: string | null;
}

export interface ForecastResponse {
  run_id: string;
  basin: string;
  retrieved_at: string;
  lat: number;
  lon: number;
  hourly: HourlyWeather[];
  rainfall_accumulations: RainfallAccumulation[];
  data_quality_notes: string[];
  is_stale: boolean;
  stale_since: string | null;
}

export interface Asset {
  osm_id: string;
  name: string | null;
  asset_type: string;
  sub_type: string | null;
  lat: number;
  lon: number;
  source: string;
  source_url: string | null;
  tags: Record<string, string> | null;
  ingested_at: string;
  is_verified: boolean;
}

export interface AssetsResponse {
  items: Asset[];
  meta: { total: number; page: number; page_size: number; pages: number };
  warnings: string[];
  cached_at: string | null;
  limitations: string[];
}

export interface ExposureScore {
  asset_id: string;
  asset_name: string | null;
  asset_type: string;
  sub_type: string | null;
  lat: number;
  lon: number;
  risk_score: number;
  risk_category: "low" | "medium" | "high" | "critical";
  flood_susceptibility: number | null;
  rainfall_accumulation_mm: number | null;
  terrain_elevation_m: number | null;
  evidence: string[];
  data_quality: "good" | "partial" | "limited";
  data_warnings: string[];
  computed_at: string;
}

export interface ExposureResponse {
  items: ExposureScore[];
  meta: { total: number; page: number; page_size: number; pages: number };
  rainfall_24h_mm: number | null;
  forecast_time: string | null;
  warnings: string[];
  disclaimer: string;
}

export interface ScenarioRequest {
  rainfall_mm: number;
  duration_hours: number;
  forecast_hour: number;
  closure_threshold?: number;
}

export interface ScenarioResponse {
  scenario_id: string;
  rainfall_mm: number;
  duration_hours: number;
  forecast_hour: number;
  closure_threshold: number;
  baseline_24h_mm: number | null;
  scenario_24h_mm: number | null;
  summary: {
    baseline_high_critical_count: number;
    scenario_high_critical_count: number;
    delta_high_critical: number;
    escalated_count: number;
    combined_24h_mm: number | null;
  };
  method: string;
  assumptions: string[];
  disclaimer: string;
  computed_at: string;
}

export interface IsolationResult {
  facility_id: string;
  facility_name: string | null;
  facility_type: string;
  lat: number;
  lon: number;
  is_connected: boolean;
  last_connected_time: string | null;
  first_disconnected_time: string | null;
  time_to_isolation_hours: number | null;
  alternative_routes_count: number;
  flagged_edges: string[];
  assumptions: string[];
  uncertainty_note: string;
  computed_at: string;
}

export interface IsolationResponse {
  items: IsolationResult[];
  safe_access_anchors: { id: string; name: string; lat: number; lon: number }[];
  closure_threshold: number;
  warnings: string[];
  disclaimer: string;
}

export interface BriefResponse {
  basin: string;
  generated_at: string;
  forecast_horizon_hours: number;
  rainfall_24h_mm: number | null;
  max_risk_category: string | null;
  affected_roads_count: number | null;
  isolated_facilities_count: number | null;
  data_freshness: "current" | "stale" | "unavailable";
  operating_mode: string;
  key_warnings: string[];
  disclaimer: string;
}

export interface ReportCreate {
  lat: number;
  lon: number;
  description: string;
  reported_depth_cm?: number;
  reporter_name?: string;
}

export interface AnalysisParams {
  west: number; south: number; east: number; north: number;
  pre_start: string; pre_end: string; event_start: string; event_end: string;
  orbit: "ASCENDING" | "DESCENDING" | "ANY"; threshold_db: number; permanent_occurrence_pct: number;
  max_slope_deg: number; smooth_m: number; min_drop_db: number; scale_m: number;
  optical_fusion?: boolean; mndwi_threshold?: number; max_cloud_pct?: number;
}
export interface AnalysisResult {
  product: string; validated: boolean; method: string;
  datasets: Record<string, string>; parameters: AnalysisParams;
  scene_counts: { pre_event: number; event: number };
  acquisition_dates: { pre_event: string[]; event: string[] };
  areas_km2: Record<string, number>;
  exposed_population?: number | null;
  population_dataset?: string;
  processing: { scale_m: number; area_method: string; seconds: number };
  tiles: { candidate_inundation: string; vv_change_db: string; mndwi?: string; no_observation?: string };
  coverage?: { no_observation_fraction: number | null; note: string };
  vectors?: { available: boolean; reason?: string; feature_count?: number; total_polygons?: number; truncated?: boolean; min_polygon_area_m2?: number | null; simplify_m?: number };
  limitations: string[];
  run: { id: string; seconds_total: number; attempts: number };
}
export interface AnalysisRun {
  id: string; status: "queued" | "running" | "completed" | "failed";
  params: AnalysisParams; created_at: string; started_at: string | null; finished_at: string | null;
  attempts: number; error: string | null; error_code: string | null; result?: AnalysisResult | null; cache_hit?: boolean;
  poll_url?: string; result_url?: string;
}
export interface InundationGeoJSON { type: "FeatureCollection"; features: { type: "Feature"; properties: Record<string, unknown>; geometry: { type: string; coordinates: unknown } }[] }
export interface AnalysisStatus {
  id: string; status: "queued" | "running" | "completed" | "failed"; attempts: number;
  created_at: string; started_at: string | null; finished_at: string | null;
  queued_seconds: number | null; running_seconds: number | null;
  error: string | null; error_code: string | null; terminal: boolean; poll_after_ms: number | null; has_geojson: boolean;
}
export interface ModelEvaluation {
  model_version: string; evaluated_at: string | null;
  metrics: Record<string, number | null>;
  confusion_matrix: null | { labels: string[]; matrix: number[][]; layout: string };
  n_test?: number;
  class_balance: null | { train_positive_fraction: number; test_positive_fraction: number };
  baseline_comparison: null | { rule: string; threshold_db: number; metrics: ModelMetrics };
  feature_importance?: Record<string, number>;
  split: null | { method: string; test_size: number; seed: number; train_regions: string[]; test_regions: string[] };
  per_region_test?: Record<string, { n: number; rf_f1: number | null; baseline_f1: number | null }>;
  csv_name?: string; csv_sha256?: string;
  notes: string[]; status: "evaluated" | "not_evaluated";
}
export interface AnalysisCapabilities {
  ready: boolean; blocking_reasons: string[]; datasets: Record<string, string>; method: string;
  limits: { max_area_km2: number; max_window_days: number; queue_limit: number; cache_hours: number };
}
export interface ModelMetrics {
  tp: number; fp: number; fn: number; tn: number; precision: number | null; recall: number | null;
  f1: number | null; iou: number | null; accuracy: number | null; n: number; positive_fraction: number | null;
  roc_auc?: number | null; brier_score?: number | null;
  confusion_matrix: number[][];
}

export interface ModelExplanation {
  asset_id: string;
  prediction?: number | null;
  prediction_label?: string | null;
  feature_contributions: { feature: string; value: number; shap_value: number; direction: string }[];
  base_value: number | null;
  model_version: string | null;
  status: "explained" | "features_required" | "model_not_trained" | "explanation_failed";
  required_features?: string[];
  missing_features?: string[];
  limitation?: string;
  computed_at: string;
}
export interface Experiment {
  id: string; created_at: string;
  models: {
    random_forest: { metrics: ModelMetrics; feature_importance: Record<string, number>; n_estimators: number };
    threshold_baseline: { metrics: ModelMetrics; threshold_db: number; rule: string };
  };
  per_region_test: Record<string, { n: number; rf_f1: number | null; baseline_f1: number | null }>;
  provenance: { csv_name: string; csv_sha256: string; n_rows: number; features: string[];
    split: { method: string; test_size: number; seed: number; train_regions: string[]; test_regions: string[] };
    class_balance: { train_positive_fraction: number; test_positive_fraction: number };
    versions: Record<string, string> };
  warnings: string[];
}

// ─── API functions ────────────────────────────────────────────────────────────

export const api = {
  analysis: {
    capabilities: () => request<AnalysisCapabilities>("/api/v1/analysis/capabilities"),
    runs: () => request<{ runs: AnalysisRun[] }>("/api/v1/analysis/runs"),
    run: (id: string) => request<AnalysisRun>(`/api/v1/analysis/runs/${id}`),
    status: (id: string) => request<AnalysisStatus>(`/api/v1/analysis/runs/${id}/status`),
    geojson: (id: string) => request<InundationGeoJSON>(`/api/v1/analysis/runs/${id}/inundation.geojson`),
    create: (p: AnalysisParams) => request<AnalysisRun>("/api/v1/analysis/runs", { method: "POST", body: JSON.stringify(p) }),
    exportCsvUrl: (id: string) => `${API_BASE}/api/v1/analysis/runs/${id}/export.csv`,
  },
  modelLab: {
    experiments: () => request<{ experiments: Experiment[]; note: string | null }>("/api/v1/model-lab/experiments"),
  },
  health: () => request<HealthResponse>("/api/v1/health"),
  status: () => request<StatusResponse>("/api/v1/status"),

  forecast: {
    latest: () => request<ForecastResponse>("/api/v1/forecast/latest"),
    dataSources: () => request<{ sources: DataSourceStatus[] }>("/api/v1/data-sources"),
  },

  assets: {
    list: (params?: { asset_type?: string; page?: number; page_size?: number }) => {
      const q = new URLSearchParams();
      if (params?.asset_type) q.set("asset_type", params.asset_type);
      if (params?.page) q.set("page", String(params.page));
      if (params?.page_size) q.set("page_size", String(params.page_size));
      return request<AssetsResponse>(`/api/v1/assets?${q}`);
    },
    get: (assetId: string) => request<Asset>(`/api/v1/assets/${assetId}`),
    refresh: () => request<{ status: string; count: number }>("/api/v1/assets/refresh", { method: "POST" }),
  },

  exposure: {
    list: (params?: { asset_type?: string; risk_category?: string; page?: number; page_size?: number }) => {
      const q = new URLSearchParams();
      if (params?.asset_type) q.set("asset_type", params.asset_type);
      if (params?.risk_category) q.set("risk_category", params.risk_category);
      if (params?.page) q.set("page", String(params.page));
      if (params?.page_size) q.set("page_size", String(params.page_size));
      return request<ExposureResponse>(`/api/v1/exposure?${q}`);
    },
  },

  isolation: {
    get: (threshold?: number) => {
      const q = threshold ? `?closure_threshold=${threshold}` : "";
      return request<IsolationResponse>(`/api/v1/isolation${q}`);
    },
  },

  scenario: {
    create: (body: ScenarioRequest) =>
      request<ScenarioResponse>("/api/v1/scenario", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    get: (id: string) => request<ScenarioResponse>(`/api/v1/scenario/${id}`),
  },

  model: {
    metadata: () => request("/api/v1/model/metadata"),
    evaluation: () => request<ModelEvaluation>("/api/v1/model/evaluation"),
    explain: (assetId: string, features?: Record<string, number>) => {
      const query = new URLSearchParams();
      Object.entries(features ?? {}).forEach(([key, value]) => query.set(key, String(value)));
      return request<ModelExplanation>(`/api/v1/model/explain/${assetId}?${query}`);
    },
  },

  historical: {
    events: () => request("/api/v1/historical/events"),
    compare: () => request("/api/v1/historical/compare"),
  },

  reports: {
    submit: (body: ReportCreate) =>
      request("/api/v1/reports", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    list: () => request("/api/v1/reports"),
  },

  brief: () => request<BriefResponse>("/api/v1/brief"),
};
