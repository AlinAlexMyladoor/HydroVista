import type { Metadata } from "next";
import "./globals.css";
import { QueryProvider } from "@/components/providers/QueryProvider";
import { ThemeProvider } from "@/components/providers/ThemeProvider";

export const metadata: Metadata = {
  title: "HydroVista — River Basin Intelligence for Safer Communities",
  description:
    "Geospatial decision-support platform for the Chalakudy River basin, Kerala. " +
    "Flood risk assessment, infrastructure exposure analysis, and connectivity modelling.",
  keywords: ["flood risk", "Kerala", "Chalakudy", "HydroVista", "river basin", "infrastructure", "geospatial"],
  authors: [{ name: "HydroVista Research" }],
  robots: "noindex, nofollow",
  icons: {
    icon: "/favicon.ico",
  },
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#155E59",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,300..700;1,14..32,300..700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased h-screen overflow-hidden bg-background text-text transition-colors duration-200">
        <ThemeProvider>
          <QueryProvider>{children}</QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
