import type { ConversationListItem } from "@/lib/types";
import {
  displayName,
  formatListTime,
  messagePreview,
} from "@/lib/format";

interface Props {
  conversations: ConversationListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export default function ConversationList({
  conversations,
  selectedId,
  onSelect,
}: Props) {
  if (conversations.length === 0) {
    return (
      <div className="p-6 text-center text-sm text-neutral-500">
        Todavía no hay conversaciones. Cuando entre un mensaje de WhatsApp va a
        aparecer acá.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-neutral-100 dark:divide-neutral-800">
      {conversations.map((c) => {
        const active = c.id === selectedId;
        const preview =
          (c.last_message_direction === "outbound" ? "Vos: " : "") +
          messagePreview(c.last_message_type, c.last_message_body);
        return (
          <li key={c.id}>
            <button
              onClick={() => onSelect(c.id)}
              className={[
                "flex w-full items-center gap-3 px-3 py-3 text-left transition-colors",
                active
                  ? "bg-emerald-50 dark:bg-emerald-950/40"
                  : "hover:bg-neutral-50 dark:hover:bg-neutral-900",
              ].join(" ")}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-700 text-sm font-medium text-neutral-600 dark:text-neutral-200">
                {displayName(c.name, c.phone_number).charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-medium">
                    {displayName(c.name, c.phone_number)}
                  </span>
                  <span className="shrink-0 text-[11px] text-neutral-400">
                    {formatListTime(c.last_message_at)}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-neutral-500">
                    {preview || "—"}
                  </span>
                  {c.unread_count > 0 && (
                    <span className="ml-1 inline-flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[11px] font-semibold text-white">
                      {c.unread_count}
                    </span>
                  )}
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
