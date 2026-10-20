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
        const rawDetail = err.detail;
        detail = typeof rawDetail === "string"
          ? rawDetail
          : Array.isArray(rawDetail)
            ? rawDetail.map((issue: any) => {
                const field = Array.isArray(issue.loc) ? issue.loc.filter((part: unknown) => part !== "body").join(".") : "request";
                return `${field}: ${issue.msg || "Invalid value"}`;
              }).join("; ")
            : rawDetail?.message || (rawDetail ? JSON.stringify(rawDetail) : err.error || detail);
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

export interface AssetRiskSnapshot {
  name: string;
  asset_type: string;
  risk_category: "low" | "medium" | "high" | "critical";
  risk_score?: number | null;
  elevation?: number | null;
}

export interface AssistantContext {
  basin: string;
  rainfall_24h_mm?: number | null;
  rainfall_source?: string | null;
  rainfall_updated_at?: string | null;
  forecast_stale?: boolean;
  observed_stage_m?: number | null;
  observed_stage_at?: string | null;
  stage_source?: string | null;
  stage_forecast_points?: number;
  modelled_discharge_m3s?: number | null;
  discharge_source?: string | null;
  high_risk_assets?: number | null;
  source_statuses?: Record<string, "available" | "stale" | "unavailable">;
  source_updated_at?: Record<string, string>;
  hourly_rainfall?: { time: string; precipitation_mm?: number | null; is_forecast?: boolean }[];
  high_risk_assets_snapshot?: AssetRiskSnapshot[];
  scenario_rainfall_mm?: number | null;
  scenario_duration_hours?: number | null;
  active_scenario_impact?: {
    severe_risk_count: number;
    net_change: number;
    escalated_count?: number;
    rainfall_mm?: number;
    duration_hours?: number;
  } | null;
}

export interface AssistantResponse {
  answer: string;
  sources: string[];
  grounded: boolean;

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

export interface HistoricalRainfallResponse {
  source: string;
  source_url: string;
  start_date: string;
  end_date: string;
  hourly: HourlyWeather[];
  data_quality_notes: string[];
}

export interface RiverDischargeResponse {
  source: string;
  source_url: string;
  model: string;
  retrieved_at: string;
  lat: number;
  lon: number;
  units: string;
  daily: { date: string; river_discharge_m3s: number | null }[];
  known_limitations: string;
  is_stale?: boolean;
}

export interface RiverStageForecastResponse {
  is_available?: boolean;
  is_forecast_available?: boolean;
  unavailable_reason?: string;
  station: string;
  river: string;
  observed_at?: string;
  observed_stage_m?: number;
  forecast: { time: string; stage_m: number; lower_m: number; upper_m: number; lead_hours: number }[];
  model?: string;
  validation?: { method: string; mae_m: number; empirical_90pct_abs_error_m: number };
  source: string;
  source_url: string;
  rainfall_source_url?: string;
  retrieved_at?: string;
  known_limitations?: string;
}

export interface TerrainDistributionResponse {
  source: string;
  bounds: number[] | null;
  grid_size: number | null;
  sampled_cells: number;
  slope_cells: number;
  coverage_pct: number | null;
  measurement_basis: "regular_grid_samples" | "sample_points";
  hypsometric: { elevation_m: number; area_below_pct: number }[];
  slope_histogram: { slope_bin: string; share_pct: number }[];
  known_limitations: string;
  fallback_reason?: string;
  is_stale?: boolean;
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
  terrain_source?: string | null;
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
  terrain_coverage?: { sampled_assets: number; total_assets: number; sources: string[] };
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
  escalated_assets?: {
    asset_id: string;
    name: string | null;
    type: string;
    baseline_category: string;
    scenario_category: string;
    delta_score: number;
    lat?: number | null;
    lon?: number | null;
  }[];
  scenario_rankings?: ExposureScore[];
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

export interface ReportItem extends ReportCreate {
  id: string;
  submitted_at: string;
  status: string;
  disclaimer: string;
}
export interface ReportsResponse {
  items: ReportItem[];
  meta: { total: number; page: number; page_size: number; pages: number };
  disclaimer: string;
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
  probability_calibration?: { available: boolean; method?: string | null; training_only?: boolean; grouped_oof?: boolean; n_oof?: number };
  label_source?: "vv_threshold_pseudo_label" | "unverified_binary_label" | string;
  split: null | { method: string; test_size: number; seed: number; train_regions: string[]; test_regions: string[] };
  per_region_test?: Record<string, { n: number; rf_f1: number | null; baseline_f1: number | null }>;
  csv_name?: string; csv_sha256?: string | Record<string, string>;
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
  label_source?: string;
  feature_contributions: { feature: string; value: number; shap_value: number; direction: string }[];
  base_value: number | null;
  model_version: string | null;
  status: "explained" | "features_required" | "model_not_trained" | "explanation_failed";
  required_features?: string[];
  missing_features?: string[];
  limitation?: string;
  computed_at: string;
}
export interface ClassificationExperiment {
  task: "flood_classification";
  id: string; created_at: string;
  models: {
    random_forest: { metrics: ModelMetrics; feature_importance: Record<string, number>; n_estimators: number };
    threshold_baseline?: { metrics: ModelMetrics; threshold_db: number; rule: string };
  };
  per_region_test: Record<string, { n: number; rf_f1: number | null; baseline_f1: number | null }>;
  provenance: { csv_name: string; csv_sha256: string | Record<string, string>; n_rows: number; features: string[]; label_source?: string;
    split: { method: string; test_size: number; seed: number; train_regions: string[]; test_regions: string[] };
    class_balance: { train_positive_fraction: number; test_positive_fraction: number };
    versions: Record<string, string> };
  warnings: string[];
}
export interface ForecastExperiment {
  task: "future_flood_susceptibility";
  id: string; created_at: string;
  model: { type: string; metrics: ModelMetrics; artifact: string };
  provenance: {
    csv_name: string; csv_sha256: string; n_rows: number; n_train: number; n_test: number; features: string[];
    split: { method: string; test_size: number; seed: number; train_regions: string[]; test_regions: string[] };
  };
  warnings: string[];
}
export type Experiment = ClassificationExperiment | ForecastExperiment;

// ─── API functions ────────────────────────────────────────────────────────────

export const api = {
  assistant: {
    chat: (message: string, language: "en" | "ml" | "hi" | "ta", context: AssistantContext) =>
      request<AssistantResponse>("/api/v1/assistant/chat", {
        method: "POST",
        body: JSON.stringify({ message, language, context }),
      }),
  },
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
    latest: async (): Promise<ForecastResponse> => {
      try {
        return await request<ForecastResponse>("/api/v1/forecast/latest");
      } catch (err) {
        // Fallback: If backend is unreachable or sleeping, fetch directly from Open-Meteo client-side!
        try {
          const res = await fetch(
            "https://api.open-meteo.com/v1/forecast?latitude=10.2814&longitude=76.3153&hourly=precipitation,temperature_2m,relative_humidity_2m,wind_speed_10m&forecast_days=7&timezone=Asia%2FKolkata"
          );
          if (res.ok) {
            const raw = await res.json();
            const hourlyRaw = raw.hourly || {};
            const times: string[] = hourlyRaw.time || [];
            const precip: number[] = hourlyRaw.precipitation || [];
            const temp: number[] = hourlyRaw.temperature_2m || [];
            const hum: number[] = hourlyRaw.relative_humidity_2m || [];
            const wind: number[] = hourlyRaw.wind_speed_10m || [];
            const now = Date.now();
            const hourly = times.map((t, idx) => ({
              time: new Date(t).toISOString(),
              precipitation_mm: precip[idx] ?? 0,
              temperature_2m: temp[idx] ?? 28,
              relative_humidity_2m: hum[idx] ?? 80,
              wind_speed_10m: wind[idx] ?? 10,
              is_forecast: new Date(t).getTime() > now,
            }));
            const r24 = precip.slice(0, 24).reduce((a, b) => a + (b || 0), 0);
            return {
              run_id: "client-direct-om",
              basin: "Chalakudy River Basin",
              retrieved_at: new Date().toISOString(),
              lat: 10.2814,
              lon: 76.3153,
              hourly,
              rainfall_accumulations: [
                { window_hours: 24, accumulation_mm: r24, computed_at: new Date().toISOString(), note: "Client fallback" },
              ],
              data_quality_notes: ["Direct client fallback from Open-Meteo"],
              is_stale: false,
              stale_since: null,
            };
          }
        } catch {
          // ignore fallback error and rethrow original error
        }
        throw err;
      }
    },
    discharge: () => request<RiverDischargeResponse>("/api/v1/forecast/discharge"),
    stage: () => request<RiverStageForecastResponse>("/api/v1/forecast/stage"),
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
    terrainDistribution: () => request<TerrainDistributionResponse>("/api/v1/model/terrain-distribution"),
    explain: (assetId: string, features?: Record<string, number>) => {
      const query = new URLSearchParams();
      Object.entries(features ?? {}).forEach(([key, value]) => query.set(key, String(value)));
      return request<ModelExplanation>(`/api/v1/model/explain/${assetId}?${query}`);
    },
  },

  historical: {
    events: () => request("/api/v1/historical/events"),
    compare: () => request("/api/v1/historical/compare"),
    rainfall: (startDate: string, endDate: string) => {
      const q = new URLSearchParams({ start_date: startDate, end_date: endDate });
      return request<HistoricalRainfallResponse>(`/api/v1/historical/rainfall?${q}`);
    },
  },

  reports: {
    submit: (body: ReportCreate) =>
      request("/api/v1/reports", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    list: () => request<ReportsResponse>("/api/v1/reports"),
  },

  brief: () => request<BriefResponse>("/api/v1/brief"),
};
