import { NextResponse } from "next/server";

// =============================================================================
// Puente con ESDOMED SERVICES (el sistema hermano de PULSO).
// -----------------------------------------------------------------------------
// Services expone tableros de SOLO LECTURA con la produccion real del hospital.
// PULSO los consume desde el SERVIDOR (nunca desde el navegador) para que la
// llave de integracion no viaje al cliente ni quede en el repositorio.
//
// Configuracion en Vercel (proyecto PULSO), Settings -> Environment Variables:
//   SERVICES_API_URL = https://<dominio-de-esdomed-services>
//   SERVICES_API_KEY = <llave que entrega ESDOMED>
//
// Si falta cualquiera de las dos, la ruta responde 200 con configurado:false y
// el consolidado sigue funcionando (esos renglones quedan en 0). Nunca rompe.
// =============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tablero de Services -> que representa. Los tres primeros devuelven EGRESOS
// (total = vivos + fallecidos); apoyo-riiss devuelve INGRESOS.
const TABLEROS = ["medicina-interna", "cirugia", "convenios", "apoyo-riiss"] as const;
type TableroId = (typeof TABLEROS)[number];

function baseUrl(): string {
  return (process.env.SERVICES_API_URL || "").trim().replace(/\/+$/, "");
}

function apiKey(): string {
  return (process.env.SERVICES_API_KEY || "").trim();
}

/** Pide UN tablero para un mes "YYYY-MM" y devuelve su total (o null si falla). */
async function fetchTotal(
  tablero: TableroId,
  mes: string,
  refrescar: boolean,
): Promise<{ total: number | null; error?: string }> {
  const url = new URL(`${baseUrl()}/api/integraciones/tableros/${tablero}`);
  url.searchParams.set("mes", mes);
  if (refrescar) url.searchParams.set("refrescar", "1");

  try {
    const response = await fetch(url.toString(), {
      headers: { "x-api-key": apiKey(), Accept: "application/json" },
      cache: "no-store",
      // Si Services tarda demasiado no dejamos colgado el consolidado.
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      return { total: null, error: `HTTP ${response.status}` };
    }

    const data = (await response.json()) as { total?: unknown };
    const total = Number(data?.total);
    return Number.isFinite(total) ? { total } : { total: null, error: "sin total" };
  } catch (error) {
    const detalle = error instanceof Error ? error.message : "error de red";
    return { total: null, error: detalle };
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mes = (searchParams.get("mes") || "").trim();
  const refrescar = searchParams.get("refrescar") === "1";

  if (!/^\d{4}-\d{2}$/.test(mes)) {
    return NextResponse.json(
      { ok: false, error: "Parametro 'mes' invalido. Usa YYYY-MM." },
      { status: 400 },
    );
  }

  if (!baseUrl() || !apiKey()) {
    // No configurado todavia: no es un error para el consolidado.
    return NextResponse.json({
      ok: true,
      configurado: false,
      mes,
      totales: {},
      mensaje:
        "Falta configurar SERVICES_API_URL y SERVICES_API_KEY en las variables de entorno.",
    });
  }

  const resultados = await Promise.all(
    TABLEROS.map(async (tablero) => [tablero, await fetchTotal(tablero, mes, refrescar)] as const),
  );

  const totales: Record<string, number> = {};
  const errores: Record<string, string> = {};

  for (const [tablero, resultado] of resultados) {
    if (resultado.total !== null) totales[tablero] = resultado.total;
    else if (resultado.error) errores[tablero] = resultado.error;
  }

  return NextResponse.json({
    ok: true,
    configurado: true,
    mes,
    totales,
    ...(Object.keys(errores).length > 0 ? { errores } : {}),
    generadoEn: new Date().toISOString(),
  });
}
