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
  "El asistente inteligente alcanzó su límite de uso gratuito por ahora. Siga usando las órdenes y opciones de abajo; la consulta libre se reactiva sola cuando se restablece el límite gratuito.";

export async function POST(req: NextRequest) {
  let body: ReqBody = {};
  try {
    body = (await req.json()) as ReqBody;
  } catch {
    body = {};
  }

  const message = typeof body.message === "string" ? body.message.slice(0, 280).trim() : "";
  const available = Array.isArray(body.availableActions) ? body.availableActions : [];

  if (!message) {
    return NextResponse.json({ reply: "Escríbame su consulta y le ayudo.", actionId: null });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return NextResponse.json({
      reply:
        "No estoy seguro de eso puntualmente. Puedo ayudarle a ir a PERC, SEPS o Dis/horas, cambiar su contraseña, cambiar el modo claro/oscuro, abrir soporte, solicitar habilitación o guardar su captura. Escríbame qué necesita con otras palabras o toque un tema de abajo.",
      actionId: null,
    });
  }

  // Freno activo: no llamamos a Gemini hasta que se restablezca el limite.
  if (Date.now() < cooldownUntil) {
    return NextResponse.json({ reply: LIMIT_REPLY, actionId: null, limited: true });
  }

  const actionList = available.map((a) => `- ${a.id}: ${a.label}`).join("\n") || "(ninguna disponible)";

  const systemPrompt = [
    "Sos el asistente de PULSO (Hospital Nacional El Salvador), app para capturar la producción mensual por servicio.",
    "Respondé SIEMPRE en español, tratando de USTED, breve (2-3 frases; máx 5 si piden un cómo-hacer).",
    "Módulos: PERC (productividad), SEPS (estadística diaria por días del mes, Total automático), Distribución de Horas; además Insumos, Censo, Consolidados, DOCS. Para capturar: abrir el tabulador, llenar el período y Guardar. Meses previos son solo lectura (salvo admin). Cierres: PERC/SEPS 3er día hábil 2:30pm, Horas 5º, SEPS reabre 6º.",
    "Se puede arrastrar un Excel del servicio al chat y el sistema llena el tabulador del mes; luego el usuario revisa y guarda.",
    "No pidas ni menciones datos sensibles de pacientes.",
    "Si el usuario quiere ejecutar algo, proponé UNA acción por su id EXACTO de esta lista:",
    actionList,
    "Devolvé JSON { reply, actionId }. actionId = id solo si claramente quiere ejecutar una acción; si no, null. Nunca inventes ids.",
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
        const secs = typeof retryDelay === "string" ? parse