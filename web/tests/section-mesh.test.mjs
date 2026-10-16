import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const m = require("../.test-build/section-mesh.js");
const dem = require("../.test-build/dem.js");

function fakeSwath(nulls = []) {
  const spec = { a: { lon: 76.8, lat: 10.31 }, b: { lon: 76.17, lat: 10.28 }, halfWidthKm: 6, lines: 9, samples: 40 };
  const g = dem.buildSwathGrid(spec);
  const elevations = g.coords.map((row, i) => row.map((_, j) => (nulls.some(([a, b]) => a === i && b === j) ? null : 600 - j * 15 + i)));
  return { spec, ...g, elevations, minM: 0, maxM: 600, missingCount: nulls.length, totalCount: 360, zoom: 11, source: "test", retrievedAt: "", tiles: { requested: 0, ok: 0, failed: 0 } };
}

test("mesh has consistent buffers and finite values", () => {
  const mesh = m.buildSectionMesh(fakeSwath(), 8);
  const nV = mesh.positions.length / 3;
  assert.equal(mesh.normals.length, mesh.positions.length);
  assert.equal(mesh.colors.length, mesh.positions.length);
  assert.ok(mesh.indices.length % 3 === 0);
  assert.ok(Math.max(...mesh.indices) < nV);
  assert.ok(mesh.positions.every(Number.isFinite) && mesh.normals.every(Number.isFinite));
  // surface: (9-1)*(40-1)*2 tris ; skirts: 2*(40-1)*2 + 2*(9-1)*2
  assert.equal(mesh.indices.length / 3, 8 * 39 * 2 + 2 * 39 * 2 + 2 * 8 * 2);
  assert.equal(mesh.centerline.length, 40);
  assert.equal(mesh.filledCount, 0);
});

test("vertical exaggeration scales y only", () => {
  const a = m.buildSectionMesh(fakeSwath(), 2), b = m.buildSectionMesh(fakeSwath(), 10);
  assert.ok(Math.abs(b.bounds.maxY / a.bounds.maxY - 5) < 1e-6);
  assert.equal(a.bounds.maxX, b.bounds.maxX);
});

test("missing samples are counted and gap-filled for display only", () => {
  const mesh = m.buildSectionMesh(fakeSwath([[4, 10], [4, 11]]), 8);
  assert.equal(mesh.filledCount, 2);
  assert.ok(mesh.positions.every(Number.isFinite));
});

test("elevation colour ramp is monotone-safe at the extremes", () => {
  assert.deepEqual(m.elevationColor(-999), m.ELEVATION_STOPS[0].c);
  assert.deepEqual(m.elevationColor(99999), m.ELEVATION_STOPS.at(-1).c);
});
