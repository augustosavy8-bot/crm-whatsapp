import { SiWhatsapp } from "react-icons/si";
import { CHANNEL_BRAND, CHANNEL_LABEL, type Channel } from "@/lib/channels";

// Ícono identificador del canal (solo WhatsApp).
export default function ChannelIcon({
  channel,
  size = 16,
  className,
}: {
  channel: Channel;
  size?: number;
  className?: string;
}) {
  return (
    <SiWhatsapp
      size={size}
      color={CHANNEL_BRAND.whatsapp}
      className={className}
      title={CHANNEL_LABEL[channel]}
    />
  );
}
