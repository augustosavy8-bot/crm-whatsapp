import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentAgent, esGymStaff } from "@/lib/agent";
import { anotarFijo, reservarSuelta } from "@/lib/gymCupo";
import { normalizeArPhone } from "@/lib/phone";

// El admin (owner / gym_admin) anota a un alumno a mano en un horario — alguien
// que llama o se acerca. Reusa las mismas funciones que el flujo del alumno
// (upsert por teléfono + trigger de cupo), pero autenticado:
//   1) exige sesión con gate owner/gym_admin,
//   2) verifica que el horario sea de SU tenant (RLS del cliente de sesión),
// y recién ahí escribe con el service client.
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
  const sb = await createClient();
  const agent = await getCurrentAgent(sb);
  if (!agent) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!esGymStaff(agent)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
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
  const nombre = body.nombre?.trim();
  const telefonoRaw = body.telefono?.trim();

  if (!horarioId || !fecha || !nombre) {
    return NextResponse.json({ error: "Falta el nombre" }, { status: 400 });
  }
  if (tipo !== "suelta" && tipo !== "fijo") {
    return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  }
  // El WhatsApp es OPCIONAL en el alta a mano del staff. Si lo cargan, se
  // valida y normaliza; si no, se anota igual sin número.
  let telefono = "";
  if (telefonoRaw) {
    telefono = normalizeArPhone(telefonoRaw);
    if (telefono.length < 10) {
      return NextResponse.json({ error: "WhatsApp inválido" }, { status: 400 });
    }
  }

  // El horario tiene que ser del tenant del admin. Con el cliente de sesión RLS
  // solo devuelve horarios del propio tenant: si no aparece, no es suyo.
  const { data: horario } = await sb
    .from("gym_horarios")
    .select("id")
    .eq("id", horarioId)
    .maybeSingle();
  if (!horario) {
    return NextResponse.json({ error: "Horario no encontrado" }, { status: 404 });
  }

  try {
    // Alta del staff: las reservas ya entran confirmadas (el RPC lo hace), y es
    // un OVERRIDE del bloqueo por deuda — el admin puede anotar a quien quiera.
    const id =
      tipo === "suelta"
        ? await reservarSuelta({ horarioId, fecha, nombre, telefono })
        : await anotarFijo({ horarioId, fechaDesde: fecha, nombre, telefono });

    // La persona que anota el staff a mano es socia del gym (deja de figurar
    // "No socio"). El pago se registra aparte. Dedup por teléfono o por nombre.
    const svc = createServiceClient();
    const upd = svc
      .from("gym_alumnos")
      .update({ es_socio: true })
      .eq("tenant_id", agent.tenant_id);
    await (telefono ? upd.eq("telefono", telefono) : upd.ilike("nombre", nombre));

    return NextResponse.json({ ok: true, tipo, id });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "No se pudo agregar.";
    const lleno = /cupo/i.test(msg);
    return NextResponse.json({ error: msg }, { status: lleno ? 409 : 400 });
  }
}
