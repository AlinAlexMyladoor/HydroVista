import type { Metadata } from "next";
import "./globals.css";
import { QueryProvider } from "@/components/providers/QueryProvider";

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
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,300..700;1,14..32,300..700&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="antialiased h-screen overflow-hidden" style={{ backgroundColor: "#F7F8F4" }}>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
