"use client";

import { useState } from "react";

interface Props {
  montoARS: number | null;
  mostrarPago: boolean; // la cuota está por vencer o vencida
}

// Pago de la cuota del alumno con MercadoPago (pago único): lo redirige a MP
// con el link que devuelve el backend. Si MP no está configurado, el backend
// responde 503 y mostramos el mensaje tal cual.
export default function CuotaAcciones({ montoARS, mostrarPago }: Props) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const monto = montoARS != null ? `$${montoARS.toLocaleString("es-AR")}` : "";

  async function pagar() {
    setError(null);
    setCargando(true);
    try {
      const res = await fetch("/api/gym/mp/pagar-cuota", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = (await res.json()) as { initPoint?: string; error?: string };
      if (!res.ok || !data.initPoint) {
        setError(data.error ?? "No se pudo continuar. Probá de nuevo.");
        setCargando(false);
        return;
      }
      window.location.href = data.initPoint; // salta al checkout de MercadoPago
    } catch {
      setError("Sin conexión. Probá de nuevo.");
      setCargando(false);
    }
  }

  // Si no hay nada para ofrecer (al día, o sin monto de plan), no renderizamos.
  if (!mostrarPago || montoARS == null) return null;

  return (
    <div className="mb-5 space-y-3">
      <button
        type="button"
        onClick={pagar}
        disabled={cargando}
        className="w-full rounded-full bg-accent py-3.5 text-sm font-bold text-white transition-colors hover:brightness-95 disabled:opacity-50"
      >
        {cargando ? "Abriendo MercadoPago…" : `Pagar cuota ${monto} con MercadoPago`}
      </button>
      {error && <p className="text-[13px] font-semibold text-danger">{error}</p>}
    </div>
  );
}
