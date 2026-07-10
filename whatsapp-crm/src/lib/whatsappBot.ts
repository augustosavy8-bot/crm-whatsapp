import type { SupabaseClient } from "@supabase/supabase-js";
import { generateAutoReply, type AutoReplyTurno } from "@/lib/ai/autoResponder";
import { sendText } from "@/lib/whatsapp/meta";
import { normalizeArPhone } from "@/lib/phone";
import { sendPushToTenant } from "@/lib/push/send";

// Tope duro de respuestas seguidas del bot en una misma conversación sin
// que un humano intervenga: lo que pase primero entre esto y que la propia
// IA marque necesita_humano.
const UMBRAL_HANDOFF = 4;

interface Params {
  tenantId: string;
  tenantIaActiva: boolean;
  tenantNombre: string | null;
  contactId: string;
  phoneNumberId: string;
  accessToken: string;
}

// Genera y envía la respuesta automática de la IA para un mensaje de
// WhatsApp entrante, y maneja la derivación a humano. Nunca tira: el
// llamador (el webhook) es best-effort.
export async function maybeAutoReply(
  sb: SupabaseClient,
  { tenantId, tenantIaActiva, tenantNombre, contactId, phoneNumberId, accessToken }: Params,
): Promise<void> {
  if (!tenantIaActiva) return;

  try {
    const { data: contact } = await sb
      .from("contacts")
      .select("id, name, phone_number, modo_atencion, ia_respuestas_consecutivas")
      .eq("id", contactId)
      .maybeSingle();
    if (!contact || contact.modo_atencion !== "ia") return;

    const { data: recientes } = await sb
      .from("messages")
      .select("direction, type, body")
      .eq("contact_id", contactId)
      .order("created_at", { ascending: false })
      .limit(10);

    const historial: AutoReplyTurno[] = (recientes ?? [])
      .reverse()
      .filter((m) => m.type === "text" && (m.body as string | null)?.trim())
      .map((m) => ({
        role: m.direction === "inbound" ? "user" : "assistant",
        content: (m.body as string).trim(),
      }));

    if (historial.length === 0 || historial[historial.length - 1].role !== "user") {
      return;
    }

    const resultado = await generateAutoReply({ tenantNombre, historial });
    if (!resultado) return;

    const to = normalizeArPhone(contact.phone_number as string | null);
    const envio = await sendText(phoneNumberId, accessToken, to, resultado.respuesta);
    if (!envio.ok) {
      console.error("[whatsappBot] no pude enviar la respuesta", envio.error);
      return;
    }

    const now = new Date().toISOString();
    await sb.from("messages").insert({
      tenant_id: tenantId,
      contact_id: contactId,
      channel: "whatsapp",
      wa_message_id: envio.waMessageId,
      direction: "outbound",
      type: "text",
      body: resultado.respuesta,
      status: "sent",
      is_bot: true,
    });
    await sb
      .from("contacts")
      .update({ last_message_at: now, updated_at: now })
      .eq("id", contactId);

    const nuevoContador = ((contact.ia_respuestas_consecutivas as number) ?? 0) + 1;
    const derivar = resultado.necesita_humano || nuevoContador >= UMBRAL_HANDOFF;

    if (derivar) {
      await sb
        .from("contacts")
        .update({ modo_atencion: "humano", ia_respuestas_consecutivas: nuevoContador })
        .eq("id", contactId);
      await sendPushToTenant(tenantId, {
        title: "Conversación derivada a un humano",
        body: (contact.name as string | null) || (contact.phone_number as string | null) || "Paciente",
        url: `/inbox?c=${contactId}`,
        tag: `foko-derivacion-${contactId}`,
      });
    } else {
      await sb
        .from("contacts")
        .update({ ia_respuestas_consecutivas: nuevoContador })
        .eq("id", contactId);
    }
  } catch (e) {
    console.error("[whatsappBot] error en auto-respuesta", e);
  }
}
