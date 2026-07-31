import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAlumno } from "@/lib/alumno";
import { anotarFijo, reservarSuelta } from "@/lib/gymCupo";

// Alta de reserva del alumno LOGUEADO. Igual que /api/gym/reservar pero el
// nombre y el teléfono salen de la sesión: no se re-piden ni se pueden falsear.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Payload {
  horarioId?: string;
  fecha?: string; // YYYY-MM-DD
  tipo?: "suelta" | "fijo";
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const alumno = await getCurrentAlumno(supabase);
  if (!alumno) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  let body: Payload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const horarioId = body.horarioId?.trim();
  const fecha = body.fecha?.trim();
  const tipo = body.tipo;

  if (!horarioId || !fecha) {
    return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  }
  if (tipo !== "suelta" && tipo !== "fijo") {
    return NextResponse.json({ error: "Tipo de reserva inválido" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  }

  try {
    if (tipo === "suelta") {
      const id = await reservarSuelta({
        horarioId,
        fecha,
        nombre: alumno.nombre,
        telefono: alumno.telefono,
      });
      return NextResponse.json({ ok: true, tipo, id });
    }
    const id = await anotarFijo({
      horarioId,
      fechaDesde: fecha,
      nombre: alumno.nombre,
      telefono: alumno.telefono,
    });
    return NextResponse.json({ ok: true, tipo, id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo reservar.";
    const lleno = /cupo/i.test(msg);
    return NextResponse.json({ error: msg }, { status: lleno ? 409 : 400 });
  }
}
