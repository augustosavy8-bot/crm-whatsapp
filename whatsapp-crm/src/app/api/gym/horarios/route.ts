import { NextResponse, type NextRequest } from "next/server";
import { getGymContext } from "@/lib/gym";
import { getHorariosDia } from "@/lib/gymCupo";
import { createServiceClient } from "@/lib/supabase/service";
import { AR_TZ } from "@/lib/tz";

// Grilla pública del alumno: horarios de un día con su cupo usado/total.
// Sin sesión — corre server-side con el service client (dentro de getHorariosDia).
// Solo devuelve horario/hora/cupo; ningún dato de alumnos.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_DIAS_ADELANTE = 60;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const fecha = searchParams.get("fecha")?.trim();

  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  }

  // No dejar pedir fechas pasadas ni más allá del tope, comparado contra HOY AR.
  const hoyAR = new Date().toLocaleDateString("en-CA", { timeZone: AR_TZ });
  const topeAR = new Date(`${hoyAR}T12:00:00Z`);
  topeAR.setUTCDate(topeAR.getUTCDate() + MAX_DIAS_ADELANTE);
  const topeISO = topeAR.toISOString().slice(0, 10);
  if (fecha < hoyAR || fecha > topeISO) {
    return NextResponse.json({ horarios: [] });
  }

  const gym = await getGymContext();
  if (!gym) {
    return NextResponse.json({ error: "Gimnasio no configurado" }, { status: 503 });
  }

  // Día cerrado (feriado): no hay clases ni se puede reservar.
  const svc = createServiceClient();
  const { data: cerrado } = await svc
    .from("gym_dias_cerrados")
    .select("motivo")
    .eq("tenant_id", gym.tenantId)
    .eq("fecha", fecha)
    .maybeSingle();
  if (cerrado) {
    return NextResponse.json({
      horarios: [],
      cerrado: true,
      motivo: (cerrado.motivo as string | null) ?? null,
    });
  }

  const horarios = await getHorariosDia(gym.tenantId, fecha);
  return NextResponse.json({ horarios });
}
