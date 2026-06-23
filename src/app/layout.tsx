import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegister from "./sw-register";

const geistSans = Geist({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PULSO — PERC HNES",
  description: "Captura mensual PERC por servicio con acceso privado.",
  applicationName: "PULSO",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "PULSO",
  },
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

// Viewport responsivo: device-width + viewport-fit=cover para adaptarse a
// CUALQUIER tamano de pantalla movil (incluye notch/safe-area).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0e1626",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className={`${geistSans.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
