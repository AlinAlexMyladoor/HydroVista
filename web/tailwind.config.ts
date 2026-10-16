import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // FloodLens AI design tokens
        background: "#F7F8F4",
        surface: "#FFFFFF",
        "surface-secondary": "#E2EDE6",
        primary: "#246B62",
        "primary-dark": "#1a4f48",
        "primary-light": "#3d9e92",
        water: "#D7EAF2",
        warning: "#D99A28",
        "warning-dark": "#b57e1e",
        text: "#26332F",
        "text-secondary": "#687770",
        border: "#DCE4DD",
        alert: "#C0392B",
        "alert-light": "#FDECEA",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        serif: ["Fraunces", "Georgia", "serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      fontSize: {
        "2xs": ["0.65rem", { lineHeight: "1rem" }],
      },
      boxShadow: {
        card: "0 1px 3px 0 rgba(38, 51, 47, 0.08), 0 1px 2px -1px rgba(38, 51, 47, 0.06)",
        panel: "0 4px 6px -1px rgba(38, 51, 47, 0.08), 0 2px 4px -2px rgba(38, 51, 47, 0.06)",
        elevated: "0 10px 15px -3px rgba(38, 51, 47, 0.08), 0 4px 6px -4px rgba(38, 51, 47, 0.06)",
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        md: "8px",
        lg: "12px",
      },
      spacing: {
        "safe-bottom": "env(safe-area-inset-bottom)",
      },
    },
  },
  plugins: [],
};

export default config;
