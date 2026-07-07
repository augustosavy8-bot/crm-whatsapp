import type { ConversationListItem, ConversationStatus } from "@/lib/types";
import { contactLabel, formatListTime, messagePreview } from "@/lib/format";
import { CHANNEL_META, type Channel } from "@/lib/channels";

interface Props {
  conversations: ConversationListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

const STATUS_DOT: Record<ConversationStatus, string> = {
  abierta: "bg-danger",
  en_proceso: "bg-warn",
  resuelta: "bg-ok",
};

export default function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: Props) {
  if (conversations.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted">
        Todavía no hay conversaciones. Cuando entre un mensaje va a aparecer acá.
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-0.5 p-2">
      {conversations.map((c) => {
        const active = c.id === selectedId;
        const ch = CHANNEL_META[(c.channel as Channel) ?? "whatsapp"];
        const preview =
          (c.last_message_direction === "outbound" ? "Vos: " : "") +
          messagePreview(c.last_message_type, c.last_message_body);
        return (
          <li key={c.id}>
            <button
              onClick={() => onSelect(c.id)}
              className={[
                "flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors",
                active ? "bg-accent-soft" : "hover:bg-surface-2",
              ].join(" ")}
            >
              <div className="relative shrink-0">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-surface-2 border border-line text-sm font-semibold text-muted">
                  {contactLabel(c).replace(/^@/, "").charAt(0).toUpperCase()}
                </div>
                <span
                  className={`absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-surface ${ch.dot}`}
                  title={ch.label}
                />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[c.status]}`}
                      title={c.status}
                    />
                    <span className="truncate text-[15px] font-semibold">
                      {contactLabel(c)}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-faint">
                    {formatListTime(c.last_message_at)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="truncate text-[13px] text-muted">
                    {preview || "—"}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <span className="flex items-center gap-1 text-[11px] font-medium text-muted">
                      <span className={`h-1.5 w-1.5 rounded-full ${ch.dot}`} />
                      {ch.label}
                    </span>
                    {c.unread_count > 0 && (
                      <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-white">
                        {c.unread_count}
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
