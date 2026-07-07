import Link from "next/link";
import type { ConversationListItem } from "@/lib/types";
import { contactLabel, formatListTime, messagePreview } from "@/lib/format";
import { type Channel } from "@/lib/channels";
import ChannelIcon from "@/components/ChannelIcon";

// Últimas conversaciones con actividad. Click -> abre esa conversación en el Inbox.
export default function RecentList({
  conversations,
}: {
  conversations: ConversationListItem[];
}) {
  return (
    <div className="rounded-panel border border-line bg-surface shadow-card">
      <div className="flex items-center justify-between px-5 py-4">
        <h2 className="text-[15px] font-bold">Conversaciones recientes</h2>
        <Link
          href="/inbox"
          className="text-xs font-semibold text-accent hover:underline"
        >
          Ver Inbox
        </Link>
      </div>
      {conversations.length === 0 ? (
        <div className="px-5 pb-6 text-sm text-muted">
          Todavía no hay conversaciones.
        </div>
      ) : (
        <ul className="border-t border-line">
          {conversations.map((c) => {
            const channel = (c.channel as Channel) ?? "whatsapp";
            const preview =
              (c.last_message_direction === "outbound" ? "Vos: " : "") +
              messagePreview(c.last_message_type, c.last_message_body);
            return (
              <li key={c.id}>
                <Link
                  href={`/inbox?c=${c.id}`}
                  className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-2"
                >
                  <div className="relative shrink-0">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface-2 text-sm font-semibold text-muted">
                      {contactLabel(c).replace(/^@/, "").charAt(0).toUpperCase()}
                    </div>
                    <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-surface bg-surface">
                      <ChannelIcon channel={channel} size={10} />
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">
                      {contactLabel(c)}
                    </div>
                    <div className="truncate text-xs text-muted">
                      {preview || "—"}
                    </div>
                  </div>
                  <span className="shrink-0 text-[11px] tabular-nums text-faint">
                    {formatListTime(c.last_message_at)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
