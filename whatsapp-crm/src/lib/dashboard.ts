import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  ChannelStat,
  ConversationListItem,
  MessagesDaily,
} from "./types";

// Queries de lectura del dashboard. Respetan RLS con la sesión del agente.

export async function getChannelStats(
  sb: SupabaseClient,
): Promise<ChannelStat[]> {
  const { data, error } = await sb.from("channel_stats").select("*");
  if (error) throw error;
  return (data ?? []) as ChannelStat[];
}

export async function getMessagesDaily(
  sb: SupabaseClient,
): Promise<MessagesDaily[]> {
  const { data, error } = await sb
    .from("messages_daily")
    .select("*")
    .order("day", { ascending: true });
  if (error) throw error;
  return (data ?? []) as MessagesDaily[];
}

export async function getRecentConversations(
  sb: SupabaseClient,
  limit = 8,
): Promise<ConversationListItem[]> {
  const { data, error } = await sb
    .from("conversation_list")
    .select("*")
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ConversationListItem[];
}
