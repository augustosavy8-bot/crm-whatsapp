"use client";

import { useState } from "react";

interface Props {
  windowOpen: boolean;
  sending: boolean;
  error: string | null;
  // Devuelve true si el envío fue exitoso (para limpiar el input).
  onSend: (text: string) => Promise<boolean>;
}

// Composer de texto libre. Habilitado solo dentro de la ventana de 24hs.
export default function MessageComposer({
  windowOpen,
  sending,
  error,
  onSend,
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

  if (!windowOpen) {
    return (
      <div className="shrink-0 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-3">
        <div className="rounded-lg border border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
          Pasaron más de 24hs desde el último mensaje del contacto. Para reabrir
          la conversación necesitás enviar una plantilla (llega en una fase
          próxima).
        </div>
      </div>
    );
  }

  return (
    <div className="shrink-0 border-t border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 p-3">
      {error && (
        <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>
      )}
      <div className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={sending}
          placeholder="Escribí un mensaje…"
          className="flex-1 rounded-full border border-neutral-300 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-4 py-2 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60"
        />
        <button
          onClick={submit}
          disabled={sending || !text.trim()}
          className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {sending ? "Enviando…" : "Enviar"}
        </button>
      </div>
    </div>
  );
}
