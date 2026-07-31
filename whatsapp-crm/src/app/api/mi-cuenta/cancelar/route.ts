import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAlumno } from "@/lib/alumno";
import { cancelarFijo, cancelarSuelta } from "@/lib/gymCupo";

// Baja de una reserva del alumno LOGUEADO. El teléfono (titularidad) sale de la
// sesión, no del cuerpo: solo puede cancelar lo suyo. La función security
// definer igual revalida el teléfono contra la reserva.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Payload {
  tipo?: "suelta" | "fijo";
  id?: string;
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

  const id = body.id?.trim();
  if (!id) {
    return NextResponse.json({ error: "Falta la reserva" }, { status: 400 });
  }
  if (body.tipo !== "suelta" && body.tipo !== "fijo") {
    return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
  }

  try {
    if (body.tipo === "suelta") {
      await cancelarSuelta({ reservaId: id, telefono: alumno.telefono });
    } else {
      await cancelarFijo({ turnoFijoId: id, telefono: alumno.telefono });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo cancelar.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
