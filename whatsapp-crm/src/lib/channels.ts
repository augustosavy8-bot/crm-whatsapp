// Canales soportados por el CRM.
export type Channel = "whatsapp" | "instagram" | "facebook";

export const CHANNELS: Channel[] = ["whatsapp", "instagram", "facebook"];

interface ChannelMeta {
  label: string;
  // Punto de color para el indicador chico (clases Tailwind).
  dot: string;
  // Chip/badge (fondo + texto).
  badge: string;
}

export const CHANNEL_META: Record<Channel, ChannelMeta> = {
  whatsapp: {
    label: "WhatsApp",
    dot: "bg-emerald-500",
    badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  },
  instagram: {
    label: "Instagram",
    dot: "bg-pink-500",
    badge: "bg-pink-100 text-pink-700 dark:bg-pink-950 dark:text-pink-300",
  },
  facebook: {
    label: "Messenger",
    dot: "bg-blue-500",
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  },
};

export function channelLabel(channel: string | null | undefined): string {
  return CHANNEL_META[(channel as Channel) ?? "whatsapp"]?.label ?? "—";
}
