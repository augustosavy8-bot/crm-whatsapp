"use client";

import { useState } from "react";

interface Props {
  windowOpen: boolean;
  sending: boolean;
  error: string | null;
  // Devuelve true si el envío fue exitoso (para limpiar el input).
  onSend: (text: string) => Promise<boolean>;
  onFocus?: () => void;
}

// Composer de texto libre. Habilitado solo dentro de la ventana de 24hs.
export default function MessageComposer({
  windowOpen,
  sending,
  error,
  onSend,
  onFocus,
}: Props) {
  const [text, setText] = useState("");

  async function submit() {
    const t = text.trim();
    if (!t || sending || !windowOpen) return;
    const ok = await onSend(t);
    if (ok) setText(""); // en error, se mantiene lo tipeado para reintentar
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  // Padding inferior extra para el safe-area del notch/home indicator.
  const shell =
    "shrink-0 border-t border-line bg-surface px-3 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]";

  if (!windowOpen) {
    return (
      <div className={shell}>
        <div className="rounded-xl border border-warn/30 bg-warn/10 px-3 py-2 text-[13px] text-warn">
          Pasaron más de 24hs desde el último mensaje del contacto. Para reabrir
          la conversación necesitás enviar una plantilla (llega en una fase
          próxima).
        </div>
      </div>
    );
  }

  return (
    <div className={shell}>
      {error && <p className="mb-2 text-[13px] text-danger">{error}</p>}
      <div className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onFocus={onFocus}
          disabled={sending}
          placeholder="Escribí un mensaje…"
          className="min-w-0 flex-1 rounded-full border border-line bg-surface-2 px-4 py-2.5 text-ink outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/20 disabled:opacity-60"
        />
        <button
          onClick={submit}
          disabled={sending || !text.trim()}
          aria-label="Enviar"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-white transition-colors hover:bg-accent/90 disabled:opacity-40"
        >
          {sending ? (
            <span className="text-xs">…</span>
          ) : (
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m22 2-7 20-4-9-9-4Z" />
              <path d="M22 2 11 13" />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
