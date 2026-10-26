import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentAlumno } from "@/lib/alumno";
import { puntosHabilitadoParaAlumno } from "@/lib/gymPuntosPrueba";
import { getHorariosDia } from "@/lib/gymCupo";
import { hoyISOArgentina } from "@/lib/tz";
import { getCheckinConfig } from "@/lib/gymCheckinConfig";
import { distanciaMetros } from "@/lib/geo";

// Check-in del socio: marca su propia asistencia de HOY a una clase que tiene
// reservada (fijo de hoy o suelta de hoy). Eso alimenta los puntos. El QR del
// gym y el chip NFC apuntan a /checkin, que termina llamando acá.
// Gateado a la cuenta de prueba por ahora.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const alumno = await getCurrentAlumno(supabase);
  if (!alumno) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!puntosHabilitadoParaAlumno(alumno.telefono, alumno.email)) {
    return NextResponse.json(
      { error: "El check-in todavía no está habilitado." },
      { status: 403 },
    );
  }

  let body: { horarioId?: string; lat?: number; lng?: number };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const horarioId = body.horarioId?.trim();
  if (!horarioId) {
    return NextResponse.json({ error: "Falta la clase" }, { status: 400 });
  }

  const hoy = hoyISOArgentina();

  // Validación: el horario tiene que ser una clase ACTIVA del gym para hoy. No
  // exigimos reserva previa: el socio puede marcar "vine a entrenar" a cualquier
  // clase del día (el anti-trampa por ubicación es lo que evita el abuso).
  const horariosHoy = await getHorariosDia(alumno.tenant_id, hoy);
  const valida = horariosHoy.some((h) => h.horario_id === horarioId);
  if (!valida) {
    return NextResponse.json(
      { error: "Esa clase no está disponible hoy." },
      { status: 400 },
    );
  }

  // Anti-trampa: si el gym configuró su ubicación, el socio tiene que estar
  // dentro del radio para marcar asistencia (no se puede desde casa).
  const cfg = await getCheckinConfig(alumno.tenant_id);
  if (cfg.configurada) {
    const lat = typeof body.lat === "number" ? body.lat : null;
    const lng = typeof body.lng === "number" ? body.lng : null;
    if (lat === null || lng === null) {
      return NextResponse.json(
        {
          error:
            "Necesitamos tu ubicación para marcar asistencia. Activá el GPS y permití el acceso a la ubicación.",
        },
        { status: 400 },
      );
    }
    const dist = distanciaMetros(lat, lng, cfg.lat!, cfg.lng!);
    if (dist > cfg.radioM) {
      return NextResponse.json(
        { error: "Tenés que estar en el gimnasio para marcar asistencia." },
        { status: 400 },
      );
    }
  }

  const svc = createServiceClient();
  const { error } = await svc.from("gym_asistencias").upsert(
    {
      tenant_id: alumno.tenant_id,
      alumno_id: alumno.id,
      horario_id: horarioId,
      fecha: hoy,
      estado: "presente",
      updated_at: new Date().toISOString(),
    },
    { onConflict: "alumno_id,horario_id,fecha" },
  );
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
