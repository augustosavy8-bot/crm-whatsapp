// Send API de la Messenger Platform.
//  - Facebook Messenger: graph.facebook.com + Page Access Token.
//  - Instagram (Instagram Login): graph.instagram.com + Instagram Access Token.
// El recipient es el PSID (Messenger) / IGSID (Instagram) guardado en external_id.
// Secrets siempre por env vars.

import type { Channel } from "@/lib/channels";

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";

export interface MessengerSendResult {
  ok: boolean;
  messageId: string | null;
  error: string | null;
}

export async function sendMessengerText(
  channel: Channel,
  recipientId: string,
  text: string,
): Promise<MessengerSendResult> {
  const isInstagram = channel === "instagram";
  const host = isInstagram ? "graph.instagram.com" : "graph.facebook.com";
  const token = isInstagram
    ? process.env.INSTAGRAM_ACCESS_TOKEN
    : process.env.META_PAGE_ACCESS_TOKEN;

  if (!token) {
    return {
      ok: false,
      messageId: null,
      error: isInstagram
        ? "INSTAGRAM_ACCESS_TOKEN no configurado"
        : "META_PAGE_ACCESS_TOKEN no configurado",
    };
  }

  const url = `https://${host}/${GRAPH_VERSION}/me/messages?access_token=${token}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: recipientId },
        message: { text },
        messaging_type: "RESPONSE",
      }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      const err = data.error as Record<string, unknown> | undefined;
      return {
        ok: false,
        messageId: null,
        error: err
          ? String(err.message ?? JSON.stringify(err))
          : `HTTP ${res.status}`,
      };
    }
    return {
      ok: true,
      messageId: data.message_id ? String(data.message_id) : null,
      error: null,
    };
  } catch (e) {
    return { ok: false, messageId: null, error: (e as Error).message };
  }
}
