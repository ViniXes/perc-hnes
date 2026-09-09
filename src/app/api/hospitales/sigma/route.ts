import { NextResponse } from "next/server";

// =============================================================================
// Puente con SIGMA (Hospital Nacional Psiquiatrico "Dr. Jose Molina Martinez").
// -----------------------------------------------------------------------------
// SIGMA corre en Google Apps Script y expone SOLO su monitoreo: cuantos
// servicios entregaron su produccion y cuales faltan. Nunca viaja una cifra de
// produccion ni de insumos por aqui.
//
// PULSO lo consume desde el SERVIDOR para que la llave no llegue al navegador.
//
// Configuracion en Vercel (proyecto PULSO), Settings -> Environment Variables:
//   SIGMA_URL     = https://script.google.com/macros/s/<id>/exec
//   SIGMA_API_KEY = <la llave que devuelve crearLlaveApi() en SIGMA>
//
// Si falta cualquiera de las dos, responde 200 con configurado:false y la
// pantalla muestra "sin conexion". Nunca rompe PULSO.
// =============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
// monitoreo se abre muchas veces al dia. Cinco minutos es suficiente para que
// se sienta al instante sin quedar desactualizado.
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, { en: number; datos: RespuestaSigma }>();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mes = (searchParams.get("mes") || "").trim();
  const refrescar = searchParams.get("refrescar") === "1";

  if (mes && !/^\d{4}-\d{2}$/.test(mes)) {
    return NextResponse.json({ ok: false, error: "Parametro 'mes' invalido. Usa YYYY-MM." }, { status: 400 });
  }

  const base = (process.env.SIGMA_URL || "").trim();
  const llave = (process.env.SIGMA_API_KEY || "").trim();
  if (!base || !llave) {
    return NextResponse.json({
      ok: true,
      configurado: false,
      mensaje: "Falta configurar SIGMA_URL y SIGMA_API_KEY en las variables de entorno.",
    });
  }

  const clave = mes || "actual";
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
        error: `SIGMA respondio ${respuesta.status}.`,
      });
    }
    const datos = (await respuesta.json()) as RespuestaSigma;
    if (!datos?.ok) {
      return NextResponse.json({
        ok: false,
        configurado: true,
        error: datos?.error || "SIGMA rechazo la consulta.",
      });
    }
    cache.set(clave, { en: Date.now(), datos });
    return NextResponse.json({ ok: true, configurado: true, cacheado: false, ...datos });
  } catch (error) {
    const detalle = error instanceof Error ? error.message : "error de red";
    return NextResponse.json({ ok: false, configurado: true, error: detalle });
  }
}
