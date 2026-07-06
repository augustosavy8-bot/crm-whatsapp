"use client";

import { useEffect, useRef } from "react";
import type { ConversationListItem, Message } from "@/lib/types";
import { displayName } from "@/lib/format";
import MessageBubble from "./MessageBubble";
import MessageComposer from "./MessageComposer";

interface Props {
  contact: ConversationListItem;
  messages: Message[];
  loading: boolean;
  onBack?: () => void;
}

export default function ChatWindow({
  contact,
  messages,
  loading,
  onBack,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  // Autoscroll al fondo al abrir el chat y cuando cambian los mensajes.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [contact.id, messages.length]);

  return (
    <div className="flex h-full flex-col bg-neutral-100 dark:bg-neutral-950">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900 px-4 py-2.5">
        {onBack && (
          <button
            onClick={onBack}
            className="md:hidden -ml-1 rounded-md p-1 text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            aria-label="Volver"
          >
            ‹
          </button>
        )}
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-200 dark:bg-neutral-700 text-sm font-medium text-neutral-600 dark:text-neutral-200">
          {displayName(contact.name, contact.phone_number)
            .charAt(0)
            .toUpperCase()}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium">
            {displayName(contact.name, contact.phone_number)}
          </div>
          <div className="truncate text-xs text-neutral-500">
            {contact.phone_number}
          </div>
        </div>
      </div>

      {/* Mensajes */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-4">
        {loading ? (
          <p className="text-center text-xs text-neutral-400">Cargando…</p>
        ) : messages.length === 0 ? (
          <p className="text-center text-xs text-neutral-400">
            Sin mensajes en esta conversación.
          </p>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
        <div ref={bottomRef} />
      </div>

      <MessageComposer />
    </div>
  );
}
