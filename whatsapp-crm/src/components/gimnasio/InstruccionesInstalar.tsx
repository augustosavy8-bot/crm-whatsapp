"use client";

import { useEffect, useState } from "react";

// Instructivo "llevá la app a tu pantalla de inicio" para el alumno. Aparece la
// primera vez en su panel (mobile, no instalada todavía), con los pasos de
// iPhone/Safari y Android/Chrome. "Ya la instalé" no vuelve a aparecer;
// "Recordarme después" la muestra de nuevo en la próxima visita.

const KEY = "kinactiva:app-instalada";

type Plataforma = "ios" | "android";

const PASOS: Record<Plataforma, { title: string; body: string }[]> = {
  ios: [
    {
      title: "Tocá Compartir",
      body: "En la barra de abajo de Safari, el ícono con la flecha hacia arriba.",
    },
    {
      title: "Elegí “Agregar a inicio”",
      body: "Deslizá la lista de opciones hasta encontrar “Agregar a pantalla de inicio”.",
    },
    {
      title: "Confirmá “Agregar”",
      body: "El ícono queda en tu inicio y abre como app, sin barra del navegador.",
    },
  ],
  android: [
    {
      title: "Abrí el menú de Chrome",
      body: "Los tres puntos, arriba a la derecha.",
    },
    {
      title: "Elegí “Instalar aplicación”",
      body: "En algunos teléfonos aparece como “Agregar a pantalla de inicio”.",
    },
    {
      title: "Confirmá “Instalar”",
      body: "El ícono queda en tu inicio y abre como app, sin barra del navegador.",
    },
  ],
};

export default function InstruccionesInstalar() {
  const [visible, setVisible] = useState(false);
  const [plataforma, setPlataforma] = useState<Plataforma>("android");

  useEffect(() => {
    // Ya la instaló antes (localStorage), o ya corre como app instalada.
    if (localStorage.getItem(KEY) === "1") return;
    const standalone =
      window.matchMedia?.("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone;
    if (standalone) return;

    const ua = navigator.userAgent || "";
    const esIOS = /iphone|ipad|ipod/i.test(ua);
    const esAndroid = /android/i.test(ua);
    // Solo tiene sentido en el celu; en desktop no mostramos nada.
    if (!esIOS && !esAndroid) return;

    setPlataforma(esIOS ? "ios" : "android");
    setVisible(true);
  }, []);

  if (!visible) return null;

  function yaInstale() {
    localStorage.setItem(KEY, "1");
    setVisible(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-panel border border-line bg-surface p-5 shadow-pop">
        <div className="mb-1 flex items-start gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/kinactiva-mark.png"
            alt=""
            aria-hidden
            className="mt-0.5 h-6 w-auto"
          />
          <div>
            <h2 className="text-[16px] font-extrabold leading-tight tracking-tight">
              Llevá KINACTIVA a tu inicio
            </h2>
            <p className="mt-1 text-[13px] leading-snug text-muted">
              Se abre a pantalla completa, sin la barra del navegador, y mantiene
              tu sesión abierta.
            </p>
          </div>
        </div>

        {/* Selector de plataforma */}
        <div className="mt-4 flex rounded-full bg-surface-2 p-1">
          {(
            [
              ["ios", "iPhone · Safari"],
              ["android", "Android · Chrome"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setPlataforma(key)}
              className={[
                "flex-1 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors",
                plataforma === key
                  ? "bg-ink text-white"
                  : "text-muted hover:text-ink",
              ].join(" ")}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Pasos */}
        <ol className="mt-4 space-y-3">
          {PASOS[plataforma].map((p, i) => (
            <li key={i} className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-[12px] font-bold text-white">
                {i + 1}
              </span>
              <div className="min-w-0">
                <div className="text-[14px] font-semibold leading-tight">
                  {p.title}
                </div>
                <p className="mt-0.5 text-[13px] leading-snug text-muted">
                  {p.body}
                </p>
              </div>
            </li>
          ))}
        </ol>

        <div className="mt-5 flex flex-col gap-2">
          <button
            onClick={yaInstale}
            className="w-full rounded-full bg-ink py-2.5 text-sm font-bold text-white transition-colors hover:bg-ink/90"
          >
            Listo, ya la instalé
          </button>
          <button
            onClick={() => setVisible(false)}
            className="w-full text-xs font-semibold text-muted hover:text-ink"
          >
            Recordarme después
          </button>
        </div>
      </div>
    </div>
  );
}
