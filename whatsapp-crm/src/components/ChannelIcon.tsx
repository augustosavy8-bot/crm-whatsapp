import { SiWhatsapp, SiInstagram, SiMessenger } from "react-icons/si";
import { CHANNEL_BRAND, CHANNEL_LABEL, type Channel } from "@/lib/channels";

// Ícono identificador de cada canal, con su color de marca.
// Instagram usa el gradiente definido una vez en (app)/layout.tsx (#ig-grad).
export default function ChannelIcon({
  channel,
  size = 16,
  className,
}: {
  channel: Channel;
  size?: number;
  className?: string;
}) {
  const label = CHANNEL_LABEL[channel];
  if (channel === "whatsapp") {
    return (
      <SiWhatsapp
        size={size}
        color={CHANNEL_BRAND.whatsapp}
        className={className}
        title={label}
      />
    );
  }
  if (channel === "facebook") {
    return (
      <SiMessenger
        size={size}
        color={CHANNEL_BRAND.facebook}
        className={className}
        title={label}
      />
    );
  }
  // Instagram: relleno con el gradiente de marca.
  return (
    <SiInstagram
      size={size}
      style={{ fill: "url(#ig-grad)" }}
      className={className}
      title={label}
    />
  );
}
