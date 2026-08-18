import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentAlumno } from "@/lib/alumno";
import { rutinaHabilitadaParaAlumno } from "@/lib/gymRutinaPrueba";

// El alumno registra lo que hizo de un ejercicio de su rutina (peso/reps del
// día). alumno_id y tenant salen de la sesión — no se confían del cliente.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Payload {
  ejercicioId?: string;
  ejercicioNombre?: string;
  peso?: string;
  reps?: string;
  nota?: string;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const alumno = await getCurrentAlumno(supabase);
  if (!alumno) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  // En prueba: rutinas habilitadas solo para el perfil de alumno permitido.
  if (!rutinaHabilitadaParaAlumno(alumno.telefono)) {
    return NextResponse.json({ error: "No habilitado" }, { status: 403 });
  }

  let body: Payload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const ejercicioId = body.ejercicioId?.trim();
  if (!ejercicioId) {
    return NextResponse.json({ error: "Falta el ejercicio" }, { status: 400 });
  }
  const peso = (body.peso ?? "").trim() || null;
  const reps = (body.reps ?? "").trim() || null;
  const nota = (body.nota ?? "").trim() || null;
  if (!peso && !reps && !nota) {
    return NextResponse.json({ error: "Cargá al menos el peso o las reps." }, { status: 400 });
  }

  const svc = createServiceClient();
  const { data, error } = await svc
    .from("gym_rutina_logs")
    .insert({
      tenant_id: alumno.tenant_id,
      alumno_id: alumno.id,
      ejercicio_id: ejercicioId,
      ejercicio_nombre: (body.ejercicioNombre ?? "").trim() || null,
      peso,
      reps,
      nota,
    })
    .select("id, ejercicio_id, fecha, peso, reps, nota")
    .single();
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, log: data });
}
