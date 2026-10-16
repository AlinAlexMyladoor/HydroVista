/**
 * Builds a "block diagram" mesh (terrain surface + side skirts) from DEM swath samples.
 * Pure function — no DOM/WebGL — so it can be unit-tested.
 *
 * Scene units: x = distance along transect (km, centred), z = perpendicular offset (km),
 * y = elevation (km) × vertical exaggeration.
 */
import type { SwathResult } from "@/lib/dem";

export interface SectionMesh {
  positions: Float32Array; // xyz
  normals: Float32Array;
  colors: Float32Array; // rgb 0..1
  indices: Uint16Array;
  /** centre-line vertices for hover picking (scene coordinates) */
  centerline: { x: number; y: number; z: number; distKm: number; elevM: number }[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number };
  /** number of samples that had no DEM value and were filled from neighbours (display only) */
  filledCount: number;
}

type RGB = [number, number, number];

const hex = (h: string): RGB => [
  parseInt(h.slice(1, 3), 16) / 255,
  parseInt(h.slice(3, 5), 16) / 255,
  parseInt(h.slice(5, 7), 16) / 255,
];

// Hypsometric ramp (metres → colour). Values ≤ 0 are shown as water.
export const ELEVATION_STOPS: { m: number; c: RGB; label: string }[] = [
  { m: -50, c: hex("#6FA8C7"), label: "≤ 0 m (sea level / water)" },
  { m: 2, c: hex("#B7D6A8"), label: "0–20 m floodplain" },
  { m: 20, c: hex("#8FBF8A"), label: "20–100 m lowland" },
  { m: 100, c: hex("#C9BD86"), label: "100–300 m midland" },
  { m: 300, c: hex("#A68560"), label: "300–600 m highland" },
  { m: 700, c: hex("#7E6B5C"), label: "> 600 m ridge" },
];

export function elevationColor(m: number): RGB {
  const s = ELEVATION_STOPS;
  if (m <= s[0].m) return s[0].c;
  if (m >= s[s.length - 1].m) return s[s.length - 1].c;
  for (let i = 1; i < s.length; i++) {
    if (m <= s[i].m) {
      const t = (m - s[i - 1].m) / (s[i].m - s[i - 1].m);
      return [
        s[i - 1].c[0] + (s[i].c[0] - s[i - 1].c[0]) * t,
        s[i - 1].c[1] + (s[i].c[1] - s[i - 1].c[1]) * t,
        s[i - 1].c[2] + (s[i].c[2] - s[i - 1].c[2]) * t,
      ];
    }
  }
  return s[s.length - 1].c;
}

/** Fill null gaps along each line using the nearest valid neighbour (display only). */
function fillGaps(grid: (number | null)[][]): { filled: number[][]; count: number } {
  let count = 0;
  const filled = grid.map((row) => {
    const out = row.map((v) => v as number);
    const valid = row.map((v) => v != null);
    if (!valid.some(Boolean)) return row.map(() => 0);
    for (let j = 0; j < row.length; j++) {
      if (valid[j]) continue;
      count++;
      let l = j - 1;
      while (l >= 0 && !valid[l]) l--;
      let r = j + 1;
      while (r < row.length && !valid[r]) r++;
      if (l >= 0 && r < row.length) {
        const t = (j - l) / (r - l);
        out[j] = (row[l] as number) * (1 - t) + (row[r] as number) * t;
      } else out[j] = (l >= 0 ? row[l] : row[r]) as number;
    }
    return out;
  });
  return { filled, count };
}

export function buildSectionMesh(swath: SwathResult, vertExag: number): SectionMesh {
  const L = swath.elevations.length; // lines
  const N = swath.distancesKm.length; // samples
  const { filled, count } = fillGaps(swath.elevations);

  let minM = Infinity;
  let maxM = -Infinity;
  for (const row of filled) for (const v of row) {
    if (v < minM) minM = v;
    if (v > maxM) maxM = v;
  }
  const baseM = Math.min(minM, 0) - 40;
  const ky = vertExag / 1000; // km per metre in scene
  const xOff = swath.lengthKm / 2;

  const pos: number[] = [];
  const nor: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];

  const X = (j: number) => swath.distancesKm[j] - xOff;
  const Z = (i: number) => swath.offsetsKm[i];
  const Y = (i: number, j: number) => filled[i][j] * ky;

  // ── Surface ──
  for (let i = 0; i < L; i++) {
    for (let j = 0; j < N; j++) {
      pos.push(X(j), Y(i, j), Z(i));
      const jl = Math.max(0, j - 1);
      const jr = Math.min(N - 1, j + 1);
      const il = Math.max(0, i - 1);
      const ir = Math.min(L - 1, i + 1);
      const dydx = (Y(i, jr) - Y(i, jl)) / (X(jr) - X(jl) || 1);
      const dydz = (Y(ir, j) - Y(il, j)) / (Z(ir) - Z(il) || 1);
      const nl = Math.hypot(dydx, 1, dydz);
      nor.push(-dydx / nl, 1 / nl, -dydz / nl);
      col.push(...elevationColor(filled[i][j]));
    }
  }
  for (let i = 0; i < L - 1; i++) {
    for (let j = 0; j < N - 1; j++) {
      const a = i * N + j;
      const b = a + 1;
      const c = a + N;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  }

  // ── Skirts ──
  const baseY = baseM * ky;
  const SKIRT_BOTTOM: RGB = [0.36, 0.3, 0.25];
  const addSkirt = (
    pts: { x: number; y: number; z: number; m: number }[],
    n: [number, number, number]
  ) => {
    const start = pos.length / 3;
    pts.forEach((p) => {
      const top = elevationColor(p.m);
      pos.push(p.x, p.y, p.z);
      nor.push(...n);
      col.push(top[0] * 0.85, top[1] * 0.85, top[2] * 0.85);
      pos.push(p.x, baseY, p.z);
      nor.push(...n);
      col.push(...SKIRT_BOTTOM);
    });
    for (let k = 0; k < pts.length - 1; k++) {
      const t0 = start + k * 2;
      const b0 = t0 + 1;
      const t1 = t0 + 2;
      const b1 = t0 + 3;
      idx.push(t0, b0, t1, t1, b0, b1);
    }
  };
  const lineSkirt = (i: number, nz: number) =>
    addSkirt(
      Array.from({ length: N }, (_, j) => ({ x: X(j), y: Y(i, j), z: Z(i), m: filled[i][j] })),
      [0, 0, nz]
    );
  lineSkirt(0, -1);
  lineSkirt(L - 1, 1);
  const colSkirt = (j: number, nx: number) =>
    addSkirt(
      Array.from({ length: L }, (_, i) => ({ x: X(j), y: Y(i, j), z: Z(i), m: filled[i][j] })),
      [nx, 0, 0]
    );
  colSkirt(0, -1);
  colSkirt(N - 1, 1);

  const mid = Math.floor(L / 2);
  const centerline = Array.from({ length: N }, (_, j) => ({
    x: X(j),
    y: Y(mid, j),
    z: Z(mid),
    distKm: swath.distancesKm[j],
    elevM: filled[mid][j],
  }));

  const bounds = {
    minX: -xOff,
    maxX: xOff,
    minY: baseY,
    maxY: maxM * ky,
    minZ: Z(0),
    maxZ: Z(L - 1),
  };

  return {
    positions: new Float32Array(pos),
    normals: new Float32Array(nor),
    colors: new Float32Array(col),
    indices: new Uint16Array(idx),
    centerline,
    bounds,
    filledCount: count,
  };
}
