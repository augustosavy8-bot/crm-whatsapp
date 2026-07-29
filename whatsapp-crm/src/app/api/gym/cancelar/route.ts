import { NextResponse, type NextRequest } from "next/server";
import { cancelarFijo, cancelarSuelta } from "@/lib/gymCupo";
import { normalizeArPhone } from "@/lib/phone";

// Baja de una reserva del alumno. "suelta" -> estado cancelada; "fijo" -> baja
// del fijo entero (deja de ir todas las semanas). Ambas liberan cupo. El
// teléfono valida la titularidad dentro de la función security definer.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Payload {
  tipo?: "suelta" | "fijo";
  id?: string;
  telefono?: string;
}

export async function POST(request: NextRequest) {
  let body: Payload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const id = body.id?.trim();
  const telefonoRaw = body.telefono?.trim();
  if (!id || !telefonoRaw) {
    return NextResponse.json({ error: "Faltan datos" }, { status: 400 });
  }
  if (body.tipo !== "suelta" && body.tipo !== "fijo") {
    return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
  }
  const telefono = normalizeArPhone(telefonoRaw);
  if (telefono.length < 10) {
    return NextResponse.json({ error: "WhatsApp inválido" }, { status: 400 });
  }

  try {
    if (body.tipo === "suelta") {
      await cancelarSuelta({ reservaId: id, telefono });
    } else {
      await cancelarFijo({ turnoFijoId: id, telefono });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo cancelar.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
