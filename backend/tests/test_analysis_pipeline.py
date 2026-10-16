"""Pipeline tests. Synthetic data below exists ONLY to exercise code paths; it never feeds the app."""
import json
import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from app.analysis import ml_lab, runs, gee
from app.analysis.core import ValidationError
from app.main import app


def _table(path, n_regions=8, per=120, seed=0):
    rng = np.random.default_rng(seed)
    rows = []
    for r in range(n_regions):
        y = rng.integers(0, 2, per)
        vv = np.where(y == 1, rng.normal(-19, 3, per), rng.normal(-11, 3, per))
        rows.append(pd.DataFrame({"label": y, "region_id": f"r{r}", "vv": vv, "vh": vv - 6 + rng.normal(0, 1, per),
                                  "elevation": np.where(y == 1, rng.normal(10, 5, per), rng.normal(40, 15, per)), "slope": rng.uniform(0, 10, per)}))
    pd.concat(rows).to_csv(path, index=False)


def test_experiment_runs_and_is_spatially_separated(tmp_path):
    csv = tmp_path / "f.csv"
    _table(csv)
    exp = ml_lab.train_experiment(str(csv), str(tmp_path / "out"), seed=1)
    sp = exp["provenance"]["split"]
    assert not set(sp["train_regions"]) & set(sp["test_regions"])
    rf = exp["models"]["random_forest"]["metrics"]
    assert rf["n"] > 0 and 0 <= rf["f1"] <= 1
    assert set(exp["models"]["random_forest"]["feature_importance"]) == {"vv", "vh", "elevation", "slope"}
    assert (tmp_path / "out" / f"experiment_{exp['id']}.json").exists()
    assert exp["provenance"]["csv_sha256"]


@pytest.mark.parametrize("mut,msg", [
    (lambda d: d.drop(columns=["vv"]), "missing required"),
    (lambda d: d.assign(label=d["label"] + 2), "only 0"),
    (lambda d: d.assign(region_id="same"), "at least 3"),
    (lambda d: d.head(10), "rows"),
])
def test_experiment_rejects_bad_tables(tmp_path, mut, msg):
    csv = tmp_path / "f.csv"
    _table(csv)
    mut(pd.read_csv(csv)).to_csv(csv, index=False)
    with pytest.raises(ml_lab.ExperimentError, match=msg):
        ml_lab.train_experiment(str(csv), str(tmp_path / "o"))


def test_single_class_split_is_rejected(tmp_path):
    csv = tmp_path / "f.csv"
    _table(csv)
    d = pd.read_csv(csv)
    d["label"] = 0
    d.loc[d.index[:5], "label"] = 1
    d.to_csv(csv, index=False)
    with pytest.raises(ml_lab.ExperimentError):
        ml_lab.train_experiment(str(csv), str(tmp_path / "o"), seed=3)


def _params(**kw):
    p = dict(west=76.2, south=10.15, east=76.55, north=10.45, pre_start="2018-07-01", pre_end="2018-08-01", event_start="2018-08-01", event_end="2018-09-01")
    return {**{f: getattr(gee.FloodParams(**p), f) for f in gee.FloodParams.__dataclass_fields__}, **kw}


@pytest.fixture(autouse=True)
def _tmp_db(tmp_path, monkeypatch):
    monkeypatch.setenv("ANALYSIS_DB_PATH", str(tmp_path / "runs.sqlite"))
    monkeypatch.setenv("EXPERIMENT_DIR", str(tmp_path / "experiments"))


def test_run_lifecycle_cache_and_provenance():
    calls = []
    def fake(p):
        calls.append(p)
        return {"product": "candidate_inundation", "validated": False, "areas_km2": {"candidate_inundation_final": 1.0}, "scene_counts": {}, "parameters": {}}
    r = runs.submit(_params(), fn=fake, run_inline=True)
    done = runs.get_run(r["id"])
    assert done["status"] == "completed" and done["result"]["run"]["attempts"] == 1
    again = runs.submit(_params(), fn=fake, run_inline=True)
    assert again["cache_hit"] and again["id"] == r["id"] and len(calls) == 1
    other = runs.submit(_params(threshold_db=-18.0), fn=fake, run_inline=True)
    assert other["id"] != r["id"] and len(calls) == 2


def test_retry_then_fail_and_non_retryable():
    n = {"c": 0}
    def flaky(p):
        n["c"] += 1
        raise ConnectionError("boom")
    r = runs.submit(_params(), fn=flaky, run_inline=True, sleep=lambda s: None)
    got = runs.get_run(r["id"])
    assert got["status"] == "failed" and got["attempts"] == 3 and n["c"] == 3 and got["error_code"] == "processing_failed"

    def noscenes(p):
        raise gee.NoScenesError("none")
    r2 = runs.submit(_params(threshold_db=-17.0), fn=noscenes, run_inline=True, sleep=lambda s: None)
    got2 = runs.get_run(r2["id"])
    assert got2["status"] == "failed" and got2["attempts"] == 1 and got2["error_code"] == "no_scenes"


def test_queue_limit(monkeypatch):
    monkeypatch.setattr(runs, "MAX_ACTIVE", 1)
    import sqlite3
    with runs._conn() as c:
        c.execute("INSERT INTO runs(id, params_hash, params, status, created_at) VALUES('x','h','{}','running','2026-01-01')")
    with pytest.raises(runs.QueueFull):
        runs.submit(_params(), fn=lambda p: {}, run_inline=True)


BODY = dict(west=76.2, south=10.15, east=76.55, north=10.45, pre_start="2018-07-01", pre_end="2018-08-01", event_start="2018-08-01", event_end="2018-09-01")


def test_api_validation_errors_are_structured_and_unconfigured_ee_is_503(monkeypatch):
    monkeypatch.delenv("EE_PROJECT_ID", raising=False)
    c = TestClient(app)
    bad = c.post("/api/v1/analysis/runs", json={**BODY, "west": 77.0})
    assert bad.status_code == 422 and bad.json()["detail"]["errors"]
    ok_shape = c.post("/api/v1/analysis/runs", json=BODY)
    assert ok_shape.status_code == 503 and ok_shape.json()["detail"]["error"] == "earth_engine_unavailable"
    assert c.post("/api/v1/analysis/runs", json={**BODY, "threshold_db": 3}).status_code == 422
    cap = c.get("/api/v1/analysis/capabilities").json()
    assert cap["ready"] is False and cap["blocking_reasons"]


def test_api_runs_export_and_404(monkeypatch):
    c = TestClient(app)
    r = runs.submit(_params(), fn=lambda p: {"product": "candidate_inundation", "validated": False,
        "areas_km2": {"candidate_inundation_final": 2.5}, "scene_counts": {"pre_event": 3, "event": 4}, "parameters": {"threshold_db": -16}}, run_inline=True)
    assert c.get(f"/api/v1/analysis/runs/{r['id']}").json()["status"] == "completed"
    assert any(x["id"] == r["id"] for x in c.get("/api/v1/analysis/runs").json()["runs"])
    csvr = c.get(f"/api/v1/analysis/runs/{r['id']}/export.csv")
    assert csvr.status_code == 200 and "candidate_inundation_final,2.500000,km2" in csvr.text
    assert c.get("/api/v1/analysis/runs/nope").status_code == 404
    assert c.get("/api/v1/analysis/runs/nope/export.csv").status_code == 404


def test_model_lab_empty_state_is_honest():
    j = TestClient(app).get("/api/v1/model-lab/experiments").json()
    assert j["experiments"] == [] and "none are pre-loaded" in j["note"]
