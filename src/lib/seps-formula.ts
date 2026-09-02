// =============================================================================
// Motor de formulas tipo Excel para las tablas MENSUALES del SEPS.
// -----------------------------------------------------------------------------
// Las columnas se nombran con letras (A, B, C ... Z, AA, AB) segun su posicion, y
// las filas con numeros (1, 2, 3 ...), igual que en Excel. Una formula empieza con
// "=" y puede usar:
//
//   =A1+B1            referencias a celdas concretas
//   =SUMA(A1:I1)      rangos (tambien SUM)
//   =SUMA(A:I)        sin numero de fila = "esta misma fila" (util en una columna
//                     de TOTAL, que se aplica a todas las filas por igual)
//   =(A1-B1)/C1*100   parentesis y las cuatro operaciones
//   =PROMEDIO(A1:A9)  PROMEDIO/AVERAGE, MIN, MAX, CONTAR/COUNT, ABS, REDONDEAR
//
// El motor es deliberadamente chico: solo numeros. No hay texto, ni condicionales,
// ni referencias a otras tablas. Si una formula esta mal escrita devuelve un error
// legible en espanol en vez de romper la pantalla.
// =============================================================================

/** "A" -> 0, "B" -> 1, "AA" -> 26. Devuelve -1 si no es una letra de columna. */
export function letraAIndice(letras: string): number {
  const limpio = letras.trim().toUpperCase();
  if (!/^[A-Z]+$/.test(limpio)) return -1;
  let total = 0;
  for (const caracter of limpio) {
    total = total * 26 + (caracter.charCodeAt(0) - 64);
  }
  return total - 1;
}

/** 0 -> "A", 25 -> "Z", 26 -> "AA". */
export function indiceALetra(indice: number): string {
  if (indice < 0) return "";
  let n = indice + 1;
  let letras = "";
  while (n > 0) {
    const resto = (n - 1) % 26;
    letras = String.fromCharCode(65 + resto) + letras;
    n = Math.floor((n - 1) / 26);
  }
  return letras;
}

export type ContextoFormula = {
  /** Cantidad de columnas de la tabla. */
  columnas: number;
  /** Cantidad de filas de la tabla. */
  filas: number;
  /** Valor numerico ya resuelto de una celda (0 si esta vacia). */
  valor: (col: number, fila: number) => number;
  /** Fila (0-based) desde la que se evalua: la usan las referencias sin numero. */
  filaActual?: number;
};

type Token =
  | { t: "num"; v: number }
  | { t: "ref"; col: number; fila: number | null }
  | { t: "id"; v: string }
  | { t: "op"; v: string };

class ErrorFormula extends Error {}

function tokenizar(texto: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    if (c === " " || c === "\t") {
      i += 1;
      continue;
    }
    if ("+-*/(),:".includes(c)) {
      tokens.push({ t: "op", v: c });
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < texto.length && /[0-9.]/.test(texto[j])) j += 1;
      const numero = Number.parseFloat(texto.slice(i, j));
      if (!Number.isFinite(numero)) throw new ErrorFormula(`Número inválido: ${texto.slice(i, j)}`);
      tokens.push({ t: "num", v: numero });
      i = j;
      continue;
    }
    if (/[A-Za-zÁÉÍÓÚÑáéíóúñ_]/.test(c)) {
      let j = i;
      while (j < texto.length && /[A-Za-zÁÉÍÓÚÑáéíóúñ_]/.test(texto[j])) j += 1;
      const letras = texto.slice(i, j);
      let k = j;
      while (k < texto.length && /[0-9]/.test(texto[k])) k += 1;
      const digitos = texto.slice(j, k);
      // Si lo que sigue es "(", es el nombre de una funcion.
      let sig = k;
      while (sig < texto.length && texto[sig] === " ") sig += 1;
      if (digitos === "" && texto[sig] === "(") {
        tokens.push({ t: "id", v: letras.toUpperCase() });
        i = k;
        continue;
      }
      const col = letraAIndice(letras);
      if (col < 0) throw new ErrorFormula(`No entiendo "${letras}". Las columnas se escriben con letras (A, B, C…).`);
      tokens.push({ t: "ref", col, fila: digitos === "" ? null : Number.parseInt(digitos, 10) - 1 });
      i = k;
      continue;
    }
    throw new ErrorFormula(`Carácter no permitido: "${c}"`);
  }
  return tokens;
}

const FUNCIONES = new Set([
  "SUMA", "SUM", "PROMEDIO", "AVERAGE", "MIN", "MAX", "CONTAR", "COUNT", "ABS", "REDONDEAR", "ROUND",
]);

function evaluarTokens(tokens: Token[], ctx: ContextoFormula): number {
  let pos = 0;

  const mirar = (): Token | undefined => tokens[pos];
  const esOp = (v: string) => {
    const t = mirar();
    return t && t.t === "op" && t.v === v;
  };
  const comer = (v: string) => {
    if (!esOp(v)) throw new ErrorFormula(`Falta "${v}" en la fórmula.`);
    pos += 1;
  };

  const filaDe = (ref: { col: number; fila: number | null }): number => {
    if (ref.fila !== null) return ref.fila;
    if (ctx.filaActual === undefined) {
      throw new ErrorFormula(
        `Escribiste "${indiceALetra(ref.col)}" sin número de fila. Eso solo se puede en una fórmula de columna.`,
      );
    }
    return ctx.filaActual;
  };

  const leerCelda = (col: number, fila: number): number => {
    if (col < 0 || col >= ctx.columnas || fila < 0 || fila >= ctx.filas) {
      throw new ErrorFormula(`La celda ${indiceALetra(col)}${fila + 1} no existe en esta tabla.`);
    }
    return ctx.valor(col, fila);
  };

  const leerArgumento = (): number[] => {
    // Un argumento puede ser un rango (A1:I1) o una expresion suelta.
    const inicio = pos;
    const t = mirar();
    if (t && t.t === "ref") {
      const siguiente = tokens[pos + 1];
      if (siguiente && siguiente.t === "op" && siguiente.v === ":") {
        const desde = t;
        const hasta = tokens[pos + 2];
        if (!hasta || hasta.t !== "ref") throw new ErrorFormula("Un rango se escribe así: A1:C1");
        pos += 3;
        const c1 = Math.min(desde.col, hasta.col);
        const c2 = Math.max(desde.col, hasta.col);
        const f1 = Math.min(filaDe(desde), filaDe(hasta));
        const f2 = Math.max(filaDe(desde), filaDe(hasta));
        const valores: number[] = [];
        for (let f = f1; f <= f2; f += 1) {
          for (let c = c1; c <= c2; c += 1) valores.push(leerCelda(c, f));
        }
        return valores;
      }
    }
    pos = inicio;
    return [expresion()];
  };

  function primario(): number {
    const t = mirar();
    if (!t) throw new ErrorFormula("La fórmula está incompleta.");
    if (t.t === "num") {
      pos += 1;
      return t.v;
    }
    if (t.t === "ref") {
      pos += 1;
      return leerCelda(t.col, filaDe(t));
    }
    if (t.t === "id") {
      const nombre = t.v;
      if (!FUNCIONES.has(nombre)) {
        throw new ErrorFormula(`No conozco la función ${nombre}. Disponibles: SUMA, PROMEDIO, MIN, MAX, CONTAR, ABS, REDONDEAR.`);
      }
      pos += 1;
      comer("(");
      const valores: number[] = [];
      if (!esOp(")")) {
        valores.push(...leerArgumento());
        while (esOp(",")) {
          pos += 1;
          valores.push(...leerArgumento());
        }
      }
      comer(")");
      switch (nombre) {
        case "SUMA":
        case "SUM":
          return valores.reduce((a, b) => a + b, 0);
        case "PROMEDIO":
        case "AVERAGE":
          return valores.length ? valores.reduce((a, b) => a + b, 0) / valores.length : 0;
        case "MIN":
          return valores.length ? Math.min(...valores) : 0;
        case "MAX":
          return valores.length ? Math.max(...valores) : 0;
        case "CONTAR":
        case "COUNT":
          return valores.filter((v) => v !== 0).length;
        case "ABS":
          return Math.abs(valores[0] ?? 0);
        default:
          return Math.round(valores[0] ?? 0);
      }
    }
    if (t.t === "op" && t.v === "(") {
      pos += 1;
      const valor = expresion();
      comer(")");
      return valor;
    }
    throw new ErrorFormula(`No esperaba "${t.t === "op" ? t.v : String(t)}" acá.`);
  }

  function factor(): number {
    if (esOp("-")) {
      pos += 1;
      return -factor();
    }
    if (esOp("+")) {
      pos += 1;
      return factor();
    }
    return primario();
  }

  function termino(): number {
    let valor = factor();
    for (;;) {
      if (esOp("*")) {
        pos += 1;
        valor *= factor();
      } else if (esOp("/")) {
        pos += 1;
        const divisor = factor();
        valor = divisor === 0 ? 0 : valor / divisor;
      } else {
        return valor;
      }
    }
  }

  function expresion(): number {
    let valor = termino();
    for (;;) {
      if (esOp("+")) {
        pos += 1;
        valor += termino();
      } else if (esOp("-")) {
        pos += 1;
        valor -= termino();
      } else {
        return valor;
      }
    }
  }

  const resultado = expresion();
  if (pos < tokens.length) throw new ErrorFormula("Sobra texto al final de la fórmula.");
  return resultado;
}

/** Evalua una formula ("=A1+B1" o "A1+B1"). Nunca lanza: devuelve el error. */
export function evaluarFormula(
  formula: string,
  ctx: ContextoFormula,
): { valor: number | null; error?: string } {
  const limpia = formula.trim().replace(/^=/, "").trim();
  if (!limpia) return { valor: null };
  try {
    const valor = evaluarTokens(tokenizar(limpia), ctx);
    if (!Number.isFinite(valor)) return { valor: null, error: "El resultado no es un número." };
    return { valor };
  } catch (error) {
    return { valor: null, error: error instanceof ErrorFormula ? error.message : "Fórmula inválida." };
  }
}

/** ¿El texto de una celda es una formula? */
export function esFormula(texto: string | undefined | null): boolean {
  return typeof texto === "string" && texto.trim().startsWith("=");
}

export type CeldaCalculada = { texto: string; formula?: string; error?: string };

/**
 * Resuelve TODA la matriz de una tabla mensual: toma lo digitado y las formulas
 * (de columna y de celda) y devuelve el texto a mostrar en cada celda. Detecta
 * referencias circulares y las marca en vez de colgarse.
 */
export function calcularMatriz(params: {
  filas: string[];
  columnas: string[];
  /** Valor digitado: crudo[filaKey]?.[colKey] */
  crudo: Record<string, Record<string, string> | undefined>;
  /** Formula por columna (se aplica a todas las filas): porColumna[colKey] */
  porColumna: Record<string, string | undefined>;
  /** Formula de una celda concreta: porCelda["filaKey|colKey"] */
  porCelda: Record<string, string | undefined>;
}): Map<string, CeldaCalculada> {
  const { filas, columnas, crudo, porColumna, porCelda } = params;
  const indiceFila = new Map(filas.map((k, i) => [k, i]));
  const indiceCol = new Map(columnas.map((k, i) => [k, i]));
  const resultado = new Map<string, CeldaCalculada>();
  const enCurso = new Set<string>();

  const formulaDe = (filaKey: string, colKey: string): string | undefined => {
    const propia = porCelda[`${filaKey}|${colKey}`];
    if (propia && propia.trim()) return propia;
    const columna = porColumna[colKey];
    return columna && columna.trim() ? columna : undefined;
  };

  const resolver = (col: number, fila: number): number => {
    const filaKey = filas[fila];
    const colKey = columnas[col];
    if (filaKey === undefined || colKey === undefined) return 0;
    const id = `${filaKey}|${colKey}`;

    const yaEsta = resultado.get(id);
    if (yaEsta) {
      const n = Number.parseFloat(yaEsta.texto);
      return Number.isFinite(n) ? n : 0;
    }
    if (enCurso.has(id)) {
      resultado.set(id, { texto: "⟳", error: "Referencia circular." });
      return 0;
    }

    const formula = formulaDe(filaKey, colKey);
    if (!formula) {
      const bruto = crudo[filaKey]?.[colKey] ?? "";
      const n = Number.parseFloat(bruto);
      return Number.isFinite(n) ? n : 0;
    }

    enCurso.add(id);
    const evaluado = evaluarFormula(formula, {
      columnas: columnas.length,
      filas: filas.length,
      filaActual: fila,
      valor: resolver,
    });
    enCurso.delete(id);

    // Si mientras se evaluaba alguien volvio a pedir ESTA celda, quedo marcada como
    // circular: se respeta esa marca en vez de pisarla con un resultado enganoso.
    const marcada = resultado.get(id);
    if (marcada?.error === "Referencia circular.") return 0;

    const celda: CeldaCalculada = evaluado.error
      ? { texto: "—", formula, error: evaluado.error }
      : { texto: evaluado.valor === null ? "" : formatearNumero(evaluado.valor), formula };
    resultado.set(id, celda);
    return evaluado.valor ?? 0;
  };

  for (const filaKey of filas) {
    for (const colKey of columnas) {
      const id = `${filaKey}|${colKey}`;
      if (resultado.has(id)) continue;
      if (!formulaDe(filaKey, colKey)) continue;
      resolver(indiceCol.get(colKey)!, indiceFila.get(filaKey)!);
    }
  }

  return resultado;
}

/** Numero para mostrar: sin decimales si es entero, con 2 si no. */
export function formatearNumero(valor: number): string {
  if (Number.isInteger(valor)) return String(valor);
  return (Math.round(valor * 100) / 100).toString();
}
