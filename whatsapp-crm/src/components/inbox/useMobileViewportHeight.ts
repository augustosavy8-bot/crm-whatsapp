"use client";

import { useEffect, useState } from "react";

// Devuelve la altura del viewport VISIBLE en mobile (visualViewport), que se
// achica cuando aparece el teclado. En desktop devuelve null (se usa CSS h-full).
// Sirve para que el composer del chat quede siempre por encima del teclado en iOS.
export function useMobileViewportHeight(): number | null {
  const [height, setHeight] = useState<number | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    const mq = window.matchMedia("(max-width: 767px)");

    const update = () => {
      if (mq.matches && vv) setHeight(vv.height);
      else setHeight(null);
    };

    update();
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

  return height;
}
