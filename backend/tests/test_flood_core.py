import numpy as np
import pytest
from datetime import date

from app.analysis import core as c


def test_bbox_valid_and_area():
    a = c.validate_bbox(76.20, 10.15, 76.55, 10.45)
    assert 1000 < a < 1500  # ~0.35° x 0.30° near 10°N ≈ 1.2e3 km²


@pytest.mark.parametrize("box", [(77, 10, 76, 11), (76, 11, 77, 10), (0, 0, 200, 1), (76, 10, 76.001, 10.001)])
def test_bbox_invalid(box):
    with pytest.raises(c.ValidationError):
        c.validate_bbox(*box)


def test_bbox_too_large():
    with pytest.raises(c.ValidationError) as e:
        c.validate_bbox(75, 9, 78, 12)
    assert "limit" in str(e.value)


def test_windows_ok_and_errors():
    ok = c.validate_windows("2018-07-01", "2018-08-01", "2018-08-01", "2018-09-01", today=date(2026, 10, 16))
    assert ok["event_end"] == date(2018, 9, 1)
    with pytest.raises(c.ValidationError):
        c.validate_windows("2018-08-01", "2018-07-01", "2018-08-01", "2018-09-01")
    with pytest.raises(c.ValidationError):  # overlap
        c.validate_windows("2018-07-01", "2018-08-15", "2018-08-01", "2018-09-01")
    with pytest.raises(c.ValidationError):  # future
        c.validate_windows("2018-07-01", "2018-08-01", "2018-08-01", "2030-01-01", today=date(2026, 10, 16))
    with pytest.raises(c.ValidationError):  # before S1 GRD
        c.validate_windows("2010-01-01", "2010-02-01", "2010-02-01", "2010-03-01")
    with pytest.raises(c.ValidationError):
        c.validate_windows("bad", "2018-08-01", "2018-08-01", "2018-09-01")


def test_candidate_water_is_tristate_and_nan_is_nodata():
    vv = np.array([[-20.0, -10.0], [np.nan, -16.0]])
    m = c.candidate_water(vv, -16)
    assert m.tolist() == [[1, 0], [-1, 0]]  # -16 is not < -16
    assert c.area_km2(m, 0.0001) == pytest.approx(0.0001)  # NODATA not counted as flood or dry


def test_permanent_water_exclusion_and_unknown_baseline():
    cand = np.array([1, 1, 1, 0], dtype=np.int8)
    occ = np.array([95.0, 10.0, np.nan, 99.0])
    out, unknown = c.exclude_permanent_water(cand, occ, 90)
    assert out.tolist() == [0, 1, 1, 0]
    assert unknown == 1


def test_terrain_mask():
    m = np.array([1, 1, 0], dtype=np.int8)
    out = c.apply_terrain_mask(m, np.array([2.0, 12.0, 30.0]), 5)
    assert out.tolist() == [1, 0, 0]


def test_area_calculations():
    assert c.pixel_area_km2_projected(10) == pytest.approx(0.0001)
    eq = c.pixel_area_km2_geographic(0.0, 1.0, 1.0)
    assert eq == pytest.approx(12364, rel=0.01)  # 1°x1° at the equator ≈ 12,364 km²
    assert c.pixel_area_km2_geographic(60.0, 1.0, 1.0) == pytest.approx(eq / 2, rel=0.02)
    mask = np.array([[1, 0], [1, 1]])
    assert c.area_km2(mask, np.array([1.0, 2.0])) == pytest.approx(1 * 1 + 2 * 2)  # row0: 1 cell x 1 km²; row1: 2 cells x 2 km²


def test_otsu_on_bimodal_and_degenerate():
    rng = np.random.default_rng(0)
    v = np.concatenate([rng.normal(-22, 1.5, 2000), rng.normal(-8, 1.5, 2000)])
    t = c.otsu_threshold(v)
    assert -18 < t < -12
    assert c.otsu_threshold(np.ones(10)) is None
    assert c.otsu_threshold(np.full(100, np.nan)) is None


def test_metrics_known_values_and_undefined():
    yt = np.array([1, 1, 1, 0, 0, 0, 0, 0])
    yp = np.array([1, 1, 0, 1, 0, 0, 0, 0])
    m = c.binary_metrics(yt, yp)
    assert (m.tp, m.fp, m.fn, m.tn) == (2, 1, 1, 4)
    assert m.precision == pytest.approx(2 / 3) and m.recall == pytest.approx(2 / 3)
    assert m.f1 == pytest.approx(2 / 3) and m.iou == pytest.approx(0.5)
    none = c.binary_metrics(np.zeros(4), np.zeros(4))
    assert none.precision is None and none.recall is None and none.f1 is None and none.iou is None
    with pytest.raises(ValueError):
        c.binary_metrics(np.zeros(3), np.zeros(4))


def test_raster_to_vector_roundtrip_area():
    pytest.importorskip("rasterio")
    pytest.importorskip("shapely")
    from shapely.geometry import shape
    mask = np.zeros((10, 10), dtype=np.int8)
    mask[2:5, 3:7] = 1  # 3 x 4 cells
    gj = c.mask_to_geojson(mask, 76.0, 10.5, 0.01, 0.01)
    total = sum(shape(f["geometry"]).area for f in gj["features"])
    assert total == pytest.approx(12 * 0.01 * 0.01)
