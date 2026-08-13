import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAlumno } from "@/lib/alumno";
import { getMisReservas } from "@/lib/gymCupo";

// Reservas del alumno LOGUEADO: el teléfono (titularidad) sale de la sesión, no
// de un query. Gestionar reservas exige cuenta (no hay más lookup por teléfono).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const alumno = await getCurrentAlumno(supabase);
  if (!alumno) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  // Sin WhatsApp cargado todavía no hay reservas posibles (el cupo se maneja
  // por teléfono). Devolvemos vacío en vez de romper.
  if (!alumno.telefono) {
    return NextResponse.json({ reservas: [] });
  }

  const reservas = await getMisReservas(alumno.telefono);
  return NextResponse.json({ reservas });
}
