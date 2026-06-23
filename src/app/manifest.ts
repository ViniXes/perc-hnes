import type { MetadataRoute } from "next";

// Manifest PWA (Next.js App Router genera /manifest.webmanifest a partir de esto).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PULSO — PERC HNES",
    short_name: "PULSO",
    description: "Captura mensual PERC por servicio con acceso privado.",
    start_url: "/",
    scope: "/",
    // "standalone" = se ve como app (sin barra de navegador ni URL) pero MANTIENE
    // la barra de estado del telefono (reloj, bateria, notificaciones), igual que
    // Instagram o WhatsApp.
    display: "standalone",
    display_override: ["standalone"],
    orientation: "portrait-primary",
    background_color: "#0e1626",
    theme_color: "#0e1626",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
