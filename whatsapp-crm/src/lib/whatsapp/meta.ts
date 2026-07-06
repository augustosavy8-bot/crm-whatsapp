// Cliente mínimo de la WhatsApp Cloud API (Graph API).
// Todos los secrets vienen de env vars, nunca hardcodeados.

const GRAPH_VERSION = process.env.META_GRAPH_VERSION || "v21.0";

function graphUrl(): string {
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!phoneId) throw new Error("WHATSAPP_PHONE_NUMBER_ID no configurado");
  return `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`;
}

function authHeaders(): HeadersInit {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) throw new Error("WHATSAPP_ACCESS_TOKEN no configurado");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

export interface SendResult {
  ok: boolean;
  waMessageId: string | null;
  error: string | null;
}

async function postMessage(payload: Record<string, unknown>): Promise<SendResult> {
  try {
    const res = await fetch(graphUrl(), {
      method: "POST",
      headers: authHeaders(),
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
export function sendText(to: string, body: string): Promise<SendResult> {
  return postMessage({
    to,
    type: "text",
    text: { preview_url: false, body },
  });
}

// Template aprobado con variables por componente (para reabrir fuera de la ventana).
export function sendTemplate(
  to: string,
  name: string,
  language: string,
  components?: unknown[],
): Promise<SendResult> {
  return postMessage({
    to,
    type: "template",
    template: {
      name,
      language: { code: language },
      ...(components && components.length ? { components } : {}),
    },
  });
}
