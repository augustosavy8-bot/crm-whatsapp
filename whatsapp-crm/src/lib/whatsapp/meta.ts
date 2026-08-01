// Cliente mínimo de la WhatsApp Cloud API (Graph API).
// Todos los secrets vienen de env vars, nunca hardcodeados.
// phoneNumberId/accessToken son del tenant que envía (hoy: el piloto, leído
// de env vars en el call site; en el Paso 4 -Embedded Signup- saldrán de `tenants`).

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";

function graphUrl(phoneNumberId: string): string {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
}

function authHeaders(accessToken: string): HeadersInit {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}

export interface SendResult {
  ok: boolean;
  waMessageId: string | null;
  error: string | null;
}

async function postMessage(
  phoneNumberId: string,
  accessToken: string,
  payload: Record<string, unknown>,
): Promise<SendResult> {
  try {
    const res = await fetch(graphUrl(phoneNumberId), {
      method: "POST",
      headers: authHeaders(accessToken),
      body: JSON.stringify({ messaging_product: "whatsapp", ...payload }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) {
      const err = data.error as Record<string, unknown> | undefined;
      return {
        ok: false,
        waMessageId: null,
        error: err ? String(err.message ?? JSON.stringify(err)) : `HTTP ${res.status}`,
      };
    }
    const messages = data.messages as Array<Record<string, unknown>> | undefined;
    return {
      ok: true,
      waMessageId: messages?.[0]?.id ? String(messages[0].id) : null,
      error: null,
    };
  } catch (e) {
    return { ok: false, waMessageId: null, error: (e as Error).message };
  }
}

// Texto libre (solo válido dentro de la ventana de 24hs).
export function sendText(
  phoneNumberId: string,
  accessToken: string,
  to: string,
  body: string,
): Promise<SendResult> {
  return postMessage(phoneNumberId, accessToken, {
    to,
    type: "text",
    text: { preview_url: false, body },
  });
}
