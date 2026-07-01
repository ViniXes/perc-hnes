import { NextRequest, NextResponse } from "next/server";
import { KNOWN_ACTION_IDS, type AssistantActionId } from "@/lib/assistant-actions";

export const runtime = "nodejs";

// Respaldo de IA del asistente. Se usa SOLO cuando la capa de palabras clave y la
// base de preguntas frecuentes no resuelven. Requiere GEMINI_API_KEY en el entorno
// (.env.local en local, Variables de Entorno en Vercel). Si no hay clave, degrada
// con gracia y el asistente sigue funcionando con la capa offline.

type ReqBody = {
  message?: string;
  context?: Record<string, unknown>;
  availableActions?: { id: string; label: string }[];
};

const GEMINI_MODEL = "gemini-2.0-flash";

// Freno del nivel gratuito: cuando Google responde 429 (limite alcanzado), se
// apaga la IA hasta este instante (epoch ms). Mientras tanto no se vuelve a
// llamar a Gemini; el asistente responde con la capa offline. Se re-evalua solo
// cuando pasa el tiempo que Google indica.
let cooldownUntil = 0;

const LIMIT_REPLY =
  "El asistente inteligente alcanzó su límite de uso gratuito por ahora. Seguí usando las órdenes y opciones de abajo; la consulta libre se reactiva sola cuando se restablece el límite gratuito.";

export async function POST(req: NextRequest) {
  let body: ReqBody = {};
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    body = {};
  }

  const message = typeof body.message === "string" ? body.message.slice(0, 500).trim() : "";
  const available = Array.isArray(body.availableActions) ? body.availableActions : [];

  if (!message) {
    return NextResponse.json({ reply: "Escribime tu consulta y te ayudo.", actionId: null });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      reply:
        "No encontré una respuesta exacta y el asistente inteligente todavía no está configurado. Probá con las opciones de abajo o avisá al administrador.",
      actionId: null,
    });
  }

  // Freno activo: no llamamos a Gemini hasta que se restablezca el limite.
  if (Date.now() < cooldownUntil) {
    return NextResponse.json({ reply: LIMIT_REPLY, actionId: null, limited: true });
  }

  const actionList = available.map((a) => `- ${a.id}: ${a.label}`).join("\n") || "(ninguna disponible)";

  const systemPrompt = [
    "Sos el asistente virtual de PULSO, la plataforma del Hospital Nacional El Salvador para capturar la producción mensual de cada servicio (tabuladores PERC, SEPS y Distribución de Horas).",
    "Respondés SIEMPRE en español, con un tono cordial, claro y breve (máximo 3 frases).",
    "Ayudás a los usuarios a usar el sistema y, cuando piden hacer algo concreto, podés proponer una acción de esta lista (usá el id EXACTO):",
    actionList,
    "Reglas:",
    "- Devolvé un JSON con { reply, actionId }.",
    "- 'reply' es tu respuesta en español.",
    "- 'actionId' es el id de la acción SOLO si el usuario claramente quiere ejecutar una de la lista; si solo pregunta información o no aplica ninguna, poné actionId en null.",
    "- Nunca inventes ids que no estén en la lista.",
    "- No pidas ni menciones datos sensibles de pacientes.",
  ].join("\n");

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: "user", parts: [{ text: message }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 300,
            responseMimeType: "application/json",
            responseSchema: {
              type: "object",
              properties: {
                reply: { type: "string" },
                actionId: { type: "string", nullable: true },
              },
              required: ["reply"],
            },
          },
        }),
      },
    );

    // 429 = limite del nivel gratuito alcanzado. Activamos el freno.
    if (res.status === 429) {
      let delayMs = 60_000; // por defecto reintenta al minuto (limite por minuto)
      try {
        const errBody = await res.json();
        const details: Array<Record<string, unknown>> = Array.isArray(errBody?.error?.details)
          ? errBody.error.details
          : [];
        const retry = details.find(
          (d) => typeof d["@type"] === "string" && (d["@type"] as string).includes("RetryInfo"),
        );
        const retryDelay = retry?.["retryDelay"];
        const secs = typeof retryDelay === "string" ? parseInt(retryDelay, 10) : NaN;
        // Respetamos lo que indica Google, con un tope de 6 horas para re-evaluar.
        if (!Number.isNaN(secs) && secs > 0) delayMs = Math.min(secs * 1000, 6 * 60 * 60 * 1000);
      } catch {
        // Si no se pudo leer el detalle, queda el reintento por minuto.
      }
      cooldownUntil = Date.now() + delayMs;
      return NextResponse.json({ reply: LIMIT_REPLY, actionId: null, limited: true });
    }

    if (!res.ok) throw new Error(`gemini ${res.status}`);

    const data = await res.json();
    const text: string = data?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";

    let parsed: { reply?: unknown; actionId?: unknown } = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = {};
    }

    const reply =
      typeof parsed.reply === "string" && parsed.reply.trim()
        ? parsed.reply.trim()
        : "Perdón, no entendí bien. ¿Podés reformularlo con otras palabras?";

    let actionId: AssistantActionId | null = null;
    if (typeof parsed.actionId === "string" && KNOWN_ACTION_IDS.includes(parsed.actionId as AssistantActionId)) {
      // Solo se acepta si tambien esta disponible en el contexto del usuario.
      if (available.some((a) => a.id === parsed.actionId)) {
        actionId = parsed.actionId as AssistantActionId;
      }
    }

    return NextResponse.json({ reply, actionId });
  } catch {
    return NextResponse.json({
      reply: "No pude conectar con el asistente inteligente en este momento. Probá con las opciones de abajo.",
      actionId: null,
    });
  }
}
