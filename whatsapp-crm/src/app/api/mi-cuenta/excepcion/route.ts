import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAlumno } from "@/lib/alumno";
import { marcarExcepcion } from "@/lib/gymCupo";

// "No voy ese día" de un turno fijo, del alumno LOGUEADO. El teléfono
// (titularidad) sale de la sesión, no del cuerpo: solo sobre lo suyo. La
// función security definer igual revalida el teléfono contra el turno fijo.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Payload {
  turnoFijoId?: string;
  fecha?: string; // YYYY-MM-DD
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const alumno = await getCurrentAlumno(supabase);
  if (!alumno) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!alumno.telefono) {
    return NextResponse.json({ error: "Completá tu WhatsApp en tu cuenta." }, { status: 400 });
  }

  let body: Payload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const turnoFijoId = body.turnoFijoId?.trim();
  const fecha = body.fecha?.trim();
  if (!turnoFijoId || !fecha || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  try {
    await marcarExcepcion({ turnoFijoId, fecha, telefono: alumno.telefono });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo registrar.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
