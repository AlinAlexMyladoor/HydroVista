/**
 * HydroVista — Bilingual localization strings (English & Malayalam).
 * Preserves all existing keys plus adds new navigation and panel labels.
 */

const baseTranslations = {
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
    navFloodAnalysis: "Flood Analysis",
    navModelLab: "Model Lab",
    navMethodology: "Methodology",
    navMore: "More",
    analyticsTitle: "Analytics",
    analyticsPrecipitation: "Precipitation & Inflow",
    analyticsRisk: "Risk & Model Metrics",
    analyticsHistorical: "Historical Comparison",
    rainfall24h: "24h rainfall",
    rainfall72h: "72h rainfall",
    highRiskInfrastructure: "High-risk infrastructure",
    observedStage: "Arangaly observed stage",
    forecastUnavailable: "Forecast unavailable",
    staleForecast: "Stale forecast",
    riskUnavailable: "Risk data unavailable",
    liveGaugeUnavailable: "Live gauge unavailable",
    riverGuidance: "River hydrology guidance · Chalakudy",
    stageForecast: "48-hour river stage forecast · Arangaly",
    modeledDischarge: "GloFAS modelled daily discharge · gauge stage unavailable",
    retryGauge: "Retry gauge data",
    retryDischarge: "Retry discharge",
    navInfrastructure: "Infrastructure",
    navReports: "Reports",
    navAbout: "About",
    navDeveloperMode: "Developer mode",
    analyticsFloodProcessing: "Flood processing",
    commandInfrastructure: "Infrastructure",
    commandReports: "Field reports",

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
    navFloodAnalysis: "വെള്ളപ്പൊക്ക വിശകലനം",
    navModelLab: "മോഡൽ ലാബ്",
    navMethodology: "രീതിശാസ്ത്രം",
    navMore: "കൂടുതൽ",
    analyticsTitle: "വിശകലനം",
    analyticsPrecipitation: "മഴയും ജലപ്രവാഹവും",
    analyticsRisk: "അപകടസാധ്യതയും മോഡൽ അളവുകളും",
    analyticsHistorical: "ചരിത്ര താരതമ്യം",
    rainfall24h: "24 മണിക്കൂർ മഴ",
    rainfall72h: "72 മണിക്കൂർ മഴ",
    highRiskInfrastructure: "ഉയർന്ന അപകടസാധ്യതയുള്ള സ്ഥാപനങ്ങൾ",
    observedStage: "അരണ്യാലി നിരീക്ഷിച്ച ജലനിരപ്പ്",
    forecastUnavailable: "മഴ പ്രവചനം ലഭ്യമല്ല",
    staleForecast: "പഴയ പ്രവചനം",
    riskUnavailable: "അപകടസാധ്യതാ ഡാറ്റ ലഭ്യമല്ല",
    liveGaugeUnavailable: "തത്സമയ ഗേജ് ലഭ്യമല്ല",
    riverGuidance: "ചാലക്കുടി നദിയുടെ ജലശാസ്ത്ര മാർഗ്ഗനിർദ്ദേശം",
    stageForecast: "48 മണിക്കൂർ നദിജലനിരപ്പ് പ്രവചനം · അരങ്ങാലി",
    modeledDischarge: "GloFAS മാതൃകാ ദൈനംദിന പ്രവാഹം · ഗേജ് ജലനിരപ്പ് ലഭ്യമല്ല",
    retryGauge: "ഗേജ് ഡാറ്റ വീണ്ടും ശ്രമിക്കുക",
    retryDischarge: "പ്രവാഹ ഡാറ്റ വീണ്ടും ശ്രമിക്കുക",
    navInfrastructure: "അടിസ്ഥാനസൗകര്യം",
    navReports: "റിപ്പോർട്ടുകൾ",
    navAbout: "വിശദാംശങ്ങൾ",
    navDeveloperMode: "ഡെവലപ്പർ മോഡ്",
    analyticsFloodProcessing: "വെള്ളപ്പൊക്ക പ്രോസസ്സിംഗ്",
    commandInfrastructure: "അടിസ്ഥാനസൗകര്യം",
    commandReports: "ഫീൽഡ് റിപ്പോർട്ടുകൾ",

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

// Keep all existing UI copy available in every locale; localized strings below
// override the shared English fallback until the remaining views are translated.
export const translations = {
  ...baseTranslations,
  hi: {
    ...baseTranslations.en,
    appTitle: "हाइड्रोविस्टा",
    appSubtitle: "सुरक्षित समुदायों के लिए नदी बेसिन जानकारी",
    appBasin: "चालाकुडी नदी बेसिन, केरल",
    liveMode: "लाइव डेटा", degradedMode: "सीमित डेटा", demoMode: "डेमो मोड",
    searchPlaceholder: "स्थान, अस्पताल, पंचायत खोजें...",
    navOverview: "अवलोकन", nav3DMap: "3D मानचित्र", navAnalytics: "विश्लेषण", navScenarios: "परिदृश्य", navDeveloperMode: "डेवलपर मोड", analyticsFloodProcessing: "बाढ़ प्रसंस्करण", commandInfrastructure: "बुनियादी ढाँचा", commandReports: "फील्ड रिपोर्ट",
    navFloodAnalysis: "बाढ़ विश्लेषण", navModelLab: "मॉडल प्रयोगशाला", navMethodology: "कार्यप्रणाली", navMore: "अधिक",
    analyticsTitle: "विश्लेषण", analyticsPrecipitation: "वर्षा और प्रवाह", analyticsRisk: "जोखिम और मॉडल माप",
    analyticsHistorical: "ऐतिहासिक तुलना", rainfall24h: "24 घंटे की वर्षा", rainfall72h: "72 घंटे की वर्षा",
    highRiskInfrastructure: "उच्च जोखिम वाली संरचनाएँ", observedStage: "अरंगाली मापा जलस्तर",
    forecastUnavailable: "पूर्वानुमान उपलब्ध नहीं", staleForecast: "पुराना पूर्वानुमान", riskUnavailable: "जोखिम डेटा उपलब्ध नहीं", liveGaugeUnavailable: "लाइव गेज उपलब्ध नहीं",
    riverGuidance: "चालाकुडी नदी मार्गदर्शन", stageForecast: "48 घंटे का जलस्तर पूर्वानुमान · अरंगाली",
    modeledDischarge: "GloFAS मॉडल दैनिक प्रवाह · गेज जलस्तर अनुपलब्ध", retryGauge: "गेज डेटा पुनः प्रयास", retryDischarge: "प्रवाह डेटा पुनः प्रयास",
    navInfrastructure: "बुनियादी ढाँचा", navReports: "रिपोर्ट", navAbout: "जानकारी",
    studyArea: "अध्ययन क्षेत्र", forecastTimeline: "पूर्वानुमान समयरेखा", playSimulation: "सिमुलेशन चलाएँ",
    mapLayers: "मानचित्र परतें", dataSources: "डेटा स्रोत", viewAllSources: "सभी डेटा स्रोत देखें",
    riskAssessmentTitle: "जोखिम मूल्यांकन", expectedRainfall: "अनुमानित वर्षा",
    estimatedFloodedArea: "अनुमानित बाढ़ क्षेत्र", populationAffected: "संभावित रूप से प्रभावित लोग",
    rainDialTitle: "परिदृश्य सिम्युलेटर", addedRainfall: "अतिरिक्त वर्षा", stormDuration: "अवधि",
    simulateButton: "परिदृश्य चलाएँ", reportsTitle: "सामुदायिक जल स्तर रिपोर्ट",
    submitReport: "जल अवलोकन जमा करें", location: "स्थान", waterDepth: "अनुमानित गहराई (सेमी)",
    loading: "लोड हो रहा है...", noData: "डेटा उपलब्ध नहीं", retry: "पुनः प्रयास करें", unavailable: "अनुपलब्ध",
  },
  ta: {
    ...baseTranslations.en,
    appTitle: "ஹைட்ரோவிஸ்டா",
    appSubtitle: "பாதுகாப்பான சமூகங்களுக்கான ஆற்றுப் படுகை நுண்ணறிவு",
    appBasin: "சாலக்குடி ஆற்றுப் படுகை, கேரளா",
    liveMode: "நேரடி தரவு", degradedMode: "வரையறுக்கப்பட்ட தரவு", demoMode: "மாதிரி நிலை",
    searchPlaceholder: "இடம், மருத்துவமனை, ஊராட்சி தேடுக...",
    navOverview: "கண்ணோட்டம்", nav3DMap: "3D வரைபடம்", navAnalytics: "பகுப்பாய்வு", navScenarios: "சூழல்கள்", navDeveloperMode: "உருவாக்குநர் பயன்முறை", analyticsFloodProcessing: "வெள்ள செயலாக்கம்", commandInfrastructure: "உள்கட்டமைப்பு", commandReports: "கள அறிக்கைகள்",
    navFloodAnalysis: "வெள்ளப் பகுப்பாய்வு", navModelLab: "மாதிரி ஆய்வகம்", navMethodology: "செயல்முறை", navMore: "மேலும்",
    analyticsTitle: "பகுப்பாய்வு", analyticsPrecipitation: "மழை மற்றும் நீரோட்டம்", analyticsRisk: "ஆபத்து மற்றும் மாதிரி அளவுகள்",
    analyticsHistorical: "வரலாற்று ஒப்பீடு", rainfall24h: "24 மணி நேர மழை", rainfall72h: "72 மணி நேர மழை",
    highRiskInfrastructure: "அதிக ஆபத்துள்ள உள்கட்டமைப்பு", observedStage: "அரங்கலி அளவிடப்பட்ட நீர்மட்டம்",
    forecastUnavailable: "முன்னறிவிப்பு இல்லை", staleForecast: "பழைய முன்னறிவிப்பு", riskUnavailable: "ஆபத்து தரவு இல்லை", liveGaugeUnavailable: "நேரடி அளவுகோல் இல்லை",
    riverGuidance: "சாலக்குடி ஆற்றின் நீரியல் வழிகாட்டல்", stageForecast: "48 மணி நேர ஆற்றுநிலை முன்னறிவிப்பு · அரங்கலி",
    modeledDischarge: "GloFAS மாதிரி தினசரி ஓட்டம் · அளவிடப்பட்ட நீர்மட்டம் இல்லை", retryGauge: "அளவீட்டுத் தரவை மீண்டும் முயற்சிக்கவும்", retryDischarge: "நீரோட்டத் தரவை மீண்டும் முயற்சிக்கவும்",
    navInfrastructure: "உள்கட்டமைப்பு", navReports: "அறிக்கைகள்", navAbout: "தகவல்",
    studyArea: "ஆய்வுப் பகுதி", forecastTimeline: "முன்னறிவிப்பு காலவரிசை", playSimulation: "உருவகப்படுத்தலை இயக்கு",
    mapLayers: "வரைபட அடுக்குகள்", dataSources: "தரவு மூலங்கள்", viewAllSources: "அனைத்து தரவு மூலங்களையும் காண்க",
    riskAssessmentTitle: "ஆபத்து மதிப்பீடு", expectedRainfall: "எதிர்பார்க்கப்படும் மழை",
    estimatedFloodedArea: "மதிப்பிடப்பட்ட வெள்ளப் பகுதி", populationAffected: "பாதிக்கப்படக்கூடிய மக்கள்",
    rainDialTitle: "சூழல் உருவகப்படுத்தி", addedRainfall: "கூடுதல் மழை", stormDuration: "காலம்",
    simulateButton: "சூழலை இயக்குக", reportsTitle: "சமூக நீர்மட்ட அறிக்கைகள்",
    submitReport: "நீர் கண்காணிப்பைச் சமர்ப்பிக்கவும்", location: "இடம்", waterDepth: "மதிப்பிடப்பட்ட ஆழம் (செ.மீ)",
    loading: "ஏற்றப்படுகிறது...", noData: "தரவு இல்லை", retry: "மீண்டும் முயற்சிக்கவும்", unavailable: "கிடைக்கவில்லை",
  },
};

export type TranslationKey = keyof typeof translations.en;
export type Language = keyof typeof translations;

const warnedTranslationKeys = new Set<string>();

/** Resolve dictionary entries with an English fallback and a dev-only audit.
 * For non-English locales, a value identical to English is treated as
 * untranslated so the console becomes a practical checklist during review.
 */
export function getTranslations(language: Language): typeof translations.en {
  const dictionary = translations[language] ?? translations.en;
  return new Proxy(dictionary, {
    get(target, key: string | symbol, receiver) {
      if (typeof key !== "string") return Reflect.get(target, key, receiver);
      const localized = Reflect.get(target, key, receiver) as string | undefined;
      const fallback = translations.en[key as TranslationKey];
      const missing = localized == null || (language !== "en" && localized === fallback);
      if (missing && process.env.NODE_ENV === "development") {
        const warningKey = `${language}:${key}`;
        if (!warnedTranslationKeys.has(warningKey)) {
          warnedTranslationKeys.add(warningKey);
          console.warn(`[i18n] Missing translation for key: "${key}" in language: "${language}"`);
        }
      }
      return localized ?? fallback ?? key;
    },
  });
}
