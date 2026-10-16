import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const dem = require("../.test-build/dem.js");

test("Terrarium decode matches the documented formula", () => {
  // 123.5 m -> 32891.5 -> R=128, G=123, B=128
  assert.equal(dem.decodeTerrarium(128, 123, 128), 123.5);
  assert.equal(dem.decodeTerrarium(128, 0, 0), 0);
  assert.equal(dem.decodeTerrarium(127, 255, 0), -1);
});

test("world pixel maths: lon/lat 0,0 at z=1 is the tile corner", () => {
  const p = dem.lonLatToWorldPixel(0, 0, 1);
  assert.ok(Math.abs(p.x - 256) < 1e-6 && Math.abs(p.y - 256) < 1e-6);
});

test("bilinear sampling reproduces a linear ramp and reports missing tiles", () => {
  const z = 11;
  const tiles = new Map();
  const make = (tx) => {
    const t = new Float32Array(256 * 256);
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) t[y * 256 + x] = (tx * 256 + x) * 0.5; // metres = worldX/2
    return t;
  };
  const lon = 76.3358, lat = 10.3006;
  const { x, y } = dem.lonLatToWorldPixel(lon, lat, z);
  const tx = Math.floor(x / 256), ty = Math.floor(y / 256);
  for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) tiles.set(`${tx + dx}/${ty + dy}`, make(tx + dx));
  const v = dem.sampleBilinear(lon, lat, z, (_z, a, b) => tiles.get(`${a}/${b}`) ?? null);
  assert.ok(Math.abs(v - (x - 0.5) * 0.5) < 1e-3, `got ${v}, want ${(x - 0.5) * 0.5}`);
  assert.equal(dem.sampleBilinear(lon, lat, z, () => null), null);
});

test("swath grid: length, symmetric offsets, perpendicular spacing", () => {
  const spec = { a: { lon: 76.8, lat: 10.31 }, b: { lon: 76.17, lat: 10.28 }, halfWidthKm: 6, lines: 9, samples: 90 };
  const g = dem.buildSwathGrid(spec);
  assert.ok(Math.abs(g.lengthKm - dem.haversineKm(spec.a, spec.b)) < 1e-9);
  assert.equal(g.offsetsKm[0], -6);
  assert.equal(g.offsetsKm[8], 6);
  assert.equal(g.coords.length, 9);
  assert.equal(g.coords[0].length, 90);
  // distance between mid-line and an outer line at the same column ~ 6 km
  const d = dem.haversineKm(g.coords[4][40], g.coords[8][40]);
  assert.ok(Math.abs(d - 6) < 0.05, `perp spacing ${d}`);
  // first/last columns land on A/B for the centre line
  assert.ok(dem.haversineKm(g.coords[4][0], spec.a) < 1e-6);
  assert.ok(dem.haversineKm(g.coords[4][89], spec.b) < 1e-6);
});
