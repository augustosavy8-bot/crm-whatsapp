import { CHANNEL_LABEL, type Channel } from "@/lib/channels";
import type { ChannelStat } from "@/lib/types";
import ChannelIcon from "@/components/ChannelIcon";

// Card de resumen de un canal.
export default function ChannelCard({ stat }: { stat: ChannelStat }) {
  const channel = stat.channel as Channel;
  const metric = (label: string, value: number) => (
    <div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );

  return (
    <div className="rounded-panel border border-line bg-surface p-5 shadow-card">
      <div className="mb-3 flex items-center gap-2">
        <ChannelIcon channel={channel} size={20} />
        <span className="text-[15px] font-bold">{CHANNEL_LABEL[channel]}</span>
      </div>
      <div className="text-3xl font-bold tracking-tight tabular-nums">
        {stat.total_conversations}
      </div>
      <div className="mb-4 text-xs text-muted">conversaciones</div>
      <div className="grid grid-cols-3 gap-2 border-t border-line pt-3">
        {metric("Abiertas", stat.open_conversations)}
        {metric("No leídos", stat.unread_total)}
        {metric("24 hs", stat.inbound_24h)}
      </div>
    </div>
  );
}
