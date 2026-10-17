"""Pydantic response/request schemas for FloodLens AI API."""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, List, Optional

from pydantic import BaseModel, Field, field_validator


# ─── Generic ──────────────────────────────────────────────────────────────────

class ErrorResponse(BaseModel):
    error: str
    detail: str | None = None
    code: str | None = None


class PaginationMeta(BaseModel):
    total: int
    page: int
    page_size: int
    pages: int


# ─── Health / Status ──────────────────────────────────────────────────────────

class HealthResponse(BaseModel):
    status: str
    version: str
    environment: str
    timestamp: datetime


class DataSourceStatus(BaseModel):
    slug: str
    name: str
    is_available: bool
    last_checked: datetime | None
    last_success: datetime | None
    requires_credentials: bool
    known_limitations: str | None


class StatusResponse(BaseModel):
    api: str
    database: str
    data_sources: list[DataSourceStatus]
    current_mode: str  # "live" | "degraded" | "demo"
    disclaimer: str


# ─── Weather / Forecast ───────────────────────────────────────────────────────

class HourlyWeather(BaseModel):
    time: datetime
    precipitation_mm: float | None
    temperature_2m: float | None
    relative_humidity_2m: float | None
    wind_speed_10m: float | None
    is_forecast: bool  # True = future forecast, False = historical observation


class RainfallAccumulation(BaseModel):
    window_hours: int
    accumulation_mm: float | None
    computed_at: datetime
    note: str | None = None


class ForecastResponse(BaseModel):
    run_id: str
    basin: str
    generated_at: datetime
    forecast_horizon_hours: int
    source: str
    source_url: str
    lat: float
    lon: float
    hourly: list[HourlyWeather]
    rainfall_accumulations: list[RainfallAccumulation]
    data_quality_notes: list[str]
    is_stale: bool
    stale_since: datetime | None = None


# ─── Assets / Infrastructure ──────────────────────────────────────────────────

class AssetBase(BaseModel):
    id: uuid.UUID
    name: str | None
    asset_type: str
    sub_type: str | None
    lat: float
    lon: float
    source: str
    ingested_at: datetime


class AssetDetail(AssetBase):
    osm_id: str | None
    address: str | None
    tags: dict | None
    is_verified: bool


class ExposureScore(BaseModel):
    asset_id: uuid.UUID
    asset_name: str | None
    asset_type: str
    lat: float
    lon: float
    risk_score: float = Field(ge=0.0, le=1.0, description="Normalised 0–1 relative risk score")
    risk_category: str  # low | medium | high | critical
    flood_susceptibility: float | None
    rainfall_accumulation_mm: float | None
    terrain_elevation_m: float | None
    evidence: list[str]
    data_quality: str  # good | partial | limited
    data_warnings: list[str]
    computed_at: datetime
    scenario_id: str | None = None


class ExposureListResponse(BaseModel):
    items: list[ExposureScore]
    meta: PaginationMeta
    forecast_time: datetime | None
    scenario_id: str | None


# ─── Isolation Clock ──────────────────────────────────────────────────────────

class RouteSegment(BaseModel):
    edge_id: str
    road_name: str | None
    length_m: float
    is_flagged: bool
    flag_reason: str | None


class IsolationResult(BaseModel):
    facility_id: uuid.UUID
    facility_name: str | None
    facility_type: str
    lat: float
    lon: float
    is_connected: bool
    last_connected_time: datetime | None
    first_disconnected_time: datetime | None
    time_to_isolation_hours: float | None
    baseline_route: list[RouteSegment] | None
    alternative_routes_count: int
    flagged_edges: list[str]
    assumptions: list[str]
    uncertainty_note: str
    computed_at: datetime
    scenario_id: str | None = None


class IsolationListResponse(BaseModel):
    items: list[IsolationResult]
    forecast_time: datetime | None
    scenario_id: str | None
    disclaimer: str


# ─── Scenario / Rain Dial ─────────────────────────────────────────────────────

class ScenarioRequest(BaseModel):
    rainfall_mm: float = Field(ge=0.0, le=500.0, description="Additional rainfall in mm")
    duration_hours: float = Field(ge=1.0, le=72.0, description="Rainfall duration in hours")
    forecast_hour: int = Field(ge=0, le=72, default=24, description="Forecast horizon hour")
    closure_threshold: float | None = Field(
        default=None, ge=0.1, le=1.0,
        description="Optional risk score threshold for road closure flagging"
    )

    @field_validator("rainfall_mm")
    @classmethod
    def rainfall_reasonable(cls, v: float) -> float:
        if v > 400:
            raise ValueError("Rainfall > 400 mm is beyond the scenario range")
        return v


class ScenarioSummary(BaseModel):
    scenario_id: str
    rainfall_mm: float
    duration_hours: float
    forecast_hour: int
    status: str
    created_at: datetime
    result_summary: dict | None


class ScenarioDelta(BaseModel):
    scenario_id: str
    baseline_affected_roads: int
    scenario_affected_roads: int
    delta_roads: int
    baseline_isolated_facilities: int
    scenario_isolated_facilities: int
    delta_isolated: int
    scenario_rainfall_mm: float
    method: str
    assumptions: list[str]
    disclaimer: str


# ─── Model Metadata ───────────────────────────────────────────────────────────

class ModelMetadataResponse(BaseModel):
    model_type: str
    version: str
    target: str
    feature_names: list[str]
    n_train: int | None
    n_val: int | None
    n_test: int | None
    trained_at: datetime | None
    status: str  # "available" | "not_trained" | "stale"
    disclaimer: str


class EvaluationResponse(BaseModel):
    model_version: str
    evaluated_at: datetime | None
    metrics: dict[str, float | None]
    class_balance: dict | None
    baseline_comparison: dict | None
    spatial_split: str | None
    notes: list[str]
    status: str


# ─── SHAP Explainability ──────────────────────────────────────────────────────

class FeatureContribution(BaseModel):
    feature: str
    value: float | None
    shap_value: float
    direction: str  # "increases_risk" | "decreases_risk" | "neutral"


class ExplainResponse(BaseModel):
    asset_id: uuid.UUID
    asset_name: str | None
    prediction: float | None
    prediction_label: str | None
    feature_contributions: list[FeatureContribution]
    base_value: float | None
    model_version: str | None
    limitation: str
    computed_at: datetime


# ─── Historical Events ────────────────────────────────────────────────────────

class HistoricalEvent(BaseModel):
    event_id: str
    name: str
    start_date: datetime
    end_date: datetime | None
    description: str
    affected_area_km2: float | None
    source: str
    flood_extent_available: bool
    notes: str | None


# ─── Citizen Reports ──────────────────────────────────────────────────────────

class ReportCreate(BaseModel):
    lat: float = Field(ge=9.5, le=11.5, description="Latitude within Kerala")
    lon: float = Field(ge=76.0, le=77.5, description="Longitude within Kerala")
    description: str = Field(min_length=10, max_length=1000)
    reported_depth_cm: float | None = Field(default=None, ge=0.0, le=500.0)
    reporter_name: str | None = Field(default=None, max_length=100)


class ReportResponse(BaseModel):
    id: uuid.UUID
    submitted_at: datetime
    lat: float
    lon: float
    description: str
    reported_depth_cm: float | None
    reporter_name: str | None = None
    status: str
    disclaimer: str = "Unverified community report. Not a confirmed official observation."


# ─── Brief / Summary ──────────────────────────────────────────────────────────

class BriefResponse(BaseModel):
    basin: str
    generated_at: datetime
    forecast_horizon_hours: int
    rainfall_24h_mm: float | None
    max_risk_category: str | None
    affected_roads_count: int | None
    isolated_facilities_count: int | None
    data_freshness: str  # "current" | "stale" | "unavailable"
    operating_mode: str
    key_warnings: list[str]
    disclaimer: str
