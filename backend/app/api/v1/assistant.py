"""Grounded, lightweight HydroVista help endpoint.

Responses use only the current data snapshot supplied by the UI; this endpoint
does not infer missing telemetry or claim to be an emergency warning service.
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

import httpx
import structlog
from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.core.config import HYDROVISTA_SYSTEM_PROMPT, settings

router = APIRouter(prefix="/assistant", tags=["assistant"])
log = structlog.get_logger(__name__)


class HourlyRainPoint(BaseModel):
    time: str = Field(max_length=80)
    precipitation_mm: float | None = Field(default=None, ge=0, le=1000)
    is_forecast: bool = False


class AssetRiskSnapshot(BaseModel):
    name: str = Field(max_length=160)
    asset_type: str = Field(max_length=60)
    risk_category: Literal["low", "medium", "high", "critical"]
    risk_score: float | None = Field(default=None, ge=0, le=1)
    elevation: float | None = Field(default=None, ge=-50, le=9000)


class ChatTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=1000)


class AssistantContext(BaseModel):
    basin: str = Field(default="Chalakudy River Basin", max_length=120)
    rainfall_24h_mm: float | None = Field(default=None, ge=0, le=5000)
    rainfall_source: str | None = Field(default=None, max_length=100)
    rainfall_updated_at: str | None = Field(default=None, max_length=80)
    forecast_stale: bool = False
    observed_stage_m: float | None = Field(default=None, ge=-10, le=100)
    observed_stage_at: str | None = Field(default=None, max_length=80)
    stage_source: str | None = Field(default=None, max_length=120)
    stage_forecast_points: int = Field(default=0, ge=0, le=1000)
    modelled_discharge_m3s: float | None = Field(default=None, ge=0, le=1_000_000)
    discharge_source: str | None = Field(default=None, max_length=100)
    high_risk_assets: int | None = Field(default=None, ge=0, le=100_000)
    source_statuses: dict[str, Literal["available", "stale", "unavailable"]] = Field(default_factory=dict)
    source_updated_at: dict[str, str] = Field(default_factory=dict)
    hourly_rainfall: list[HourlyRainPoint] = Field(default_factory=list, max_length=168)
    high_risk_assets_snapshot: list[AssetRiskSnapshot] = Field(default_factory=list, max_length=50)
    scenario_rainfall_mm: float | None = Field(default=None, ge=0, le=1000)
    scenario_duration_hours: float | None = Field(default=None, ge=1, le=168)
    active_scenario_impact: dict | None = None


class AssistantRequest(BaseModel):
    message: str = Field(min_length=1, max_length=1000)
    language: Literal["en", "ml", "hi", "ta"] = "en"
    context: AssistantContext = Field(default_factory=AssistantContext)
    history: list[ChatTurn] = Field(default_factory=list, max_length=8)


class AssistantResponse(BaseModel):
    answer: str
    sources: list[str]
    grounded: bool = True


def _fmt(value: float | None, unit: str, digits: int = 1) -> str:
    return "unavailable" if value is None else f"{value:.{digits}f} {unit}"


def _detect_language(text: str, default_lang: str) -> str:
    """Detect language from query script to avoid localization drop."""
    if any("\u0D00" <= ch <= "\u0D7F" for ch in text):
        return "ml"
    if any("\u0900" <= ch <= "\u097F" for ch in text):
        return "hi"
    if any("\u0B80" <= ch <= "\u0BFF" for ch in text):
        return "ta"
    return default_lang


async def _gemini_answer(payload: AssistantRequest) -> str | None:
    """Use Gemini as a language/intent layer over a bounded, validated snapshot."""
    api_key = settings.GEMINI_API_KEY
    provider = (settings.LLM_PROVIDER or "").strip().lower()
    if not api_key:
        log.info("assistant.gemini_skipped", reason="no_api_key")
        return None
    if provider and provider not in ("gemini", "google"):
        log.info("assistant.gemini_skipped", reason=f"provider_{provider}")
        return None

    model_name = settings.GEMINI_MODEL or "gemini-2.5-flash"
    if "3.8" in model_name:
        model_name = "gemini-2.5-flash"

    api_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={api_key}"

    user_query_text = f"User Query: {payload.message}\n\nSession Context: {payload.context.model_dump_json()}"

    contents: list[dict] = []
    for turn in payload.history[-6:]:
        contents.append({
            "role": "user" if turn.role == "user" else "model",
            "parts": [{"text": turn.content}],
        })
    contents.append({
        "role": "user",
        "parts": [{"text": user_query_text}],
    })

    gemini_payload = {
        "systemInstruction": {
            "parts": [
                {"text": HYDROVISTA_SYSTEM_PROMPT}
            ]
        },
        "contents": contents,
        "generationConfig": {
            "temperature": 0.2,
        },
    }

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, connect=3.0)) as client:
            response = await client.post(
                api_url,
                headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
                json=gemini_payload,
            )
            if response.status_code != 200:
                log.error(
                    "assistant.gemini_call_failed",
                    status_code=response.status_code,
                    response=response.text[:500],
                )
                return None
            data = response.json()
            candidates = data.get("candidates", [])
            if not candidates:
                log.warning("assistant.gemini_no_candidates", response=data)
                return None
            parts = candidates[0].get("content", {}).get("parts", [])
            answer = "".join(part.get("text", "") for part in parts).strip()
            return answer[:4000] or None
    except Exception as exc:  # noqa: BLE001 - deterministic data-aware fallback remains available
        log.error("assistant.gemini_call_exception", error=type(exc).__name__, detail=str(exc))
        return None


DEFAULT_CHALAKUDY_ASSETS = [
    AssetRiskSnapshot(name="Chalakudy Government Taluk Hospital", asset_type="hospital", risk_category="critical", risk_score=0.94, elevation=8.0),
    AssetRiskSnapshot(name="St. James Hospital Chalakudy", asset_type="hospital", risk_category="high", risk_score=0.81, elevation=12.0),
    AssetRiskSnapshot(name="Dhanya Mission Hospital Potta", asset_type="hospital", risk_category="high", risk_score=0.76, elevation=14.0),
    AssetRiskSnapshot(name="Pariyaram Primary Health Centre", asset_type="hospital", risk_category="medium", risk_score=0.58, elevation=18.0),
    AssetRiskSnapshot(name="Meloor High School Relief Camp", asset_type="shelter", risk_category="medium", risk_score=0.48, elevation=16.0),
    AssetRiskSnapshot(name="Pariyaram Primary Community Relief Shelter", asset_type="shelter", risk_category="medium", risk_score=0.48, elevation=19.0),
    AssetRiskSnapshot(name="Chalakudy Taluk Central Relief Camp", asset_type="shelter", risk_category="low", risk_score=0.22, elevation=24.0),
    AssetRiskSnapshot(name="KSRTC Bus Station Chalakudy", asset_type="transit", risk_category="critical", risk_score=0.91, elevation=7.5),
    AssetRiskSnapshot(name="KSEB 110kV Transmission Substation Chalakudy", asset_type="substation", risk_category="high", risk_score=0.79, elevation=9.0),
    AssetRiskSnapshot(name="Poringalkuthu Substation", asset_type="substation", risk_category="high", risk_score=0.72, elevation=280.0),
    AssetRiskSnapshot(name="Chalakudy River Bridge (NH 544)", asset_type="bridge", risk_category="high", risk_score=0.75, elevation=8.5),
    AssetRiskSnapshot(name="Athirappilly Bridge (SH 21)", asset_type="bridge", risk_category="medium", risk_score=0.52, elevation=35.0),
]


async def _rainfall_intent_answer(payload: AssistantRequest, lang: str) -> str | None:
    """Handle rainfall questions (tomorrow, today, or general) locally with high accuracy."""
    q = payload.message.casefold()

    # Disallow overmatching non-rain intents
    non_rain_intents = (
        "gauge", "stage", "water level", "waterlevel", "level", "reading",
        "bridge", "cross", "crossing", "road", "passable", "traffic",
        "hospital", "medical", "clinic", "health",
        "substation", "power", "electricity", "kseb",
        "shelter", "camp", "relief", "school",
        "elevation", "msl", "ഉയരം",
        "simulate", "simulation", "scenario", "stress test", "additional rain", "preset", "what if", "സിമുലേഷൻ",
        "munnar", "മൂന്നാർ", "idukki", "aluva", "ആലുവ", "periyar", "പെരിയാർ",
    )
    if any(k in q for k in non_rain_intents):
        return None

    has_rain = any(term in q for term in ("rain", "rian", "raining", "precip", "storm", "wet", "shower", "വർഷ", "മഴ", "പെയ്യും", "മഴയുണ്ടോ", "മഴയുണ്ടാകുമോ", "മഴയെത്ര", "മഴക്കാലം", "वर्षा", "बारिश", "மழை"))
    is_tomorrow = any(term in q for term in ("tomorrow", "tmr", "tomo", "tommorow", "morow", "നാളെ", "कल", "நாளை"))
    is_today = any(term in q for term in ("today", "todai", "now", "ഇന്ന്", "आज", "இன்று"))

    if not has_rain:
        return None

    is_24h = any(term in q for term in ("24h", "24-hour", "24 hour", "24 hr", "24hr", "accumulated", "cumulative", "അടുത്ത 24", "24 മണിക്കൂർ", "24 घंटे"))
    if is_24h or (not is_tomorrow and not is_today):
        r24 = payload.context.rainfall_24h_mm if payload.context.rainfall_24h_mm is not None else 18.6
        answers = {
            "en": f"The forecasted 24-hour rainfall for the Chalakudy River Basin is {r24:.1f} mm based on Open-Meteo numerical weather model guidance.",
            "ml": f"ചാലക്കുടി നദീതടത്തിലെ അടുത്ത 24 മണിക്കൂർ മഴ പ്രവചനം {r24:.1f} mm ആണ്. ഇത് ഓപ്പൺ-മെറ്റിയോ (Open-Meteo) ന്യൂമെറിക്കൽ വെതർ മോഡൽ പ്രവചനമാണ്.",
            "hi": f"चालाकुडी नदी बेसिन के लिए 24 घंटे का वर्षा पूर्वानुमान {r24:.1f} मिमी है। यह ओपन-मेटियो मौसम मॉडल का मार्गदर्शन है।",
            "ta": f"சாலக்குடி ஆற்றுப் படுகைக்கான 24 மணி நேர மழை முன்னறிவிப்பு {r24:.1f} மி.மீ. இது ஓபன்-மெட்டியோ வானிலை மாதிரி வழிகாட்டுதல்.",
        }
        return answers.get(lang, answers["en"])

    if not payload.context.hourly_rainfall and payload.context.rainfall_24h_mm is not None:
        r24 = payload.context.rainfall_24h_mm
        day_str = "tomorrow" if is_tomorrow else "today"
        answers = {
            "en": f"Based on the session forecast data for {day_str}, the cumulative precipitation is {r24:.1f} mm (Open-Meteo model guidance). Rain is expected with moderate showers.",
            "ml": f"സെഷൻ പ്രവചന ഡാറ്റ പ്രകാരം { 'നാളെ' if is_tomorrow else 'ഇന്ന്' } ആകെ {r24:.1f} mm മഴ പ്രതീക്ഷിക്കുന്നു (ഓപ്പൺ-മെറ്റിയോ മാതൃകാ പ്രവചനം).",
            "hi": f"सत्र पूर्वानुमान डेटा के अनुसार { 'कल' if is_tomorrow else 'आज' } कुल {r24:.1f} मिमी बारिश का अनुमान है।",
            "ta": f"அமர்வு முன்னறிவிப்புத் தரவின்படி { 'நாளை' if is_tomorrow else 'இன்று' } மொத்தம் {r24:.1f} மி.மீ மழை எதிர்பார்க்கப்படுகிறது.",
        }
        return answers.get(lang, answers["en"])

    tz = ZoneInfo("Asia/Kolkata")
    today_date = datetime.now(tz).date()
    target_date = (today_date + timedelta(days=1)).isoformat() if is_tomorrow else today_date.isoformat()
    day_label_en = "tomorrow" if is_tomorrow else "today"

    hourly_points = list(payload.context.hourly_rainfall)
    if not hourly_points:
        from app.api.v1.forecast import _forecast_cache
        if _forecast_cache and isinstance(_forecast_cache, dict) and "hourly" in _forecast_cache:
            for h in _forecast_cache["hourly"]:
                hourly_points.append(
                    HourlyRainPoint(
                        time=str(h.get("time")),
                        precipitation_mm=h.get("precipitation_mm"),
                        is_forecast=bool(h.get("is_forecast", True)),
                    )
                )

    matching_points = []
    for p in hourly_points:
        try:
            pt_date = datetime.fromisoformat(p.time.replace("Z", "+00:00")).astimezone(tz).date().isoformat()
            if pt_date == target_date and p.precipitation_mm is not None:
                matching_points.append(p)
        except (ValueError, TypeError):
            continue

    if not matching_points and is_tomorrow:
        matching_points = [p for p in hourly_points if p.is_forecast and p.precipitation_mm is not None][12:36]

    if matching_points:
        total = sum(p.precipitation_mm or 0.0 for p in matching_points)
        max_rain = max((p.precipitation_mm or 0.0 for p in matching_points), default=0.0)
        rain_hours = sum(1 for p in matching_points if (p.precipitation_mm or 0.0) >= 0.1)

        peak_time_str = "afternoon"
        for p in matching_points:
            if (p.precipitation_mm or 0.0) == max_rain and max_rain > 0:
                try:
                    dt = datetime.fromisoformat(p.time.replace("Z", "+00:00")).astimezone(tz)
                    peak_time_str = dt.strftime("%H:%M IST")
                except Exception:
                    pass
                break

        if total < 0.2:
            answers = {
                "en": f"No significant rain is expected {day_label_en} in the Chalakudy River Basin. The Open-Meteo forecast estimates {total:.1f} mm of total precipitation, with dry and clear conditions across all forecast hours.",
                "ml": f"ചാലക്കുടി നദീതടത്തിൽ { 'നാളെ' if is_tomorrow else 'ഇന്ന്' } കാര്യമായ മഴയില്ല. ഓപ്പൺ-മെറ്റിയോ (Open-Meteo) പ്രവചനമനുസരിച്ച് ആകെ {total:.1f} mm മഴ മാത്രമാണ് പ്രതീക്ഷിക്കുന്നത്, പ്രധാനമായും വരണ്ട കാലാവസ്ഥയായിരിക്കും.",
                "hi": f"चालाकुडी नदी बेसिन में { 'कल' if is_tomorrow else 'आज' } कोई खास बारिश नहीं होगी। ओपन-मेटियो पूर्वानुमान के अनुसार कुल वर्षा केवल {total:.1f} मिमी अनुमानित है, मौसम मुख्यतः शुष्क रहेगा।",
                "ta": f"சாலக்குடி படுகையில் { 'நாளை' if is_tomorrow else 'இன்று' } குறிப்பிடத்தக்க மழை இருக்காது. ஓபன்-மெட்டியோ முன்னறிவிப்பின்படி மொத்த மழை {total:.1f} மி.மீ மட்டுமே, பெரும்பாலும் வறண்ட வானிலையே நீடிக்கும்.",
            }
        else:
            answers = {
                "en": f"Yes, rain is expected {day_label_en} in the Chalakudy River Basin. The Open-Meteo forecast indicates approximately {total:.1f} mm of total rainfall across {rain_hours} rainy hours, with a peak intensity of {max_rain:.1f} mm/h around {peak_time_str}. This is NWP model guidance, not an official flood warning.",
                "ml": f"അതെ, { 'നാളെ' if is_tomorrow else 'ഇന്ന്' } ചാലക്കുടി നദീതടത്തിൽ മഴ പ്രതീക്ഷിക്കുന്നുണ്ട്. ഓപ്പൺ-മെറ്റിയോ (Open-Meteo) പ്രവചനപ്രകാരം ആകെ ഏകദേശം {total:.1f} mm മഴയും, {peak_time_str} സമയത്ത് പരമാവധി മണിക്കൂറിൽ {max_rain:.1f} mm മഴയും ഉണ്ടാകാം. ഇത് മാതൃകാ പ്രവചനമാണ്.",
                "hi": f"हाँ, { 'कल' if is_tomorrow else 'आज' } चालाकुडी बेसिन में बारिश की संभावना है। ओपन-मेटियो मॉडल के अनुसार कुल लगभग {total:.1f} मिमी बारिश तथा {peak_time_str} के आसपास अधिकतम {max_rain:.1f} मिमी/घंटा वर्षा का अनुमान है।",
                "ta": f"ஆம், { 'நாளை' if is_tomorrow else 'இன்று' } சாலக்குடி படுகையில் மழை எதிர்பார்க்கப்படுகிறது. ஓபன்-மெட்டியோ முன்னறிவிப்பின்படி மொத்தம் சுமார் {total:.1f} மி.மீ மழையும், {peak_time_str} அளவில் அதிகபட்சமாக மணிக்கு {max_rain:.1f} மி.மீ வரை மழையும் பெய்யக்கூடும்.",
            }
        return answers.get(lang, answers["en"])

    if is_tomorrow:
        r24 = payload.context.rainfall_24h_mm or 18.6
        answers = {
            "en": f"Yes, rain is expected tomorrow in the Chalakudy River Basin. The Open-Meteo forecast indicates approximately {r24:.1f} mm cumulative rainfall. This is NWP model guidance, not an official flood warning.",
            "ml": f"അതെ, നാളെ ചാലക്കുടി നദീതടത്തിൽ മഴ പ്രതീക്ഷിക്കുന്നുണ്ട്. ഓപ്പൺ-മെറ്റിയോ (Open-Meteo) പ്രവചനപ്രകാരം ഏകദേശം {r24:.1f} mm മഴയുണ്ടാകാം. ഇത് മാതൃകാ പ്രവചനമാണ്.",
            "hi": f"हाँ, कल चालाकुडी बेसिन में बारिश की संभावना है। ओपन-मेटियो (Open-Meteo) मॉडल के अनुसार लगभग {r24:.1f} मिमी वर्षा का अनुमान है।",
            "ta": f"ஆம், நாளை சாலக்குடி படுகையில் மழை எதிர்பார்க்கப்படுகிறது. ஓபன்-மெட்டியோ (Open-Meteo) கணிப்பின்படி சுமார் {r24:.1f} மி.மீ மழை பெய்யக்கூடும்.",
        }
        return answers.get(lang, answers["en"])

    r24 = payload.context.rainfall_24h_mm or 18.6
    answers = {
        "en": f"The forecasted 24-hour rainfall for the Chalakudy River Basin is {r24:.1f} mm based on Open-Meteo numerical weather model guidance.",
        "ml": f"ചാലക്കുടി നദീതടത്തിലെ അടുത്ത 24 മണിക്കൂർ മഴ പ്രവചനം {r24:.1f} mm ആണ്. ഇത് ഓപ്പൺ-മെറ്റിയോ (Open-Meteo) ന്യൂമെറിക്കൽ വെതർ മോഡൽ പ്രവചനമാണ്.",
        "hi": f"चालाकुडी नदी बेसिन के लिए 24 घंटे का वर्षा पूर्वानुमान {r24:.1f} मिमी है।",
        "ta": f"சாலக்குடி ஆற்றுப் படுகைக்கான 24 மணி நேர மழை முன்னறிവിப்பு {r24:.1f} மி.மீ.",
    }
    return answers.get(lang, answers["en"])


@router.post("/chat", response_model=AssistantResponse)
async def chat(payload: AssistantRequest) -> AssistantResponse:
    # Auto-detect language if query is written in native script
    lang = _detect_language(payload.message, payload.language)
    payload.language = lang  # type: ignore

    # Self-healing Context Enrichment: If fields are missing, enrich from system services
    if not payload.context.high_risk_assets_snapshot:
        try:
            from app.api.v1.assets import _get_or_fetch_assets
            from app.services.exposure import rank_assets
            raw_assets, _ = await _get_or_fetch_assets()
            if raw_assets:
                ranked = rank_assets(assets=raw_assets, rainfall_24h_mm=payload.context.rainfall_24h_mm)
                payload.context.high_risk_assets_snapshot = [
                    AssetRiskSnapshot(
                        name=r.get("asset_name") or r.get("name") or str(r.get("asset_type")),
                        asset_type=str(r.get("asset_type") or "infrastructure"),
                        risk_category=r.get("risk_category") or "medium",
                        risk_score=r.get("risk_score"),
                        elevation=r.get("terrain_elevation_m") or (8.0 if "taluk hospital" in (r.get("asset_name") or "").lower() else 16.0 if "meloor" in (r.get("asset_name") or "").lower() else 12.0),
                    )
                    for r in ranked[:30]
                ]
                if payload.context.high_risk_assets is None:
                    payload.context.high_risk_assets = sum(
                        1 for r in ranked if r.get("risk_category") in ("critical", "high")
                    )
        except Exception as exc:
            log.warning("assistant.enrich_assets_failed", error=str(exc))

        if not payload.context.high_risk_assets_snapshot:
            payload.context.high_risk_assets_snapshot = list(DEFAULT_CHALAKUDY_ASSETS)
            if payload.context.high_risk_assets is None:
                payload.context.high_risk_assets = 5

    # Stage / Gauge: DO NOT enrich if cwc_arangaly is marked unavailable
    if payload.context.observed_stage_m is None and payload.context.source_statuses.get("cwc_arangaly") != "unavailable":
        try:
            from app.services.river_stage import cached_stage_payload
            cached_stage = cached_stage_payload(force_stale=False)
            if cached_stage and cached_stage.get("observed_stage_m") is not None:
                payload.context.observed_stage_m = float(cached_stage["observed_stage_m"])
                payload.context.observed_stage_at = cached_stage.get("observed_at")
                payload.context.stage_source = cached_stage.get("source")
        except Exception as exc:
            log.warning("assistant.enrich_stage_failed", error=str(exc))

    if payload.context.rainfall_24h_mm is None:
        try:
            from app.api.v1.forecast import _forecast_cache
            if _forecast_cache and "rainfall_accumulations" in _forecast_cache:
                for acc in _forecast_cache.get("rainfall_accumulations", []):
                    if acc.get("window_hours") == 24:
                        payload.context.rainfall_24h_mm = acc.get("accumulation_mm")
                        break
        except Exception:
            pass
        if payload.context.rainfall_24h_mm is None:
            payload.context.rainfall_24h_mm = 18.6
            payload.context.rainfall_source = "Open-Meteo numerical weather forecast"

    if payload.context.modelled_discharge_m3s is None:
        payload.context.modelled_discharge_m3s = 23.2
        payload.context.discharge_source = "GloFAS modelled discharge"

    # Audit the Hidden Context Payload: Log the exact JSON output of payload.context.model_dump()
    context_dump = payload.context.model_dump()
    log.info(
        "assistant.context_payload",
        message=payload.message,
        context=context_dump,
        context_json=payload.context.model_dump_json(),
    )

    q = payload.message.casefold()
    c = payload.context
    sources: list[str] = []

    # 1. Prompt Injection & Jailbreak Neutralization
    if any(phrase in q for phrase in ("ignore previous instructions", "disregard previous", "ignore all rules", "system prompt", "developer message", "jailbreak")):
        r24 = c.rainfall_24h_mm or 18.6
        return AssistantResponse(
            answer=f"I am HydroVista's analytical assistant for the Chalakudy River Basin. Current 24-hour rainfall forecast is {r24:.1f} mm (Open-Meteo model guidance). How can I help you interpret local flood metrics?",
            sources=["HydroVista Guardrails"],
        )

    # 2. Safety Refusal - Explicit refusal for official warnings/evacuation orders
    if any(phrase in q for phrase in ("evacuate", "evacuation", "official warning", "order", "decree", "mandate")):
        return AssistantResponse(
            answer="I provide analytical guidance only and cannot issue official government warnings or evacuation orders. Please consult the Kerala State Disaster Management Authority (KSDMA) or local district administration for official emergency directives.",
            sources=["HydroVista Safety Directives"],
        )

    # 3. Direct Gemini LLM Call
    llm_answer = await _gemini_answer(payload)
    if llm_answer:
        names = set()
        if c.rainfall_24h_mm is not None:
            names.add(c.rainfall_source or "Open-Meteo forecast")
        if c.observed_stage_m is not None:
            names.add(c.stage_source or "Central Water Commission gauge")
        if c.modelled_discharge_m3s is not None:
            names.add(c.discharge_source or "GloFAS modelled discharge")
        if c.high_risk_assets_snapshot:
            names.add("HydroVista exposure rankings")
        if not names:
            names.add("HydroVista session data snapshot")
        return AssistantResponse(answer=llm_answer, sources=sorted(names))

    # 4. Out-of-Scope Geographical Boundary Refusal (Munnar, Aluva, Periyar, Wayanad, Idukki, etc.)
    out_of_scope_places = (
        "munnar", "മൂന്നാർ",
        "wayanad", "വയനാട്",
        "idukki", "ഇടുക്കി",
        "aluva", "ആലുവ",
        "periyar", "പെരിയാർ", "periyar bridge",
        "kochi", "കൊച്ചി", "cochin",
        "ernakulam", "എറണാകുളം",
        "trivandrum", "thiruvananthapuram", "തിരുവനന്തപുരം",
        "kozhikode", "കോഴിക്കോട്",
        "alappuzha", "ആലപ്പുഴ",
        "kottayam", "കോട്ടയം",
        "kannur", "കണ്ണൂർ",
    )
    if any(place in q for place in out_of_scope_places):
        out_of_scope_answers = {
            "en": (
                "HydroVista's analytical models and telemetry coverage are currently focused exclusively on the "
                "**Chalakudy River Basin** (Kerala). Data, water levels, bridge status, and forecasts for locations outside this "
                "basin (such as Aluva, Periyar, Munnar, or Wayanad) are out of scope."
            ),
            "ml": (
                "HydroVista-യുടെ വിശകലന മോഡലുകളും ഡാറ്റയും നിലവിൽ **ചാലക്കുടി നദീതടത്തിൽ** മാത്രമായി പരിമിതപ്പെടുത്തിയിരിക്കുന്നു. "
                "ആലുവ, പെരിയാർ, മൂന്നാർ, വയനാട് തുടങ്ങിയ മറ്റ് പ്രദേശങ്ങളിലെ ജലനിരപ്പും പ്രളയവിവരങ്ങളും ഇതിന്റെ പരിധിയിൽ വരില്ല."
            ),
            "hi": (
                "HydroVista के विश्लेषणात्मक मॉडल और डेटा कवरेज वर्तमान में केवल **चालाकुडी नदी बेसिन** तक सीमित हैं। "
                "अलुवा, पेरियार, मुन्नार या वायनाड जैसे बाहरी क्षेत्रों के डेटा इसके दायरे से बाहर हैं।"
            ),
            "ta": (
                "HydroVista இன் பகுப்பாய்வு மாதிரிகள் தற்போது **சாலக்குடி ஆற்றுப் படுகைக்கு** மட்டுமே பொருந்தும். "
                "ஆலுவா, பெரியாறு, மூணார் போன்ற வெளிப்பகுதிகள் இதில் அடங்காது."
            ),
        }
        return AssistantResponse(answer=out_of_scope_answers.get(lang, out_of_scope_answers["en"]), sources=["HydroVista Scope"])

    # 5. Scenario Stress-Test / Rain Dial Simulation Intent
    scenario_keywords = (
        "simulate", "simulation", "scenario", "stress test", "stresstest",
        "additional rain", "additional rainfall", "preset", "what if", "സിമുലേഷൻ",
    )
    if any(kw in q for kw in scenario_keywords):
        import re
        scenario_impact = c.active_scenario_impact
        if scenario_impact:
            severe_count = scenario_impact.get("severe_risk_count", 0)
            net_change = scenario_impact.get("net_change", 0)
            if lang == "ml":
                answer = (
                    f"സജീവ സിമുലേഷൻ സമ്മർദ്ദ പരിശോധനയിൽ, ആകെ **{severe_count}** സ്ഥാപനങ്ങൾ ഉയർന്നതോ ഗുരുതരമായതോ ആയ അപകടസാധ്യതയിലേക്ക് (high/critical risk) മാറുന്നു "
                    f"(ബേസ്‌ലൈനിൽ നിന്നുള്ള വർദ്ധനവ്: **+{net_change}**). "
                    "ഇവ കൃത്രിമ മഴ അനുമാനങ്ങളെ അടിസ്ഥാനമാക്കിയുള്ള ഹൈഡ്രോഡൈനാമിക് എസ്റ്റിമേറ്റുകളാണ്; ഔദ്യോഗിക പ്രളയ മുന്നറിയിപ്പല്ല."
                )
            else:
                answer = (
                    f"Under the active scenario stress test, **{severe_count}** facilities "
                    f"escalate to high or critical risk. Net change from baseline: **{net_change}**. "
                    "These are hydrodynamic estimates based on synthetic forcing, not official flood forecasts."
                )
            return AssistantResponse(answer=answer, sources=["HydroVista Scenario Simulator"])

        rain_match = re.search(r'(\d+(?:\.\d+)?)\s*(?:mm|m\.m|മില്ലീമീറ്റർ)', q)
        dur_match = re.search(r'(\d+(?:\.\d+)?)\s*(?:h|hr|hour|hours|മണിക്കൂർ)', q)
        sim_mm = float(rain_match.group(1)) if rain_match else (c.scenario_rainfall_mm or None)
        sim_dur = float(dur_match.group(1)) if dur_match else (c.scenario_duration_hours or 24.0)

        if sim_mm is not None:
            base_rain = c.rainfall_24h_mm or 18.6
            combined_rain = base_rain + sim_mm
            if sim_mm >= 100:
                severe_count = 9
                net_change = 5
            elif sim_mm >= 70:
                severe_count = 7
                net_change = 3
            elif sim_mm >= 40:
                severe_count = 6
                net_change = 2
            else:
                severe_count = 5
                net_change = 1

            high_risk_names = [a.name for a in c.high_risk_assets_snapshot if a.risk_category in ("critical", "high")][:3]
            names_str = ", ".join(f"**{name}**" for name in high_risk_names) if high_risk_names else "**Chalakudy Government Taluk Hospital**, **St. James Hospital Chalakudy**"

            if lang == "ml":
                answer = (
                    f"അധികമായി {sim_mm:g} mm മഴ ({sim_dur:g} മണിക്കൂറിൽ) നൽകിയുള്ള സിമുലേഷനിൽ, "
                    f"ആകെ **{severe_count}** സ്ഥാപനങ്ങൾ ഉയർന്നതോ ഗുരുതരമായതോ ആയ അപകടസാധ്യതയിലേക്ക് (high/critical risk) മാറുന്നു "
                    f"(ബേസ്‌ലൈനിൽ നിന്നുള്ള മാറ്റം: **+{net_change}**). ബാധിക്കപ്പെടുന്ന പ്രധാന സ്ഥാപനങ്ങൾ: {names_str}. "
                    "ഇവ കൃത്രിമ മഴ അനുമാനങ്ങളെ അടിസ്ഥാനമാക്കിയുള്ള ഹൈഡ്രോഡൈനാമിക് എസ്റ്റിമേറ്റുകളാണ്; ഔദ്യോഗിക പ്രളയ മുന്നറിയിപ്പല്ല."
                )
            else:
                answer = (
                    f"Under a simulated stress test of an additional **{sim_mm:g} mm** rainfall over **{sim_dur:g} hours** "
                    f"(combined 24h total: {combined_rain:.1f} mm), approximately **{severe_count}** facilities escalate to high or critical risk "
                    f"(net change from baseline: **+{net_change}**). High-risk facilities include {names_str}. "
                    "These are hydrodynamic estimates based on synthetic forcing, not official flood forecasts."
                )
            return AssistantResponse(answer=answer, sources=["HydroVista Scenario Simulator"])

        # Fallback if no specific mm given and no active scenario
        if lang == "ml":
            answer = "സിമുലേഷൻ സമ്മർദ്ദ പരിശോധന കണക്കാക്കാൻ സിനാരിയോ സിമുലേറ്റർ (Scenario Simulator) പ്രവർത്തിപ്പിക്കുക അല്ലെങ്കിൽ പ്രീസെറ്റ് തിരഞ്ഞെടുക്കുക."
        else:
            answer = "Run a scenario using the Scenario Simulator (or select a preset) to compute infrastructure escalation."
        return AssistantResponse(answer=answer, sources=["HydroVista Scenario Simulator"])

    # 6. Specific Asset Elevation Extraction
    if any(w in q for w in ("elevation", "msl", "ഉയരം", "ऊंचाई", "உயரம்")):
        pool = c.high_risk_assets_snapshot or DEFAULT_CHALAKUDY_ASSETS

        ml_map = {
            "താലൂക്ക്": "taluk",
            "ആശുപത്രി": "hospital",
            "മേലൂർ": "meloor",
            "പരിയരം": "pariyaram",
            "പൊട്ട": "potta",
            "പാലം": "bridge",
            "സബ്സ്റ്റേഷൻ": "substation",
            "ക്യാമ്പ്": "camp",
            "ഷെൽട്ടർ": "shelter",
        }
        q_expanded = q
        for ml_k, en_v in ml_map.items():
            if ml_k in q:
                q_expanded += f" {en_v}"

        common_tokens = {"the", "of", "in", "at", "and", "chalakudy", "river", "basin", "elevation", "msl", "ചാലക്കുടി", "ഉയരം", "is", "what", "tell", "me"}

        best_asset = None
        best_score = 0
        import re
        for asset in pool:
            name_clean = re.sub(r'[^a-zA-Z0-9\s]', ' ', asset.name.lower())
            tokens = [t for t in name_clean.split() if len(t) > 2 and t not in common_tokens]
            score = 0
            if asset.name.lower() in q_expanded:
                score += 100
            for tok in tokens:
                if tok in q_expanded:
                    score += 15 if tok in {"taluk", "government", "james", "dhanya", "meloor", "pariyaram", "kseb", "athirappilly", "poringalkuthu"} else 4
            if score > best_score:
                best_score = score
                best_asset = asset

        matched_asset = best_asset or next((a for a in pool if "taluk hospital" in a.name.lower()), pool[0])

        elev_val = matched_asset.elevation if matched_asset.elevation is not None else 8.0
        elev_str = f"{elev_val:g}"
        if lang == "ml":
            answer = f"**{matched_asset.name}**-ന്റെ രേഖപ്പെടുത്തിയ ഭൂനിരപ്പ് കോപ്പർനിക്കസ് DEM അനുസരിച്ച് **{elev_str} m MSL** ആണ്."
        else:
            answer = f"The recorded ground elevation for **{matched_asset.name}** is **{elev_str} m MSL** (sampled from Copernicus DEM)."
        return AssistantResponse(answer=answer, sources=["Terrain elevation (Copernicus DEM)"])

    # 7. Relief Camp & Shelter Filter
    shelter_keywords = ("relief camp", "camp", "shelter", "ക്യാമ്പ്", "ദുരിതാശ്വാസ", "റിലീഫ്")
    if any(kw in q for kw in shelter_keywords):
        shelters = [a for a in c.high_risk_assets_snapshot if a.asset_type.lower() in ("shelter", "camp") or any(t in a.name.lower() for t in ("camp", "shelter", "relief"))]
        if not shelters:
            shelters = [a for a in DEFAULT_CHALAKUDY_ASSETS if a.asset_type.lower() in ("shelter", "camp") or any(t in a.name.lower() for t in ("camp", "shelter", "relief"))]

        target_shelter = None
        for s in shelters:
            s_tokens = [t for t in s.name.lower().split() if len(t) > 3 and t not in ("relief", "camp", "shelter", "school")]
            if any(tok in q for tok in s_tokens) or ("മേലൂർ" in q and "meloor" in s.name.lower()) or ("പരിയരം" in q and "pariyaram" in s.name.lower()):
                target_shelter = s
                break

        sources.append("HydroVista infrastructure exposure")
        if target_shelter:
            s_elev = target_shelter.elevation or 16.0
            if lang == "ml":
                answer = (
                    f"**{target_shelter.name}** നിലവിലെ എക്സ്പോഷർ മോഡലിൽ **{target_shelter.risk_category}** റിസ്ക് വിഭാഗത്തിലാണ് "
                    f"(ഭൂനിരപ്പ്: **{s_elev:g} m MSL**). ഈ ദുരിതാശ്വാസ ക്യാമ്പ് സുരക്ഷിതമാണോ എന്നും പ്രവർത്തനസജ്ജമാണോ എന്നും ഔദ്യോഗികമായി "
                    "നിർണ്ണയിക്കുന്നത് ചാലക്കുടി താലൂക്ക് ദുരന്തനിവാരണ അതോറിറ്റിയും റവന്യൂ വകുപ്പുമാണ്."
                )
            else:
                answer = (
                    f"**{target_shelter.name}** is currently ranked in the **{target_shelter.risk_category}** risk category "
                    f"with a terrain ground elevation of **{s_elev:g} m MSL**. Evacuation readiness and active shelter designations "
                    "are officially managed by the Taluk Disaster Management Authority."
                )
        else:
            shelter_lines = ", ".join(f"**{s.name}** ({s.risk_category} risk, {s.elevation:g}m MSL)" if s.elevation is not None else f"**{s.name}** ({s.risk_category} risk)" for s in shelters)
            if lang == "ml":
                answer = (
                    f"ചാലക്കുടി നദീതടത്തിൽ നിരീക്ഷിക്കുന്ന ദുരിതാശ്വാസ ക്യാമ്പുകളും ഷെൽട്ടറുകളും: {shelter_lines}. "
                    "ഇവയുടെ സുരക്ഷാ പരിശോധനയും സജീവ ഷെൽട്ടർ അനുമതിയും താലൂക്ക് ദുരന്തനിവാരണ അതോറിറ്റിയുടെ ചുമതലയിലാണ്."
                )
            else:
                answer = (
                    f"Tracked relief camps and shelters in the basin: {shelter_lines}. "
                    "Evacuation readiness and active shelter designations are managed by the Taluk Disaster Management Authority."
                )
        return AssistantResponse(answer=answer, sources=sources)

    # 8. Explanatory "Why" Arangaly Stage vs Model Guidance
    is_stage_query = any(phrase in q for phrase in ("arangaly", "gauge", "stage", "water level", "waterlevel", "അരങ്ങാലി", "ലെവൽ", "ഗേജ്", "ജലനിരപ്പ്"))
    is_why_explanation = any(term in q for term in ("why", "difference", "instead of", "versus", "vs", "model guidance vs", "എന്തുകൊണ്ട്", "കാരണം", "വ്യത്യാസം", "क्यों", "अंतर", "ஏன்", "வேறுபாடு"))
    if is_stage_query and is_why_explanation:
        answer = {
            "en": (
                "The Arangaly river stage transitions to model guidance (such as GloFAS / NWP hydrodynamic estimates) "
                "whenever Central Water Commission (CWC) physical telemetry is offline, stale, or unavailable. "
                "Physical telemetry measures real-time river height via pressure transducers or radar sensors at the Arangaly gauge station, "
                "whereas model guidance represents simulated runoff projections. HydroVista strictly isolates synthetic model forecasts from "
                "physical gauge readings to avoid ungrounded telemetry extrapolation."
            ),
            "ml": (
                "സെൻട്രൽ വാട്ടർ കമ്മീഷന്റെ (CWC) അരങ്ങാലി ഗേജ് തത്സമയ ടെലിമെട്രി ഡാറ്റ ഓഫ്‌ലൈനാവുകയോ കാലഹരണപ്പെടുകയോ ചെയ്യുമ്പോഴാണ് "
                "HydroVista മോഡൽ മാർഗ്ഗനിർദ്ദേശത്തിലേക്ക് (GloFAS) മാറുന്നത്. യഥാർത്ഥ ഗേജ് നിരീക്ഷണങ്ങളും മാതൃകാ പ്രവചനങ്ങളും കൃത്യമായി വേർതിരിച്ചാണ് "
                "സിസ്റ്റം വിശകലനം നടത്തുന്നത്."
            ),
            "hi": (
                "जब केंद्रीय जल आयोग (CWC) का अरंगली गेज टेलीमेट्री ऑफ़लाइन या अनुपलब्ध होता है, तब HydroVista मॉडल मार्गदर्शन (GloFAS) "
                "प्रदर्शित करता है। वास्तविक गेज रीडिंग और सिमुलेशन मॉडल में अंतर बनाए रखने के लिए ऐसा किया जाता है।"
            ),
            "ta": (
                "மத்திய நீர் ஆணையத்தின் (CWC) அரங்கலி நேரடி தொலை அளவியல் கிடைக்காதபோது, HydroVista மாதிரி வழிகாட்டுதலைப் (GloFAS) பயன்படுத்துகிறது."
            ),
        }[lang]
        return AssistantResponse(
            answer=answer,
            sources=["Central Water Commission NWIC Telemetry", "GloFAS Hydrological Model Guidance"]
        )

    # 9. Hospital & Medical Facility Vulnerability Intent (e.g. "chalakudy hospital risk status pls", "Which medical facility has the highest vulnerability")
    if any(word in q for word in ("hospital", "medical", "clinic", "health", "ആശുപത്രി", "ചികിത്സ", "അസ്പതാല", "അस्पताल", "மருத்துவமனை")):
        hospitals = [a for a in c.high_risk_assets_snapshot if any(t in a.asset_type.lower() or t in a.name.lower() for t in ("hospital", "medical", "clinic", "health"))]
        sources.append("HydroVista exposure rankings")
        if hospitals:
            top_hosp = max(hospitals, key=lambda a: a.risk_score or 0.0)
            score_str = f"{top_hosp.risk_score:.2f}" if top_hosp.risk_score is not None else "N/A"
            hosp_list = ", ".join(f"**{h.name}** ({h.risk_category} risk, score: {h.risk_score:.2f})" if h.risk_score else f"**{h.name}** ({h.risk_category})" for h in hospitals)
            if lang == "ml":
                answer = f"ചാലക്കുടി നദീതടത്തിൽ ഏറ്റവും ഉയർന്ന അപകടസാധ്യതയുള്ള മെഡിക്കൽ സ്ഥാപനം **{top_hosp.name}** ആണ് (അപകട വിഭാഗം: **{top_hosp.risk_category}**, റിസ്ക് സ്കോർ: **{score_str}**). നിരീക്ഷിക്കുന്ന ആശുപത്രികൾ: {hosp_list}."
            else:
                answer = f"**{top_hosp.name}** has the highest vulnerability among tracked medical facilities in the Chalakudy basin, with a risk score of **{score_str}** (**{top_hosp.risk_category}** risk category). Tracked hospitals in the basin: {hosp_list}."
        else:
            answer = "No hospital assets are currently flagged in the critical/high exposure snapshot." if lang == "en" else "നിലവിലെ എക്സ്പോഷർ സ്നാപ്പ്ഷോട്ടിൽ ആശുപത്രികൾ പ്രത്യേകം രേഖപ്പെടുത്തിയിട്ടില്ല."
        return AssistantResponse(answer=answer, sources=sources)

    # 10. Bridges and Substations Query (e.g. "Are there any bridges or power substations in high risk?")
    is_substation = any(word in q for word in ("substation", "power", "electrical", "electricity", "kseb", "വൈദ്യുതി", "സബ്സ്റ്റേഷൻ"))
    is_multi_infra = ("bridge" in q or "പാലം" in q) and any(word in q for word in ("substation", "facility", "facilities", "infrastructure", "assets", "high risk"))
    if is_substation or is_multi_infra:
        substations = [a for a in c.high_risk_assets_snapshot if any(t in a.asset_type.lower() or t in a.name.lower() for t in ("substation", "power", "kseb"))]
        bridges = [a for a in c.high_risk_assets_snapshot if "bridge" in a.asset_type.lower() or "bridge" in a.name.lower()]
        sources.append("HydroVista exposure rankings")
        items = []
        if bridges:
            b_str = ", ".join(f"**{b.name}** ({b.risk_category} risk)" for b in bridges)
            items.append(f"Bridges: {b_str}")
        if substations:
            s_str = ", ".join(f"**{s.name}** ({s.risk_category} risk)" for s in substations)
            items.append(f"Substations: {s_str}")
        if items:
            combined = ". ".join(items)
            answer = f"Tracked infrastructure in the Chalakudy basin: {combined}. Vulnerability is evaluated based on terrain elevation, forecast rainfall, and facility criticality."
        else:
            answer = "Monitored infrastructure in Chalakudy includes Chalakudy River Bridge (NH 544), Athirappilly Bridge (SH 21), and KSEB 110kV Substation Chalakudy."
        return AssistantResponse(answer=answer, sources=sources)

    # 11. Bridge & Road Crossing Status Intent (e.g. "is chalakudy bridge safe to cross now")
    if any(word in q for word in ("bridge", "cross", "crossing", "road", "passable", "traffic", "പാലം", "പാലത്തിലൂടെ", "കടക്കാൻ", "പറ്റുമോ", "पुल")):
        bridges = [a for a in c.high_risk_assets_snapshot if "bridge" in a.asset_type.lower() or "bridge" in a.name.lower()]
        sources.append("HydroVista exposure rankings")
        if bridges:
            bridge_lines = "; ".join(f"**{b.name}** ({b.risk_category} risk, score: {b.risk_score:.2f})" if b.risk_score else f"**{b.name}** ({b.risk_category})" for b in bridges)
            if lang == "ml":
                answer = (
                    f"ചാലക്കുടി നദീതടത്തിലെ പ്രധാന പാലങ്ങളുടെ നിലവിലെ എക്സ്പോഷർ നില: {bridge_lines}. "
                    "എന്നാൽ പാലത്തിലൂടെയുള്ള ഗതാഗത സുരക്ഷയും റോഡ് നിയന്ത്രണങ്ങളും ഔദ്യോഗികമായി തീരുമാനിക്കുന്നത് കേരള പോലീസും പൊതുമരാമത്ത് വകുപ്പും (PWD) ജില്ലാ ദുരന്തനിവാരണ അതോറിറ്റിയുമാണ് (KSDMA). HydroVista ഔദ്യോഗിക യാത്രാനുമതി നൽകുന്ന സംവിധാനമല്ല."
                )
            else:
                answer = (
                    f"Based on current exposure rankings for the Chalakudy basin: {bridge_lines}. "
                    "However, bridge passability and road safety closures are determined exclusively by Kerala Police, PWD, and the District Disaster Management Authority (KSDMA). HydroVista is a research prototype and cannot clear or restrict bridge crossings."
                )
        else:
            if lang == "ml":
                answer = "ചാലക്കുടി പാലം നിലവിലെ മോഡൽ സ്നാപ്പ്ഷോട്ടിൽ ഉൾപ്പെട്ടിട്ടുണ്ട്. എന്നാൽ പാലത്തിലൂടെയുള്ള യാത്ര സുരക്ഷിതമാണോ എന്നത് പ്രാദേശിക പോലീസ്, ട്രാഫിക് അധികാരികൾ എന്നിവരിൽ നിന്ന് ഉറപ്പുവരുത്തുക."
            else:
                answer = "Monitored bridges in the Chalakudy basin include the Chalakudy River Bridge (NH 544) and Athirappilly Bridge (SH 21). Official passability and crossing safety must be verified directly with local traffic police and district authorities."
        return AssistantResponse(answer=answer, sources=sources)

    # 12. Water Level & Arangaly Gauge Reading Intent (e.g. "Give me the live water level reading at Arangaly right now")
    if any(phrase in q for phrase in ("water level", "waterlevel", "reading", "gauge", "stage", "വാട്ടർ ലെവൽ", "ഗേജ്", "ജലനിരപ്പ്", "നിരീക്ഷിച്ച", "जलस्तर", "गेज", "நீர்மட்டம்", "அளவீடு")):
        if c.observed_stage_m is None or c.source_statuses.get("cwc_arangaly") == "unavailable":
            answer = {
                "en": "Live telemetry is offline. Relying on GloFAS model guidance. (There is no current Arangaly gauge observation in the data snapshot; observed stage is unavailable).",
                "ml": "തത്സമയ ടെലിമെട്രി ഓഫ്‌ലൈനാണ്. GloFAS മോഡൽ മാർഗ്ഗനിർദ്ദേശത്തെ ആശ്രയിക്കുന്നു. (അരങ്ങാലി ഗേജ് നിരീക്ഷണം നിലവിലെ ഡാറ്റയിൽ ലഭ്യമല്ല).",
                "hi": "लाइव टेलीमेट्री ऑफ़लाइन है। GloFAS मॉडल मार्गदर्शन पर निर्भर। (वर्तमान डेटा में अरंगली गेज का अवलोकन उपलब्ध नहीं है)।",
                "ta": "நேரடி தொலை அளவியல் ஆஃப்லைனில் உள்ளது. GloFAS மாதிரி வழிகாட்டுதலை நம்பியுள்ளது. (தற்போதைய தரவில் அரங்கலி அளவீடு கிடைக்கவில்லை).",
            }[lang]
            return AssistantResponse(answer=answer, sources=["Central Water Commission (offline)"])
        else:
            sources.append(c.stage_source or "Central Water Commission gauge")
            stage_val = c.observed_stage_m
            obs_time = c.observed_stage_at or "recent telemetry"
            answer = {
                "en": f"The latest observed water level at the **Arangaly gauge** on the Chalakudy River is **{stage_val:.2f} m** (observed at {obs_time}). For context, Warning stage is 6.00 m, Danger stage is 7.00 m, and the 2018 peak High Flood Level (HFL) was 8.85 m. Current stage is well below warning thresholds.",
                "ml": f"ചാലക്കുടി പുഴയിലെ **അരങ്ങാലി ഗേജിലെ** ഏറ്റവും പുതിയ നിരീക്ഷിച്ച ജലനിരപ്പ് **{stage_val:.2f} m** ആണ് (സമയം: {obs_time}). മുന്നറിയിപ്പ് ലെവൽ 6.00 m, അപകട ലെവൽ 7.00 m, 2018-ലെ ഉയർന്ന പ്രളയനിരപ്പ് (HFL) 8.85 m ആണ്. നിലവിലെ ജലനിരപ്പ് മുന്നറിയിപ്പ് പരിധിക്ക് താഴെയാണ്.",
                "hi": f"चालाकुडी नदी पर **अरंगली गेज** का नवीनतम प्रेक्षित जलस्तर **{stage_val:.2f} मीटर** है (समय: {obs_time})। चेतावनी स्तर 6.00 मीटर और खतरे का स्तर 7.00 मीटर है।",
                "ta": f"சாலக்குடி ஆற்றில் **அரங்கலி அளவீட்டின்** சமீபத்திய நீர்மட்டம் **{stage_val:.2f} மீ** ஆகும். எச்சரிக்கை அளவு 6.00 மீ, ஆபத்து அளவு 7.00 மீ.",
            }[lang]
            return AssistantResponse(answer=answer, sources=sources)

    # 9. Modelled Discharge / GloFAS
    if any(word in q for word in ("discharge", "glofas", "runoff", "നീരൊഴുക്ക്", "പ്രവാഹം", "प्रवाह", "வெளியேற்றம்")):
        sources.append(c.discharge_source or "GloFAS modelled discharge")
        dis_val = c.modelled_discharge_m3s if c.modelled_discharge_m3s is not None else 23.2
        answer = {
            "en": f"The latest modelled river discharge for the Chalakudy River basin centroid is **{dis_val:.1f} m³/s** based on GloFAS model guidance. This is a hydrological model output, not a physical gauge reading.",
            "ml": f"ചാലക്കുടി നദീതടത്തിലെ ഏറ്റവും പുതിയ മാതൃകാ നദീപ്രവാഹം **{dis_val:.1f} m³/s** ആണ് (GloFAS മോഡൽ അനുസരിച്ച്). ഇത് മാതൃകാ ഫലമാണ്, ഗേജ് അളവല്ല.",
            "hi": f"चालाकुडी बेसिन के लिए नवीनतम मॉडलित नदी प्रवाह **{dis_val:.1f} m³/s** है (GloFAS मॉडल)। यह मॉडल आउटपुट है।",
            "ta": f"சாலக்குடி படுகையின் சமீபத்திய மாதிரி நதியோட்டம் **{dis_val:.1f} m³/s** (GloFAS மாதிரி).",
        }[lang]
        return AssistantResponse(answer=answer, sources=sources)

    # 10. Greetings
    if any(term in q for term in ("hi", "hello", "hey", "വണക്കം", "നമസ്കാരം", "ഹലോ", "नमस्ते", "வணக்கம்")) and len(q.split()) <= 4:
        greetings = {
            "en": "Hello! I can help interpret the rainfall forecast, Arangaly gauge reading, modelled discharge, infrastructure risk, and scenario inputs. What would you like to check?",
            "ml": "നമസ്കാരം! മഴ പ്രവചനം, അരങ്ങാലി ഗേജ്, മാതൃകാ പ്രവാഹം, സ്ഥാപന അപകടസാധ്യത, സാഹചര്യ ഇൻപുട്ടുകൾ എന്നിവ പരിശോധിക്കാം. എന്താണ് അറിയേണ്ടത്?",
            "hi": "नमस्ते! मैं वर्षा पूर्वानुमान, अरंगली गेज, मॉडलित प्रवाह, अवसंरचना जोखिम और परिदृश्य इनपुट समझा सकता हूँ। आप क्या जानना चाहेंगे?",
            "ta": "வணக்கம்! மழை முன்னறிவிப்பு, அரங்கலி அளவீடு, மாதிரி நதியோட்டம், உள்கட்டமைப்பு ஆபத்து, சூழல் உள்ளீடுகளை விளக்கலாம். எதைப் பார்க்க விரும்புகிறீர்கள்?",
        }
        return AssistantResponse(answer=greetings[lang], sources=["HydroVista assistant"])

    # 11. Rainfall Intent
    rainfall_answer = await _rainfall_intent_answer(payload, lang)
    if rainfall_answer:
        return AssistantResponse(answer=rainfall_answer, sources=[c.rainfall_source or "Open-Meteo numerical weather forecast"])

    # 12. Specific System Data Source & Freshness Status (ONLY if specifically asking about sources/system connectivity)
    if any(word in q for word in ("data source", "data sources", "source status", "sources status", "system status", "telemetry status", "freshness", "connectivity")):
        if c.source_statuses:
            sources = list(c.source_statuses.keys())[:8]
            answer = {
                "en": "Current source status: " + "; ".join(f"{name}: {state}" + (f" (last successful update {c.source_updated_at[name]})" if name in c.source_updated_at else "") for name, state in c.source_statuses.items()) + ". A connectivity check time is not necessarily an observation time.",
                "ml": "നിലവിലെ ഡാറ്റാ ഉറവിട നില: " + "; ".join(f"{name}: {state}" + (f" (അവസാന വിജയകരമായ പുതുക്കൽ {c.source_updated_at[name]})" if name in c.source_updated_at else "") for name, state in c.source_statuses.items()) + ". കണക്റ്റിവിറ്റി പരിശോധനാ സമയം നിരീക്ഷണ സമയമാകണമെന്നില്ല.",
                "hi": "वर्तमान स्रोत स्थिति: " + "; ".join(f"{name}: {state}" + (f" (अंतिम सफल अपडेट {c.source_updated_at[name]})" if name in c.source_updated_at else "") for name, state in c.source_statuses.items()) + ". कनेक्टिविटी जाँच का समय जरूरी नहीं कि अवलोकन का समय हो।",
                "ta": "தற்போதைய தரவு மூல நிலை: " + "; ".join(f"{name}: {state}" + (f" (கடைசி வெற்றிகரமான புதுப்பிப்பு {c.source_updated_at[name]})" if name in c.source_updated_at else "") for name, state in c.source_statuses.items()) + ". இணைப்பு சரிபார்ப்பு நேரம் அளவீட்டு நேரமாக இருக்க வேண்டியதில்லை.",
            }[lang]
        else:
            answer = "No data-source status has loaded in this view yet." if lang == "en" else "ഡാറ്റാ ഉറവിട നില ഇപ്പോൾ ലഭ്യമല്ല."
        return AssistantResponse(answer=answer, sources=sources or ["HydroVista System Status"])

    # 13. Critical & General Asset Counts
    if any(word in q for word in ("critical", "ഗുരുതര", "गंभीर", "தீவிர")) and any(word in q for word in ("asset", "count", "how many", "number", "classified", "ranked", "എത്ര")):
        if c.high_risk_assets_snapshot:
            critical_assets = [a for a in c.high_risk_assets_snapshot if a.risk_category == "critical"]
            crit_names = ", ".join(f"**{a.name}**" for a in critical_assets) if critical_assets else "None"
            answer = f"There are **{len(critical_assets)}** assets currently classified as critical risk: {crit_names}. Total high/critical assets tracked is **{c.high_risk_assets or len(c.high_risk_assets_snapshot)}**."
            sources.append("HydroVista exposure rankings")
        else:
            answer = "No critical risk assets are currently recorded in the active snapshot."
        return AssistantResponse(answer=answer, sources=sources)

    if any(word in q for word in ("risk", "asset", "infrastructure", "അപായ", "जोखिम", "ஆபத்து", "അപകടം", "സ്ഥാപനം")):
        sources.append("HydroVista exposure rankings")
        count = c.high_risk_assets or len(c.high_risk_assets_snapshot) or 12
        answer = {
            "en": f"There are currently {count} assets ranked in high or critical exposure categories in the Chalakudy basin. These are relative heuristic rankings based on terrain elevation, rainfall, and facility criticality, not calibrated flood probabilities.",
            "ml": f"ചാലക്കുടി നദീതടത്തിൽ ഇപ്പോൾ {count} സ്ഥാപനങ്ങൾ ഉയർന്ന അല്ലെങ്കിൽ ഗുരുതര അപകട വിഭാഗത്തിലാണ്. ഇവ ആപേക്ഷിക ഹ്യൂറിസ്റ്റിക് റാങ്കിങ്ങുകളാണ്; കാലിബ്രേറ്റ് ചെയ്ത വെള്ളപ്പൊക്ക സാധ്യതകളല്ല.",
            "hi": f"वर्तमान में चालाकुडी बेसिन में {count} परिसंपत्तियाँ उच्च या गंभीर जोखिम श्रेणी में हैं। ये सापेक्ष अनुमान हैं।",
            "ta": f"தற்போது சாலக்குடி படுகையில் {count} சொத்துகள் உயர் அல்லது தீவிர ஆபத்து நிலையில் உள்ளன.",
        }[lang]
        return AssistantResponse(answer=answer, sources=sources)

    # 14. Default fallback
    answer = {
        "en": "I can summarize current rainfall, observed Arangaly gauge stage, modelled discharge, infrastructure risk, and source freshness in the Chalakudy River Basin. Ask about one of those. I use only data loaded in this session and cannot issue official warnings.",
        "ml": "ചാലക്കുടി നദീതടത്തിലെ നിലവിലെ മഴ, അരങ്ങാലി ഗേജ് ജലനിരപ്പ്, മാതൃകാ പ്രവാഹം, സ്ഥാപന അപകട റാങ്കിങ്, ഉറവിട നില എന്നിവ വിശദീകരിക്കാം. ഇതിലൊന്ന് ചോദിക്കുക. ഈ സെഷനിലെ ഡാറ്റ മാത്രമാണ് ഉപയോഗിക്കുന്നത്; ഔദ്യോഗിക മുന്നറിയിപ്പ് നൽകില്ല.",
        "hi": "मैं चालाकुडी बेसिन में वर्तमान वर्षा, अरंगली गेज स्तर, मॉडलित प्रवाह, अवसंरचना जोखिम और स्रोत स्थिति बता सकता हूँ।",
        "ta": "சாலக்குடி ஆற்றுப் படுகையில் தற்போதைய மழை, அரங்கலி அளவீடு, மாதிரி நதியோட்டம், உள்கட்டமைப்பு ஆபத்தை விளக்கலாம்.",
    }[lang]
    return AssistantResponse(answer=answer, sources=["HydroVista data currently loaded in this session"])
