"use client";

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Registra el SW del gimnasio (scope propio /gimnasio) y muestra un botón para
// instalar la app cuando el navegador lo permite. Silencioso si no aplica
// (desktop, ya instalada, iOS —que no soporta beforeinstallprompt—).
export default function InstalarApp() {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/gimnasio/sw.js", { scope: "/gimnasio" })
        .catch(() => {});
    }

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setPrompt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!prompt) return null;

  return (
    <button
      onClick={async () => {
        await prompt.prompt();
        await prompt.userChoice;
        setPrompt(null);
      }}
      className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-[13px] font-semibold text-ink shadow-sm transition-colors hover:border-accent"
    >
      ⬇ Instalar app
    </button>
  );
}
