import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#F4F8FA",
        surface: "#FFFFFF",
        "surface-secondary": "#E5F1F2",
        primary: "#087F8C",
        "primary-dark": "#075B66",
        "primary-light": "#28A9B5",
        water: "#4BB7D8",
        warning: "#E5A23B",
        "warning-dark": "#B97818",
        text: "#19333D",
        "text-secondary": "#607783",
        border: "#D5E3E8",
        alert: "#D64545",
        "alert-light": "#FDECEC",
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
