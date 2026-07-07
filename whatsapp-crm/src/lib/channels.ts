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
    dot: "bg-ch-whatsapp",
    badge: "bg-ch-whatsapp/10 text-ch-whatsapp",
  },
  instagram: {
    label: "Instagram",
    dot: "bg-ch-instagram",
    badge: "bg-ch-instagram/10 text-ch-instagram",
  },
  facebook: {
    label: "Messenger",
    dot: "bg-ch-facebook",
    badge: "bg-ch-facebook/10 text-ch-facebook",
  },
};

export function channelLabel(channel: string | null | undefined): string {
  return CHANNEL_META[(channel as Channel) ?? "whatsapp"]?.label ?? "—";
}
