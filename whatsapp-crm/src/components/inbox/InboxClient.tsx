"use client";

import { useCallback, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getConversations,
  getMessages,
  markConversationRead,
} from "@/lib/conversations";
import type { ConversationListItem, Message } from "@/lib/types";
import ConversationList from "./ConversationList";
import ChatWindow from "./ChatWindow";
import { useRealtimeInbox } from "./useRealtimeInbox";

export default function InboxClient({
  initialConversations,
}: {
  initialConversations: ConversationListItem[];
}) {
  const supabase = useRef(createClient()).current;

  const [conversations, setConversations] =
    useState<ConversationListItem[]>(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedId;

  // Refresco de la lista (debounced) para no spamear queries en ráfagas.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshConversations = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(async () => {
      try {
        setConversations(await getConversations(supabase));
      } catch (e) {
        console.error("[inbox] refresh conversaciones", e);
      }
    }, 200);
  }, [supabase]);

  const openConversation = useCallback(
    async (id: string) => {
      setSelectedId(id);
      setLoadingMessages(true);
      // Optimista: limpiar el badge en la lista local.
      setConversations((prev) =>
        prev.map((c) => (c.id === id ? { ...c, unread_count: 0 } : c)),
      );
      try {
        const [msgs] = await Promise.all([
          getMessages(supabase, id),
          markConversationRead(supabase, id),
        ]);
        setMessages(msgs);
      } catch (e) {
        console.error("[inbox] abrir conversación", e);
        setMessages([]);
      } finally {
        setLoadingMessages(false);
      }
    },
    [supabase],
  );

  // Realtime
  useRealtimeInbox({
    onMessageInsert: (msg) => {
      if (msg.contact_id === selectedIdRef.current) {
        setMessages((prev) =>
          prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
        );
        // El chat está abierto: mantener el contador en 0.
        if (msg.direction === "inbound") {
          void markConversationRead(supabase, msg.contact_id);
        }
      }
      refreshConversations();
    },
    onContactsChange: refreshConversations,
  });

  const selectedContact =
    conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex h-full">
      {/* Columna izquierda: lista */}
      <aside
        className={[
          selectedId ? "hidden md:flex" : "flex",
          "w-full md:w-[360px] shrink-0 flex-col border-r border-neutral-200 dark:border-neutral-800 bg-white dark:bg-neutral-900",
        ].join(" ")}
      >
        <div className="shrink-0 border-b border-neutral-200 dark:border-neutral-800 px-4 py-2.5 text-sm font-semibold">
          Conversaciones
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ConversationList
            conversations={conversations}
            selectedId={selectedId}
            onSelect={openConversation}
          />
        </div>
      </aside>

      {/* Columna derecha: chat */}
      <section
        className={[
          selectedId ? "flex" : "hidden md:flex",
          "min-w-0 flex-1 flex-col",
        ].join(" ")}
      >
        {selectedContact ? (
          <ChatWindow
            contact={selectedContact}
            messages={messages}
            loading={loadingMessages}
            onBack={() => setSelectedId(null)}
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-neutral-100 dark:bg-neutral-950 text-sm text-neutral-400">
            Elegí una conversación para verla.
          </div>
        )}
      </section>
    </div>
  );
}
