import { NextResponse } from "next/server";

// =============================================================================
// Puente con el monitoreo de otros hospitales.
// -----------------------------------------------------------------------------
// Cada hospital expone SOLO su avance: cuantos servicios entregaron y cuales
// faltan. Nunca viaja una cifra de produccion ni de insumos por aqui.
//
// PULSO los consume desde el SERVIDOR para que las llaves no lleguen al
// navegador. Hay dos formas de hospital:
//
//   tipo "sigma" -> el hospital corre SIGMA (Psiquiatrico, Suchitoto). SIGMA
//                   responde el monitoreo ya armado y pide una llave.
//   tipo "lista" -> el hospital tiene su propio sistema y solo publica una
//                   lista de filas con su estado (San Miguel). PULSO la lee y
//                   arma el avance aca. No hay llave ni seleccion de mes:
//                   ese enlace devuelve el mes que el sistema tenga en curso.
//
// Variables (Vercel > Settings > Environment Variables):
//   SIGMA_URL / SIGMA_API_KEY                        -> Psiquiatrico
//   SIGMA_SUCHITOTO_URL / SIGMA_SUCHITOTO_API_KEY    -> Suchitoto
//   SAN_MIGUEL_URL                                   -> San Miguel (sin llave)
// =============================================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Hospital = {
  tipo: "sigma" | "lista";
  url: string;
  llave?: string;
  nombre: string;
};

const HOSPITALES: Record<string, Hospital> = {
  psiquiatrico: {
    tipo: "sigma",
    url: "SIGMA_URL",
    llave: "SIGMA_API_KEY",
    nombre: 'Hospital Nacional Psiquiátrico "Dr. José Molina Martínez"',
  },
  suchitoto: {
    tipo: "sigma",
    url: "SIGMA_SUCHITOTO_URL",
    llave: "SIGMA_SUCHITOTO_API_KEY",
    nombre: "Hospital Nacional de Suchitoto",
  },
  sanmiguel: {
    tipo: "lista",
    url: "SAN_MIGUEL_URL",
    nombre: "Hospital Nacional San Juan de Dios, San Miguel",
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
  // Los hospitales tipo "lista" no reportan insumos ni permiten elegir mes.
  sinInsumos?: boolean;
  sinMes?: boolean;
  error?: string;
};

// Cache en memoria del servidor: Apps Script tiene cuotas diarias y el
// monitoreo se abre muchas veces al dia. Cinco minutos alcanza para que se
// sienta al instante sin quedar desactualizado.
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map<string, { en: number; datos: RespuestaSigma }>();

/** Texto de una fila sin importar como se llame la columna en el origen. */
function primerTexto_(fila: Record<string, unknown>, candidatas: string[]): string {
  for (const clave of Object.keys(fila)) {
    const normal = clave.toUpperCase();
    if (candidatas.some((c) => normal.includes(c))) {
      const valor = String(fila[clave] ?? "").trim();
      if (valor) return valor;
    }
  }
  return "";
}

/**
 * Convierte la lista cruda de un sistema ajeno en el mismo monitoreo que
 * devuelve SIGMA. Se aguanta que las columnas vengan con otro nombre: busca
 * por palabra clave y, si no encuentra, usa el primer texto de la fila.
 */
function monitoreoDesdeLista_(crudo: unknown, nombreHospital: string): RespuestaSigma {
  const filas: Record<string, unknown>[] = Array.isArray(crudo)
    ? (crudo as Record<string, unknown>[])
    : Array.isArray((crudo as { datos?: unknown })?.datos)
      ? ((crudo as { datos: Record<string, unknown>[] }).datos)
      : [];

  if (!filas.length) {
    return { ok: false, error: "El enlace no devolvió ninguna fila." };
  }

  const items: Item[] = filas
    .map((fila, indice) => {
      const centro =
        primerTexto_(fila, ["CENTRO"]) ||
        primerTexto_(fila, ["SERVICIO", "AREA", "UNIDAD"]) ||
        String(Object.values(fila)[0] ?? "").trim();
      // "502_2-Quirofanos menor | Procedimiento" -> se corta en la barra: el
      // producto ya viene en su propia columna y alarga el nombre sin aportar.
      const nombre = centro.split("|")[0].trim() || `Fila ${indice + 1}`;
      const estado = primerTexto_(fila, ["ESTADO", "STATUS"]).toUpperCase();
      return {
        id: `${indice}-${nombre}`,
        nombre,
        completo: estado.startsWith("COMPLET") || estado === "OK" || estado === "SI",
      };
    })
    .filter((item) => item.nombre);

  const total = items.length;
  const completos = items.filter((i) => i.completo).length;
  return {
    ok: true,
    hospital: nombreHospital,
    mesEtiqueta: "mes en curso",
    perc: {
      total,
      completos,
      pendientes: total - completos,
      pct: total ? Math.round((completos / total) * 100) : 0,
      items,
    },
    sinInsumos: true,
    sinMes: true,
  };
}

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
  const llave = hospital.llave ? (process.env[hospital.llave] || "").trim() : "";
  const faltan = !base || (hospital.llave ? !llave : false);
  if (faltan) {
    return NextResponse.json({
      ok: true,
      configurado: false,
      hospital: hospital.nombre,
      mensaje: hospital.llave
        ? `Faltan las variables ${hospital.url} y ${hospital.llave} en las variables de entorno.`
        : `Falta la variable ${hospital.url} en las variables de entorno.`,
    });
  }

  // El tipo "lista" siempre trae el mes en curso: no tiene sentido cachear por mes.
  const clave = `${hospitalId}__${hospital.tipo === "lista" ? "unico" : mes || "actual"}`;
  const guardado = cache.get(clave);
  if (!refrescar && guardado && Date.now() - guardado.en < CACHE_MS) {
    return NextResponse.json({ ok: true, configurado: true, cacheado: true, ...guardado.datos });
  }

  const url = new URL(base);
  if (hospital.tipo === "sigma") {
    url.searchParams.set("accion", "monitoreo");
    url.searchParams.set("key", llave);
    if (mes) url.searchParams.set("mes", mes);
  }

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
        error: `El hospital respondió ${respuesta.status}.`,
      });
    }

    // Se lee como texto: algunos origenes mandan JSON con encabezado de HTML, y
    // si el enlace vencio devuelven la pagina de Google, que empieza con "<".
    const texto = (await respuesta.text()).trim();
    if (texto.startsWith("<")) {
      return NextResponse.json({
        ok: false,
        configurado: true,
        error:
          "El enlace devolvió una página de Google en vez de datos. Suele pasar cuando el enlace venció o pide iniciar sesión: pedí el enlace que termina en /exec.",
      });
    }

    let crudo: unknown;
    try {
      crudo = JSON.parse(texto);
    } catch {
      return NextResponse.json({
        ok: false,
        configurado: true,
        error: "La respuesta no es JSON válido.",
      });
    }

    const datos =
      hospital.tipo === "lista"
        ? monitoreoDesdeLista_(crudo, hospital.nombre)
        : (crudo as RespuestaSigma);

    if (!datos?.ok) {
      return NextResponse.json({
        ok: false,
        configurado: true,
        error: datos?.error || "El hospital rechazó la consulta.",
      });
    }
    cache.set(clave, { en: Date.now(), datos });
    return NextResponse.json({ ok: true, configurado: true, cacheado: false, ...datos });
  } catch (error) {
    const detalle = error instanceof Error ? error.message : "error de red";
    return NextResponse.json({ ok: false, configurado: true, error: detalle });
  }
}
