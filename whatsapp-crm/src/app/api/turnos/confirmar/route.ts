import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendText } from "@/lib/whatsapp/meta";
import { normalizeArPhone } from "@/lib/phone";
import { isWindowOpen } from "@/lib/window";
import { formatArFechaHora } from "@/lib/tz";

// Confirma un turno y, si el paciente tiene un contacto de WhatsApp vinculado
// y la ventana de 24hs sigue abierta, le manda un mensaje avisándole.
// Requiere sesión (lo dispara un agente desde /turnos).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  let payload: { turnoId?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const turnoId = payload.turnoId?.trim();
  if (!turnoId) {
    return NextResponse.json({ error: "Falta turnoId" }, { status: 400 });
  }

  const { data: turno, error: turnoErr } = await supabase
    .from("turnos")
    .select(
      "id, tenant_id, fecha_hora, paciente:pacientes(id, nombre, contact_id), profesional:agents(id, name), servicio:servicios(nombre)",
    )
    .eq("id", turnoId)
    .maybeSingle();
  if (turnoErr) {
    return NextResponse.json({ error: turnoErr.message }, { status: 500 });
  }
  if (!turno) {
    return NextResponse.json({ error: "Turno no encontrado" }, { status: 404 });
  }

  const { error: updateErr } = await supabase
    .from("turnos")
    .update({ estado: "confirmado" })
    .eq("id", turnoId);
  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  const paciente = turno.paciente as unknown as {
    id: string;
    nombre: string;
    contact_id: string | null;
  } | null;
  const profesional = turno.profesional as unknown as {
    id: string;
    name: string | null;
  } | null;
  const servicio = turno.servicio as unknown as { nombre: string } | null;

  const contactId = paciente?.contact_id ?? null;
  if (!contactId) {
    return NextResponse.json({
      ok: true,
      warning: "Turno confirmado. El paciente no tiene WhatsApp vinculado, no se le pudo avisar.",
    });
  }

  const { data: contact } = await supabase
    .from("contacts")
    .select("id, phone_number, last_inbound_at")
    .eq("id", contactId)
    .maybeSingle();
  if (!contact) {
    return NextResponse.json({
      ok: true,
      warning: "Turno confirmado. No se encontró el contacto de WhatsApp para avisarle.",
    });
  }

  if (!isWindowOpen(contact.last_inbound_at as string | null)) {
    return NextResponse.json({
      ok: true,
      warning:
        "Turno confirmado. Pasaron más de 24hs desde el último mensaje del paciente, no se le pudo avisar por WhatsApp.",
    });
  }

  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    return NextResponse.json({
      ok: true,
      warning: "Turno confirmado. WhatsApp no está configurado, no se le pudo avisar.",
    });
  }

  // Esta fecha va en el WhatsApp al paciente: sin timeZone se formateaba con
  // la zona del server (UTC en Vercel) y le llegaba 3hs corrida.
  const fechaTxt = formatArFechaHora(turno.fecha_hora as string);
  const servicioTxt = servicio?.nombre ? ` de ${servicio.nombre}` : "";
  const profesionalTxt = profesional?.name ? ` con ${profesional.name}` : "";
  const mensaje = `¡Tu turno${servicioTxt}${profesionalTxt} quedó confirmado para el ${fechaTxt}hs! Te esperamos.`;

  const to = normalizeArPhone(contact.phone_number as string | null);
  const envio = await sendText(phoneNumberId, accessToken, to, mensaje);
  if (!envio.ok) {
    return NextResponse.json({
      ok: true,
      warning: `Turno confirmado. Falló el aviso por WhatsApp: ${envio.error}`,
    });
  }

  await supabase.from("messages").insert({
    tenant_id: turno.tenant_id,
    contact_id: contact.id,
    channel: "whatsapp",
    wa_message_id: envio.waMessageId,
    direction: "outbound",
    type: "text",
    body: mensaje,
    status: "sent",
    is_bot: true,
  });
  await supabase
    .from("contacts")
    .update({
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", contact.id);

  return NextResponse.json({ ok: true });
}
