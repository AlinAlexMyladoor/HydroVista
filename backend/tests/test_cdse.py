import asyncio
import httpx
from datetime import datetime, timezone

from app.services import cdse


def _feat(i, dt, cc=None):
    p = {"datetime": dt, "platform": "sentinel-2a"}
    if cc is not None:
        p["eo:cloud_cover"] = cc
    return {"id": i, "properties": p, "bbox": [76.3, 10.0, 76.9, 10.6]}


def test_rank_prefers_recent_and_clear():
    now = datetime(2026, 10, 16, tzinfo=timezone.utc)
    sc = cdse.parse_stac_features("s2", [
        _feat("old_clear", "2026-10-01T05:00:00Z", 2),
        _feat("new_cloudy", "2026-10-15T05:00:00Z", 95),
        _feat("new_clear", "2026-10-14T05:00:00Z", 5),
    ])
    ranked = cdse.rank_scenes(sc, now)
    assert ranked[0].id == "new_clear"


def test_parse_skips_features_without_time():
    assert cdse.parse_stac_features("s1", [{"id": "x", "properties": {}}]) == []


def test_search_success_and_failure_states():
    def ok(req):
        return httpx.Response(200, json={"features": [_feat("a", "2026-10-15T00:00:00Z", 10)]})

    async def run(handler):
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as c:
            return await cdse.search_scenes("s2", [76.3, 10.0, 76.9, 10.6], client=c)

    res = asyncio.run(run(ok))
    assert res and cdse.STATE.last_search_ok
    st = cdse.sensor_status("s2", False)
    assert st["catalogue_ok"] and not st["imagery_ok"]  # config/search alone never means imagery is live

    try:
        asyncio.run(run(lambda r: httpx.Response(503)))
        assert False, "should raise"
    except cdse.CDSEError as e:
        assert "503" in str(e)
    assert cdse.sensor_status("s2", False)["catalogue_error"]


def test_token_requires_credentials():
    try:
        asyncio.run(cdse.get_token(None, None))
        assert False
    except cdse.CDSEError as e:
        assert "not configured" in str(e)


def test_invalid_credentials_message():
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(401))) as c:
            return await cdse.get_token("id", "bad", client=c)
    cdse.STATE.token = None
    try:
        asyncio.run(run())
        assert False
    except cdse.CDSEError as e:
        assert "rejected" in str(e)


def test_render_rejects_non_png():
    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda r: httpx.Response(200, content=b"nope"))) as c:
            return await cdse.render_png("s2", "2026-10-15T05:00:00Z", [76.3, 10.0, 76.9, 10.6], "t", client=c)
    try:
        asyncio.run(run())
        assert False
    except cdse.CDSEError as e:
        assert "PNG" in str(e)


def test_scenario_discloses_duration_is_inert():
    import inspect
    from app.services import scenario
    assert "does NOT change the result" in inspect.getsource(scenario)
