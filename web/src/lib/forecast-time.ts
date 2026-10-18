import type { HourlyWeather } from "@/lib/api";

/** Keep the map and forecast controls on the same timestamped hourly series. */
export function getTimelineForecast(hourly: HourlyWeather[] | undefined, now = Date.now()) {
  return (hourly ?? []).filter((point) => {
    const timestamp = Date.parse(point.time);
    return Number.isFinite(timestamp) && timestamp >= now - 60 * 60_000;
  });
}

export function getForecastPointAt(hourly: HourlyWeather[] | undefined, hour: number, now = Date.now()) {
  const timeline = getTimelineForecast(hourly, now);
  return timeline[Math.min(Math.max(0, hour), Math.max(0, timeline.length - 1))];
}

export function formatForecastTimestamp(time: string, language: "en" | "ml") {
  return new Date(time).toLocaleString(language === "en" ? "en-IN" : "ml-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}
