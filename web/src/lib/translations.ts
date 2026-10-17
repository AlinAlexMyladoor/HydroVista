/**
 * HydroVista — Bilingual localization strings (English & Malayalam).
 * Preserves all existing keys plus adds new navigation and panel labels.
 */

export const translations = {
  en: {
    // Brand
    appTitle: "HydroVista",
    appSubtitle: "River Basin Intelligence for Safer Communities",
    appBasin: "Chalakudy River Basin, Kerala",
    liveMode: "Live Data",
    degradedMode: "Degraded Mode",
    demoMode: "Demo Mode",
    staleData: "Stale Data",
    lastUpdated: "Updated",
    dataAvailable: "Available",
    dataUnavailable: "Unavailable",
    searchPlaceholder: "Search location, hospital, panchayat...",

    // Top navigation
    navOverview: "Overview",
    nav3DMap: "3D Map",
    navAnalytics: "Analytics",
    navScenarios: "Scenarios",
    navInfrastructure: "Infrastructure",
    navReports: "Reports",
    navAbout: "About",

    // Sidebar modules (legacy panel names preserved)
    navMap: "Map View",
    navExposure: "Exposure Ledger",
    navIsolation: "Isolation Clock",
    navRainDial: "Rain Dial",
    navModelHealth: "Model & Data Health",

    // Study area & forecast
    studyArea: "Study Area",
    forecastTimeline: "Forecast Timeline",
    forecastHorizon24: "24 Hours",
    forecastHorizon3d: "3 Days",
    forecastHorizon7d: "7 Days",
    playSimulation: "Play Simulation",

    // Map layers
    mapLayers: "Map Layers",
    layerTerrain: "3D Terrain",
    layerFloodRisk: "Flood Risk (Model)",
    layerRainfall: "Rainfall Forecast",
    layerRivers: "Rivers & Water Bodies",
    layerRoads: "Road Network",
    layerBuildings: "Buildings (3D)",
    layerHospitals: "Hospitals & Health Centers",
    layerSchools: "Schools",
    layerShelters: "Shelters / Relief Camps",
    layerBoundaries: "Panchayat Boundaries",
    layerSatellite: "Satellite Imagery (Sentinel)",
    layerAssets: "Critical Assets",
    layerReports: "Community Reports",
    layerReset: "Reset",

    // Data sources
    dataSources: "Data Sources",
    viewAllSources: "View all data sources",

    // Risk levels
    riskAll: "All Risks",
    riskCritical: "Critical",
    riskHigh: "High",
    riskMedium: "Medium",
    riskLow: "Low",

    // Asset types
    typeAll: "All Assets",
    typeHospital: "Hospitals",
    typeShelter: "Shelters / Relief",
    typeBridge: "Bridges",
    typeSubstation: "Power Substations",
    typeSchool: "Schools",

    // Risk Assessment card
    riskAssessmentTitle: "Risk Assessment",
    highFloodRisk: "High Flood Risk",
    moderateFloodRisk: "Moderate Flood Risk",
    lowFloodRisk: "Low Flood Risk",
    avgFloodProbability: "average flood probability in low-lying areas",
    expectedRainfall: "Expected Rainfall",
    estimatedFloodedArea: "Estimated Flooded Area",
    populationAffected: "People Potentially Affected",

    // Isolation Clock
    isolationTitle: "Isolation Clock (Hospitals)",
    isolationSubtitle: "Earliest time of loss of drivable access (modelled)",
    connectedStatus: "Connected",
    cutoffStatus: "At Risk of Cutoff",
    safeAnchors: "Designated Safe Access Hubs",
    alternativeRoutes: "Alt. Routes",
    estimatedTimeToCutoff: "Time to Cutoff",
    viewAll: "View all",

    // Rain Dial
    rainDialTitle: "Scenario Simulator (Rain Dial)",
    rainDialSubtitle: "Increase or decrease rainfall to explore potential impact.",
    addedRainfall: "Additional rainfall",
    stormDuration: "Duration",
    simulateButton: "Run Scenario",
    baselineHighCritical: "Baseline Critical Assets",
    scenarioHighCritical: "Scenario Critical Assets",
    escalatedAssets: "Newly Escalated Assets",

    // Citizen Reports
    reportsTitle: "Community Water Level Reports",
    reportsNotice: "Unverified community observations. Ground-truth cross-referencing only.",
    submitReport: "Submit Water Observation",
    location: "Location",
    waterDepth: "Estimated Depth (cm)",
    notes: "Description / Landmark",
    reporterName: "Reporter Name (Optional)",
    submitBtn: "Post Unverified Report",

    // Explainability
    explainTitle: "Risk Factor Explainability",
    modelStatusNotice: "ML Status: Baseline heuristic model active. XGBoost pending training data.",
    elevationSusceptibility: "Elevation Susceptibility",
    rainfallAccumulation: "Rainfall Exposure",
    criticalityWeight: "Facility Criticality",
    distanceToRiver: "Proximity to Waterway",

    // Status & errors
    loading: "Loading...",
    error: "Error",
    noData: "No data available",
    retry: "Retry",
    unavailable: "Unavailable",
    sampleData: "Sample Data",
  },

  ml: {
    // Brand
    appTitle: "ഹൈഡ്രോവിസ്റ്റ",
    appSubtitle: "സുരക്ഷിത സമൂഹങ്ങൾക്കായി നദീതട ബുദ്ധി",
    appBasin: "ചാലക്കുടിപ്പുഴ തടം, കേരളം",
    liveMode: "തത്സമയ ഡാറ്റ",
    degradedMode: "പരിമിത ഡാറ്റ",
    demoMode: "മാതൃകാ ഡാറ്റ",
    staleData: "പഴയ ഡാറ്റ",
    lastUpdated: "അവസാനം പുതുക്കിയത്",
    dataAvailable: "ലഭ്യമാണ്",
    dataUnavailable: "ലഭ്യമല്ല",
    searchPlaceholder: "ആശുപത്രികൾ, പഞ്ചായത്ത്, സ്ഥലം തിരയുക...",

    // Top navigation
    navOverview: "അവലോകനം",
    nav3DMap: "3D ഭൂപടം",
    navAnalytics: "വിശകലനം",
    navScenarios: "സാഹചര്യം",
    navInfrastructure: "അടിസ്ഥാനസൗകര്യം",
    navReports: "റിപ്പോർട്ടുകൾ",
    navAbout: "വിശദാംശങ്ങൾ",

    // Sidebar
    navMap: "ഭൂപടം (Map)",
    navExposure: "ദുരന്തസാധ്യതാ പട്ടിക",
    navIsolation: "ഐസൊലേഷൻ ക്ലോക്ക്",
    navRainDial: "മഴ സിമുലേറ്റർ",
    navModelHealth: "ഡാറ്റാ ഗുണനിലവാരം",

    // Study area & forecast
    studyArea: "പഠനമേഖല",
    forecastTimeline: "പ്രവചന ടൈംലൈൻ",
    forecastHorizon24: "24 മണിക്കൂർ",
    forecastHorizon3d: "3 ദിവസം",
    forecastHorizon7d: "7 ദിവസം",
    playSimulation: "സിമുലേഷൻ",

    // Map layers
    mapLayers: "ഭൂപട പാളികൾ",
    layerTerrain: "3D ഭൂപ്രകൃതി",
    layerFloodRisk: "വെള്ളപ്പൊക്ക അപകടം",
    layerRainfall: "മഴ പ്രവചനം",
    layerRivers: "നദികളും ജലാശയങ്ങളും",
    layerRoads: "റോഡ് ശൃംഖല",
    layerBuildings: "കെട്ടിടങ്ങൾ",
    layerHospitals: "ആശുപത്രികൾ",
    layerSchools: "വിദ്യാലയങ്ങൾ",
    layerShelters: "ദുരിതാശ്വാസ ക്യാമ്പുകൾ",
    layerBoundaries: "പഞ്ചായത്ത് അതിർത്തികൾ",
    layerSatellite: "ഉപഗ്രഹ ചിത്രം (Sentinel)",
    layerAssets: "നിർണായക സ്ഥാപനങ്ങൾ",
    layerReports: "ജനകീയ റിപ്പോർട്ടുകൾ",
    layerReset: "പുനഃക്രമീകരണം",

    // Data sources
    dataSources: "ഡാറ്റ സ്രോതസ്സുകൾ",
    viewAllSources: "എല്ലാ ഡാറ്റ സ്രോതസ്സുകളും",

    // Risk levels
    riskAll: "എല്ലാ നിലകളും",
    riskCritical: "അതീവ ഗുരുതരം",
    riskHigh: "ഉയർന്ന അപകടസാധ്യത",
    riskMedium: "ഇടത്തരം",
    riskLow: "കുറഞ്ഞ അപകടസാധ്യത",

    // Asset types
    typeAll: "എല്ലാ സ്ഥാപനങ്ങളും",
    typeHospital: "ആശുപത്രികൾ",
    typeShelter: "ദുരിതാശ്വാസ ക്യാമ്പുകൾ",
    typeBridge: "പാലങ്ങൾ",
    typeSubstation: "വൈദ്യുതി സബ്സ്റ്റേഷനുകൾ",
    typeSchool: "വിദ്യാലയങ്ങൾ",

    // Risk Assessment
    riskAssessmentTitle: "അപകടസാധ്യതാ വിലയിരുത്തൽ",
    highFloodRisk: "ഉയർന്ന വെള്ളപ്പൊക്ക അപകടം",
    moderateFloodRisk: "മിതമായ വെള്ളപ്പൊക്ക അപകടം",
    lowFloodRisk: "കുറഞ്ഞ വെള്ളപ്പൊക്ക അപകടം",
    avgFloodProbability: "താഴ്ന്ന പ്രദേശങ്ങളിലെ ശരാശരി വെള്ളപ്പൊക്ക സംഭാവ്യത",
    expectedRainfall: "പ്രതീക്ഷിത മഴ",
    estimatedFloodedArea: "കണക്കാക്കിയ വെള്ളപ്പൊക്ക ഏരിയ",
    populationAffected: "ബാധിക്കപ്പെടാൻ സാധ്യതയുള്ള ജനസംഖ്യ",

    // Isolation Clock
    isolationTitle: "ഐസൊലേഷൻ ക്ലോക്ക് (ആശുപത്രികൾ)",
    isolationSubtitle: "ഡ്രൈവബിൾ ആക്സസ് നഷ്ടപ്പെടാൻ ഏറ്റവും നേരത്തെയുള്ള സമയം (മോഡൽ)",
    connectedStatus: "റോഡ് ബന്ധം ലഭ്യമാണ്",
    cutoffStatus: "വിച്ഛേദിക്കപ്പെടാൻ സാധ്യത",
    safeAnchors: "സുരക്ഷിത കേന്ദ്രങ്ങൾ",
    alternativeRoutes: "ഇതര വഴികൾ",
    estimatedTimeToCutoff: "സാധ്യതാ സമയം",
    viewAll: "എല്ലാം കാണുക",

    // Rain Dial
    rainDialTitle: "സിനാരിയോ സിമുലേറ്റർ (Rain Dial)",
    rainDialSubtitle: "സ്വാധീനം പര്യവേക്ഷണം ചെയ്യാൻ മഴ വർദ്ധിപ്പിക്കുക അല്ലെങ്കിൽ കുറയ്ക്കുക.",
    addedRainfall: "അധിക മഴ",
    stormDuration: "ദൈർഘ്യം",
    simulateButton: "സിനാരിയോ പ്രവർത്തിപ്പിക്കുക",
    baselineHighCritical: "നിലവിലെ അപകടസാധ്യതയുള്ളവ",
    scenarioHighCritical: "സിനാരിയോയിലെ അപകടസാധ്യതയുള്ളവ",
    escalatedAssets: "പുതിയ അപകടസാധ്യതകൾ",

    // Citizen Reports
    reportsTitle: "ജനകീയ വെള്ളപ്പൊക്ക വിവരങ്ങൾ",
    reportsNotice: "സ്ഥിരീകരിക്കാത്ത പ്രാദേശിക വിവരങ്ങൾ. മുന്നറിയിപ്പായി ഉപയോഗിക്കരുത്.",
    submitReport: "വെള്ളപ്പൊക്ക വിവരം നൽകുക",
    location: "സ്ഥലം",
    waterDepth: "വെള്ളത്തിന്റെ ആഴം (സെ.മീ)",
    notes: "വിവരണം / അടയാളം",
    reporterName: "പേര് (നിർബന്ധമില്ല)",
    submitBtn: "വിവരം സമർപ്പിക്കുക",

    // Explainability
    explainTitle: "അപകടസാധ്യതാ ഘടകങ്ങൾ",
    modelStatusNotice: "മോഡൽ: ഹ്യൂറിസ്റ്റിക് അൽഗോരിതം. XGBoost പ്രശിക്ഷണ ഡാറ്റ ആവശ്യമാണ്.",
    elevationSusceptibility: "ഭൂപ്രകൃതിയും ഉയരവും",
    rainfallAccumulation: "മഴയുടെ അളവ്",
    criticalityWeight: "സ്ഥാപനത്തിന്റെ പ്രാധാന്യം",
    distanceToRiver: "നദിയുമായുള്ള സാമീപ്യം",

    // Status & errors
    loading: "ലോഡ് ചെയ്യുന്നു...",
    error: "പിശക്",
    noData: "ഡാറ്റ ലഭ്യമല്ല",
    retry: "വീണ്ടും ശ്രമിക്കുക",
    unavailable: "ലഭ്യമല്ല",
    sampleData: "സാമ്പിൾ ഡാറ്റ",
  },
};

export type TranslationKey = keyof typeof translations.en;
export type Language = keyof typeof translations;
