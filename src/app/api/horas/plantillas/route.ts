import { getAdminAuth, getAdminDb } from "@/lib/firebase-admin";
import { HORAS_TEMPLATES } from "@/lib/horas-plantillas-privadas";
import { puedeConsolidarNomina, puedeLeerNomina } from "@/lib/horas-permisos";

export async function POST(request: Request) {
  const bearer = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!bearer) return new Response(null, { status: 401 });
  const auth = getAdminAuth();
  const db = getAdminDb();
  if (!auth || !db) return new Response(null, { status: 503 });
  const token = await auth.verifyIdToken(bearer, true).catch(() => null);
  if (!token) return new Response(null, { status: 401 });
  const body = await request.json().catch(() => null);
  const profile = (await db.collection("serviceUsers").doc(token.uid).get()).data();
  const headers = { "Cache-Control": "private, no-store" };
  if (body?.consolidado === true) {
    const permitidas = Object.values(HORAS_TEMPLATES).filter(t => puedeConsolidarNomina(profile, t.serviceId, token.email));
    if (!permitidas.length) return new Response(null, { status: 403 });
    return Response.json(permitidas, { headers });
  }
  const id = body?.serviceId;
  if (typeof id !== "string" || !Object.hasOwn(HORAS_TEMPLATES, id) || !puedeLeerNomina(profile, id)) {
    return new Response(null, { status: 403 });
  }
  return Response.json([HORAS_TEMPLATES[id]], { headers });
}
