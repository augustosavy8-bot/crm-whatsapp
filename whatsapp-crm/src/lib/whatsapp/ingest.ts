import type { SupabaseClient } from "@supabase/supabase-js";
import type { ParsedWebhook } from "./parseWebhook";
import { messagePreview } from "@/lib/format";

export interface IngestNotification {
  contactId: string;
  title: string;
  body: string;
}

// Persiste lo que llega del webhook usando el cliente service-role (saltea RLS).
// Devuelve un resumen para loguear/diagnosticar + las notificaciones a pushear.
export async function ingestWebhook(
  sb: SupabaseClient,
  parsed: ParsedWebhook,
): Promise<{
  inbound: number;
  statusUpdates: number;
  skipped: number;
  notifications: IngestNotification[];
}> {
  let inbound = 0;
  let skipped = 0;
  let statusUpdates = 0;
  const notifications: IngestNotification[] = [];

  // --- mensajes entrantes ---
  for (const m of parsed.messages) {
    if (!m.waMessageId || !m.from) {
      skipped++;
      continue;
    }
    const when = m.timestamp ?? new Date().toISOString();

    // asegurar contacto (por número)
    const { data: existing } = await sb
      .from("contacts")
      .select("id, name, unread_count")
      .eq("phone_number", m.from)
      .maybeSingle();

    let contactId: string;
    let currentName: string | null = null;
    let unread = 0;

    if (existing) {
      contactId = existing.id as string;
      currentName = (existing.name as string | null) ?? null;
      unread = (existing.unread_count as number | null) ?? 0;
    } else {
      const { data: created, error } = await sb
        .from("contacts")
        .insert({ phone_number: m.from, wa_id: m.from, name: m.name })
        .select("id")
        .single();
      if (error || !created) {
        console.error("[ingest] no pude crear contacto", error);
        skipped++;
        continue;
      }
      contactId = created.id as string;
    }

    // insertar mensaje con dedup por wa_message_id (ignora si ya existe)
    const { data: insertedRows, error: msgErr } = await sb
      .from("messages")
      .upsert(
        {
          contact_id: contactId,
          wa_message_id: m.waMessageId,
          direction: "inbound",
          type: m.type,
          body: m.body,
          raw_payload: m.raw,
          created_at: when,
        },
        { onConflict: "wa_message_id", ignoreDuplicates: true },
      )
      .select("id");

    if (msgErr) {
      console.error("[ingest] error insertando mensaje", msgErr);
      skipped++;
      continue;
    }

    const isNew = (insertedRows?.length ?? 0) > 0;
    if (!isNew) {
      skipped++; // duplicado reenviado por Meta
      continue;
    }
    inbound++;
    notifications.push({
      contactId,
      title: (m.name && m.name.trim()) || m.from,
      body: messagePreview(m.type, m.body) || "Nuevo mensaje",
    });

    // actualizar contacto: nombre (si faltaba), timestamps y no leídos
    const patch: Record<string, unknown> = {
      last_message_at: when,
      last_inbound_at: when,
      unread_count: unread + 1,
      updated_at: new Date().toISOString(),
    };
    if (!currentName && m.name) patch.name = m.name;

    await sb.from("contacts").update(patch).eq("id", contactId);
  }

  // --- statuses de mensajes salientes ---
  for (const s of parsed.statuses) {
    if (!s.waMessageId || !s.status) continue;
    const patch: Record<string, unknown> = { status: s.status };
    if (s.error) patch.error = s.error;
    const { error } = await sb
      .from("messages")
      .update(patch)
      .eq("wa_message_id", s.waMessageId);
    if (!error) statusUpdates++;
  }

  return { inbound, statusUpdates, skipped, notifications };
}
