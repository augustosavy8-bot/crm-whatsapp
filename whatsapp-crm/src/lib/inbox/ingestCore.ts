import type { SupabaseClient } from "@supabase/supabase-js";
import type { Channel } from "@/lib/channels";
import { fetchProfile } from "@/lib/meta/profile";
import type { ParsedMessengerWebhook } from "@/lib/meta/parseMessenger";

// Ingest genérico por (channel, external_id) para Messenger/Instagram.
// NO toca el ingest de WhatsApp (lib/whatsapp/ingest.ts). Escribe con service-role.
export async function ingestMessenger(
  sb: SupabaseClient,
  parsed: ParsedMessengerWebhook,
): Promise<{ inbound: number; skipped: number }> {
  let inbound = 0;
  let skipped = 0;

  for (const m of parsed.messages) {
    if (!m.mid || !m.externalId) {
      skipped++;
      continue;
    }
    const when = m.timestamp ?? new Date().toISOString();
    const channel: Channel = m.channel;

    // Asegurar contacto por (channel, external_id).
    const { data: existing } = await sb
      .from("contacts")
      .select("id, unread_count")
      .eq("channel", channel)
      .eq("external_id", m.externalId)
      .maybeSingle();

    let contactId: string;
    let unread = 0;

    if (existing) {
      contactId = existing.id as string;
      unread = (existing.unread_count as number | null) ?? 0;
    } else {
      // Contacto nuevo: intentar traer nombre/username (best-effort).
      const profile = await fetchProfile(channel, m.externalId);
      const { data: created, error } = await sb
        .from("contacts")
        .insert({
          channel,
          external_id: m.externalId,
          name: profile.name,
          username: profile.username,
        })
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

    const patch: Record<string, unknown> = {
      last_message_at: when,
      last_inbound_at: when,
      unread_count: unread + 1,
      updated_at: new Date().toISOString(),
    };
    await sb.from("contacts").update(patch).eq("id", contactId);
  }

  return { inbound, skipped };
}
