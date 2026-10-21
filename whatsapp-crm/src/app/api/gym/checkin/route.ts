import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentAlumno } from "@/lib/alumno";
import { puntosHabilitadoParaAlumno } from "@/lib/gymPuntosPrueba";
import { getMisReservas } from "@/lib/gymCupo";
import { hoyISOArgentina } from "@/lib/tz";

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
  if (!puntosHabilitadoParaAlumno(alumno.telefono)) {
    return NextResponse.json(
      { error: "El check-in todavía no está habilitado." },
      { status: 403 },
    );
  }

  let body: { horarioId?: string };
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
  const diaSemana = new Date(`${hoy}T12:00:00Z`).getUTCDay();

  // Validación: el socio tiene ESA clase reservada HOY (fijo de hoy o suelta de hoy).
  const reservas = alumno.telefono ? await getMisReservas(alumno.telefono) : [];
  const valida = reservas.some(
    (r) =>
      r.horario_id === horarioId &&
      ((r.tipo === "suelta" && r.fecha === hoy) ||
        (r.tipo === "fijo" && r.dia_semana === diaSemana)),
  );
  if (!valida) {
    return NextResponse.json(
      { error: "No tenés esa clase reservada para hoy." },
      { status: 400 },
    );
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
