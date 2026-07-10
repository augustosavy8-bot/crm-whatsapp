import type { SupabaseClient } from "@supabase/supabase-js";
import type { Channel } from "@/lib/channels";
import { fetchProfile } from "@/lib/meta/profile";
import type { ParsedMessengerWebhook } from "@/lib/meta/parseMessenger";
import type { IngestNotification } from "@/lib/whatsapp/ingest";
import { contactLabel, messagePreview } from "@/lib/format";

// Ingest genérico por (channel, external_id) para Messenger/Instagram.
// NO toca el ingest de WhatsApp (lib/whatsapp/ingest.ts). Escribe con service-role.
export async function ingestMessenger(
  sb: SupabaseClient,
  parsed: ParsedMessengerWebhook,
  tenantId: string,
): Promise<{
  inbound: number;
  skipped: number;
  notifications: IngestNotification[];
}> {
  let inbound = 0;
  let skipped = 0;
  const notifications: IngestNotification[] = [];

  for (const m of parsed.messages) {
    if (!m.mid || !m.externalId) {
      skipped++;
      continue;
    }
    const when = m.timestamp ?? new Date().toISOString();
    const channel: Channel = m.channel;

    // Asegurar contacto por (tenant, channel, external_id).
    const { data: existing } = await sb
      .from("contacts")
      .select("id, unread_count, name, username")
      .eq("tenant_id", tenantId)
      .eq("channel", channel)
      .eq("external_id", m.externalId)
      .maybeSingle();

    let contactId: string;
    let unread = 0;
    let name: string | null = null;
    let username: string | null = null;

    if (existing) {
      contactId = existing.id as string;
      unread = (existing.unread_count as number | null) ?? 0;
      name = (existing.name as string | null) ?? null;
      username = (existing.username as string | null) ?? null;
      // Backfill: si el contacto todavía no tiene nombre/username, reintentar el
      // perfil (p. ej. contactos creados antes del fix de graph.instagram.com).
      if (!name && !username) {
        const profile = await fetchProfile(channel, m.externalId);
        if (profile.name || profile.username) {
          name = profile.name;
          username = profile.username;
          await sb
            .from("contacts")
            .update({ name, username })
            .eq("id", contactId);
        }
      }
    } else {
      // Contacto nuevo: intentar traer nombre/username (best-effort).
      const profile = await fetchProfile(channel, m.externalId);
      name = profile.name;
      username = profile.username;
      const { data: created, error } = await sb
        .from("contacts")
        .insert({ tenant_id: tenantId, channel, external_id: m.externalId, name, username })
        .select("id")
        .single();
      if (error || !created) {
        console.error("[ingest-messenger] no pude crear contacto", error);
        skipped++;
        continue;
      }
      contactId = created.id as string;
    }

    // Insertar mensaje con dedup por wa_message_id (= mid) e ignorar duplicados.
    const { data: insertedRows, error: msgErr } = await sb
      .from("messages")
      .upsert(
        {
          tenant_id: tenantId,
          contact_id: contactId,
          channel,
          wa_message_id: m.mid,
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
      console.error("[ingest-messenger] error insertando mensaje", msgErr);
      skipped++;
      continue;
    }
    if ((insertedRows?.length ?? 0) === 0) {
      skipped++; // duplicado reenviado
      continue;
    }
    inbound++;
    notifications.push({
      contactId,
      title: contactLabel({
        name,
        username,
        phone_number: null,
        external_id: m.externalId,
        channel,
      }),
      body: messagePreview(m.type, m.body) || "Nuevo mensaje",
    });

    const patch: Record<string, unknown> = {
      last_message_at: when,
      last_inbound_at: when,
      unread_count: unread + 1,
      updated_at: new Date().toISOString(),
    };
    await sb.from("contacts").update(patch).eq("id", contactId);
  }

  return { inbound, skipped, notifications };
}
