"use client";

import { useCallback, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getConversations,
  getMessages,
  markConversationRead,
} from "@/lib/conversations";
import type { ConversationListItem, Message } from "@/lib/types";
import { isWindowOpen } from "@/lib/window";
import { CHANNELS, CHANNEL_META, type Channel } from "@/lib/channels";
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
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [tab, setTab] = useState<Channel | "all">("all");

  // Agrega un mensaje evitando duplicados por id (mismo dedupe que usa Realtime).
  const appendMessage = useCallback((msg: Message) => {
    setMessages((prev) =>
      prev.some((m) => m.id === msg.id) ? prev : [...prev, msg],
    );
  }, []);

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
      setSendError(null);
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

  // Enviar texto libre. Devuelve true si el envío fue exitoso (para limpiar el input).
  const sendMessage = useCallback(
    async (text: string): Promise<boolean> => {
      if (!selectedId) return false;
      setSending(true);
      setSendError(null);
      try {
        const res = await fetch("/api/messages/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contactId: selectedId, body: text }),
        });
        const data = await res.json();
        if (!res.ok) {
          setSendError(data.error || "No se pudo enviar el mensaje.");
          return false;
        }
        // Éxito: agregar la fila persistida (dedupe por id contra el evento Realtime).
        if (data.message) appendMessage(data.message as Message);
        if (data.warning) setSendError(data.warning);
        refreshConversations();
        return true;
      } catch {
        setSendError("Error de red al enviar. Reintentá.");
        return false;
      } finally {
        setSending(false);
      }
    },
    [selectedId, appendMessage, refreshConversations],
  );

  // Realtime
  useRealtimeInbox({
    onMessageInsert: (msg) => {
      if (msg.contact_id === selectedIdRef.current) {
        appendMessage(msg);
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
  const windowOpen = isWindowOpen(selectedContact?.last_inbound_at ?? null);

  // Filtro por canal (tab). Cuenta por canal para los badges de las tabs.
  const visibleConversations =
    tab === "all"
      ? conversations
      : conversations.filter((c) => c.channel === tab);
  const countFor = (ch: Channel | "all") =>
    ch === "all"
      ? conversations.length
      : conversations.filter((c) => c.channel === ch).length;

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
        {/* Tabs por canal */}
        <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-neutral-200 dark:border-neutral-800 px-2 py-2">
          {(["all", ...CHANNELS] as const).map((ch) => {
            const active = tab === ch;
            const label = ch === "all" ? "Todos" : CHANNEL_META[ch].label;
            return (
              <button
                key={ch}
                onClick={() => setTab(ch)}
                className={[
                  "flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  active
                    ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                    : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800",
                ].join(" ")}
              >
                {ch !== "all" && (
                  <span
                    className={`h-2 w-2 rounded-full ${CHANNEL_META[ch].dot}`}
                  />
                )}
                {label}
                <span className="opacity-60">{countFor(ch)}</span>
              </button>
            );
          })}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <ConversationList
            conversations={visibleConversations}
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
            windowOpen={windowOpen}
            sending={sending}
            sendError={sendError}
            onSend={sendMessage}
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
