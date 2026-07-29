import { NextResponse, type NextRequest } from "next/server";
import { getMisReservas } from "@/lib/gymCupo";
import { normalizeArPhone } from "@/lib/phone";

// Reservas futuras del alumno, identificado por WhatsApp. Sin sesión: el
// "esto es tuyo" lo resuelve la función security definer comparando teléfono.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const telefonoRaw = searchParams.get("telefono")?.trim();

  if (!telefonoRaw) {
    return NextResponse.json({ error: "Falta el WhatsApp" }, { status: 400 });
  }
  const telefono = normalizeArPhone(telefonoRaw);
  if (telefono.length < 10) {
    return NextResponse.json({ error: "WhatsApp inválido" }, { status: 400 });
  }

  const reservas = await getMisReservas(telefono);
  return NextResponse.json({ reservas });
}
