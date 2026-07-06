import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConversationListItem, Message } from "./types";

// Helpers de datos del Inbox. Reciben el cliente (server o browser) para
// respetar RLS con la sesión del usuario logueado.

export async function getConversations(
  sb: SupabaseClient,
): Promise<ConversationListItem[]> {
  const { data, error } = await sb
    .from("conversation_list")
    .select("*")
    .order("last_message_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return (data ?? []) as ConversationListItem[];
}

export async function getMessages(
  sb: SupabaseClient,
  contactId: string,
): Promise<Message[]> {
  const { data, error } = await sb
    .from("messages")
    .select("*")
    .eq("contact_id", contactId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Message[];
}

// Al abrir una conversación se resetea el contador de no leídos.
export async function markConversationRead(
  sb: SupabaseClient,
  contactId: string,
): Promise<void> {
  const { error } = await sb
    .from("contacts")
    .update({ unread_count: 0 })
    .eq("id", contactId);
  if (error) throw error;
}
