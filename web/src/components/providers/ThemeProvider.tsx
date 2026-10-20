"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

type Theme = "light" | "dark";
type ThemeContextValue = { resolvedTheme: Theme; setTheme: (theme: Theme) => void };
const ThemeContext = createContext<ThemeContextValue>({ resolvedTheme: "light", setTheme: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [resolvedTheme, setResolvedTheme] = useState<Theme>("light");

  useEffect(() => {
    const stored = window.localStorage.getItem("hydrovista-theme") as Theme | null;
    // Default strictly to light theme; only use dark if explicitly selected and stored
    const initial = stored === "dark" ? "dark" : "light";
    setResolvedTheme(initial);
    document.documentElement.classList.toggle("dark", initial === "dark");
  }, []);

  const setTheme = (theme: Theme) => {
    setResolvedTheme(theme);
    window.localStorage.setItem("hydrovista-theme", theme);
    document.documentElement.classList.toggle("dark", theme === "dark");
  };

  return (
    <ThemeContext.Provider value={{ resolvedTheme, setTheme }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
