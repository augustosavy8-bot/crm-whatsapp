// Send API de la Messenger Platform (Facebook Messenger + Instagram DMs).
// POST /{version}/me/messages con el Page Access Token y recipient = PSID/IGSID.
// Secrets siempre por env vars.

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";

export interface MessengerSendResult {
  ok: boolean;
  messageId: string | null;
  error: string | null;
}

export async function sendMessengerText(
  recipientId: string,
  text: string,
): Promise<MessengerSendResult> {
  const token = process.env.META_PAGE_ACCESS_TOKEN;
  if (!token) {
    return {
      ok: false,
      messageId: null,
      error: "META_PAGE_ACCESS_TOKEN no configurado",
    };
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/me/messages?access_token=${token}`;
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
