// Normaliza el payload del webhook de Meta a formas simples para la DB.
// Estructura Meta: entry[].changes[].value.{contacts[], messages[], statuses[]}

export interface ParsedInboundMessage {
  waMessageId: string;
  from: string; // wa_id / número
  name: string | null; // nombre de perfil si viene
  type: string;
  body: string | null;
  timestamp: string | null; // ISO
  raw: unknown;
}

export interface ParsedStatus {
  waMessageId: string;
  status: string; // sent / delivered / read / failed
  timestamp: string | null;
  error: string | null;
  raw: unknown;
}

export interface ParsedWebhook {
  messages: ParsedInboundMessage[];
  statuses: ParsedStatus[];
  phoneNumberId: string | null;
}

function tsToIso(ts: unknown): string | null {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n * 1000).toISOString();
}

// Extrae un texto legible según el tipo de mensaje entrante.
function extractBody(msg: Record<string, unknown>): string | null {
  const type = String(msg.type ?? "");
  const get = (k: string) => msg[k] as Record<string, unknown> | undefined;
  switch (type) {
    case "text":
      return (get("text")?.body as string) ?? null;
    case "image":
    case "video":
    case "document":
    case "audio":
    case "sticker":
      return (get(type)?.caption as string) ?? null;
    case "button":
      return (get("button")?.text as string) ?? null;
    case "interactive": {
      const i = get("interactive");
      const br = i?.button_reply as Record<string, unknown> | undefined;
      const lr = i?.list_reply as Record<string, unknown> | undefined;
      return (br?.title as string) ?? (lr?.title as string) ?? null;
    }
    case "location": {
      const l = get("location");
      return (l?.name as string) ?? (l ? `${l.latitude},${l.longitude}` : null);
    }
    case "reaction":
      return (get("reaction")?.emoji as string) ?? null;
    default:
      return null;
  }
}

export function parseWebhook(payload: unknown): ParsedWebhook {
  const messages: ParsedInboundMessage[] = [];
  const statuses: ParsedStatus[] = [];
  let phoneNumberId: string | null = null;

  const root = payload as Record<string, unknown>;
  const entries = Array.isArray(root?.entry) ? root.entry : [];

  for (const entry of entries) {
    const changes = Array.isArray((entry as Record<string, unknown>)?.changes)
      ? ((entry as Record<string, unknown>).changes as unknown[])
      : [];

    for (const change of changes) {
      const value = ((change as Record<string, unknown>)?.value ??
        {}) as Record<string, unknown>;

      // Identifica qué WABA/número recibió el mensaje -> resuelve el tenant.
      const metadata = value.metadata as Record<string, unknown> | undefined;
      const valuePhoneNumberId = metadata?.phone_number_id;
      if (valuePhoneNumberId && !phoneNumberId) {
        phoneNumberId = String(valuePhoneNumberId);
      }

      // nombre de perfil por wa_id (viene en contacts[])
      const nameByWaId = new Map<string, string>();
      const contacts = Array.isArray(value.contacts)
        ? (value.contacts as Record<string, unknown>[])
        : [];
      for (const c of contacts) {
        const waId = String(c.wa_id ?? "");
        const profile = c.profile as Record<string, unknown> | undefined;
        const name = profile?.name as string | undefined;
        if (waId && name) nameByWaId.set(waId, name);
      }

      // mensajes entrantes
      const msgs = Array.isArray(value.messages)
        ? (value.messages as Record<string, unknown>[])
        : [];
      for (const m of msgs) {
        const from = String(m.from ?? "");
        messages.push({
          waMessageId: String(m.id ?? ""),
          from,
          name: nameByWaId.get(from) ?? null,
          type: String(m.type ?? "text"),
          body: extractBody(m),
          timestamp: tsToIso(m.timestamp),
          raw: m,
        });
      }

      // statuses de mensajes salientes
      const sts = Array.isArray(value.statuses)
        ? (value.statuses as Record<string, unknown>[])
        : [];
      for (const s of sts) {
        const errs = Array.isArray(s.errors)
          ? (s.errors as Record<string, unknown>[])
          : [];
        const firstErr = errs[0];
        const errText = firstErr
          ? String(
              firstErr.message ?? firstErr.title ?? firstErr.code ?? "error",
            )
          : null;
        statuses.push({
          waMessageId: String(s.id ?? ""),
          status: String(s.status ?? ""),
          timestamp: tsToIso(s.timestamp),
          error: errText,
          raw: s,
        });
      }
    }
  }

  return { messages, statuses, phoneNumberId };
}
