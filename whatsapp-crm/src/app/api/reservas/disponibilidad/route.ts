import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getGymContext } from "@/lib/gym";
import { AR_TZ } from "@/lib/tz";

// Slots libres de un servicio para una fecha. Público (sin sesión): corre
// server-side con el service client y solo devuelve instantes ISO — ningún
// dato de pacientes ni de otros turnos. La garantía de que no filtra nada
// es que slots_disponibles() devuelve únicamente `timestamptz`.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Tope defensivo: no dejar pedir disponibilidad de fechas arbitrariamente
// lejanas (evita escaneos y reservas a 5 años).
const MAX_DIAS_ADELANTE = 60;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const servicioParam = searchParams.get("servicio")?.trim();
  const fecha = searchParams.get("fecha")?.trim();

  if (!servicioParam || !fecha) {
    return NextResponse.json(
      { error: "Faltan parámetros: servicio y fecha" },
      { status: 400 },
    );
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  }

  // La fecha no puede ser pasada ni más allá del tope. Se compara contra HOY
  // en Buenos Aires, no contra el día del server.
  const hoyAR = new Date().toLocaleDateString("en-CA", { timeZone: AR_TZ });
  const topeAR = new Date(`${hoyAR}T12:00:00Z`);
  topeAR.setUTCDate(topeAR.getUTCDate() + MAX_DIAS_ADELANTE);
  const topeISO = topeAR.toISOString().slice(0, 10);
  if (fecha < hoyAR || fecha > topeISO) {
    return NextResponse.json({ slots: [] });
  }

  const gym = await getGymContext();
  if (!gym) {
    return NextResponse.json(
      { error: "Gimnasio no configurado" },
      { status: 503 },
    );
  }

  // El front puede mandar slug (más lindo en la URL) o el uuid del servicio.
  const servicio = gym.servicios.find(
    (s) => s.slug === servicioParam || s.id === servicioParam,
  );
  if (!servicio) {
    return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 });
  }

  const sb = createServiceClient();
  const { data, error } = await sb.rpc("slots_disponibles", {
    p_servicio_id: servicio.id,
    p_fecha: fecha,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const slots = (data ?? []).map(
    (row: { inicio: string }) => row.inicio,
  );
  return NextResponse.json({ slots });
}
