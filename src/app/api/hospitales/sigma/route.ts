import { NextResponse } from "next/server";

// =============================================================================
// Puente con los SIGMA de otros hospitales.
// -----------------------------------------------------------------------------
// Cada hospital corre su propio SIGMA en Google Apps Script y expone SOLO su
// monitoreo: cuantos servicios entregaron y cuales faltan. Nunca viaja una
// cifra de produccion ni de insumos por aqui.
//
// PULSO los consume desde el SERVIDOR para que las llaves no lleguen al
// navegador. Para sumar un hospital nuevo: se agrega una linea en HOSPITALES y
// sus dos variables de entorno en Vercel. Nada mas.
//
// Variables (Vercel > Settings > Environment Variables):
//   SIGMA_URL / SIGMA_API_KEY                        -> Psiquiatrico
//   SIGMA_SUCHITOTO_URL / SIGMA_SUCHITOTO_API_KEY    -> Suchitoto
// =============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const HOSPITALES: Record<string, { url: string; llave: string; nombre: string }> = {
  psiquiatrico: {
    url: "SIGMA_URL",
    llave: "SIGMA_API_KEY",
    nombre: 'Hospital Nacional Psiquiátrico "Dr. José Molina Martínez"',
  },
  suchitoto: {
    url: "SIGMA_SUCHITOTO_URL",
    llave: "SIGMA_SUCHITOTO_API_KEY",
    nombre: "Hospital Nacional de Suchitoto",
  },
};

type Item = { id: string; nombre: string; completo: boolean };

type RespuestaSigma = {
  ok?: boolean;
  hospital?: string;
  mes?: string;
  mesEtiqueta?: string;
  perc?: { total?: number; completos?: number; pendientes?: number; pct?: number; items?: Item[] };
  insumos?: { completo?: boolean };
  ventanas?: Record<string, { abierta?: boolean; ultimoDia?: string }>;
  error?: string;
};

// Cache en memoria del servidor: Apps Script tiene cuotas diarias y el
// monitoreo se abre muchas veces al dia. Cinco minutos alcanza para que se
// sienta al instante sin quedar desactualizado.
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, { en: number; datos: RespuestaSigma }>();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mes = (searchParams.get("mes") || "").trim();
  const refrescar = searchParams.get("refrescar") === "1";
  // Sin parametro, el Psiquiatrico: es el que ya estaba antes de sumar otros.
  const hospitalId = (searchParams.get("hospital") || "psiquiatrico").trim();

  const hospital = HOSPITALES[hospitalId];
  if (!hospital) {
    return NextResponse.json({ ok: false, error: "Hospital desconocido." }, { status: 400 });
  }
  if (mes && !/^\d{4}-\d{2}$/.test(mes)) {
    return NextResponse.json({ ok: false, error: "Parametro 'mes' invalido. Usa YYYY-MM." }, { status: 400 });
  }

  const base = (process.env[hospital.url] || "").trim();
  const llave = (process.env[hospital.llave] || "").trim();
  if (!base || !llave) {
    return NextResponse.json({
      ok: true,
      configurado: false,
      hospital: hospital.nombre,
      mensaje: `Faltan las variables ${hospital.url} y ${hospital.llave} en las variables de entorno.`,
    });
  }

  const clave = `${hospitalId}__${mes || "actual"}`;
  const guardado = cache.get(clave);
  if (!refrescar && guardado && Date.now() - guardado.en < CACHE_MS) {
    return NextResponse.json({ ok: true, configurado: true, cacheado: true, ...guardado.datos });
  }

  const url = new URL(base);
  url.searchParams.set("accion", "monitoreo");
  url.searchParams.set("key", llave);
  if (mes) url.searchParams.set("mes", mes);

  try {
    const respuesta = await fetch(url.toString(), {
      // Apps Script responde con una redireccion a googleusercontent: hay que seguirla.
      redirect: "follow",
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!respuesta.ok) {
      return NextResponse.json({
        ok: false,
        configurado: true,
        error: `SIGMA respondió ${respuesta.status}.`,
      });
    }
    const datos = (await respuesta.json()) as RespuestaSigma;
    if (!datos?.ok) {
      return NextResponse.json({
        ok: false,
        configurado: true,
        error: datos?.error || "SIGMA rechazó la consulta.",
      });
    }
    cache.set(clave, { en: Date.now(), datos });
    return NextResponse.json({ ok: true, configurado: true, cacheado: false, ...datos });
  } catch (error) {
    const detalle = error instanceof Error ? error.message : "error de red";
    return NextResponse.json({ ok: false, configurado: true, error: detalle });
  }
}
