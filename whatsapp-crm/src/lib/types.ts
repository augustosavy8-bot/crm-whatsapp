// Tipos de dominio del CRM (espejo del schema de Supabase).

export type ConversationStatus = "abierta" | "en_proceso" | "resuelta";
export type MessageDirection = "inbound" | "outbound";
export type Channel = "whatsapp" | "instagram" | "facebook";
export type MessageStatus =
  | "queued"
  | "sent"
  | "delivered"
  | "read"
  | "failed";

export interface Contact {
  id: string;
  channel: Channel;
  phone_number: string | null;
  external_id: string | null;
  username: string | null;
  wa_id: string | null;
  name: string | null;
  tags: string[];
  status: ConversationStatus;
  notes: string | null;
  assigned_agent_id: string | null;
  last_message_at: string | null;
  last_inbound_at: string | null;
  unread_count: number;
  client_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  contact_id: string;
  channel: Channel;
  wa_message_id: string | null;
  direction: MessageDirection;
  type: string;
  body: string | null;
  media_url: string | null;
  template_name: string | null;
  status: MessageStatus | null;
  error: string | null;
  raw_payload: unknown;
  sent_by: string | null;
  client_id: string | null;
  created_at: string;
}

export interface Agent {
  id: string;
  auth_user_id: string | null;
  name: string | null;
  email: string | null;
  created_at: string;
}

export interface Template {
  id: string;
  name: string;
  language: string;
  category: string | null;
  body: string | null;
  variables: unknown;
  approved: boolean;
  client_id: string | null;
  created_at: string;
}

// Fila de la vista `conversation_list`: un contacto + su último mensaje.
export interface ConversationListItem extends Contact {
  last_message_body: string | null;
  last_message_type: string | null;
  last_message_direction: MessageDirection | null;
  last_message_created_at: string | null;
}

// Vista `channel_stats`: resumen por canal (dashboard).
export interface ChannelStat {
  channel: Channel;
  total_conversations: number;
  open_conversations: number;
  unread_total: number;
  inbound_24h: number;
}

// Vista `messages_daily`: entrantes por día y canal (dashboard).
export interface MessagesDaily {
  day: string; // date (YYYY-MM-DD)
  channel: Channel;
  inbound: number;
}
