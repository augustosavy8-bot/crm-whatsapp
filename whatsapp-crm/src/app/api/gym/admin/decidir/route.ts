import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgent, esGymStaff } from "@/lib/agent";
import { createServiceClient } from "@/lib/supabase/service";
import { sendText } from "@/lib/whatsapp/meta";
import { normalizeArPhone } from "@/lib/phone";
import { isWindowOpen } from "@/lib/window";
import { formatArFecha } from "@/lib/tz";
import { sendPushToAlumno } from "@/lib/push/send";

// Mariano confirma o rechaza una reserva del gimnasio. Al confirmar, intenta
// avisar por WhatsApp (best-effort): el alumno del gym NO es un contacto del
// CRM, así que solo se le puede mandar texto libre si además existe un contacto
// con ese número y su ventana de 24hs sigue abierta. Si no, se confirma igual y
// se avisa que no se pudo notificar. Requiere sesión owner/gym_admin.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const hhmm = (h: string) => h.slice(0, 5);

interface Payload {
  tipo?: "suelta" | "fijo";
  id?: string;
  accion?: "confirmar" | "rechazar";
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const agent = await getCurrentAgent(supabase);
  if (!agent) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  if (!esGymStaff(agent)) {
    return NextResponse.json({ error: "Sin permiso" }, { status: 403 });
  }

  let body: Payload;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const { tipo, accion } = body;
  const id = body.id?.trim();
  if (!id || (tipo !== "suelta" && tipo !== "fijo") ||
      (accion !== "confirmar" && accion !== "rechazar")) {
    return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  }

  const tabla = tipo === "suelta" ? "gym_reservas_sueltas" : "gym_turnos_fijos";
  const nuevoEstado =
    tipo === "suelta"
      ? accion === "confirmar" ? "confirmada" : "rechazada"
      : accion === "confirmar" ? "confirmado" : "rechazado";

  // Traigo alumno + horario ANTES de decidir (para el mensaje). RLS del cliente
  // de sesión ya scopea al tenant: si no aparece, no es del gimnasio del admin.
  const sel =
    tipo === "suelta"
      ? "id, alumno_id, fecha, alumno:gym_alumnos(nombre, telefono), horario:gym_horarios(dia_semana, hora_inicio, hora_fin)"
      : "id, alumno_id, alumno:gym_alumnos(nombre, telefono), horario:gym_horarios(dia_semana, hora_inicio, hora_fin)";
  const { data: row } = await supabase.from(tabla).select(sel).eq("id", id).maybeSingle();
  if (!row) {
    return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
  }

  // Update: RLS admin_gym_* exige owner/gym_admin del tenant. El trigger de cupo
  // libera el lugar al rechazar y no lo re-valida al confirmar (ya lo ocupaba).
  const { error: upErr } = await supabase
    .from(tabla)
    .update({ estado: nuevoEstado })
    .eq("id", id);
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // Rechazo: no se notifica (el alumno lo ve en "Mis reservas"). Listo.
  if (accion === "rechazar") return NextResponse.json({ ok: true });

  // --- Confirmar: aviso best-effort por WhatsApp ---
  // El select es dinámico (tabla según tipo), así que Supabase no lo tipa: se
  // castea la fila a la forma conocida vía unknown.
  const r = row as unknown as {
    alumno_id: string | null;
    alumno: { nombre: string; telefono: string } | null;
    horario: { dia_semana: number; hora_inicio: string; hora_fin: string } | null;
    fecha?: string;
  };
  const alumno = r.alumno;
  const horario = r.horario;
  const fecha = r.fecha;

  // Web Push al alumno (best-effort): le llega aunque no tenga la app abierta
  // ni WhatsApp vinculado. Independiente del aviso por WhatsApp de abajo.
  if (r.alumno_id && horario) {
    const franjaPush = `${hhmm(horario.hora_inicio)} a ${hhmm(horario.hora_fin)} hs`;
    const cuerpo =
      tipo === "suelta" && fecha
        ? `Tu clase del ${formatArFecha(`${fecha}T12:00:00Z`, {
            weekday: "long",
            day: "2-digit",
            month: "long",
          })} de ${franjaPush} quedó confirmada.`
        : `Quedaste anotado los ${DIAS[horario.dia_semana]} de ${franjaPush}.`;
    try {
      await sendPushToAlumno(r.alumno_id, {
        title: "¡Reserva confirmada! 🎉",
        body: cuerpo,
        url: "/mi-cuenta",
        tag: `reserva-${id}`,
      });
    } catch (e) {
      console.error("[decidir] push al alumno falló", e);
    }
  }

  if (!alumno?.telefono || !horario) {
    return NextResponse.json({ ok: true });
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    return NextResponse.json({
      ok: true,
      warning: "Confirmada. WhatsApp no está configurado, no se avisó.",
    });
  }

  // El aviso toca contacts/messages (CRM, sellado a owner). Como ahora también
  // puede confirmar un profesional, la notificación del sistema va con el
  // service client. La autorización ya ocurrió: el gate del handler + el update
  // de la reserva de arriba (que pasó por RLS de staff del gym).
  const svc = createServiceClient();

  // Buscar un contacto del CRM con ese número (formas con/sin el 9 argentino).
  const tel = alumno.telefono;
  const conNueve = tel.startsWith("54") ? "549" + tel.slice(2) : tel;
  const { data: contactos } = await svc
    .from("contacts")
    .select("id, phone_number, last_inbound_at")
    .in("phone_number", Array.from(new Set([tel, conNueve])));
  const contacto = (contactos ?? []).find(
    (c) => normalizeArPhone(c.phone_number as string | null) === tel,
  );

  if (!contacto) {
    return NextResponse.json({
      ok: true,
      warning: "Confirmada. El alumno no tiene WhatsApp vinculado, no se le avisó.",
    });
  }
  if (!isWindowOpen(contacto.last_inbound_at as string | null)) {
    return NextResponse.json({
      ok: true,
      warning:
        "Confirmada. Pasaron más de 24hs desde su último WhatsApp, no se le pudo avisar.",
    });
  }

  const franja = `${hhmm(horario.hora_inicio)} a ${hhmm(horario.hora_fin)} hs`;
  const mensaje =
    tipo === "suelta" && fecha
      ? `¡Tu reserva en KINACTIVA quedó confirmada para el ${formatArFecha(
          `${fecha}T12:00:00Z`,
          { weekday: "long", day: "2-digit", month: "long" },
        )} de ${franja}! Te esperamos.`
      : `¡Quedaste anotado en KINACTIVA los ${DIAS[horario.dia_semana]} de ${franja}! Te esperamos.`;

  const envio = await sendText(
    phoneNumberId,
    accessToken,
    normalizeArPhone(contacto.phone_number as string | null),
    mensaje,
  );
  if (!envio.ok) {
    return NextResponse.json({
      ok: true,
      warning: `Confirmada. Falló el aviso por WhatsApp: ${envio.error}`,
    });
  }

  await svc.from("messages").insert({
    tenant_id: agent.tenant_id,
    contact_id: contacto.id,
    channel: "whatsapp",
    wa_message_id: envio.waMessageId,
    direction: "outbound",
    type: "text",
    body: mensaje,
    status: "sent",
    is_bot: true,
  });
  await svc
    .from("contacts")
    .update({ last_message_at: new Date().toISOString() })
    .eq("id", contacto.id);

  return NextResponse.json({ ok: true });
}
