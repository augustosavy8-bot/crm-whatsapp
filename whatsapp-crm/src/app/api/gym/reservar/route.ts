import { NextResponse, type NextRequest } from "next/server";
import { getGymContext } from "@/lib/gym";
import { anotarFijo, reservarSuelta } from "@/lib/gymCupo";
import { notificarReservaGym } from "@/lib/gymNotif";
import { normalizeArPhone } from "@/lib/phone";
import { createServiceClient } from "@/lib/supabase/service";
import { reservaBloqueadaPorDeuda, MENSAJE_DEUDA } from "@/lib/gymDeuda";

// Alta de reserva de clase del gimnasio, sin cuenta. Dos modos que conviven:
//   - "suelta": una fecha puntual.
//   - "fijo":   todas las semanas a ese horario, desde esa fecha.
// Server-side con el service client (dentro de gymCupo). La garantía de cupo
// es el trigger gym_valida_cupo en la base, no esta capa.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Payload {
  horarioId?: string;
  fecha?: string; // YYYY-MM-DD
  tipo?: "suelta" | "fijo";
  nombre?: string;
  telefono?: string;
}

export async function POST(request: NextRequest) {
  let body: Payload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const horarioId = body.horarioId?.trim();
  const fecha = body.fecha?.trim();
  const tipo = body.tipo;
  const nombre = body.nombre?.trim();
  const telefonoRaw = body.telefono?.trim();

  if (!horarioId || !fecha || !nombre || !telefonoRaw) {
    return NextResponse.json(
      { error: "Faltan datos: horario, fecha, nombre y WhatsApp son obligatorios." },
      { status: 400 },
    );
  }
  if (tipo !== "suelta" && tipo !== "fijo") {
    return NextResponse.json({ error: "Tipo de reserva inválido" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  }

  // Mismo normalizador que el resto del CRM: un solo criterio de número para
  // deduplicar al alumno por WhatsApp.
  const telefono = normalizeArPhone(telefonoRaw);
  if (telefono.length < 10) {
    return NextResponse.json(
      { error: "El número de WhatsApp no parece válido. Revisalo, con código de área." },
      { status: 400 },
    );
  }

  const gym = await getGymContext();
  if (!gym) {
    return NextResponse.json({ error: "Gimnasio no configurado" }, { status: 503 });
  }

  // Para reservar hay que estar al día (gracia del 1 al 20). El alumno se
  // identifica por teléfono; si es nuevo (sin cuota), igual entra en la gracia.
  const svc = createServiceClient();
  const { data: alu } = await svc
    .from("gym_alumnos")
    .select("cuota_hasta")
    .eq("tenant_id", gym.tenantId)
    .eq("telefono", telefono)
    .maybeSingle();
  if (reservaBloqueadaPorDeuda((alu?.cuota_hasta as string | null) ?? null)) {
    return NextResponse.json({ error: MENSAJE_DEUDA }, { status: 402 });
  }

  try {
    let id: string;
    if (tipo === "suelta") {
      id = await reservarSuelta({ horarioId, fecha, nombre, telefono });
    } else {
      id = await anotarFijo({ horarioId, fechaDesde: fecha, nombre, telefono });
    }
    // Aviso al staff para que confirme (best-effort).
    await notificarReservaGym({ tenantId: gym.tenantId, nombre, horarioId, fecha, tipo });
    return NextResponse.json({ ok: true, tipo, id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo reservar.";
    // El trigger de cupo lanza "No hay cupo disponible…": es un caso esperable
    // (se llenó mientras completaba), no un 500.
    const lleno = /cupo/i.test(msg);
    return NextResponse.json({ error: msg }, { status: lleno ? 409 : 400 });
  }
}
