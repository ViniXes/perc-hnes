/**
 * AVISOS DIRIGIDOS
 *
 * Mensajes de alerta para personas puntuales (por nombre de usuario). A cada
 * persona le sale al entrar a PULSO y le SIGUE saliendo hasta que presiona
 * "Entendido"; desde ese momento no vuelve a aparecer (queda guardado en su
 * perfil, campo avisosVistos, asi no se repite aunque cambie de equipo).
 *
 * Si el aviso trae `falta`, el administrador deja ademas un registro en la
 * Bitacora (una sola vez) con esa falta.
 */
export type AvisoDirigido = {
  /** Identificador estable. NO cambiarlo: es lo que se guarda como "visto". */
  id: string;
  /** Nombres de usuario (sin @perc-hnes.app) a los que les sale el aviso. */
  usuarios: string[];
  titulo: string;
  texto: string;
  /** Registro que queda en la Bitacora como falta. */
  falta?: { accion: string; detalle: string };
};

export const AVISOS_DIRIGIDOS: AvisoDirigido[] = [
  {
    id: "perc-tarde-2026-09-lavanderia",
    usuarios: ["wrodriguez", "adominguez", "aarriaga"],
    titulo: "Entrega tardía del PERC",
    texto:
      "El PERC de septiembre de 2026 de Lavandería se registró fuera de plazo: se guardó el martes 6 de octubre a las 8:57 a. m., cuando la captura había cerrado el lunes 5 de octubre a las 2:30 p. m. (3er día hábil). Se permitió que la información quedara registrada, pero queda constancia de la entrega tardía en la bitácora de PULSO. Recuerde que el PERC se registra los primeros 3 días hábiles de cada mes, hasta las 2:30 p. m. del tercero.",
    falta: {
      accion: "Falta: entrega tardía de PERC",
      detalle:
        "Lavandería · septiembre de 2026 · guardado por wrodriguez el 06/10/2026 a las 8:57 a. m. (la captura cerró el 05/10/2026 a las 2:30 p. m.). Se permitió el registro. Aviso enviado a wrodriguez, adominguez y aarriaga.",
    },
  },
  {
    id: "perc-tarde-2026-09-ceye",
    usuarios: ["maquino"],
    titulo: "Entrega tardía del PERC",
    texto:
      "El PERC de septiembre de 2026 de CEYE se registró fuera de plazo: se guardó el lunes 5 de octubre a las 4:06 p. m., cuando la captura había cerrado ese mismo día a las 2:30 p. m. (3er día hábil). Se permitió que la información quedara registrada, pero queda constancia de la entrega tardía en la bitácora de PULSO. Recuerde que el PERC se registra los primeros 3 días hábiles de cada mes, hasta las 2:30 p. m. del tercero.",
    falta: {
      accion: "Falta: entrega tardía de PERC",
      detalle:
        "CEYE · septiembre de 2026 · guardado por maquino el 05/10/2026 a las 4:06 p. m. (la captura cerró el 05/10/2026 a las 2:30 p. m.). Se permitió el registro. Aviso enviado a maquino.",
    },
  },
  {
    id: "perc-tarde-2026-09-almacen-medicamentos",
    usuarios: ["ogutierrez"],
    titulo: "Entrega tardía del PERC",
    texto:
      "El PERC de septiembre de 2026 de Almacén Medicamentos se registró fuera de plazo: se guardó el martes 6 de octubre a las 8:24 a. m., cuando la captura había cerrado el lunes 5 de octubre a las 2:30 p. m. (3er día hábil). Se permitió que la información quedara registrada, pero queda constancia de la entrega tardía en la bitácora de PULSO. Recuerde que el PERC se registra los primeros 3 días hábiles de cada mes, hasta las 2:30 p. m. del tercero.",
    falta: {
      accion: "Falta: entrega tardía de PERC",
      detalle:
        "Almacén Medicamentos · septiembre de 2026 · guardado por ogutierrez el 06/10/2026 a las 8:24 a. m. (la captura cerró el 05/10/2026 a las 2:30 p. m.). Se permitió el registro. Aviso enviado a ogutierrez.",
    },
  },
];
