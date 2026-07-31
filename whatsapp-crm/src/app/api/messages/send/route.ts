import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendText } from "@/lib/whatsapp/meta";
import { isWindowOpen } from "@/lib/window";
import { normalizeArPhone } from "@/lib/phone";

// Envío de texto libre por WhatsApp. Requiere sesión (a diferencia de los
// webhooks). Reemplaza a /api/whatsapp/send.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  // 1) Requiere agente logueado
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  // 2) Body válido
  let payload: { contactId?: string; body?: string };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const contactId = payload.contactId?.trim();
  const body = payload.body?.trim();
  if (!contactId || !body) {
    return NextResponse.json(
      { error: "Faltan contactId o body" },
      { status: 400 },
    );
  }

  // 3) Contacto (respeta RLS con la sesión del agente -> ya viene scoped a su tenant)
  const { data: contact, error: contactErr } = await supabase
    .from("contacts")
    .select("id, tenant_id, phone_number, last_inbound_at")
    .eq("id", contactId)
    .maybeSingle();
  if (contactErr) {
    return NextResponse.json({ error: contactErr.message }, { status: 500 });
  }
  if (!contact) {
    return NextResponse.json({ error: "Contacto no encontrado" }, { status: 404 });
  }

  // 4) Ventana de 24hs (autoridad server-side)
  if (!isWindowOpen(contact.last_inbound_at as string | null)) {
    return NextResponse.json(
      {
        code: "window_closed",
        error:
          "Pasaron más de 24hs desde el último mensaje del contacto. Para reabrir la conversación necesitás enviar una plantilla (llega en una fase próxima).",
      },
      { status: 403 },
    );
  }

  // 5) Enviar por WhatsApp.
  // Credenciales del tenant. Hoy salen de env vars (tenant piloto, single);
  // en el Paso 4 (Embedded Signup) se resuelven desde `tenants` por tenant_id.
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!phoneNumberId || !accessToken) {
    return NextResponse.json(
      { error: "WhatsApp no está configurado para este tenant" },
      { status: 500 },
    );
  }
  const to = normalizeArPhone(contact.phone_number as string | null);
  const result = await sendText(phoneNumberId, accessToken, to, body);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "Falló el envío a WhatsApp" },
      { status: 502 },
    );
  }
  const externalMessageId = result.waMessageId;

  // 6) Persistir el saliente (+ reordenar la conversación)
  const { data: agent } = await supabase
    .from("agents")
    .select("id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  const { data: inserted, error: insertErr } = await supabase
    .from("messages")
    .insert({
      tenant_id: contact.tenant_id,
      contact_id: contact.id,
      channel: "whatsapp",
      wa_message_id: externalMessageId,
      direction: "outbound",
      type: "text",
      body,
      status: "sent",
      sent_by: agent?.id ?? null,
    })
    .select("*")
    .single();

  if (insertErr) {
    // El mensaje SÍ se envió; solo falló guardarlo.
    console.error("[send] enviado pero no se pudo guardar", insertErr);
    return NextResponse.json({
      ok: true,
      message: null,
      warning: "El mensaje se envió pero no se pudo guardar en la base.",
    });
  }

  await supabase
    .from("contacts")
    .update({
      last_message_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", contact.id);

  return NextResponse.json({ ok: true, message: inserted });
}
