import { NextResponse, type NextRequest } from "next/server";
import { marcarExcepcion } from "@/lib/gymCupo";
import { normalizeArPhone } from "@/lib/phone";

// El alumno con fijo avisa que un día puntual NO va: libera su cupo esa fecha,
// sin dar de baja el fijo. El teléfono valida titularidad dentro de la función.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Payload {
  turnoFijoId?: string;
  fecha?: string; // YYYY-MM-DD
  telefono?: string;
}

export async function POST(request: NextRequest) {
  let body: Payload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const turnoFijoId = body.turnoFijoId?.trim();
  const fecha = body.fecha?.trim();
  const telefonoRaw = body.telefono?.trim();
  if (!turnoFijoId || !fecha || !telefonoRaw) {
    return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  }
  const telefono = normalizeArPhone(telefonoRaw);
  if (telefono.length < 10) {
    return NextResponse.json({ error: "WhatsApp inválido" }, { status: 400 });
  }

  try {
    await marcarExcepcion({ turnoFijoId, fecha, telefono });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo registrar.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
