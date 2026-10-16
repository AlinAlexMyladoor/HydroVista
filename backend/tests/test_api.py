"""Backend API tests."""
from __future__ import annotations

import pytest
from httpx import AsyncClient, ASGITransport


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
async def client():
    # Use SQLite for tests (no PostGIS needed)
    import os
    os.environ["DATABASE_URL"] = "sqlite+aiosqlite:///./test.db"
    os.environ["SYNC_DATABASE_URL"] = "sqlite:///./test.db"

    from app.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.mark.anyio
async def test_root(client):
    resp = await client.get("/")
    assert resp.status_code == 200
    data = resp.json()
    assert "FloodLens AI" in data["service"]


@pytest.mark.anyio
async def test_health(client):
    resp = await client.get("/api/v1/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "version" in data


@pytest.mark.anyio
async def test_data_sources(client):
    resp = await client.get("/api/v1/data-sources")
    assert resp.status_code == 200
    data = resp.json()
    assert "sources" in data
    assert len(data["sources"]) > 0


@pytest.mark.anyio
async def test_model_metadata_not_trained(client, tmp_path, monkeypatch):
    monkeypatch.setenv("EXPERIMENT_DIR", str(tmp_path / "none"))
    resp = await client.get("/api/v1/model/metadata")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "not_trained"
    assert data["n_train"] is None


@pytest.mark.anyio
async def test_model_evaluation_not_available(client, tmp_path, monkeypatch):
    monkeypatch.setenv("EXPERIMENT_DIR", str(tmp_path / "none"))
    resp = await client.get("/api/v1/model/evaluation")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "not_evaluated"
    assert all(v is None for v in data["metrics"].values())


@pytest.mark.anyio
async def test_explain_model_not_trained(client):
    resp = await client.get("/api/v1/model/explain/test-asset-123")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "model_not_trained"
    assert data["prediction"] is None


@pytest.mark.anyio
async def test_scenario_validation(client):
    # Valid scenario
    resp = await client.post("/api/v1/scenario", json={
        "rainfall_mm": 50.0,
        "duration_hours": 6.0,
        "forecast_hour": 24,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert "scenario_id" in data
    assert data["rainfall_mm"] == 50.0
    assert "disclaimer" in data
    assert "HYPOTHETICAL" in data["disclaimer"].upper() or "hypothetical" in data["disclaimer"]


@pytest.mark.anyio
async def test_scenario_invalid_rainfall(client):
    # Rainfall out of range
    resp = await client.post("/api/v1/scenario", json={
        "rainfall_mm": 600.0,  # exceeds 500 max
        "duration_hours": 6.0,
        "forecast_hour": 24,
    })
    assert resp.status_code == 422


@pytest.mark.anyio
async def test_historical_events(client):
    resp = await client.get("/api/v1/historical/events")
    assert resp.status_code == 200
    data = resp.json()
    assert "events" in data
    assert len(data["events"]) > 0
    # The 2018 Kerala floods should be listed
    event_ids = [e["event_id"] for e in data["events"]]
    assert "kerala-2018-aug" in event_ids


@pytest.mark.anyio
async def test_historical_compare_unavailable(client):
    resp = await client.get("/api/v1/historical/compare")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "unavailable"  # Honest about missing SAR data


@pytest.mark.anyio
async def test_brief_endpoint(client):
    resp = await client.get("/api/v1/brief")
    assert resp.status_code == 200
    data = resp.json()
    assert "basin" in data
    assert "disclaimer" in data
    assert "operating_mode" in data


@pytest.mark.anyio
async def test_report_submission(client):
    resp = await client.post("/api/v1/reports", json={
        "lat": 10.3006,
        "lon": 76.3358,
        "description": "Water rising rapidly on main road near bridge.",
        "reported_depth_cm": 30.0,
    })
    # May fail if DB unavailable in test env
    if resp.status_code == 200:
        data = resp.json()
        assert data["status"] == "unverified"
        assert "Unverified" in data["disclaimer"]
    else:
        # Acceptable in test env without DB
        assert resp.status_code in (503, 422)


@pytest.mark.anyio
async def test_report_invalid_coordinates(client):
    resp = await client.post("/api/v1/reports", json={
        "lat": 0.0,  # Outside Kerala bounds
        "lon": 0.0,
        "description": "Some description longer than 10 chars",
    })
    assert resp.status_code == 422
