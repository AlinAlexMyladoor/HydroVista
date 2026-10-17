/**
 * Single source of truth for map layers, shared by the sidebar and the map's layer menu.
 * `unavailable` layers are shown disabled with the reason, instead of a checkbox that does nothing.
 */
export interface LayerDef {
  id: string;
  label: string;
  mlLabel: string;
  defaultOn: boolean;
  unavailable?: string;
}

export const LAYER_DEFS: LayerDef[] = [
  { id: "terrain",    label: "3D Terrain & Hillshade",       mlLabel: "3D ഭൂപ്രകൃതി",        defaultOn: true },
  { id: "inundation", label: "Flood Extent", mlLabel: "വെള്ളപ്പൊക്ക പരിധി", defaultOn: true },
  { id: "flood-risk", label: "Asset Risk Level", mlLabel: "അപകട നില",       defaultOn: true },
  { id: "rivers",     label: "Rivers & Water Bodies (OSM)",  mlLabel: "നദികൾ & ജലാശയങ്ങൾ",  defaultOn: true },
  { id: "roads",      label: "Road Network (OSM)",           mlLabel: "റോഡ് ശൃംഖല",          defaultOn: true },
  { id: "buildings",  label: "Buildings (OSM)",              mlLabel: "കെട്ടിടങ്ങൾ",           defaultOn: false },
  { id: "hospitals",  label: "Hospitals & Health",           mlLabel: "ആശുപത്രികൾ",         defaultOn: true },
  { id: "schools",    label: "Schools",                      mlLabel: "വിദ്യാലയങ്ങൾ",          defaultOn: true },
  { id: "shelters",   label: "Shelters / Relief Camps",      mlLabel: "ദുരിതാശ്വാസ ക്യാമ്പ്",  defaultOn: true },
  { id: "other-assets", label: "Bridges, Power, Emergency",  mlLabel: "മറ്റ് സ്ഥാപനങ്ങൾ",     defaultOn: true },
  { id: "reports",    label: "Community Reports",            mlLabel: "റിപ്പോർട്ടുകൾ",         defaultOn: true },
  { id: "boundaries", label: "Admin Boundaries (OSM)",       mlLabel: "അതിർത്തി",             defaultOn: false },
  { id: "satellite",  label: "Satellite Imagery (Sentinel)", mlLabel: "ഉപഗ്രഹ ചിത്രം",         defaultOn: false },
];

export const DEFAULT_LAYER_IDS = LAYER_DEFS.filter((l) => l.defaultOn && !l.unavailable).map((l) => l.id);

/** Which layer group an exposure asset_type belongs to. */
export function assetLayerGroup(assetType: string): "hospitals" | "schools" | "shelters" | "other-assets" {
  if (assetType === "hospital") return "hospitals";
  if (assetType === "school") return "schools";
  if (assetType === "shelter") return "shelters";
  return "other-assets";
}
