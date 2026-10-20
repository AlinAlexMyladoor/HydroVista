"use client";

import {
  FormEvent, useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bot, X, Send, LoaderCircle, Sparkles, MessageCircle,
  Mic, MicOff, Volume2, VolumeX, ChevronDown,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { api, type AssistantContext, type AssistantResponse } from "@/lib/api";

/* ─── Types ───────────────────────────────────────────────────────────────── */
type Message = {
  role: "user" | "assistant";
  text: string;
  sources?: string[];
};

/* ─── i18n copy ──────────────────────────────────────────────────────────── */
const copy = {
  en: {
    title: "HydroVista Assistant",
    sub: "AI-powered · answers from loaded session data",
    placeholder: "Ask about rainfall, gauge, risk…",
    send: "Send",
    intro:
      "I can interpret the rainfall forecast, Arangaly gauge reading, modelled discharge, infrastructure risk, and scenario inputs — including typos and abbreviations.",
    unavailable: "I couldn't reach the HydroVista service. Please try again.",
    grounded: "Data-grounded · not an official warning",
    listening: "Listening…",
    speakAloud: "Speak aloud",
    muteVoice: "Mute voice",
    suggestions: [
      "What is the latest rainfall forecast?",
      "Is the Arangaly gauge available?",
      "How many assets are high risk?",
    ],
  },
  ml: {
    title: "HydroVista സഹായം",
    sub: "AI · ഈ സെഷനിലെ ഡാറ്റ അടിസ്ഥാനം",
    placeholder: "മഴ, ഗേജ്, അപകടസാധ്യത ചോദിക്കുക…",
    send: "അയയ്ക്കുക",
    intro:
      "മഴ പ്രവചനം, അരങ്ങാലി ഗേജ്, മാതൃകാ പ്രവാഹം, സ്ഥാപന അപകടസാധ്യത, സാഹചര്യ ഇൻപുട്ടുകൾ — ഉൾപ്പെടെ ഹ്രസ്വരൂപങ്ങളും തെറ്റായ അക്ഷരവിന്യാസവും — വ്യാഖ്യാനിക്കാം.",
    unavailable:
      "HydroVista സേവനവുമായി ബന്ധപ്പെടാനായില്ല. വീണ്ടും ശ്രമിക്കുക.",
    grounded: "ഡാറ്റ അടിസ്ഥാനം · ഔദ്യോഗിക മുന്നറിയിപ്പല്ല",
    listening: "ശ്രവിക്കുന്നു…",
    speakAloud: "ഉച്ചത്തിൽ സംസാരിക്കുക",
    muteVoice: "ശബ്ദം നിശ്ശബ്ദമാക്കുക",
    suggestions: [
      "ഏറ്റവും പുതിയ മഴ പ്രവചനം എന്താണ്?",
      "അരങ്ങാലി ഗേജ് ലഭ്യമാണോ?",
      "എത്ര സ്ഥാപനങ്ങൾ ഉയർന്ന അപകടത്തിലാണ്?",
    ],
  },
  hi: {
    title: "HydroVista सहायक",
    sub: "AI-संचालित · सत्र डेटा आधारित",
    placeholder: "वर्षा, गेज या जोखिम पूछें…",
    send: "भेजें",
    intro:
      "मैं वर्षा पूर्वानुमान, अरंगली गेज, मॉडलित प्रवाह, अवसंरचना जोखिम और परिदृश्य इनपुट — संक्षेपाक्षर और टाइपो सहित — समझा सकता हूँ।",
    unavailable:
      "HydroVista सेवा से संपर्क नहीं हो सका। फिर कोशिश करें।",
    grounded: "डेटा आधारित · आधिकारिक चेतावनी नहीं",
    listening: "सुन रहा है…",
    speakAloud: "ज़ोर से बोलें",
    muteVoice: "आवाज़ बंद करें",
    suggestions: [
      "नवीनतम वर्षा पूर्वानुमान क्या है?",
      "क्या अरंगली गेज उपलब्ध है?",
      "कितनी परिसंपत्तियाँ उच्च जोखिम में हैं?",
    ],
  },
  ta: {
    title: "HydroVista உதவியாளர்",
    sub: "AI-இயக்கம் · அமர்வு தரவு அடிப்படை",
    placeholder: "மழை, அளவீடு அல்லது ஆபத்து கேளுங்கள்…",
    send: "அனுப்பு",
    intro:
      "மழை முன்னறிவிப்பு, அரங்கலி அளவீடு, மாதிரி நதியோட்டம், உள்கட்டமைப்பு ஆபத்து, சூழல் உள்ளீடுகளை — சுருக்கங்கள் மற்றும் எழுத்துப் பிழைகள் உட்பட — விளக்கலாம்.",
    unavailable:
      "HydroVista சேவையை அணுக முடியவில்லை. மீண்டும் முயற்சிக்கவும்.",
    grounded: "தரவு சார்ந்தது · அதிகாரப்பூர்வ எச்சரிக்கை அல்ல",
    listening: "கேட்கிறது…",
    speakAloud: "சத்தமாக பேசு",
    muteVoice: "குரலை அடக்கு",
    suggestions: [
      "சமீபத்திய மழை முன்னறிவிப்பு என்ன?",
      "அரங்கலி அளவீடு கிடைக்கிறதா?",
      "எத்தனை சொத்துகள் உயர் ஆபத்தில் உள்ளன?",
    ],
  },
} as const;

/* ─── Voice wave animation ────────────────────────────────────────────────── */
function VoiceWave() {
  return (
    <div className="flex items-end gap-[3px] h-4" aria-hidden>
      {[0.4, 0.7, 1, 0.7, 0.4].map((delay, i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-red-400"
          style={{
            height: "100%",
            animation: `wave-bar 0.8s ease-in-out ${delay * 0.2}s infinite`,
            transformOrigin: "bottom",
          }}
        />
      ))}
    </div>
  );
}

/* ─── Component ──────────────────────────────────────────────────────────── */
export function AssistantChat() {
  const { language, assistantOpen: open, setAssistantOpen: setOpen, analysisDrawerOpen } = useStore();
  const words = copy[language];

  /* UI state */
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [voiceOn, setVoiceOn] = useState(false);   // TTS speak-aloud toggle
  const [listening, setListening] = useState(false); // STT mic active
  const [scrolledUp, setScrolledUp] = useState(false);

  const msgEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  /* ── Data queries (only when chat is open) ── */
  const { data: forecast } = useQuery({
    queryKey: ["assistant-forecast"], queryFn: api.forecast.latest,
    enabled: open, staleTime: 5 * 60_000, retry: 1,
  });
  const { data: stage } = useQuery({
    queryKey: ["assistant-stage"], queryFn: api.forecast.stage,
    enabled: open, staleTime: 60_000, retry: 1,
  });
  const { data: discharge } = useQuery({
    queryKey: ["assistant-discharge"], queryFn: api.forecast.discharge,
    enabled: open, staleTime: 15 * 60_000, retry: 1,
  });
  const { data: exposure } = useQuery({
    queryKey: ["assistant-exposure"],
    queryFn: () => api.exposure.list({ page_size: 200 }),
    staleTime: 60_000,
    retry: 1,
  });
  const { data: status } = useQuery({
    queryKey: ["assistant-sources"], queryFn: api.forecast.dataSources,
    enabled: open, staleTime: 60_000, retry: 1,
  });

  const criticalCount = useMemo(() => {
    if (!exposure?.items?.length) return 0;
    return exposure.items.filter(
      (item) => item.risk_category === "critical" || item.risk_score >= 0.85,
    ).length;
  }, [exposure]);
  const hasCriticalRisk = criticalCount > 0;

  /* ── Build context ── */
  const context = useMemo<AssistantContext>(() => {
    const rainfall = forecast?.rainfall_accumulations?.find(
      (item) => item.window_hours === 24,
    )?.accumulation_mm;
    const highRisk =
      exposure?.meta?.pages === 1
        ? exposure.items.filter(
            (item) =>
              item.risk_category === "high" || item.risk_category === "critical",
          ).length
        : undefined;
    const sourceStatuses: AssistantContext["source_statuses"] = {};
    const sourceUpdatedAt: AssistantContext["source_updated_at"] = {};
    status?.sources?.forEach((src) => {
      const state = src.is_available
        ? "available"
        : src.last_success
        ? "stale"
        : "unavailable";
      sourceStatuses[src.name] = state;
      if (src.last_success) sourceUpdatedAt[src.name] = src.last_success;
    });
    if (forecast?.is_stale && forecast) {
      sourceStatuses["Open-Meteo forecast"] = "stale";
      if (forecast.retrieved_at)
        sourceUpdatedAt["Open-Meteo forecast"] = forecast.retrieved_at;
    }
    return {
      basin: forecast?.basin || "Chalakudy River Basin",
      rainfall_24h_mm: rainfall,
      rainfall_source: "Open-Meteo forecast",
      rainfall_updated_at: forecast?.retrieved_at,
      forecast_stale: forecast?.is_stale ?? false,
      hourly_rainfall: (forecast?.hourly || []).slice(0, 72).map((h) => ({
        time: h.time,
        precipitation_mm: h.precipitation_mm ?? 0,
        is_forecast: Boolean(h.is_forecast),
      })),
      observed_stage_m: stage?.observed_stage_m,
      observed_stage_at: stage?.observed_at,
      stage_source: stage?.source,
      stage_forecast_points: stage?.forecast?.length ?? 0,
      modelled_discharge_m3s: discharge?.daily?.find(
        (p) => p.river_discharge_m3s != null,
      )?.river_discharge_m3s,
      discharge_source: discharge?.source || "GloFAS modelled discharge",
      high_risk_assets: highRisk,
      high_risk_assets_snapshot: (exposure?.items || []).slice(0, 30).map((item) => ({
        name: item.asset_name || `${item.asset_type}`,
        asset_type: item.asset_type,
        risk_category: item.risk_category as "low" | "medium" | "high" | "critical",
        risk_score: item.risk_score,
      })),
      source_statuses: sourceStatuses,
      source_updated_at: sourceUpdatedAt,
    };
  }, [forecast, stage, discharge, exposure, status]);

  /* ── TTS: speak a message ── */
  const speak = useCallback(
    (text: string) => {
      if (!voiceOn || typeof window === "undefined" || !window.speechSynthesis)
        return;
      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang =
        language === "ml"
          ? "ml-IN"
          : language === "hi"
          ? "hi-IN"
          : language === "ta"
          ? "ta-IN"
          : "en-IN";
      utt.rate = 1.0;
      utt.pitch = 1;
      window.speechSynthesis.speak(utt);
    },
    [voiceOn, language],
  );

  /* ── STT: start mic ── */
  const startListening = useCallback(() => {
    const SR =
      typeof window !== "undefined"
        ? (window.SpeechRecognition || window.webkitSpeechRecognition)
        : null;
    if (!SR) return;
    const rec = new SR();
    rec.lang =
      language === "ml"
        ? "ml-IN"
        : language === "hi"
        ? "hi-IN"
        : language === "ta"
        ? "ta-IN"
        : "en-IN";
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    rec.onresult = (event: SpeechRecognitionEvent) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
      setListening(false);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    rec.start();
    setListening(true);
  }, [language]);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  /* ── Send message ── */
  const sendMessage = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || pending) return;
      setInput("");
      setError("");
      setPending(true);
      setMessages((cur) => [...cur, { role: "user", text: message }]);
      try {
        const response: AssistantResponse = await api.assistant.chat(
          message, language, context,
        );
        setMessages((cur) => [
          ...cur,
          {
            role: "assistant",
            text: response.answer,
            sources: response.sources,
          },
        ]);
        speak(response.answer);
      } catch {
        setError(words.unavailable);
      } finally {
        setPending(false);
      }
    },
    [pending, language, context, speak, words.unavailable],
  );

  /* ── Auto-scroll ── */
  useEffect(() => {
    if (!scrolledUp) {
      msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, scrolledUp]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setScrolledUp(el.scrollTop < el.scrollHeight - el.clientHeight - 40);
  };

  const scrollToBottom = () => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setScrolledUp(false);
  };

  /* ── Stop TTS on close ── */
  useEffect(() => {
    if (!open && typeof window !== "undefined")
      window.speechSynthesis?.cancel();
  }, [open]);

  /* ── Focus input when opened ── */
  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 80);
  }, [open]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void sendMessage(input);
  };

  const rightRailOpen = useStore((s) => s.rightRailOpen);
  const activeRoute = useStore((s) => s.activeRoute);
  const isOverviewWithRail = activeRoute === "overview" && rightRailOpen;

  const hasSpeechSupport =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const hasTTS =
    typeof window !== "undefined" && "speechSynthesis" in window;

  /* ─────────────────────────────────────────────────────────────────────── */
  return (
    <>
      {/* ── Chat panel ── */}
      {open && (
        <section
          className={`fixed z-[100] flex flex-col overflow-hidden rounded-2xl shadow-2xl border border-slate-200 dark:border-neutral-800 animate-fade-in ${
            isOverviewWithRail ? "bottom-15 right-2.5" : "bottom-22 right-6"
          }`}
          style={{
            width: "min(400px, calc(100vw - 2rem))",
            height: "min(640px, calc(100vh - 7rem))",
            background: "var(--chat-bg, #ffffff)",
          }}
          aria-label={words.title}
        >
          {/* CSS vars for dark mode inside the panel */}
          <style>{`
            .dark section[aria-label="${words.title}"] {
              --chat-bg: #000000;
              --chat-border: #262626;
              --chat-header: #0a0a0a;
              --chat-body: #050505;
              --chat-footer: #0a0a0a;
            }
          `}</style>

          {/* Header */}
          <header
            className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-[#0d111a]"
          >
            <div className="flex items-center gap-2.5">
              <span
                className="relative grid h-9 w-9 place-items-center rounded-xl"
                style={{ background: "linear-gradient(135deg,#0f8c8622,#0ea5e922)" }}
              >
                <Bot size={19} className="text-teal-600 dark:text-teal-400" />
                {/* Glow ring when voice is on */}
                {voiceOn && (
                  <span className="animate-glow-ring absolute inset-0 rounded-xl border-2 border-teal-500/50" />
                )}
              </span>
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">
                  {words.title}
                </h2>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {words.sub}
                </p>
              </div>
            </div>

            {/* Controls */}
            <div className="flex items-center gap-1">
              {/* TTS toggle */}
              {hasTTS && (
                <button
                  type="button"
                  onClick={() => {
                    setVoiceOn((v) => {
                      if (v) window.speechSynthesis?.cancel();
                      return !v;
                    });
                  }}
                  title={voiceOn ? words.muteVoice : words.speakAloud}
                  aria-label={voiceOn ? words.muteVoice : words.speakAloud}
                  className={`rounded-lg p-2 transition ${
                    voiceOn
                      ? "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300"
                      : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  }`}
                >
                  {voiceOn ? <Volume2 size={15} /> : <VolumeX size={15} />}
                </button>
              )}

              {/* Close */}
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                aria-label="Close assistant"
              >
                <X size={17} />
              </button>
            </div>
          </header>

          {/* Messages */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="relative flex-1 space-y-3 overflow-y-auto p-4 dark:bg-[#070a10]"
            style={{ background: "#f8fafc" }}
            aria-live="polite"
          >
            {/* Intro card */}
            {messages.length === 0 && (
              <div className="animate-fade-in rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-800 dark:bg-slate-900">
                <div className="mb-2 flex items-center gap-2 text-teal-700 dark:text-teal-300">
                  <Sparkles size={14} />
                  <span className="text-xs font-semibold">HydroVista AI</span>
                </div>
                <p className="text-sm leading-6 text-slate-700 dark:text-slate-200">
                  {words.intro}
                </p>
                <div className="mt-3 flex flex-col gap-1.5">
                  {words.suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => void sendMessage(s)}
                      className="rounded-lg border border-slate-200 px-2.5 py-2 text-left text-xs text-slate-700 transition hover:border-teal-500 hover:bg-teal-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-teal-950/40"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Message bubbles */}
            {messages.map((msg, i) => (
              <div
                key={`${i}-${msg.role}`}
                className={`animate-msg-pop max-w-[92%] rounded-xl px-3 py-2.5 ${
                  msg.role === "user"
                    ? "ml-auto bg-gradient-to-br from-teal-600 to-teal-700 text-white dark:from-teal-500 dark:to-teal-600"
                    : "border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                }`}
              >
                <p className="whitespace-pre-wrap text-sm leading-5">{msg.text}</p>
                {msg.sources && (
                  <p className="mt-2 border-t border-slate-200/70 pt-1.5 text-[10px] opacity-75 dark:border-slate-700">
                    {msg.sources.join(" · ")}
                  </p>
                )}
                {/* Re-speak button for assistant messages */}
                {msg.role === "assistant" && hasTTS && voiceOn && (
                  <button
                    type="button"
                    onClick={() => speak(msg.text)}
                    className="mt-1.5 flex items-center gap-1 text-[10px] text-slate-400 hover:text-teal-600 dark:hover:text-teal-400"
                    aria-label="Re-read this message"
                  >
                    <Volume2 size={10} /> replay
                  </button>
                )}
              </div>
            ))}

            {/* Typing indicator */}
            {pending && (
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <LoaderCircle className="animate-spin" size={14} />
                HydroVista is thinking…
              </div>
            )}

            {/* Error */}
            {error && (
              <p role="alert" className="text-xs text-red-700 dark:text-red-400">
                {error}
              </p>
            )}

            <div ref={msgEndRef} />
          </div>

          {/* Scroll-to-bottom pill */}
          {scrolledUp && (
            <button
              type="button"
              onClick={scrollToBottom}
              className="absolute bottom-20 left-1/2 -translate-x-1/2 z-10 flex items-center gap-1 rounded-full bg-teal-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-lg hover:bg-teal-700"
            >
              <ChevronDown size={12} /> Latest
            </button>
          )}

          {/* Input bar */}
          <form
            onSubmit={submit}
            className="shrink-0 border-t border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-[#0d111a]"
          >
            {listening && (
              <div className="mb-2 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-1.5 dark:bg-red-950/40">
                <VoiceWave />
                <span className="text-xs text-red-600 dark:text-red-400">
                  {words.listening}
                </span>
                <button
                  type="button"
                  onClick={stopListening}
                  className="ml-auto text-[10px] font-semibold text-red-600 hover:underline dark:text-red-400"
                >
                  Stop
                </button>
              </div>
            )}

            <div className="flex gap-2">
              {/* Mic button */}
              {hasSpeechSupport && (
                <button
                  type="button"
                  onClick={listening ? stopListening : startListening}
                  title={listening ? "Stop listening" : "Speak your question"}
                  aria-label={listening ? "Stop listening" : "Speak your question"}
                  className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg border transition ${
                    listening
                      ? "animate-mic-pulse border-red-400 bg-red-500 text-white"
                      : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                  }`}
                >
                  {listening ? <MicOff size={15} /> : <Mic size={15} />}
                </button>
              )}

              {/* Text input */}
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={1000}
                placeholder={listening ? words.listening : words.placeholder}
                aria-label={words.placeholder}
                className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none transition focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50 dark:placeholder:text-slate-500"
              />

              {/* Send button */}
              <button
                disabled={pending || !input.trim()}
                type="submit"
                aria-label={words.send}
                className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-teal-600 text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-teal-600 dark:text-white"
              >
                <Send size={15} />
              </button>
            </div>

            <p className="mt-2 text-center text-[10px] text-slate-500 dark:text-slate-400">
              {words.grounded}
            </p>
          </form>
        </section>
      )}

      {/* ── Floating action button (FAB): only rendered when RightRail is not present and analysis drawer is closed ── */}
      {!isOverviewWithRail && !analysisDrawerOpen && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="fixed bottom-4 right-4 z-50 inline-flex h-12 items-center gap-2.5 rounded-full px-4.5 text-xs font-bold text-white shadow-2xl transition-all hover:scale-105 active:scale-95 bg-[#0D7363] hover:bg-teal-800 dark:bg-teal-700 dark:hover:bg-teal-600 cursor-pointer ring-2 ring-white/30 dark:ring-white/15 backdrop-blur-md"
          aria-label={words.title}
          title={words.title}
          aria-expanded={open}
        >
          <MessageCircle size={17} />
          <span>{words.title}</span>
        </button>
      )}
    </>
  );
}
