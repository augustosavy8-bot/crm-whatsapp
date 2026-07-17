import { NextResponse, type NextRequest } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getGymContext } from "@/lib/gym";
import { normalizeArPhone } from "@/lib/phone";

// Alta de un turno desde el front público (sin cuenta). Server-side con el
// service client: valida, normaliza el teléfono y delega TODO a la función
// crear_turno_publico(), que revalida el slot y crea/vincula el paciente en
// una sola transacción. La garantía contra doble reserva es la EXCLUDE de la
// base (23P01), no esta validación.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Payload {
  servicio?: string; // slug o uuid
  inicio?: string; // ISO del slot elegido
  nombre?: string;
  telefono?: string;
  email?: string;
}

export async function POST(request: NextRequest) {
  let body: Payload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  const nombre = body.nombre?.trim();
  const telefonoRaw = body.telefono?.trim();
  const inicio = body.inicio?.trim();
  const servicioParam = body.servicio?.trim();

  if (!servicioParam || !inicio || !nombre || !telefonoRaw) {
    return NextResponse.json(
      { error: "Faltan datos: servicio, horario, nombre y WhatsApp son obligatorios." },
      { status: 400 },
    );
  }

  // Mismo normalizador que el resto del CRM: así el match con `contacts` y el
  // dedupe de `pacientes` usan un solo criterio de número.
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
  const servicio = gym.servicios.find(
    (s) => s.slug === servicioParam || s.id === servicioParam,
  );
  if (!servicio) {
    return NextResponse.json({ error: "Servicio no encontrado" }, { status: 404 });
  }

  const sb = createServiceClient();
  const { data, error } = await sb.rpc("crear_turno_publico", {
    p_servicio_id: servicio.id,
    p_inicio: inicio,
    p_nombre: nombre,
    p_telefono: telefono,
    p_email: body.email?.trim() || null,
  });

  if (error) {
    // 23P01 = exclusion_violation: dos reservas ganaron la carrera y la EXCLUDE
    // frenó a la segunda. Es un caso esperable, no un 500.
    const yaOcupado =
      error.code === "23P01" || /ya no está disponible/i.test(error.message);
    if (yaOcupado) {
      return NextResponse.json(
        { error: "Ese horario se acaba de ocupar. Elegí otro, por favor." },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, turnoId: data, servicio: servicio.nombre });
}
