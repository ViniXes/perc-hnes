"use client";

/**
 * MENÚ "MEMORÁNDUMS" (solo administradores), submenús ESDOMED y Planificación:
 * cada área con sus memos, su numeración y su remitente por defecto.
 *
 * Lista de memos guardados por año y número correlativo, editor con los campos
 * del formato oficial (No., bloques PARA / CC.: / DE / A TRAVÉS DE…, ASUNTO, FECHA, cuerpo, despedida,
 * firma y copias) y descargas en PDF y Word con el membrete de la plantilla.
 * Los memos viven en Firestore `esdomedMemos/<año>__<número>`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDoc, collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firestore";
import {
  MEMO_AREAS,
  MEMO_ETIQUETA_OPCIONES,
  memoEtiqueta,
  buildMemoPdfConMembrete,
  downloadMemoDocx,
  downloadMemoPdf,
  memoCodigo,
  memoDocId,
  memoFechaTexto,
  memoNuevo,
  memoFirmante,
  memoNumeroTexto,
  normalizarMemo,
  type MemoEsdomed,
  type MemoSello,
  type MemoArea,
  type MemoBloque,
  type MemoPersona,
} from "@/lib/memo-esdomed";
import { BTN_GUARDAR } from "@/components/ui-basicos";
import { AjusteSello } from "@/components/ajuste-sello";
import { VistaSello } from "@/components/vista-sello";
import { useConfirmar } from "@/components/dialogo-confirmar";
import { PersonaAutocompletar } from "@/components/persona-autocompletar";
import {
  leerDirectorio,
  personasDeMemos,
  personasFijas,
  publicarDirectorio,
  unirPersonas,
} from "@/lib/directorio-memos";
import { borrarBorrador, guardarBorrador, leerBorrador } from "@/lib/borradores";
import {
  DESTINO_MEMO,
  MENSAJES_COLECCION,
  NOMBRE_BANDEJA,
  SELLOS_COLECCION,
  leerSello,
  memoNombraGil,
  mesMemo,
  prepararSello,
  type BandejaId,
} from "@/lib/memos-internos";

type MemoGuardado = MemoEsdomed & {
  id: string;
  actualizado: string;
  actualizadoPor: string;
  enviado: string;
};

type Props = {
  /** Área cuyos memos se muestran (submenú de MEMORÁNDUMS). */
  area: MemoArea;
  isLight: boolean;
  /** Correo o usuario de quien guarda (queda en el memo). */
  usuario: string;
  /** Nombre de quien envía (sale en la bandeja del que recibe). */
  nombreUsuario?: string;
  /** uid de la sesión (queda en el envío; las reglas lo exigen). */
  uid?: string;
  /** Puede enviar memos de esta área por PULSO y cargar su firma y sello. */
  puedeEnviar?: boolean;
  /** Puede cargar y usar la firma y sello del área (por defecto, quien envía). */
  puedeSellar?: boolean;
  /** Administrador: arma y publica el directorio de nombres para las sugerencias. */
  esAdmin?: boolean;
};

function hoyIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function normalizar(texto: string) {
  return texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function fechaDe(valor: unknown): string {
  const v = valor as { toDate?: () => Date } | null;
  if (v && typeof v.toDate === "function") {
    return v.toDate().toLocaleString("es-SV", { dateStyle: "short", timeStyle: "short" });
  }
  return "";
}

export function MemosEsdomed({
  area,
  isLight,
  usuario,
  nombreUsuario = "",
  uid = "",
  puedeEnviar = false,
  puedeSellar,
  esAdmin = false,
}: Props) {
  const config = MEMO_AREAS[area];
  const coleccion = config.coleccion;
  const destino = (puedeEnviar ? DESTINO_MEMO[area] : undefined) as BandejaId | undefined;
  const usaSello = !!config.conSello && (puedeSellar ?? puedeEnviar);
  // A quién se envía: la otra área (marcada de entrada) y, si el memo la nombra,
  // la Dra. Katherinne Gil (SIS).
  const [enviarOtraArea, setEnviarOtraArea] = useState(true);
  const [enviarGil, setEnviarGil] = useState(true);
  const [memos, setMemos] = useState<MemoGuardado[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const [aviso, setAviso] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [anio, setAnio] = useState<number>(new Date().getFullYear());
  // Memo abierto en el editor; `idOriginal` es null si todavía no se ha guardado.
  const [memo, setMemo] = useState<MemoEsdomed | null>(null);
  const [idOriginal, setIdOriginal] = useState<string | null>(null);
  const [guardadoJson, setGuardadoJson] = useState("");
  const [ocupado, setOcupado] = useState<"" | "guardar" | "pdf" | "word" | "vista" | "borrar" | "enviar" | "sello">("");
  // Firma y sello del área (memoSellos/<area>), solo para quien firma.
  const [sello, setSello] = useState<MemoSello | null>(null);
  const [selloCargado, setSelloCargado] = useState(false);
  const selloInputRef = useRef<HTMLInputElement | null>(null);
  const [vistaUrl, setVistaUrl] = useState<string | null>(null);
  // Nombres y cargos que se sugieren al escribir en el encabezado.
  const [directorio, setDirectorio] = useState<MemoPersona[]>([]);
  // Vista previa donde se coloca el sello con el mouse sobre el memo completo.
  const [colocando, setColocando] = useState(false);
  const cuerpoRef = useRef<HTMLTextAreaElement | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError("");
    try {
      const snap = await getDocs(collection(db, coleccion));
      const lista = snap.docs.map((d) => {
        const data = d.data() as Record<string, unknown>;
        return {
          ...normalizarMemo(data),
          id: d.id,
          actualizado: fechaDe(data.updatedAt) || fechaDe(data.createdAt),
          actualizadoPor: String(data.updatedBy ?? data.createdBy ?? ""),
          enviado: fechaDe(data.enviadoAt),
        };
      });
      lista.sort((a, b) => b.year - a.year || b.numero - a.numero);
      // Todas las áreas comparten la colección; cada submenú ve solo los suyos.
      setMemos(lista.filter((m) => m.area === area));
    } catch (e) {
      setError(
        (e as { code?: string })?.code === "permission-denied"
          ? `Firestore no permite leer los memos. Falta publicar las reglas de «${coleccion}».`
          : "No se pudieron cargar los memos. Revisá la conexión e intentá de nuevo.",
      );
    } finally {
      setCargando(false);
    }
  }, [area, coleccion]);

  // Firma y sello guardados del área.
  useEffect(() => {
    if (!usaSello) return;
    let vivo = true;
    getDoc(doc(db, SELLOS_COLECCION, area))
      .then((snap) => {
        if (!vivo) return;
        setSello(snap.exists() ? leerSello(snap.data() as Record<string, unknown>) : null);
      })
      .catch(() => {
        if (vivo) setSello(null);
      })
      .finally(() => {
        if (vivo) setSelloCargado(true);
      });
    return () => {
      vivo = false;
    };
  }, [area, usaSello]);

  const subirSello = async (archivo: File | undefined) => {
    if (!archivo) return;
    if (!/^image\/(png|jpe?g)$/i.test(archivo.type)) {
      setError("La firma y sello debe ser una imagen PNG o JPG.");
      return;
    }
    setOcupado("sello");
    setError("");
    try {
      const nuevo = await prepararSello(archivo);
      await setDoc(doc(db, SELLOS_COLECCION, area), {
        ...nuevo,
        area,
        updatedAt: serverTimestamp(),
        updatedBy: usuario,
      });
      setSello(nuevo);
      setAviso("Firma y sello guardados. Desde ahora los memos marcados «Firmar y sellar» salen con esta imagen.");
    } catch (e) {
      setError(
        (e as { code?: string })?.code === "permission-denied"
          ? "Firestore no permitió guardar la firma. Falta publicar las reglas de «memoSellos»."
          : "No se pudo leer o guardar la imagen. Intente con otra (PNG con fondo transparente es lo ideal).",
      );
    } finally {
      setOcupado("");
      if (selloInputRef.current) selloInputRef.current.value = "";
    }
  };

  /** El sello solo se usa si el memo está marcado para firmar y sellar. */
  const selloDe = (m: MemoEsdomed) => (usaSello && m.sellado ? sello : null);

  // Carga inicial de la lista al entrar al menú.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void cargar();
  }, [cargar]);

  useEffect(() => {
    return () => {
      if (vistaUrl) URL.revokeObjectURL(vistaUrl);
    };
  }, [vistaUrl]);

  const anios = useMemo(() => {
    const set = new Set<number>([new Date().getFullYear(), ...memos.map((m) => m.year)]);
    return Array.from(set).sort((a, b) => b - a);
  }, [memos]);

  const siguienteNumero = useCallback(
    (year: number) => memos.filter((m) => m.year === year).reduce((max, m) => Math.max(max, m.numero), 0) + 1,
    [memos],
  );

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda.trim());
    return memos.filter(
      (m) =>
        m.year === anio &&
        (!q ||
          normalizar(`${memoCodigo(m)} ${m.asunto} ${m.bloques.flatMap((b) => b.personas.map((p) => p.nombre)).join(" ")}`).includes(q)),
    );
  }, [memos, anio, busqueda]);

  const cambiosSinGuardar = memo !== null && JSON.stringify(memo) !== guardadoJson;

  // Borrador en este equipo: si la sesion se cierra (inactividad, luz, cerrar la
  // pestana) con el memo sin guardar, al volver se recupera tal cual.
  const claveBorrador = `memo.${area}`;
  type BorradorMemo = { memo: MemoEsdomed; idOriginal: string | null; guardadoJson: string };
  useEffect(() => {
    const b = leerBorrador<BorradorMemo>(usuario, claveBorrador);
    if (!b?.memo) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMemo(normalizarMemo(b.memo as unknown as Record<string, unknown>));
    setIdOriginal(b.idOriginal ?? null);
    setGuardadoJson(b.guardadoJson ?? "");
    setAviso("Se recuperó el memo que estaba escribiendo y no había guardado. Revíselo y guárdelo.");
  }, [usuario, claveBorrador]);
  useEffect(() => {
    if (memo && cambiosSinGuardar) guardarBorrador(usuario, claveBorrador, { memo, idOriginal, guardadoJson });
  }, [memo, cambiosSinGuardar, idOriginal, guardadoJson, usuario, claveBorrador]);
  const olvidarBorrador = () => borrarBorrador(usuario, claveBorrador);

  const [preguntar, dialogoConfirmar] = useConfirmar(isLight);
  const confirmarDescartar = async () =>
    !cambiosSinGuardar ||
    (await preguntar({
      titulo: "¿Descartar los cambios?",
      texto: "El memo abierto tiene cambios sin guardar. Si continúa, se pierden.",
      boton: "Descartar cambios",
      cancelar: "Seguir editando",
      tono: "aviso",
    }));

  const abrirNuevo = async () => {
    if (!(await confirmarDescartar())) return;
    const year = new Date().getFullYear();
    const nuevo = memoNuevo(area, year, siguienteNumero(year), hoyIso());
    olvidarBorrador();
    setMemo(nuevo);
    setIdOriginal(null);
    setGuardadoJson("");
    setAviso("");
    setError("");
  };

  const abrir = async (m: MemoGuardado) => {
    if (!(await confirmarDescartar())) return;
    const limpio = normalizarMemo(m as unknown as Record<string, unknown>);
    olvidarBorrador();
    setMemo(limpio);
    setIdOriginal(m.id);
    setGuardadoJson(JSON.stringify(limpio));
    setAviso("");
    setError("");
  };

  const cerrar = async () => {
    if (!(await confirmarDescartar())) return;
    olvidarBorrador();
    setMemo(null);
    setIdOriginal(null);
    setGuardadoJson("");
  };

  const editar = (cambios: Partial<MemoEsdomed>) => setMemo((m) => (m ? { ...m, ...cambios } : m));

  const editarBloques = (cambiar: (bloques: MemoBloque[]) => MemoBloque[]) =>
    setMemo((m) => (m ? { ...m, bloques: cambiar(m.bloques) } : m));

  const editarBloque = (b: number, cambios: Partial<MemoBloque>) =>
    editarBloques((lista) => lista.map((x, j) => (j === b ? { ...x, ...cambios } : x)));

  useEffect(() => {
    let vivo = true;
    (async () => {
      const lista = esAdmin
        ? ((await publicarDirectorio(db, [MEMO_AREAS["consulta-externa"].coleccion])) ??
          (await leerDirectorio(db)))
        : await leerDirectorio(db);
      if (vivo) setDirectorio(lista);
    })();
    return () => {
      vivo = false;
    };
  }, [esAdmin]);
  const sugerencias = useMemo(
    // Primero los remitentes y destinatarios de esta área (con el cargo que usa
    // esta área, p. ej. "Jefe de ESDOMED" en los memos de C.E.).
    () =>
      unirPersonas(
        [config.de, ...(config.para ? [config.para] : [])],
        personasDeMemos(memos),
        personasFijas(),
        directorio,
      ),
    [config, memos, directorio],
  );

  const editarPersona = (b: number, i: number, cambios: Partial<MemoPersona>) =>
    editarBloques((lista) =>
      lista.map((x, j) =>
        j === b ? { ...x, personas: x.personas.map((p, k) => (k === i ? { ...p, ...cambios } : p)) } : x,
      ),
    );

  /** Sube (-1) o baja (+1) un bloque en el encabezado. */
  const moverBloque = (b: number, paso: -1 | 1) =>
    editarBloques((lista) => {
      const destino = b + paso;
      if (destino < 0 || destino >= lista.length) return lista;
      const copia = [...lista];
      [copia[b], copia[destino]] = [copia[destino], copia[b]];
      return copia;
    });

  const validar = (m: MemoEsdomed): string => {
    if (!Number.isInteger(m.numero) || m.numero < 1) return "El número del memo debe ser un entero mayor que 0.";
    if (!Number.isInteger(m.year) || m.year < 2000 || m.year > 2100) return "El año del memo no es válido.";
    if (!m.bloques.some((b) => b.personas.some((p) => p.nombre.trim()))) return "Falta el destinatario (PARA).";
    if (m.bloques.some((b) => !b.etiqueta.trim() && b.personas.some((p) => p.nombre.trim() || p.cargo.trim()))) {
      return "Hay un bloque del encabezado sin título (PARA, CC.:, DE…).";
    }
    if (!m.asunto.trim()) return "Falta el ASUNTO.";
    return "";
  };

  const guardar = async () => {
    if (!memo) return;
    const problema = validar(memo);
    if (problema) {
      setError(problema);
      return;
    }
    setOcupado("guardar");
    setError("");
    setAviso("");
    try {
      const id = memoDocId(memo.area, memo.year, memo.numero);
      const ref = doc(db, coleccion, id);
      const datos = { ...memo, updatedAt: serverTimestamp(), updatedBy: usuario };
      if (id === idOriginal) {
        await setDoc(ref, datos, { merge: true });
      } else {
        // Número nuevo (memo nuevo o se le cambió el número): no pisar otro memo.
        const existe = await getDoc(ref);
        if (existe.exists()) {
          setError(`Ya existe el memo No. ${memoCodigo(memo)}. Usá otro número.`);
          return;
        }
        await setDoc(ref, { ...datos, createdAt: serverTimestamp(), createdBy: usuario });
        if (idOriginal) await deleteDoc(doc(db, coleccion, idOriginal));
      }
      olvidarBorrador();
      setIdOriginal(id);
      setGuardadoJson(JSON.stringify(memo));
      setAnio(memo.year);
      setAviso(`Memo No. ${memoCodigo(memo)} guardado.`);
      void cargar();
    } catch (e) {
      setError(
        (e as { code?: string })?.code === "permission-denied"
          ? `Firestore no permitió guardar. Falta publicar las reglas de «${coleccion}».`
          : "No se pudo guardar el memo. Revisá la conexión e intentá de nuevo.",
      );
    } finally {
      setOcupado("");
    }
  };

  const borrar = async () => {
    if (!memo || !idOriginal) return;
    const ok = await preguntar({
      titulo: "¿Eliminar este memo?",
      texto: (
        <>
          Se eliminará el memo <strong className="whitespace-nowrap">{memoNumeroTexto(memo)}</strong>
          {memo.asunto.trim() ? <> · {memo.asunto.trim()}</> : null}. Esta acción no se puede deshacer.
        </>
      ),
      boton: "Sí, eliminar",
      tono: "peligro",
    });
    if (!ok) return;
    setOcupado("borrar");
    try {
      await deleteDoc(doc(db, coleccion, idOriginal));
      olvidarBorrador();
      setMemo(null);
      setIdOriginal(null);
      setGuardadoJson("");
      setAviso("Memo eliminado.");
      void cargar();
    } catch {
      setError("No se pudo eliminar el memo.");
    } finally {
      setOcupado("");
    }
  };

  const exportar = async (tipo: "pdf" | "word" | "vista") => {
    if (!memo) return;
    setOcupado(tipo);
    setError("");
    try {
      if (tipo === "pdf") await downloadMemoPdf(memo, selloDe(memo));
      else if (tipo === "word") await downloadMemoDocx(memo, selloDe(memo));
      else if (selloDe(memo)) {
        // Con firma y sello: la vista previa deja moverlo y girarlo encima del memo.
        setColocando(true);
      } else {
        const blob = await buildMemoPdfConMembrete(memo, selloDe(memo));
        setVistaUrl(URL.createObjectURL(blob));
      }
    } catch {
      setError("No se pudo generar el documento. Intentá de nuevo.");
    } finally {
      setOcupado("");
    }
  };

  /** Envía el memo guardado, firmado y sellado, a la bandeja del otro lado. */
  const enviar = async () => {
    if (!memo || !destino) return;
    if (!idOriginal || cambiosSinGuardar) {
      setError("Primero guarde el memo; se envía tal como quedó guardado.");
      return;
    }
    if (!memo.sellado || !sello) {
      setError(
        sello
          ? "Marque «Firmar y sellar» para enviarlo: por PULSO solo se envían memos firmados y sellados."
          : "Cargue primero la firma y sello del área (botón «Cargar firma y sello»).",
      );
      return;
    }
    const destinos: BandejaId[] = [
      ...(enviarOtraArea ? [destino] : []),
      ...(enviarGil && memoNombraGil(memo) ? (["sis"] as const) : []),
    ];
    if (destinos.length === 0) {
      setError("Marque al menos a quién enviarlo.");
      return;
    }
    const nombreDestino = destinos.map((d) => NOMBRE_BANDEJA[d]).join(" y ");
    const ok = await preguntar({
      titulo: "¿Enviar el memo?",
      texto: (
        <>
          El memo <strong className="whitespace-nowrap">{memoNumeroTexto(memo)}</strong> se enviará firmado y sellado a{" "}
          <strong>{nombreDestino}</strong> por PULSO.
        </>
      ),
      boton: "Enviar",
    });
    if (!ok) return;
    setOcupado("enviar");
    setError("");
    setAviso("");
    try {
      // Un envío por destinatario: cada bandeja marca su propio "leído".
      for (const para of destinos) {
        await addDoc(collection(db, MENSAJES_COLECCION), {
          de: area,
          para,
          memo,
          sello,
          codigo: memoCodigo(memo),
          asunto: memo.asunto,
          enviadoPor: usuario,
          enviadoPorNombre: nombreUsuario || usuario,
          enviadoUid: uid,
          createdAt: serverTimestamp(),
          mes: mesMemo(),
          leido: false,
          recibido: false,
        });
      }
      await setDoc(
        doc(db, coleccion, idOriginal),
        { enviadoAt: serverTimestamp(), enviadoA: destinos.join(",") },
        { merge: true },
      ).catch(() => {});
      setAviso(`Memo ${memoNumeroTexto(memo)} enviado a ${nombreDestino}. Le llega en su bandeja de PULSO.`);
      void cargar();
    } catch (e) {
      setError(
        (e as { code?: string })?.code === "permission-denied"
          ? "Firestore no permitió enviar. Falta publicar las reglas de «memosInternos»."
          : "No se pudo enviar el memo. Revise la conexión e intente de nuevo.",
      );
    } finally {
      setOcupado("");
    }
  };

  // --- Estilos ---------------------------------------------------------------
  const tarjeta = isLight
    ? "border border-slate-200 bg-white text-slate-900"
    : "border border-white/10 bg-[#202c41] text-slate-100";
  const sub = isLight ? "text-slate-500" : "text-slate-400";
  const input = `w-full rounded-xl px-3 py-2 text-sm outline-none transition focus:border-teal-400/60 ${
    isLight
      ? "border border-slate-200 bg-white text-slate-900 placeholder:text-slate-400"
      : "border border-white/[0.08] bg-white/[0.035] text-white placeholder:text-slate-500"
  }`;
  // Opciones del desplegable: en modo oscuro, letra blanca sobre el azul más claro
  // de las tarjetas (#22487f); sin esto heredan el blanco del sistema y no se leen.
  const desplegable = `${input} ${
    isLight ? "[&_option]:bg-white [&_option]:text-slate-900" : "[&_option]:bg-[#22487f] [&_option]:text-white"
  }`;
  const etiqueta = `mb-1 block text-[11px] font-semibold uppercase tracking-[0.14em] ${sub}`;
  const btnSec = `rounded-xl px-3.5 py-2 text-sm font-semibold transition disabled:opacity-50 ${
    isLight
      ? "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
      : "border border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]"
  }`;
  const btnMini = `rounded-lg px-2 py-1 text-[11px] font-semibold transition ${
    isLight ? "text-slate-500 hover:bg-slate-100 hover:text-rose-600" : "text-slate-400 hover:bg-white/[0.06] hover:text-rose-300"
  }`;

  const chip = (activo: boolean) =>
    `rounded-lg px-2.5 py-1 text-[11px] font-semibold transition ${
      activo
        ? isLight
          ? "bg-teal-600 text-white"
          : "bg-teal-400/20 text-teal-100 ring-1 ring-inset ring-teal-300/40"
        : isLight
          ? "border border-slate-200 text-slate-600 hover:bg-slate-100"
          : "border border-white/10 text-slate-300 hover:bg-white/[0.06]"
    }`;
  const btnLink = `text-[11px] font-semibold hover:underline ${isLight ? "text-teal-700" : "text-teal-300"}`;

  /** Un bloque del encabezado: título (rápido o libre) y sus personas. */
  const editorBloque = (bloque: MemoBloque, b: number, total: number) => (
    <div
      key={b}
      className={`rounded-2xl border p-3 ${isLight ? "border-slate-200 bg-slate-50/60" : "border-white/[0.07] bg-white/[0.02]"}`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <input
          className={`${input} w-40 font-bold uppercase`}
          value={bloque.etiqueta}
          placeholder="Título"
          aria-label="Título del bloque"
          onChange={(e) => editarBloque(b, { etiqueta: e.target.value })}
        />
        {MEMO_ETIQUETA_OPCIONES.map((op) => (
          <button
            key={op}
            type="button"
            onClick={() => editarBloque(b, { etiqueta: op })}
            className={chip(memoEtiqueta(bloque.etiqueta) === op)}
          >
            {op}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-1">
          <button type="button" className={btnMini} title="Subir" disabled={b === 0} onClick={() => moverBloque(b, -1)}>
            ↑
          </button>
          <button
            type="button"
            className={btnMini}
            title="Bajar"
            disabled={b === total - 1}
            onClick={() => moverBloque(b, 1)}
          >
            ↓
          </button>
          <button
            type="button"
            className={btnMini}
            title="Quitar este bloque"
            onClick={() => editarBloques((lista) => lista.filter((_, j) => j !== b))}
          >
            Quitar bloque
          </button>
        </span>
      </div>
      <div className="mt-2 space-y-2">
        {bloque.personas.map((p, i) => (
          <div key={i} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
            <PersonaAutocompletar
              className={input}
              valor={p.nombre}
              lista={sugerencias}
              isLight={isLight}
              placeholder="Nombre (escriba y elija de la lista)"
              onNombre={(nombre) => editarPersona(b, i, { nombre })}
              onElegir={(elegida) => editarPersona(b, i, { nombre: elegida.nombre, cargo: elegida.cargo })}
            />
            <input
              className={input}
              value={p.cargo}
              placeholder="Cargo (sale en negrita)"
              onChange={(e) => editarPersona(b, i, { cargo: e.target.value })}
            />
            <button
              type="button"
              className={btnMini}
              title="Quitar persona"
              onClick={() => editarBloque(b, { personas: bloque.personas.filter((_, k) => k !== i) })}
            >
              Quitar
            </button>
          </div>
        ))}
        <button
          type="button"
          className={btnLink}
          onClick={() => editarBloque(b, { personas: [...bloque.personas, { nombre: "", cargo: "" }] })}
        >
          + Agregar persona a {memoEtiqueta(bloque.etiqueta) || "este bloque"}
        </button>
      </div>
    </div>
  );

  // Alto del cuerpo según el texto, para escribir memos largos con comodidad.
  useEffect(() => {
    const el = cuerpoRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.max(320, el.scrollHeight + 4)}px`;
  }, [memo?.cuerpo]);

  return (
    <section id={`panel-memos-${area}`} className={`rounded-[24px] p-5 ${tarjeta}`}>
      {dialogoConfirmar}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className={`text-[11px] font-semibold uppercase tracking-[0.22em] ${sub}`}>Memorándums</p>
          <h2 className={`mt-1 text-xl font-semibold ${isLight ? "text-slate-900" : "text-white"}`}>
            {config.nombre}
          </h2>
          <p className={`mt-1 max-w-2xl text-sm ${isLight ? "text-slate-600" : "text-slate-400"}`}>
            Memos con el membrete oficial, guardados por número correlativo. Se descargan en PDF o en Word
            {destino
              ? ` y se envían firmados y sellados por PULSO a ${NOMBRE_BANDEJA[destino]} (y a la Dra. Katherinne Gil cuando el memo la nombra).`
              : area === "consulta-externa"
                ? ". Los firma, sella y envía la Jefatura de Consulta Externa (Dra. Benítez) desde su cuenta."
                : " (para firmar o seguir editando). Solo los administradores ven este menú."}
          </p>
        </div>
        <button
          type="button"
          onClick={abrirNuevo}
          className={`${BTN_GUARDAR} rounded-xl px-4 py-2 text-sm transition`}
        >
          + Nuevo memo
        </button>
      </div>

      {error ? (
        <p className="mt-4 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-500">{error}</p>
      ) : null}
      {aviso ? (
        <p className="mt-4 rounded-xl border border-teal-400/40 bg-teal-500/10 px-3 py-2 text-sm text-teal-600">{aviso}</p>
      ) : null}

      {usaSello ? (
        <div
          className={`mt-4 flex flex-wrap items-center gap-3 rounded-2xl border px-3 py-2.5 ${
            isLight ? "border-slate-200 bg-slate-50/60" : "border-white/[0.07] bg-white/[0.02]"
          }`}
        >
          {sello ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={sello.data} alt="Firma y sello" className="h-14 w-auto rounded-lg bg-white p-1" />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Firma y sello digital</p>
            <p className={`text-[12px] ${sub}`}>
              {!selloCargado
                ? "Cargando…"
                : sello
                  ? "Va al final del memo, sobre la línea de firma, en el PDF, el Word y lo que se envía."
                  : "Todavía no está cargada. Suba la imagen de su firma y sello (PNG con fondo transparente es lo ideal)."}
            </p>
          </div>
          <input
            ref={selloInputRef}
            type="file"
            accept="image/png,image/jpeg"
            className="hidden"
            onChange={(e) => void subirSello(e.target.files?.[0])}
          />
          <button
            type="button"
            className={btnSec}
            disabled={!!ocupado}
            onClick={() => selloInputRef.current?.click()}
          >
            {ocupado === "sello" ? "Guardando…" : sello ? "Cambiar firma y sello" : "Cargar firma y sello"}
          </button>
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        {/* ---- Lista ---- */}
        <div className={`rounded-2xl border p-3 ${isLight ? "border-slate-200 bg-slate-50/60" : "border-white/[0.07] bg-white/[0.02]"}`}>
          <div className="flex gap-2">
            <select
              value={anio}
              onChange={(e) => setAnio(Number(e.target.value))}
              className={`${desplegable} w-24 shrink-0`}
              aria-label="Año"
            >
              {anios.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar número o asunto…"
              className={input}
            />
          </div>
          <div className="mt-3 max-h-[60vh] space-y-1.5 overflow-y-auto pr-1">
            {cargando ? <p className={`px-2 py-6 text-center text-sm ${sub}`}>Cargando…</p> : null}
            {!cargando && filtrados.length === 0 ? (
              <p className={`px-2 py-6 text-center text-sm ${sub}`}>
                {memos.some((m) => m.year === anio) ? "Nada coincide con la búsqueda." : `Sin memos guardados en ${anio}.`}
              </p>
            ) : null}
            {filtrados.map((m) => {
              const activo = m.id === idOriginal;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => abrir(m)}
                  className={`block w-full rounded-xl border px-3 py-2 text-left transition ${
                    activo
                      ? isLight
                        ? "border-teal-300 bg-teal-50"
                        : "border-teal-400/40 bg-teal-400/[0.08]"
                      : isLight
                        ? "border-transparent hover:border-slate-200 hover:bg-white"
                        : "border-transparent hover:border-white/10 hover:bg-white/[0.04]"
                  }`}
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-bold">No. {m.numero}</span>
                    <span className={`text-[11px] ${sub}`}>{memoFechaTexto(m.fecha)}</span>
                  </span>
                  <span className={`mt-0.5 block truncate text-[12.5px] ${isLight ? "text-slate-700" : "text-slate-300"}`}>
                    {m.asunto || "(sin asunto)"}
                  </span>
                  <span className={`block truncate text-[11px] ${sub}`}>Para: {m.bloques[0]?.personas[0]?.nombre || "—"}</span>
                  {m.enviado ? (
                    <span className="mt-0.5 block text-[10.5px] font-semibold text-emerald-500">Enviado por PULSO · {m.enviado}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* ---- Editor ---- */}
        {memo ? (
          <div className="min-w-0 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold">
                {idOriginal ? "Editando" : "Nuevo"} · {memoNumeroTexto(memo)}
                {cambiosSinGuardar ? <span className="ml-2 text-xs font-normal text-amber-500">sin guardar</span> : null}
              </p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void exportar("vista")} disabled={!!ocupado} className={btnSec}>
                  {ocupado === "vista" ? "Generando…" : "Vista previa"}
                </button>
                <button type="button" onClick={() => void exportar("pdf")} disabled={!!ocupado} className={btnSec}>
                  {ocupado === "pdf" ? "Generando…" : "Descargar PDF"}
                </button>
                <button type="button" onClick={() => void exportar("word")} disabled={!!ocupado} className={btnSec}>
                  {ocupado === "word" ? "Generando…" : "Descargar Word"}
                </button>
                <button
                  type="button"
                  onClick={() => void guardar()}
                  disabled={!!ocupado}
                  className={`${BTN_GUARDAR} rounded-xl px-4 py-2 text-sm transition disabled:opacity-50`}
                >
                  {ocupado === "guardar" ? "Guardando…" : "Guardar"}
                </button>
                {destino ? (
                  <button
                    type="button"
                    onClick={() => void enviar()}
                    disabled={!!ocupado}
                    title={cambiosSinGuardar || !idOriginal ? "Primero guarde el memo" : undefined}
                    className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {ocupado === "enviar" ? "Enviando…" : "Enviar por PULSO"}
                  </button>
                ) : null}
              </div>
              {destino ? (
                <div className={`flex w-full flex-wrap items-center justify-end gap-x-4 gap-y-1 text-[12px] ${sub}`}>
                  <span>Enviar a:</span>
                  <label className="flex items-center gap-1.5">
                    <input type="checkbox" checked={enviarOtraArea} onChange={(e) => setEnviarOtraArea(e.target.checked)} />
                    {NOMBRE_BANDEJA[destino as BandejaId]}
                  </label>
                  <label
                    className={`flex items-center gap-1.5 ${memoNombraGil(memo) ? "" : "opacity-50"}`}
                    title="Solo si el memo la nombra en el encabezado (PARA, CC., VÍA…)"
                  >
                    <input
                      type="checkbox"
                      disabled={!memoNombraGil(memo)}
                      checked={enviarGil && memoNombraGil(memo)}
                      onChange={(e) => setEnviarGil(e.target.checked)}
                    />
                    {NOMBRE_BANDEJA.sis}
                    {memoNombraGil(memo) ? "" : " (no va en el memo)"}
                  </label>
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-[150px_100px_100px_1fr_170px]">
              <label title="Va en el número: HNES-año-CÓDIGO-número">
                <span className={etiqueta}>Código</span>
                <input
                  className={`${input} uppercase`}
                  value={memo.codigoArea}
                  onChange={(e) => editar({ codigoArea: e.target.value })}
                />
              </label>
              <label>
                <span className={etiqueta}>Año</span>
                <input
                  type="number"
                  className={input}
                  value={memo.year}
                  onChange={(e) => editar({ year: Number(e.target.value) })}
                />
              </label>
              <label>
                <span className={etiqueta}>Número</span>
                <input
                  type="number"
                  min={1}
                  className={input}
                  value={memo.numero}
                  onChange={(e) => editar({ numero: Number(e.target.value) })}
                />
              </label>
              <label>
                <span className={etiqueta}>Lugar</span>
                <input className={input} value={memo.lugar} onChange={(e) => editar({ lugar: e.target.value })} />
              </label>
              <label>
                <span className={etiqueta}>Fecha</span>
                <input
                  type="date"
                  className={input}
                  value={memo.fecha}
                  onChange={(e) => editar({ fecha: e.target.value })}
                />
              </label>
            </div>

            <div className="space-y-2">
              <span className={etiqueta}>Encabezado (PARA, CC.:, DE, A TRAVÉS DE…)</span>
              {memo.bloques.map((bloque, b) => editorBloque(bloque, b, memo.bloques.length))}
              <button
                type="button"
                className={btnLink}
                onClick={() => editarBloques((lista) => [...lista, { etiqueta: "", personas: [{ nombre: "", cargo: "" }] }])}
              >
                + Agregar bloque
              </button>
              <p className={`text-[11px] ${sub}`}>
                Salen en este orden. Con ↑ ↓ se acomodan; un bloque sin personas no se imprime.
              </p>
            </div>

            <label className="block">
              <span className={etiqueta}>Asunto</span>
              <input
                className={input}
                value={memo.asunto}
                placeholder="Ej.: Entrega del Plan Anual Operativo (PAO)"
                onChange={(e) => editar({ asunto: e.target.value })}
              />
            </label>

            <label className="block">
              <span className={etiqueta}>Cuerpo del memo</span>
              <textarea
                ref={cuerpoRef}
                className={`${input} min-h-[320px] resize-y font-serif text-[15px] leading-relaxed`}
                value={memo.cuerpo}
                onChange={(e) => editar({ cuerpo: e.target.value })}
                spellCheck
              />
              <span className={`mt-1 block text-[11px] ${sub}`}>
                Cada Enter es un párrafo y un renglón vacío deja un espacio, igual que en Word. Un renglón que empieza
                con «- » sale como viñeta. Si el texto no cabe en una hoja, sigue solo en la siguiente con el mismo membrete.
              </span>
            </label>

            <div className="grid gap-3 sm:grid-cols-[1fr_1fr]">
              <label className="block">
                <span className={etiqueta}>Despedida</span>
                <input className={input} value={memo.despedida} onChange={(e) => editar({ despedida: e.target.value })} />
              </label>
              <label className="block">
                <span className={etiqueta}>Con copia (C.c.), una por renglón</span>
                <textarea
                  className={`${input} min-h-[42px] resize-y`}
                  rows={2}
                  value={memo.cc}
                  placeholder="Ej.: Archivo"
                  onChange={(e) => editar({ cc: e.target.value })}
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={memo.firma} onChange={(e) => editar({ firma: e.target.checked })} />
              Agregar línea de firma con el nombre y cargo del bloque «DE:»
            </label>
            {usaSello ? (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={memo.sellado} onChange={(e) => editar({ sellado: e.target.checked })} />
                Firmar y sellar (agrega la imagen de firma y sello al final, antes de guardar y enviar)
              </label>
            ) : null}
            {usaSello ? (
              <div className="flex flex-wrap items-center gap-3 pl-6">
                {sello ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={sello.data} alt="Firma y sello" className="h-12 w-auto rounded-lg bg-white p-1" />
                ) : selloCargado ? (
                  <span className="text-xs text-amber-500">Falta cargar la imagen de su firma y sello.</span>
                ) : null}
                <button
                  type="button"
                  className={`${BTN_GUARDAR} rounded-xl px-3.5 py-1.5 text-sm transition disabled:opacity-50`}
                  disabled={!!ocupado}
                  onClick={() => selloInputRef.current?.click()}
                >
                  {ocupado === "sello" ? "Guardando…" : sello ? "Cambiar firma y sello" : "Cargar firma y sello"}
                </button>
              </div>
            ) : null}
            {usaSello && sello && memo.sellado ? (
              <AjusteSello
                sello={sello}
                ajuste={memo.selloAjuste}
                onChange={(a) => editar({ selloAjuste: a })}
                despedida={memo.despedida}
                firmante={memo.firma ? memoFirmante(memo) : null}
                isLight={isLight}
                onColocar={() => setColocando(true)}
              />
            ) : null}

            <div className="flex flex-wrap justify-between gap-2 border-t pt-4 border-slate-500/20">
              <button type="button" onClick={cerrar} className={btnSec}>
                Cerrar
              </button>
              {idOriginal ? (
                <button
                  type="button"
                  onClick={() => void borrar()}
                  disabled={!!ocupado}
                  className="rounded-xl border border-rose-400/40 px-3.5 py-2 text-sm font-semibold text-rose-500 transition hover:bg-rose-500/10 disabled:opacity-50"
                >
                  {ocupado === "borrar" ? "Eliminando…" : "Eliminar memo"}
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div
            className={`flex min-h-[240px] flex-col items-center justify-center rounded-2xl border border-dashed p-6 text-center ${
              isLight ? "border-slate-300 text-slate-500" : "border-white/15 text-slate-400"
            }`}
          >
            <p className="text-sm">Abrí un memo de la lista o creá uno nuevo.</p>
            <p className="mt-1 text-xs">
              El número se propone solo (el siguiente del año), pero se puede cambiar.
            </p>
          </div>
        )}
      </div>

      {colocando && memo && sello ? (
        <VistaSello
          memo={memo}
          sello={sello}
          isLight={isLight}
          onCerrar={() => setColocando(false)}
          onListo={(a) => {
            editar({ selloAjuste: a });
            setColocando(false);
            setAviso("Posición del sello lista. Guarde el memo para que quede así.");
          }}
        />
      ) : null}

      {vistaUrl ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-3" onClick={() => setVistaUrl(null)}>
          <div
            className={`flex h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl ${tarjeta}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 px-4 py-2">
              <p className="text-sm font-semibold">Vista previa (PDF)</p>
              <button type="button" className={btnSec} onClick={() => setVistaUrl(null)}>
                Cerrar
              </button>
            </div>
            <iframe title="Vista previa del memo" src={vistaUrl} className="h-full w-full flex-1 bg-white" />
          </div>
        </div>
      ) : null}
    </section>
  );
}
