// Canal soportado por el CRM (solo WhatsApp).
export type Channel = "whatsapp";

export const CHANNELS: Channel[] = ["whatsapp"];

export const CHANNEL_LABEL: Record<Channel, string> = {
  whatsapp: "WhatsApp",
};

export const CHANNEL_BRAND: Record<Channel, string> = {
  whatsapp: "#25D366",
};

export function channelLabel(channel: string | null | undefined): string {
  return CHANNEL_LABEL[(channel as Channel) ?? "whatsapp"] ?? "—";
}
