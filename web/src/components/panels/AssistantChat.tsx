"use client";

import { FormEvent, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bot, X, Send, LoaderCircle, Sparkles, MessageCircle } from "lucide-react";
import { useStore } from "@/lib/store";
import { api, type AssistantContext, type AssistantResponse } from "@/lib/api";

type Message = { role: "user" | "assistant"; text: string; sources?: string[] };

const copy = {
  en: { title: "HydroVista Assistant", sub: "Answers from data loaded in this session", placeholder: "Ask about rainfall, gauge, risk…", send: "Send", intro: "I can summarize the current forecast, observed Arangaly gauge reading, modelled discharge, infrastructure risk, and source freshness.", unavailable: "I couldn't reach the HydroVista service. Please try again.", grounded: "Data-grounded · not an official warning", suggestions: ["What is the latest rainfall forecast?", "Is the Arangaly gauge available?", "How many assets are high risk?"] },
  ml: { title: "HydroVista സഹായം", sub: "ഈ സെഷനിൽ ലഭ്യമായ ഡാറ്റയിൽ നിന്നുള്ള മറുപടികൾ", placeholder: "മഴ, ഗേജ്, അപകടസാധ്യത എന്നിവ ചോദിക്കുക…", send: "അയയ്ക്കുക", intro: "നിലവിലെ മഴ പ്രവചനം, അരങ്ങാലി ഗേജ് നിരീക്ഷണം, മാതൃകാ പ്രവാഹം, അടിസ്ഥാനസൗകര്യ അപകടസാധ്യത, ഉറവിട പുതുമ എന്നിവ സംഗ്രഹിക്കാം.", unavailable: "HydroVista സേവനവുമായി ബന്ധപ്പെടാനായില്ല. വീണ്ടും ശ്രമിക്കുക.", grounded: "ഡാറ്റയെ അടിസ്ഥാനമാക്കി · ഔദ്യോഗിക മുന്നറിയിപ്പല്ല", suggestions: ["ഏറ്റവും പുതിയ മഴ പ്രവചനം എന്താണ്?", "അരങ്ങാലി ഗേജ് ലഭ്യമാണോ?", "എത്ര സ്ഥാപനങ്ങൾ ഉയർന്ന അപകടത്തിലാണ്?"] },
  hi: { title: "HydroVista सहायक", sub: "इस सत्र में लोड किए गए डेटा पर आधारित उत्तर", placeholder: "वर्षा, गेज या जोखिम पूछें…", send: "भेजें", intro: "मैं वर्तमान पूर्वानुमान, अरंगली गेज, मॉडलित प्रवाह, अवसंरचना जोखिम और स्रोत की नवीनता का सार दे सकता हूँ।", unavailable: "HydroVista सेवा से संपर्क नहीं हो सका। फिर कोशिश करें।", grounded: "डेटा आधारित · आधिकारिक चेतावनी नहीं", suggestions: ["नवीनतम वर्षा पूर्वानुमान क्या है?", "क्या अरंगली गेज उपलब्ध है?", "कितनी परिसंपत्तियाँ उच्च जोखिम में हैं?"] },
  ta: { title: "HydroVista உதவியாளர்", sub: "இந்த அமர்வில் ஏற்றப்பட்ட தரவை அடிப்படையாகக் கொண்ட பதில்கள்", placeholder: "மழை, அளவீடு அல்லது ஆபத்து கேளுங்கள்…", send: "அனுப்பு", intro: "தற்போதைய முன்னறிவிப்பு, அரங்கலி அளவீடு, மாதிரி நதியோட்டம், உள்கட்டமைப்பு ஆபத்து மற்றும் தரவு புதுப்பிப்பைச் சுருக்கலாம்.", unavailable: "HydroVista சேவையை அணுக முடியவில்லை. மீண்டும் முயற்சிக்கவும்.", grounded: "தரவு சார்ந்தது · அதிகாரப்பூர்வ எச்சரிக்கை அல்ல", suggestions: ["சமீபத்திய மழை முன்னறிவிப்பு என்ன?", "அரங்கலி அளவீடு கிடைக்கிறதா?", "எத்தனை சொத்துகள் உயர் ஆபத்தில் உள்ளன?"] },
} as const;

export function AssistantChat() {
  const { language } = useStore();
  const words = copy[language];
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const { data: forecast } = useQuery({ queryKey: ["assistant-forecast"], queryFn: api.forecast.latest, enabled: open, staleTime: 5 * 60_000, retry: 1 });
  const { data: stage } = useQuery({ queryKey: ["assistant-stage"], queryFn: api.forecast.stage, enabled: open, staleTime: 60_000, retry: 1 });
  const { data: discharge } = useQuery({ queryKey: ["assistant-discharge"], queryFn: api.forecast.discharge, enabled: open, staleTime: 15 * 60_000, retry: 1 });
  const { data: exposure } = useQuery({ queryKey: ["assistant-exposure"], queryFn: () => api.exposure.list({ page_size: 200 }), enabled: open, staleTime: 60_000, retry: 1 });
  const { data: status } = useQuery({ queryKey: ["assistant-sources"], queryFn: api.forecast.dataSources, enabled: open, staleTime: 60_000, retry: 1 });

  const context = useMemo<AssistantContext>(() => {
    const rainfall = forecast?.rainfall_accumulations?.find((item) => item.window_hours === 24)?.accumulation_mm;
    const highRisk = exposure?.meta?.pages === 1 ? exposure.items.filter((item) => item.risk_category === "high" || item.risk_category === "critical").length : undefined;
    const sourceStatuses: AssistantContext["source_statuses"] = {};
    const sourceUpdatedAt: AssistantContext["source_updated_at"] = {};
    status?.sources?.forEach((source) => {
      const state = source.is_available ? "available" : source.last_success ? "stale" : "unavailable";
      sourceStatuses![source.name] = state;
      if (source.last_success) sourceUpdatedAt![source.name] = source.last_success;
    });
    if (forecast?.is_stale && forecast) {
      sourceStatuses!["Open-Meteo forecast"] = "stale";
      if (forecast.retrieved_at) sourceUpdatedAt!["Open-Meteo forecast"] = forecast.retrieved_at;
    }
    return {
      basin: forecast?.basin || "Chalakudy River Basin",
      rainfall_24h_mm: rainfall,
      rainfall_source: "Open-Meteo forecast",
      rainfall_updated_at: forecast?.retrieved_at,
      forecast_stale: forecast?.is_stale ?? false,
      observed_stage_m: stage?.observed_stage_m,
      observed_stage_at: stage?.observed_at,
      stage_source: stage?.source,
      stage_forecast_points: stage?.forecast?.length ?? 0,
      modelled_discharge_m3s: discharge?.daily?.find((point) => point.river_discharge_m3s != null)?.river_discharge_m3s,
      discharge_source: discharge?.source || "GloFAS modelled discharge",
      high_risk_assets: highRisk,
      source_statuses: sourceStatuses,
      source_updated_at: sourceUpdatedAt,
    };
  }, [forecast, stage, discharge, exposure, status]);

  const sendMessage = async (text: string) => {
    const message = text.trim();
    if (!message || pending) return;
    setInput(""); setError(""); setPending(true);
    setMessages((current) => [...current, { role: "user", text: message }]);
    try {
      const response: AssistantResponse = await api.assistant.chat(message, language, context);
      setMessages((current) => [...current, { role: "assistant", text: response.answer, sources: response.sources }]);
    } catch {
      setError(words.unavailable);
    } finally { setPending(false); }
  };

  const submit = (event: FormEvent) => { event.preventDefault(); void sendMessage(input); };

  return <>
    {open && <section className="fixed bottom-20 right-5 z-[80] flex h-[min(620px,calc(100vh-7rem))] w-[min(390px,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900" aria-label={words.title}>
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex items-center gap-2.5"><span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-400/15 dark:text-teal-300"><Bot size={19} /></span><div><h2 className="text-sm font-semibold text-slate-900 dark:text-slate-50">{words.title}</h2><p className="text-[11px] text-slate-500 dark:text-slate-400">{words.sub}</p></div></div>
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 focus-visible:outline-2 focus-visible:outline-teal-600 dark:text-slate-300 dark:hover:bg-slate-800" aria-label="Close assistant"><X size={17} /></button>
      </header>
      <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/80 p-4 dark:bg-slate-950/70" aria-live="polite">
        {messages.length === 0 && <div className="rounded-xl border border-slate-200 bg-white p-3.5 dark:border-slate-700 dark:bg-slate-900"><div className="mb-2 flex items-center gap-2 text-teal-700 dark:text-teal-300"><Sparkles size={15} /><span className="text-xs font-semibold">HydroVista</span></div><p className="text-sm leading-6 text-slate-700 dark:text-slate-200">{words.intro}</p><div className="mt-3 flex flex-col gap-1.5">{words.suggestions.map((suggestion) => <button key={suggestion} onClick={() => void sendMessage(suggestion)} className="rounded-lg border border-slate-200 px-2.5 py-2 text-left text-xs text-slate-700 hover:border-teal-500 hover:bg-teal-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-teal-950/40">{suggestion}</button>)}</div></div>}
        {messages.map((message, index) => <div key={`${index}-${message.role}`} className={`max-w-[92%] rounded-xl px-3 py-2.5 ${message.role === "user" ? "ml-auto bg-teal-700 text-white dark:bg-teal-600" : "border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"}`}><p className="whitespace-pre-wrap text-sm leading-5">{message.text}</p>{message.sources && <p className="mt-2 border-t border-slate-200/70 pt-1.5 text-[10px] opacity-75 dark:border-slate-700">{message.sources.join(" · ")}</p>}</div>)}
        {pending && <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400"><LoaderCircle className="animate-spin" size={14} /> HydroVista…</div>}
        {error && <p role="alert" className="text-xs text-red-700 dark:text-red-300">{error}</p>}
      </div>
      <form onSubmit={submit} className="border-t border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900"><div className="flex gap-2"><input value={input} onChange={(event) => setInput(event.target.value)} maxLength={1000} placeholder={words.placeholder} aria-label={words.placeholder} className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-teal-600 focus:ring-2 focus:ring-teal-600/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-50" /><button disabled={pending || !input.trim()} type="submit" aria-label={words.send} className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-teal-700 text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-teal-500 dark:text-slate-950"><Send size={16} /></button></div><p className="mt-2 text-center text-[10px] text-slate-500 dark:text-slate-400">{words.grounded}</p></form>
    </section>}
    <button type="button" onClick={() => setOpen((value) => !value)} className="fixed bottom-5 right-5 z-[80] inline-flex h-12 items-center gap-2 rounded-full bg-teal-700 px-4 text-sm font-semibold text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-teal-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600 dark:bg-teal-500 dark:text-slate-950 dark:hover:bg-teal-400" aria-label={words.title} aria-expanded={open}><MessageCircle size={18} /><span>{words.title}</span></button>
  </>;
}
