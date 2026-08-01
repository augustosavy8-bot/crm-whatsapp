import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgent, esGymStaff } from "@/lib/agent";
import { formatArFecha } from "@/lib/tz";
import { sendPushToAlumno } from "@/lib/push/send";

// Confirma o rechaza una reserva del gimnasio. Al confirmar, el único aviso
// automático al alumno es un Web Push (si activó notificaciones). No se manda
// nada por WhatsApp: para eso está el botón manual en el panel. Requiere sesión
// de staff del gym (owner/profesional/gym_admin).
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

  // --- Confirmar: Web Push al alumno ---
  // No se manda nada por WhatsApp automático. El único aviso automático es el
  // push (le llega con la app cerrada, si activó las notificaciones). Para el
  // que no lo tiene, el staff avisa a mano con el botón de WhatsApp del panel.
  // El select es dinámico (tabla según tipo): Supabase no lo tipa, se castea.
  const r = row as unknown as {
    alumno_id: string | null;
    horario: { dia_semana: number; hora_inicio: string; hora_fin: string } | null;
    fecha?: string;
  };
  const horario = r.horario;
  const fecha = r.fecha;

  if (r.alumno_id && horario) {
    const franja = `${hhmm(horario.hora_inicio)} a ${hhmm(horario.hora_fin)} hs`;
    const cuerpo =
      tipo === "suelta" && fecha
        ? `Tu clase del ${formatArFecha(`${fecha}T12:00:00Z`, {
            weekday: "long",
            day: "2-digit",
            month: "long",
          })} de ${franja} quedó confirmada.`
        : `Quedaste anotado los ${DIAS[horario.dia_semana]} de ${franja}.`;
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

  return NextResponse.json({ ok: true });
}
