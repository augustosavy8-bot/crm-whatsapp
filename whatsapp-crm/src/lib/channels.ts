// Canales soportados por el CRM.
export type Channel = "whatsapp" | "instagram" | "facebook";

export const CHANNELS: Channel[] = ["whatsapp", "instagram", "facebook"];

export const CHANNEL_LABEL: Record<Channel, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Messenger",
};

// Colores de marca (para los íconos de canal; el gradiente de IG se resuelve en ChannelIcon).
export const CHANNEL_BRAND: Record<Channel, string> = {
  whatsapp: "#25D366",
  instagram: "#E1306C",
  facebook: "#0866FF",
};

export function channelLabel(channel: string | null | undefined): string {
  return CHANNEL_LABEL[(channel as Channel) ?? "whatsapp"] ?? "—";
}
