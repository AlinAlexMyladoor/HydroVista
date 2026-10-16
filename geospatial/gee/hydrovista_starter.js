// HydroVista — Sentinel-1 candidate-inundation starter (Earth Engine Code Editor).
// Milestone 1: paste into https://code.earthengine.google.com/ and click Run.
// Mirrors backend/app/analysis/gee.py. Example polygon/dates are NOT claims that suitable scenes exist.
var roi = ee.Geometry.Rectangle([76.20, 10.15, 76.55, 10.45]);
Map.centerObject(roi, 10);
Map.addLayer(roi, {color: 'yellow'}, 'Study area');

var preStart = '2018-07-01', preEnd = '2018-08-01', eventStart = '2018-08-01', eventEnd = '2018-09-01';
var s1 = ee.ImageCollection('COPERNICUS/S1_GRD').filterBounds(roi)
  .filter(ee.Filter.eq('instrumentMode', 'IW'))
  .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
  .filter(ee.Filter.eq('orbitProperties_pass', 'DESCENDING')).select('VV');

var preCol = s1.filterDate(preStart, preEnd), evCol = s1.filterDate(eventStart, eventEnd);
print('Pre-event scene count', preCol.size());
print('Event scene count', evCol.size());          // if 0: stop and fix windows/orbit/geometry
var pre = preCol.median().clip(roi), during = evCol.median().clip(roi);

var thresholdDb = -16;                              // demo threshold; tune and validate
var candidateWater = during.lt(thresholdDb);
var permanent = ee.Image('JRC/GSW1_4/GlobalSurfaceWater').select('occurrence').unmask(0).gte(90);
var slope = ee.Terrain.slope(ee.Image('USGS/SRTMGL1_003'));
var candidate = candidateWater.and(permanent.not()).and(slope.lte(5)).selfMask().clip(roi);

Map.addLayer(pre, {min: -25, max: 0}, 'Pre-event VV');
Map.addLayer(during, {min: -25, max: 0}, 'Event VV');
Map.addLayer(during.subtract(pre), {min: -8, max: 8, palette: ['2166AC', 'FFFFFF', 'B2182B']}, 'VV change');
Map.addLayer(candidate, {palette: ['F97316']}, 'Candidate inundation (not validated)');

var areaKm2 = ee.Number(ee.Image.pixelArea().updateMask(candidate).reduceRegion({
  reducer: ee.Reducer.sum(), geometry: roi, scale: 30, maxPixels: 1e10, tileScale: 4}).get('area')).divide(1e6);
print('Candidate inundation area (km²)', areaKm2);
