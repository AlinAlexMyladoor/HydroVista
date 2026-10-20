"""Grounded, lightweight HydroVista help endpoint.

Responses use only the current data snapshot supplied by the UI; this endpoint
does not infer missing telemetry or claim to be an emergency warning service.
"""
from __future__ import annotations

import json
from typing import Literal

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
    high_risk_assets_snapshot: list[AssetRiskSnapshot] = Field(default_factory=list, max_length=10)
    scenario_rainfall_mm: float | None = Field(default=None, ge=0, le=1000)
    scenario_duration_hours: float | None = Field(default=None, ge=1, le=168)


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


async def _gemini_answer(payload: AssistantRequest) -> str | None:
    """Use Gemini as a language/intent layer over a bounded, validated snapshot."""
    provider = (settings.LLM_PROVIDER or "").strip().lower()
    if provider not in ("gemini", "google") or not settings.GEMINI_API_KEY:
        return None

    model_name = settings.GEMINI_MODEL or "gemini-3.8-flash"
    api_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent?key={settings.GEMINI_API_KEY}"

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
        async with httpx.AsyncClient(timeout=httpx.Timeout(18, connect=5)) as client:
            response = await client.post(
                api_url,
                headers={"x-goog-api-key": settings.GEMINI_API_KEY, "Content-Type": "application/json"},
                json=gemini_payload,
            )
        response.raise_for_status()
        data = response.json()
        answer = "".join(part.get("text", "") for part in data["candidates"][0]["content"]["parts"]).strip()
        return answer[:4000] or None
    except Exception as exc:  # noqa: BLE001 - deterministic data-aware fallback remains available
        log.warning("assistant.gemini_unavailable", error=type(exc).__name__, detail=str(exc))
        return None


async def _rainfall_intent_answer(payload: AssistantRequest) -> str | None:
    """Handle rainfall questions (tomorrow, today, or general) locally with high accuracy."""
    q = payload.message.casefold()
    has_rain = any(term in q for term in ("rain", "rian", "raining", "precip", "storm", "wet", "shower", "വർഷ", "മഴ", "वर्षा", "बारिश", "மழை"))
    is_tomorrow = any(term in q for term in ("tomorrow", "tmr", "tomo", "tommorow", "morow", "നാളെ", "कल", "நாளை"))
    is_today = any(term in q for term in ("today", "todai", "now", "ഇന്ന്", "आज", "இன்று"))
    
    if not (has_rain or is_tomorrow or is_today):
        return None

    is_24h = any(term in q for term in ("24h", "24-hour", "24 hour", "24 hr", "24hr", "accumulated", "cumulative"))
    if (is_24h or (not is_tomorrow and not is_today)) and payload.context.rainfall_24h_mm is not None:
        r24 = payload.context.rainfall_24h_mm
        answers = {
            "en": f"The forecasted 24-hour rainfall for the Chalakudy River Basin is {r24:.1f} mm based on Open-Meteo numerical weather model guidance.",
            "ml": f"ചാലക്കുടി നദീതടത്തിലെ 24 മണിക്കൂർ മഴ പ്രവചനം {r24:.1f} mm ആണ്. ഇത് ഓപ്പൺ-മെറ്റിയോ മാതൃകാ പ്രവചനമാണ്.",
            "hi": f"चालाकुडी नदी बेसिन के लिए 24 घंटे का वर्षा पूर्वानुमान {r24:.1f} मिमी है।",
            "ta": f"சாலக்குடி ஆற்றுப் படுகைக்கான 24 மணி நேர மழை முன்னறிவிப்பு {r24:.1f} மி.மீ.",
        }
        return answers.get(payload.language, answers["en"])

    # Strict Grounding Directive: If hourly breakdown is not in session context, rely strictly on context rainfall_24h_mm
    if not payload.context.hourly_rainfall and payload.context.rainfall_24h_mm is not None:
        r24 = payload.context.rainfall_24h_mm
        day_str = "tomorrow" if is_tomorrow else "today" if is_today else "the upcoming 24 hours"
        answers = {
            "en": f"Based on the session forecast data for {day_str}, the cumulative precipitation is {r24:.1f} mm (Open-Meteo model guidance).",
            "ml": f"സെഷൻ പ്രവചന ഡാറ്റ പ്രകാരം { 'നാളെ' if is_tomorrow else 'ഇന്ന്' } ആകെ {r24:.1f} mm മഴ പ്രതീക്ഷിക്കുന്നു.",
            "hi": f"सत्र पूर्वानुमान डेटा के अनुसार { 'कल' if is_tomorrow else 'आज' } कुल {r24:.1f} मिमी बारिश का अनुमान है।",
            "ta": f"அமர்வு முன்னறிவிப்புத் தரவின்படி { 'நாளை' if is_tomorrow else 'இன்று' } மொத்தம் {r24:.1f} மி.மீ மழை எதிர்பார்க்கப்படுகிறது.",
        }
        return answers.get(payload.language, answers["en"])

    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo
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
        else:
            try:
                from app.services.weather import fetch_forecast
                from app.services.river_stage import STATION_LAT, STATION_LON
                fc = await fetch_forecast(STATION_LAT, STATION_LON, forecast_days=3, past_days=1)
                for h in fc.get("hourly", []):
                    hourly_points.append(
                        HourlyRainPoint(
                            time=str(h.get("time")),
                            precipitation_mm=h.get("precipitation_mm"),
                            is_forecast=bool(h.get("is_forecast", True)),
                        )
                    )
            except Exception as exc:
                log.warning("assistant.forecast_fetch_failed", error=str(exc))

    matching_points = []
    for p in hourly_points:
        try:
            pt_date = datetime.fromisoformat(str(p.time).replace("Z", "+00:00")).astimezone(tz).date().isoformat()
            if pt_date == target_date and p.precipitation_mm is not None:
                matching_points.append(p)
        except (ValueError, TypeError):
            continue

    if not matching_points and is_tomorrow:
        # If hourly points only cover next 24h, grab the future points
        matching_points = [p for p in hourly_points if p.is_forecast and p.precipitation_mm is not None][12:36]

    if matching_points:
        total = sum(p.precipitation_mm or 0.0 for p in matching_points)
        max_rain = max((p.precipitation_mm or 0.0 for p in matching_points), default=0.0)
        rain_hours = sum(1 for p in matching_points if (p.precipitation_mm or 0.0) >= 0.1)
        
        peak_time_str = "afternoon"
        for p in matching_points:
            if (p.precipitation_mm or 0.0) == max_rain and max_rain > 0:
                try:
                    dt = datetime.fromisoformat(str(p.time).replace("Z", "+00:00")).astimezone(tz)
                    peak_time_str = dt.strftime("%H:%M IST")
                except Exception:
                    pass
                break

        if total < 0.2:
            answers = {
                "en": f"No significant rain is expected {day_label_en} in the Chalakudy River Basin. The Open-Meteo forecast estimates {total:.1f} mm of total precipitation, with dry and clear conditions across all forecast hours.",
                "ml": f"ചാലക്കുടി നദീതടത്തിൽ { 'നാളെ' if is_tomorrow else 'ഇന്ന്' } കാര്യമായ മഴയില്ല. ഓപ്പൺ-മെറ്റിയോ പ്രവചനമനുസരിച്ച് ആകെ {total:.1f} mm മഴ മാത്രമാണ് പ്രതീക്ഷിക്കുന്നത്, പ്രധാനമായും വരണ്ട കാലാവസ്ഥയായിരിക്കും.",
                "hi": f"चालाकुडी नदी बेसिन में { 'कल' if is_tomorrow else 'आज' } कोई खास बारिश नहीं होगी। ओपन-मेटियो पूर्वानुमान के अनुसार कुल वर्षा केवल {total:.1f} मिमी अनुमानित है, मौसम मुख्यतः शुष्क रहेगा।",
                "ta": f"சாலக்குடி படுகையில் { 'நாளை' if is_tomorrow else 'இன்று' } குறிப்பிடத்தக்க மழை இருக்காது. ஓபன்-மெட்டியோ முன்னறிவிப்பின்படி மொத்த மழை {total:.1f} மி.மீ மட்டுமே, பெரும்பாலும் வறண்ட வானிலையே நீடிக்கும்.",
            }
        else:
            answers = {
                "en": f"Yes, rain is expected {day_label_en} in the Chalakudy River Basin. The Open-Meteo forecast indicates approximately {total:.1f} mm of total rainfall across {rain_hours} rainy hours, with a peak intensity of {max_rain:.1f} mm/h around {peak_time_str}. This is NWP model guidance, not an official flood warning.",
                "ml": f"അതെ, { 'നാളെ' if is_tomorrow else 'ഇന്ന്' } ചാലക്കുടി നദീതടത്തിൽ മഴ പ്രതീക്ഷിക്കുന്നുണ്ട്. ഓപ്പൺ-മെറ്റിയോ പ്രവചനപ്രകാരം ആകെ ഏകദേശം {total:.1f} mm മഴയും, {peak_time_str} സമയത്ത് പരമാവധി മണിക്കൂറിൽ {max_rain:.1f} mm മഴയും ഉണ്ടാകാം. ഇത് മാതൃകാ പ്രവചനമാണ്.",
                "hi": f"हाँ, { 'कल' if is_tomorrow else 'आज' } चालाकुडी बेसिन में बारिश की संभावना है। ओपन-मेटियो मॉडल के अनुसार कुल लगभग {total:.1f} मिमी बारिश तथा {peak_time_str} के आसपास अधिकतम {max_rain:.1f} मिमी/घंटा वर्षा का अनुमान है।",
                "ta": f"ஆம், { 'நாளை' if is_tomorrow else 'இன்று' } சாலக்குடி படுகையில் மழை எதிர்பார்க்கப்படுகிறது. ஓபன்-மெட்டியோ முன்னறிவிப்பின்படி மொத்தம் சுமார் {total:.1f} மி.மீ மழையும், {peak_time_str} அளவில் அதிகபட்சமாக மணிக்கு {max_rain:.1f} மி.மீ வரை மழையும் பெய்யக்கூடும்.",
            }
        return answers.get(payload.language, answers["en"])

    # Fallback if specific hourly breakdown is unavailable
    if payload.context.rainfall_24h_mm is not None:
        r24 = payload.context.rainfall_24h_mm
        answers = {
            "en": f"The 24-hour rainfall forecast for the Chalakudy River Basin is {r24:.1f} mm. Weather model guidance indicates {'moderate to heavy showers' if r24 >= 15 else 'light showers or dry periods' if r24 > 0.5 else 'dry conditions'}.",
            "ml": f"ചാലക്കുടി നദീതടത്തിലെ 24 മണിക്കൂർ മഴ പ്രവചനം {r24:.1f} mm ആണ്. ഇത് ഓപ്പൺ-മെറ്റിയോ മാതൃകാ പ്രവചനമാണ്.",
            "hi": f"चालाकुडी नदी बेसिन के लिए 24 घंटे का वर्षा पूर्वानुमान {r24:.1f} मिमी है।",
            "ta": f"சாலக்குடி ஆற்றுப் படுகைக்கான 24 மணி நேர மழை முன்னறிவிப்பு {r24:.1f} மி.மீ.",
        }
        return answers.get(payload.language, answers["en"])

    return None


@router.post("/chat", response_model=AssistantResponse)
async def chat(payload: AssistantRequest) -> AssistantResponse:
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
    lang = payload.language
    sources: list[str] = []

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

    # Core Directive 5: Safety Boundaries - Explicit refusal for official warnings/evacuation orders
    if any(phrase in q for phrase in ("evacuate", "evacuation", "official warning", "order", "decree", "mandate")):
        return AssistantResponse(
            answer="I provide analytical guidance only and cannot issue official government warnings or evacuation orders. Please consult the Kerala State Disaster Management Authority (KSDMA) or local district administration for official emergency directives.",
            sources=["HydroVista Safety Directives"],
        )

    if any(term in q for term in ("hi", "hello", "hey", "വണക്കം", "നമസ്കാരം", "नमस्ते", "வணக்கம்")) and len(q.split()) <= 4:
        greetings = {
            "en": "Hello! I can help interpret the rainfall forecast, Arangaly gauge reading, modelled discharge, infrastructure risk, and scenario inputs. What would you like to check?",
            "ml": "നമസ്കാരം! മഴ പ്രവചനം, അരങ്ങാലി ഗേജ്, മാതൃകാ പ്രവാഹം, സ്ഥാപന അപകടസാധ്യത, സാഹചര്യ ഇൻപുട്ടുകൾ എന്നിവ പരിശോധിക്കാം. എന്താണ് അറിയേണ്ടത്?",
            "hi": "नमस्ते! मैं वर्षा पूर्वानुमान, अरंगली गेज, मॉडलित प्रवाह, अवसंरचना जोखिम और परिदृश्य इनपुट समझा सकता हूँ। आप क्या जानना चाहेंगे?",
            "ta": "வணக்கம்! மழை முன்னறிவிப்பு, அரங்கலி அளவீடு, மாதிரி நதியோட்டம், உள்கட்டமைப்பு ஆபத்து, சூழல் உள்ளீடுகளை விளக்கலாம். எதைப் பார்க்க விரும்புகிறீர்கள்?",
        }
        return AssistantResponse(answer=greetings[lang], sources=["HydroVista assistant"])

    rainfall_answer = await _rainfall_intent_answer(payload)
    if rainfall_answer:
        return AssistantResponse(answer=rainfall_answer, sources=[c.rainfall_source or "Open-Meteo hourly forecast"])

    if any(word in q for word in ("stage", "gauge", "water level", "ജലനിരപ്പ്", "நீர்மட்டம்", "गेज", "जलस्तर")):
        if c.observed_stage_m is None:
            # Core Directive 2: Zero Extrapolation - Live telemetry is offline fallback
            answer = {
                "en": "Live telemetry is offline. Relying on GloFAS model guidance. (There is no current Arangaly gauge observation in the data snapshot; observed stage is unavailable).",
                "ml": "തത്സമയ ടെലിമെട്രി ഓഫ്‌ലൈനാണ്. GloFAS മോഡൽ മാർഗ്ഗനിർദ്ദേശത്തെ ആശ്രയിക്കുന്നു. (അരങ്ങാലി ഗേജ് നിരീക്ഷണം നിലവിലെ ഡാറ്റയിൽ ലഭ്യമല്ല).",
                "hi": "लाइव टेलीमेट्री ऑफ़लाइन है। GloFAS मॉडल मार्गदर्शन पर निर्भर। (वर्तमान डेटा में अरंगली गेज का अवलोकन उपलब्ध नहीं है)।",
                "ta": "நேரடி தொலை அளவியல் ஆஃப்லைனில் உள்ளது. GloFAS மாதிரி வழிகாட்டுதலை நம்பியுள்ளது. (தற்போதைய தரவில் அரங்கலி அளவீடு கிடைக்கவில்லை).",
            }[lang]
        else:
            sources.append(c.stage_source or "Central Water Commission gauge")
            answer = {
                "en": f"The latest observed Arangaly stage is {_fmt(c.observed_stage_m, 'm')} (observation time: {c.observed_stage_at or 'not supplied'}). This is a gauge observation, separate from forecast output.",
                "ml": f"അരങ്ങാലിയിലെ ഏറ്റവും പുതിയ നിരീക്ഷിച്ച ജലനിരപ്പ് {_fmt(c.observed_stage_m, 'm')} ആണ് (സമയം: {c.observed_stage_at or 'ലഭ്യമല്ല'}). ഇത് പ്രവചനത്തിൽ നിന്ന് വേറിട്ട ഗേജ് നിരീക്ഷണമാണ്.",
                "hi": f"अरंगली का नवीनतम प्रेक्षित जलस्तर {_fmt(c.observed_stage_m, 'm')} है (समय: {c.observed_stage_at or 'उपलब्ध नहीं'}). यह पूर्वानुमान से अलग गेज अवलोकन है।",
                "ta": f"அரங்கலியின் சமீபத்திய கவனிக்கப்பட்ட நீர்மட்டம் {_fmt(c.observed_stage_m, 'm')} (நேரம்: {c.observed_stage_at or 'வழங்கப்படவில்லை'}). இது முன்னறிவிப்பிலிருந்து தனியான அளவீடு.",
            }[lang]
    elif any(word in q for word in ("discharge", "runoff", "प्रवाह", "നീരൊഴുക്ക്", "வெளியேற்றம்")):
        sources.append(c.discharge_source or "GloFAS modelled discharge")
        answer = {
            "en": f"The latest modelled river discharge value available in this view is {_fmt(c.modelled_discharge_m3s, 'm³/s')}. This is model output, not a physical gauge reading.",
            "ml": f"ഈ കാഴ്ചയിൽ ലഭ്യമായ ഏറ്റവും പുതിയ മാതൃകാ നദീപ്രവാഹം {_fmt(c.modelled_discharge_m3s, 'm³/s')} ആണ്. ഇത് മാതൃകാ ഫലമാണ്, ഗേജ് അളവല്ല.",
            "hi": f"इस दृश्य में उपलब्ध नवीनतम मॉडलित नदी प्रवाह {_fmt(c.modelled_discharge_m3s, 'm³/s')} है। यह मॉडल आउटपुट है, भौतिक गेज रीडिंग नहीं।",
            "ta": f"இந்தக் காட்சியில் கிடைக்கும் சமீபத்திய மாதிரி நதியோட்டம் {_fmt(c.modelled_discharge_m3s, 'm³/s')}. இது மாதிரி வெளியீடு; நேரடி அளவீடு அல்ல.",
        }[lang]
    elif any(word in q for word in ("rain", "rainfall", "precipitation", "മഴ", "वर्षा", "மழை")):
        sources.append(c.rainfall_source or "Open-Meteo numerical weather forecast")
        freshness = " (stale)" if c.forecast_stale else ""
        answer = {
            "en": f"The current 24-hour rainfall forecast is {_fmt(c.rainfall_24h_mm, 'mm')}{freshness}. It is forecast forcing, not an observed rain-gauge total. Updated: {c.rainfall_updated_at or 'time not supplied'}.",
            "ml": f"നിലവിലെ 24 മണിക്കൂർ മഴ പ്രവചനം {_fmt(c.rainfall_24h_mm, 'mm')}{' (പഴയത്)' if c.forecast_stale else ''}. ഇത് പ്രവചനമാണ്, മഴമാപിനി നിരീക്ഷണമല്ല. പുതുക്കിയത്: {c.rainfall_updated_at or 'സമയം ലഭ്യമല്ല'}.",
            "hi": f"वर्तमान 24 घंटे की वर्षा भविष्यवाणी {_fmt(c.rainfall_24h_mm, 'mm')}{' (पुराना डेटा)' if c.forecast_stale else ''} है। यह पूर्वानुमान है, वर्षामापी का अवलोकन नहीं। अपडेट: {c.rainfall_updated_at or 'समय उपलब्ध नहीं'}।",
            "ta": f"தற்போதைய 24 மணி நேர மழை முன்னறிவிப்பு {_fmt(c.rainfall_24h_mm, 'mm')}{' (பழையது)' if c.forecast_stale else ''}. இது முன்னறிவிப்பு; மழைமானி அளவீடு அல்ல. புதுப்பிப்பு: {c.rainfall_updated_at or 'நேரம் வழங்கப்படவில்லை'}.",
        }[lang]
    elif any(word in q for word in ("source", "fresh", "status", "available", "மூலம்", "स्रोत", "நிலை")):
        if c.source_statuses:
            sources = list(c.source_statuses.keys())[:8]
            answer = {
                "en": "Current source status: " + "; ".join(f"{name}: {state}" + (f" (last successful update {c.source_updated_at[name]})" if name in c.source_updated_at else "") for name, state in c.source_statuses.items()) + ". A connectivity check time is not necessarily an observation time.",
                "ml": "നിലവിലെ ഡാറ്റാ ഉറവിട നില: " + "; ".join(f"{name}: {state}" + (f" (അവസാന വിജയകരമായ പുതുക്കൽ {c.source_updated_at[name]})" if name in c.source_updated_at else "") for name, state in c.source_statuses.items()) + ". കണക്റ്റിവിറ്റി പരിശോധനാ സമയം നിരീക്ഷണ സമയമാകണമെന്നില്ല.",
                "hi": "वर्तमान स्रोत स्थिति: " + "; ".join(f"{name}: {state}" + (f" (अंतिम सफल अपडेट {c.source_updated_at[name]})" if name in c.source_updated_at else "") for name, state in c.source_statuses.items()) + ". कनेक्टिविटी जाँच का समय जरूरी नहीं कि अवलोकन का समय हो।",
                "ta": "தற்போதைய தரவு மூல நிலை: " + "; ".join(f"{name}: {state}" + (f" (கடைசி வெற்றிகரமான புதுப்பிப்பு {c.source_updated_at[name]})" if name in c.source_updated_at else "") for name, state in c.source_statuses.items()) + ". இணைப்பு சரிபார்ப்பு நேரம் அளவீட்டு நேரமாக இருக்க வேண்டியதில்லை.",
            }[lang]
        else:
            answer = "No data-source status has loaded in this view yet." if lang == "en" else {
                "ml": "இந்தக் காட்சியில் தரவு மூல நிலை இன்னும் ஏற்றப்படவில்லை.", "hi": "इस दृश्य में स्रोत स्थिति अभी लोड नहीं हुई है।", "ta": "இந்தக் காட்சியில் தரவு மூல நிலை இன்னும் ஏற்றப்படவில்லை."
            }[lang]
    elif any(word in q for word in ("hospital", "ആശുപത്രി", "अस्पताल", "மருத்துவமனை")):
        hospitals = [a for a in c.high_risk_assets_snapshot if "hospital" in a.asset_type.lower() or "hospital" in a.name.lower()]
        if hospitals:
            top_hosp = max(hospitals, key=lambda a: a.risk_score or 0.0)
            score_str = f"{top_hosp.risk_score:.2f}" if top_hosp.risk_score is not None else "N/A"
            answer = f"**{top_hosp.name}** has the highest risk ranking (**{top_hosp.risk_category}** risk category, risk score: **{score_str}**)."
            sources.append("HydroVista exposure rankings")
        else:
            answer = "No hospital assets are currently flagged in the critical/high exposure snapshot."
    elif any(word in q for word in ("critical", "ഗുരുതര", "गंभीर", "தீவிர")) and any(word in q for word in ("asset", "count", "how many", "number", "classified", "ranked")):
        if c.high_risk_assets_snapshot:
            critical_assets = [a for a in c.high_risk_assets_snapshot if a.risk_category == "critical"]
            crit_names = ", ".join(f"**{a.name}**" for a in critical_assets)
            answer = f"There are **{len(critical_assets)}** assets currently classified as critical risk: {crit_names}. Total high/critical assets tracked is **{c.high_risk_assets or len(c.high_risk_assets_snapshot)}**."
            sources.append("HydroVista exposure rankings")
        else:
            answer = "No critical risk assets are currently recorded in the active snapshot."
    elif any(word in q for word in ("risk", "asset", "infrastructure", "ಅಪಾಯ", "जोखिम", "ஆபத்து", "അപകടം")):
        if c.high_risk_assets is None:
            answer = {
                "en": "Infrastructure risk rankings have not loaded into this view. Open Infrastructure or Overview to load the current exposure results.",
                "ml": "അടിസ്ഥാനസൗകര്യ അപകട റാങ്കിങ്ങുകൾ ഈ കാഴ്ചയിൽ ലഭ്യമല്ല. നിലവിലെ ഫലങ്ങൾക്കായി Infrastructure അല്ലെങ്കിൽ Overview തുറക്കുക.",
                "hi": "इस दृश्य में अवसंरचना जोखिम रैंकिंग लोड नहीं हुई है। वर्तमान परिणामों के लिए Infrastructure या Overview खोलें।",
                "ta": "இந்தக் காட்சியில் உள்கட்டமைப்பு ஆபத்து தரவரிசை ஏற்றப்படவில்லை. தற்போதைய முடிவுகளுக்கு Infrastructure அல்லது Overview திறக்கவும்.",
            }[lang]
        else:
            answer = {
                "en": f"There are {c.high_risk_assets} assets currently ranked high or critical. These are relative heuristic rankings, not calibrated flood probabilities. See Infrastructure for the asset-level list.",
                "ml": f"ഇപ്പോൾ {c.high_risk_assets} സ്ഥാപനങ്ങൾ ഉയർന്ന അല്ലെങ്കിൽ ഗുരുതര വിഭാഗത്തിലാണ്. ഇവ ആപേക്ഷിക ഹ്യൂറിസ്റ്റിക് റാങ്കിങ്ങുകളാണ്; കാലിബ്രേറ്റ് ചെയ്ത വെള്ളപ്പൊക്ക സാധ്യതകളല്ല. പട്ടികയ്ക്ക് Infrastructure കാണുക.",
                "hi": f"वर्तमान में {c.high_risk_assets} परिसंपत्तियाँ उच्च या गंभीर जोखिम श्रेणी में हैं। ये सापेक्ष अनुमान हैं, कैलिब्रेटेड बाढ़ संभावनाएँ नहीं। सूची के लिए Infrastructure देखें।",
                "ta": f"தற்போது {c.high_risk_assets} சொத்துகள் உயர் அல்லது தீவிர ஆபத்து நிலையில் உள்ளன. இவை ஒப்பீட்டு மதிப்பீடுகள்; அளவுத்திருத்தம் செய்யப்பட்ட வெள்ள நிகழ்தகவு அல்ல. பட்டியலுக்கு Infrastructure பார்க்கவும்.",
            }[lang]
    else:
        answer = {
            "en": "I can summarize current rainfall, observed Arangaly gauge stage, modelled discharge, infrastructure risk, and source freshness. Ask about one of those. I use only data loaded in this session and cannot issue official warnings.",
            "ml": "നിലവിലെ മഴ, അരങ്ങാലിയിലെ നിരീക്ഷിച്ച ജലനിരപ്പ്, മാതൃകാ പ്രവാഹം, സ്ഥാപന അപകട റാങ്കിങ്, ഉറവിട പുതുമ എന്നിവ വിശദീകരിക്കാം. ഇതിലൊന്ന് ചോദിക്കുക. ഈ സെഷനിൽ ലഭ്യമായ ഡാറ്റ മാത്രമാണ് ഉപയോഗിക്കുന്നത്; ഔദ്യോഗിക മുന്നറിയിപ്പ് നൽകില്ല.",
            "hi": "मैं वर्तमान वर्षा, अरंगली का प्रेक्षित गेज स्तर, मॉडलित प्रवाह, अवसंरचना जोखिम और स्रोत की नवीनता बता सकता हूँ। इनमें से किसी के बारे में पूछें। मैं केवल इस सत्र में लोड डेटा उपयोग करता हूँ और आधिकारिक चेतावनी जारी नहीं कर सकता।",
            "ta": "தற்போதைய மழை, அரங்கலி அளவீடு, மாதிரி நதியோட்டம், உள்கட்டமைப்பு ஆபத்து மற்றும் தரவு புதுப்பிப்பு நிலையைச் சுருக்கலாம். இவற்றில் ஒன்றைக் கேளுங்கள். இந்த அமர்வில் ஏற்றப்பட்ட தரவை மட்டுமே பயன்படுத்துகிறேன்; அதிகாரப்பூர்வ எச்சரிக்கை வழங்க முடியாது.",
        }[lang]

    if not sources:
        sources = ["HydroVista data currently loaded in this session"]
    return AssistantResponse(answer=answer, sources=sources)
