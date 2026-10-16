/**
 * DEM access for HydroVista.
 *
 * Elevation comes from the free "Terrarium" terrain tiles (Mapzen/AWS Open Data,
 * no API key). Each tile is a 256×256 PNG where
 *     elevation_m = (R * 256 + G + B / 256) - 32768
 *
 * The same tile source is used by the MapLibre terrain layer, so the 3D map and
 * the 3D cross-section are driven by the same DEM.
 *
 * Nothing here fabricates data: if a tile cannot be fetched, the affected samples
 * are `null` and the failure is reported in the result.
 */

export const TERRARIUM_URL =
  "https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png";
export const TERRARIUM_ATTRIBUTION =
  "Terrain: Mapzen Terrarium (AWS Open Data) — SRTM / ASTER / other open DEMs";
export const DEM_SAMPLE_ZOOM = 11;
export const TILE_SIZE = 256;

export type TileElevations = Float32Array; // TILE_SIZE*TILE_SIZE, row-major, metres

/** Decode one Terrarium pixel to metres. */
export function decodeTerrarium(r: number, g: number, b: number): number {
  return r * 256 + g + b / 256 - 32768;
}

/** Decode RGBA bytes of a whole tile into metres. */
export function decodeTile(rgba: Uint8ClampedArray | Uint8Array): TileElevations {
  const out = new Float32Array(TILE_SIZE * TILE_SIZE);
  for (let i = 0; i < out.length; i++) {
    out[i] = decodeTerrarium(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
  }
  return out;
}

/** Web-mercator world pixel coordinates at zoom z (256-px tiles). */
export function lonLatToWorldPixel(lon: number, lat: number, z: number) {
  const n = 2 ** z;
  const latRad = (lat * Math.PI) / 180;
  const x = ((lon + 180) / 360) * n * TILE_SIZE;
  const y =
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n * TILE_SIZE;
  return { x, y };
}

export function tileUrl(z: number, x: number, y: number): string {
  return TERRARIUM_URL.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
}

export type TileProvider = (z: number, tx: number, ty: number) => TileElevations | null;

/**
 * Bilinear elevation at lon/lat using already-loaded tiles.
 * Returns null if any of the 4 neighbouring pixels is in a tile that is not loaded.
 */
export function sampleBilinear(
  lon: number,
  lat: number,
  z: number,
  getTile: TileProvider
): number | null {
  const { x, y } = lonLatToWorldPixel(lon, lat, z);
  // pixel centres are at +0.5
  const fx = x - 0.5;
  const fy = y - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const dx = fx - x0;
  const dy = fy - y0;

  const px = (ix: number, iy: number): number | null => {
    const tx = Math.floor(ix / TILE_SIZE);
    const ty = Math.floor(iy / TILE_SIZE);
    const tile = getTile(z, tx, ty);
    if (!tile) return null;
    const lx = ix - tx * TILE_SIZE;
    const ly = iy - ty * TILE_SIZE;
    return tile[ly * TILE_SIZE + lx];
  };

  const a = px(x0, y0);
  const b = px(x0 + 1, y0);
  const c = px(x0, y0 + 1);
  const d = px(x0 + 1, y0 + 1);
  if (a == null || b == null || c == null || d == null) return null;
  return a * (1 - dx) * (1 - dy) + b * dx * (1 - dy) + c * (1 - dx) * dy + d * dx * dy;
}

// ─── Tile loading (browser) ───────────────────────────────────────────────────

export interface TileStats {
  requested: number;
  ok: number;
  failed: number;
}

const tileCache = new Map<string, Promise<TileElevations | null>>();
export const tileStats: TileStats = { requested: 0, ok: 0, failed: 0 };

async function fetchAndDecode(url: string, signal?: AbortSignal): Promise<TileElevations | null> {
  tileStats.requested++;
  try {
    const res = await fetch(url, { mode: "cors", signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob);
    const canvas = document.createElement("canvas");
    canvas.width = TILE_SIZE;
    canvas.height = TILE_SIZE;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("2D canvas unavailable");
    // Disable colour management / premultiplication artefacts by drawing 1:1
    ctx.drawImage(bmp, 0, 0, TILE_SIZE, TILE_SIZE);
    bmp.close?.();
    const data = ctx.getImageData(0, 0, TILE_SIZE, TILE_SIZE).data;
    tileStats.ok++;
    return decodeTile(data);
  } catch (e) {
    if ((e as Error)?.name === "AbortError") throw e;
    tileStats.failed++;
    return null;
  }
}

export function loadTile(
  z: number,
  tx: number,
  ty: number,
  signal?: AbortSignal
): Promise<TileElevations | null> {
  const n = 2 ** z;
  if (ty < 0 || ty >= n) return Promise.resolve(null);
  const wrappedX = ((tx % n) + n) % n;
  const key = `${z}/${wrappedX}/${ty}`;
  let p = tileCache.get(key);
  if (!p) {
    p = fetchAndDecode(tileUrl(z, wrappedX, ty), signal).then((t) => {
      if (!t) tileCache.delete(key); // allow retry after failure
      return t;
    });
    p.catch(() => tileCache.delete(key));
    tileCache.set(key, p);
  }
  return p;
}

/** Load every tile needed for the given lon/lat points (plus 1px neighbours). */
async function ensureTilesFor(
  points: { lon: number; lat: number }[],
  z: number,
  signal?: AbortSignal
): Promise<Map<string, TileElevations | null>> {
  const needed = new Set<string>();
  for (const p of points) {
    const { x, y } = lonLatToWorldPixel(p.lon, p.lat, z);
    for (const ox of [-1, 0, 1]) {
      for (const oy of [-1, 0, 1]) {
        const tx = Math.floor((x + ox) / TILE_SIZE);
        const ty = Math.floor((y + oy) / TILE_SIZE);
        needed.add(`${tx}/${ty}`);
      }
    }
  }
  const loaded = new Map<string, TileElevations | null>();
  await Promise.all(
    [...needed].map(async (k) => {
      const [tx, ty] = k.split("/").map(Number);
      loaded.set(k, await loadTile(z, tx, ty, signal));
    })
  );
  return loaded;
}

/** Elevation (m) at a single point; null if tiles unavailable. */
export async function elevationAt(
  lon: number,
  lat: number,
  z = DEM_SAMPLE_ZOOM,
  signal?: AbortSignal
): Promise<number | null> {
  const tiles = await ensureTilesFor([{ lon, lat }], z, signal);
  return sampleBilinear(lon, lat, z, (_z, tx, ty) => tiles.get(`${tx}/${ty}`) ?? null);
}

// ─── Swath (parallel transects) sampling ─────────────────────────────────────

export interface LonLat {
  lon: number;
  lat: number;
}

export interface SwathSpec {
  a: LonLat;
  b: LonLat;
  /** half-width of the swath in km, perpendicular to the transect */
  halfWidthKm: number;
  /** number of parallel profile lines (odd, ≥3) */
  lines: number;
  /** samples along each line */
  samples: number;
  zoom?: number;
}

export interface SwathResult {
  spec: SwathSpec;
  lengthKm: number;
  /** distance along transect for each sample column (km) */
  distancesKm: number[];
  /** perpendicular offset for each line (km, negative = left of A→B) */
  offsetsKm: number[];
  /** lonlat of every sample [line][sample] */
  coords: LonLat[][];
  /** elevation metres [line][sample]; null where DEM missing */
  elevations: (number | null)[][];
  minM: number | null;
  maxM: number | null;
  missingCount: number;
  totalCount: number;
  zoom: number;
  source: string;
  retrievedAt: string;
  tiles: TileStats;
}

const EARTH_R_KM = 6371.0088;

export function haversineKm(a: LonLat, b: LonLat): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_R_KM * Math.asin(Math.sqrt(s));
}

/** Build sample coordinates for the swath (no network). */
export function buildSwathGrid(spec: SwathSpec) {
  const { a, b, halfWidthKm, lines, samples } = spec;
  const lengthKm = haversineKm(a, b);
  const midLat = (a.lat + b.lat) / 2;
  const kmPerDegLat = (Math.PI / 180) * EARTH_R_KM;
  const kmPerDegLon = kmPerDegLat * Math.cos((midLat * Math.PI) / 180);
  // unit vector A→B in km space
  const vx = (b.lon - a.lon) * kmPerDegLon;
  const vy = (b.lat - a.lat) * kmPerDegLat;
  const vlen = Math.hypot(vx, vy);
  const ux = vx / vlen;
  const uy = vy / vlen;
  // left-hand normal
  const nx = -uy;
  const ny = ux;

  const offsetsKm: number[] = [];
  for (let i = 0; i < lines; i++) {
    offsetsKm.push(lines === 1 ? 0 : -halfWidthKm + (2 * halfWidthKm * i) / (lines - 1));
  }
  const distancesKm: number[] = [];
  for (let j = 0; j < samples; j++) distancesKm.push((lengthKm * j) / (samples - 1));

  const coords: LonLat[][] = offsetsKm.map((off) =>
    distancesKm.map((_, j) => {
      const t = j / (samples - 1);
      const lon = a.lon + (b.lon - a.lon) * t + (nx * off) / kmPerDegLon;
      const lat = a.lat + (b.lat - a.lat) * t + (ny * off) / kmPerDegLat;
      return { lon, lat };
    })
  );
  return { lengthKm, distancesKm, offsetsKm, coords };
}

export async function sampleSwath(spec: SwathSpec, signal?: AbortSignal): Promise<SwathResult> {
  const zoom = spec.zoom ?? DEM_SAMPLE_ZOOM;
  const grid = buildSwathGrid(spec);
  const flat = grid.coords.flat();
  const before: TileStats = { ...tileStats };
  const tiles = await ensureTilesFor(flat, zoom, signal);
  const provider: TileProvider = (_z, tx, ty) => tiles.get(`${tx}/${ty}`) ?? null;

  let min = Infinity;
  let max = -Infinity;
  let missing = 0;
  const elevations = grid.coords.map((row) =>
    row.map((p) => {
      const v = sampleBilinear(p.lon, p.lat, zoom, provider);
      if (v == null || !Number.isFinite(v)) {
        missing++;
        return null;
      }
      if (v < min) min = v;
      if (v > max) max = v;
      return v;
    })
  );

  return {
    spec,
    lengthKm: grid.lengthKm,
    distancesKm: grid.distancesKm,
    offsetsKm: grid.offsetsKm,
    coords: grid.coords,
    elevations,
    minM: Number.isFinite(min) ? min : null,
    maxM: Number.isFinite(max) ? max : null,
    missingCount: missing,
    totalCount: flat.length,
    zoom,
    source: TERRARIUM_ATTRIBUTION,
    retrievedAt: new Date().toISOString(),
    tiles: {
      requested: tileStats.requested - before.requested,
      ok: tileStats.ok - before.ok,
      failed: tileStats.failed - before.failed,
    },
  };
}
