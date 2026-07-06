// Normaliza el payload de la Messenger Platform (Facebook Messenger + Instagram).
// Estructura: entry[].messaging[] con sender.id (PSID/IGSID), message.{mid,text,attachments}.
// Distinto al de WhatsApp Cloud API (entry[].changes[].value.messages[]).

import type { Channel } from "@/lib/channels";

export interface ParsedMessengerMessage {
  channel: Channel; // 'instagram' | 'facebook'
  externalId: string; // sender.id = PSID / IGSID
  mid: string; // message.mid (id externo, dedup)
  type: string; // 'text' | 'image' | 'audio' | ...
  body: string | null;
  timestamp: string | null; // ISO
  raw: unknown;
}

export interface ParsedMessengerWebhook {
  messages: ParsedMessengerMessage[];
}

function tsToIso(ts: unknown): string | null {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return null;
  // Messenger manda milisegundos.
  return new Date(n).toISOString();
}

function extractBodyAndType(message: Record<string, unknown>): {
  type: string;
  body: string | null;
} {
  const text = message.text;
  if (typeof text === "string" && text.length) {
    return { type: "text", body: text };
  }
  const attachments = message.attachments as
    | Array<Record<string, unknown>>
    | undefined;
  if (Array.isArray(attachments) && attachments.length) {
    // image / video / audio / file / etc. -> placeholder por tipo.
    const t = String(attachments[0].type ?? "attachment");
    return { type: t, body: null };
  }
  return { type: "text", body: null };
}

export function parseMessenger(payload: unknown): ParsedMessengerWebhook {
  const messages: ParsedMessengerMessage[] = [];
  const root = payload as Record<string, unknown>;

  // Discriminador: 'instagram' => IG DMs; 'page' => Facebook Messenger.
  const object = String(root?.object ?? "");
  const channel: Channel | null =
    object === "instagram"
      ? "instagram"
      : object === "page"
        ? "facebook"
        : null;
  if (!channel) return { messages };

  const entries = Array.isArray(root.entry) ? root.entry : [];
  for (const entry of entries) {
    const messaging = (entry as Record<string, unknown>)?.messaging;
    const events = Array.isArray(messaging) ? messaging : [];
    for (const ev of events as Record<string, unknown>[]) {
      const message = ev.message as Record<string, unknown> | undefined;
      if (!message) continue; // otros eventos (delivery, read, postback...) se ignoran
      if (message.is_echo) continue; // eco de nuestro propio envío -> ya lo guardamos

      const sender = ev.sender as Record<string, unknown> | undefined;
      const externalId = String(sender?.id ?? "");
      const mid = String(message.mid ?? "");
      if (!externalId || !mid) continue;

      const { type, body } = extractBodyAndType(message);
      messages.push({
        channel,
        externalId,
        mid,
        type,
        body,
        timestamp: tsToIso(ev.timestamp),
        raw: ev,
      });
    }
  }

  return { messages };
}
