import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAlumno } from "@/lib/alumno";
import { getMisReservas } from "@/lib/gymCupo";

// Reservas del alumno LOGUEADO. A diferencia de /api/gym/mis-reservas (público,
// teléfono por query), acá el teléfono sale de la sesión: el alumno no puede
// pedir las reservas de otro.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();
  const alumno = await getCurrentAlumno(supabase);
  if (!alumno) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const reservas = await getMisReservas(alumno.telefono);
  return NextResponse.json({ reservas });
}
