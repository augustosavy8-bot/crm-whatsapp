import type { SupabaseClient } from "@supabase/supabase-js";
import { interpretTurnoText } from "@/lib/ai/interpretTurno";
import { pareceMencionarTurno } from "@/lib/ai/turnoKeywordFilter";
import { sendPushToTenant } from "@/lib/push/send";
import { getProfesionalUnico } from "@/lib/profesionales";

interface Params {
  tenantId: string;
  contactId: string;
  texto: string;
}

// Best-effort: interpreta un mensaje entrante de WhatsApp y, si parece un
// pedido de turno, crea un turno `pendiente` para que el profesional lo
// revise. Nunca tira — se llama desde el webhook en un bloque aditivo.
export async function maybeCreateTurnoFromMensaje(
  sb: SupabaseClient,
  { tenantId, contactId, texto }: Params,
): Promise<void> {
  if (!pareceMencionarTurno(texto)) return;

  try {
    // El pedido de turno suele completarse en varios mensajes ("quiero
    // turno" / "el jueves" / "a las 15") — interpretar solo el mensaje
    // actual pierde ese contexto y nunca junta fecha+hora. Se arma un
    // bloque con los últimos mensajes del paciente (más el actual) y se
    // interpreta ese conjunto.
    const { data: recientes } = await sb
      .from("messages")
      .select("direction, type, body, created_at")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(8);
    const historialTexto = (recientes ?? [])
      .reverse()
      .filter((m) => m.direction === "inbound" && m.type === "text" && (m.body as string | null)?.trim())
      .map((m) => (m.body as string).trim())
      .join("\n");
    const textoParaInterpretar = historialTexto || texto;

    const hoyISO = new Date().toLocaleDateString("en-CA", {
      timeZone: "America/Argentina/Buenos_Aires",
    }); // en-CA -> YYYY-MM-DD
    const interpretado = await interpretTurnoText(textoParaInterpretar, { hoyISO });
    if (!interpretado || !interpretado.es_pedido_turno) return;
    if (!interpretado.fecha || !interpretado.hora) return;

    // Resolver paciente vía el contacto (autolink inverso al de PacienteForm).
    const { data: pacienteExistente } = await sb
      .from("pacientes")
      .select("id, nombre")
      .eq("tenant_id", tenantId)
      .eq("contact_id", contactId)
      .maybeSingle();

    let pacienteId = pacienteExistente?.id as string | undefined;

    if (!pacienteId) {
      const { data: contact } = await sb
        .from("contacts")
        .select("name, phone_number")
        .eq("id", contactId)
        .maybeSingle();

      const { data: nuevoPaciente, error } = await sb
        .from("pacientes")
        .insert({
          tenant_id: tenantId,
          contact_id: contactId,
          nombre: contact?.name || contact?.phone_number || "Paciente de WhatsApp",
          telefono: contact?.phone_number ?? null,
        })
        .select("id, nombre")
        .single();
      if (error || !nuevoPaciente) {
        console.error("[turnosIA] no pude crear paciente", error);
        return;
      }
      pacienteId = nuevoPaciente.id as string;
    }

    // Evita duplicar el turno si varios mensajes seguidos siguen mencionando
    // la palabra clave después de ya haber creado uno (ej. el paciente
    // agradece o confirma) — mismo paciente, mismo origen, ventana de 6hs.
    const seisHorasAtras = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { data: turnoReciente } = await sb
      .from("turnos")
      .select("id")
      .eq("paciente_id", pacienteId)
      .eq("origen", "ia_whatsapp")
      .eq("estado", "pendiente")
      .gte("created_at", seisHorasAtras)
      .limit(1)
      .maybeSingle();
    if (turnoReciente) return;

    const fechaHora = new Date(
      `${interpretado.fecha}T${interpretado.hora}:00`,
    ).toISOString();

    // Si hay un solo profesional en el tenant, se asigna directo (no hace
    // falta que el paciente elija entre opciones que no existen).
    const profesionalUnico = await getProfesionalUnico(sb, tenantId);

    const { error: turnoError } = await sb.from("turnos").insert({
      tenant_id: tenantId,
      paciente_id: pacienteId,
      profesional_id: profesionalUnico?.id ?? null,
      fecha_hora: fechaHora,
      duracion_min: interpretado.duracion_min ?? 30,
      estado: "pendiente",
      notas: interpretado.notas,
      origen: "ia_whatsapp",
      ia_confianza: interpretado.confianza,
      ia_notas_originales: textoParaInterpretar,
    });
    if (turnoError) {
      console.error("[turnosIA] no pude crear turno", turnoError);
      return;
    }

    const { data: paciente } = await sb
      .from("pacientes")
      .select("nombre")
      .eq("id", pacienteId)
      .maybeSingle();
    const fechaCorta = new Date(fechaHora).toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
    });
    await sendPushToTenant(tenantId, {
      title: "Turno sugerido",
      body: `${paciente?.nombre ?? "Paciente"} · ${fechaCorta}`,
      url: "/turnos",
      tag: `turno-ia-${pacienteId}-${fechaHora}`,
    });
  } catch (e) {
    console.error("[turnosIA] error interpretando mensaje", e);
  }
}
