import { createClient } from "@/lib/supabase/server";
import {
  getChannelStats,
  getMessagesDaily,
  getRecentConversations,
} from "@/lib/dashboard";
import { CHANNELS, type Channel } from "@/lib/channels";
import type {
  ChannelStat,
  ConversationListItem,
  MessagesDaily,
} from "@/lib/types";
import ChannelCard from "@/components/dashboard/ChannelCard";
import DailyChart from "@/components/dashboard/DailyChart";
import RecentList from "@/components/dashboard/RecentList";

export default async function DashboardPage() {
  const supabase = await createClient();

  let stats: ChannelStat[] = [];
  let daily: MessagesDaily[] = [];
  let recent: ConversationListItem[] = [];
  try {
    [stats, daily, recent] = await Promise.all([
      getChannelStats(supabase),
      getMessagesDaily(supabase),
      getRecentConversations(supabase, 8),
    ]);
  } catch (e) {
    console.error("[dashboard] error cargando stats", e);
  }

  const statFor = (ch: Channel): ChannelStat =>
    stats.find((s) => s.channel === ch) ?? {
      channel: ch,
      total_conversations: 0,
      open_conversations: 0,
      unread_total: 0,
      inbound_24h: 0,
    };

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inicio</h1>
          <p className="text-sm text-muted">
            Resumen de tus conversaciones en los 3 canales.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CHANNELS.map((ch) => (
            <ChannelCard key={ch} stat={statFor(ch)} />
          ))}
        </div>

        <DailyChart rows={daily} />

        <RecentList conversations={recent} />
      </div>
    </div>
  );
}
