import type { Metadata, Viewport } from "next";
import { DM_Sans } from "next/font/google";
import "./globals.css";
import ServiceWorkerRegister from "./sw-register";

// TIPOGRAFIA DE PULSO. DM Sans: suave, de formas abiertas y muy comoda de leer
// en los tamanos chicos que usan los tabuladores y el menu. Se carga desde el
// servidor de la aplicacion (next/font la descarga en el build), asi que no
// depende de que el navegador tenga internet ni de Google en tiempo de uso.
const fuentePulso = DM_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
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
    <html lang="es" className={`${fuentePulso.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-white text-slate-900 dark:bg-slate-950 dark:text-slate-100">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
