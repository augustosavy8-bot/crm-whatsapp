"use client";

import { useEffect, useState } from "react";

export interface MobileViewport {
  height: number; // alto del viewport VISIBLE (se achica con el teclado)
  offsetTop: number; // cuánto bajó el viewport visual respecto del layout (iOS)
}

// En mobile devuelve el viewport visible (visualViewport): alto + offsetTop.
// En iOS Safari, al abrir el teclado el viewport visual se achica Y puede
// desplazarse (offsetTop > 0); usar ambos evita el hueco gris entre el
// composer y el teclado. En desktop devuelve null (se usa CSS h-full).
export function useMobileVisualViewport(): MobileViewport | null {
  const [vp, setVp] = useState<MobileViewport | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    const mq = window.matchMedia("(max-width: 767px)");

    const update = () => {
      if (mq.matches && vv) {
        setVp({ height: vv.height, offsetTop: vv.offsetTop });
      } else {
        setVp(null);
      }
    };

    update();
    // iOS dispara 'resize' Y 'scroll' del visualViewport al mover el teclado.
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    mq.addEventListener("change", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);

    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      mq.removeEventListener("change", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return vp;
}
