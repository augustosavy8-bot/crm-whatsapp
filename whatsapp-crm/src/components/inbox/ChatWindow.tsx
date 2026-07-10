"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ConversationListItem, Message } from "@/lib/types";
import { contactLabel, contactSubtitle } from "@/lib/format";
import { CHANNEL_LABEL, type Channel } from "@/lib/channels";
import ChannelIcon from "@/components/ChannelIcon";
import MessageBubble from "./MessageBubble";
import MessageComposer from "./MessageComposer";

interface Props {
  contact: ConversationListItem;
  messages: Message[];
  loading: boolean;
  windowOpen: boolean;
  sending: boolean;
  sendError: string | null;
  onSend: (text: string) => Promise<boolean>;
  onBack?: () => void;
  onToggleModoAtencion: () => void;
}

export default function ChatWindow({
  contact,
  messages,
  loading,
  windowOpen,
  sending,
  sendError,
  onSend,
  onBack,
  onToggleModoAtencion,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const channel = (contact.channel as Channel) ?? "whatsapp";

  const scrollToBottom = useCallback((smooth = false) => {
    bottomRef.current?.scrollIntoView({
      block: "end",
      behavior: smooth ? "smooth" : "auto",
    });
  }, []);

  // Autoscroll al abrir y al llegar mensajes.
  useEffect(() => {
    scrollToBottom();
  }, [contact.id, messages.length, scrollToBottom]);

  // Al cambiar el viewport visible (teclado en mobile), mantener el fondo a la vista.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => scrollToBottom();
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, [scrollToBottom]);

  return (
    <div className="flex h-full flex-col bg-canvas">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 border-b border-line bg-surface px-3 py-2.5 sm:px-4">
        {onBack && (
          <button
            onClick={onBack}
            className="-ml-1 flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface-2 md:hidden"
            aria-label="Volver a la lista"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m15 18-6-6 6-6" />
            </svg>
          </button>
        )}
        <div className="relative shrink-0">
          <div className="flex h-9 w-9 items-center justify-center rounded-full border border-line bg-surface-2 text-sm font-semibold text-muted">
            {contactLabel(contact).replace(/^@/, "").charAt(0).toUpperCase()}
          </div>
          <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-surface bg-surface">
            <ChannelIcon channel={channel} size={10} />
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[15px] font-semibold">
              {contactLabel(contact)}
            </span>
            <ChannelIcon channel={channel} size={15} />
          </div>
          <div className="truncate text-xs text-muted">
            {contactSubtitle(contact) || CHANNEL_LABEL[channel]}
          </div>
        </div>
        {channel === "whatsapp" && (
          <button
            onClick={onToggleModoAtencion}
            className={[
              "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors",
              contact.modo_atencion === "ia"
                ? "bg-accent-soft text-accent hover:bg-accent-soft/70"
                : "bg-surface-2 text-muted hover:bg-surface-2/70",
            ].join(" ")}
            title={
              contact.modo_atencion === "ia"
                ? "La IA está respondiendo esta conversación. Click para pasar a modo manual."
                : "Modo manual: la IA no responde acá. Click para reactivarla."
            }
          >
            {contact.modo_atencion === "ia" ? "🤖 IA activa" : "Modo manual"}
          </button>
        )}
        <span
          className={[
            "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium",
            windowOpen ? "bg-ok/10 text-ok" : "bg-surface-2 text-muted",
          ].join(" ")}
          title="Ventana de 24hs para responder con texto libre"
        >
          {windowOpen ? "Ventana 24h" : "Cerrada"}
        </span>
      </div>

      {/* Mensajes */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-3 py-4 sm:px-4">
        {loading ? (
          <p className="text-center text-xs text-faint">Cargando…</p>
        ) : messages.length === 0 ? (
          <p className="text-center text-xs text-faint">
            Sin mensajes en esta conversación.
          </p>
        ) : (
          messages.map((m) => <MessageBubble key={m.id} message={m} />)
        )}
        <div ref={bottomRef} />
      </div>

      <MessageComposer
        windowOpen={windowOpen}
        sending={sending}
        error={sendError}
        onSend={onSend}
        onFocus={() => setTimeout(() => scrollToBottom(true), 300)}
      />
    </div>
  );
}
