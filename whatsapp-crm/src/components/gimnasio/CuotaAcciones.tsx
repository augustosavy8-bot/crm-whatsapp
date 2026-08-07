"use client";

import { useState } from "react";

interface Props {
  montoARS: number | null;
  mostrarPago: boolean; // la cuota está por vencer o vencida
  debitoActivo: boolean;
  tieneEmail: boolean;
}

// Acciones de cuota del alumno: pagar el mes con MercadoPago (pago único) y,
// si quiere, adherirse al débito automático. Ambos redirigen a MP con el link
// que devuelve el backend. Si MP no está configurado, el backend responde 503
// y mostramos el mensaje tal cual.
export default function CuotaAcciones({
  montoARS,
  mostrarPago,
  debitoActivo,
  tieneEmail,
}: Props) {
  const [cargando, setCargando] = useState<"pago" | "debito" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pedirEmail, setPedirEmail] = useState(false);
  const [email, setEmail] = useState("");

  const monto = montoARS != null ? `$${montoARS.toLocaleString("es-AR")}` : "";

  async function ir(
    tipo: "pago" | "debito",
    endpoint: string,
    payload?: Record<string, unknown>,
  ) {
    setError(null);
    setCargando(tipo);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload ?? {}),
      });
      const data = (await res.json()) as { initPoint?: string; error?: string };
      if (!res.ok || !data.initPoint) {
        setError(data.error ?? "No se pudo continuar. Probá de nuevo.");
        setCargando(null);
        return;
      }
      window.location.href = data.initPoint; // salta al checkout de MercadoPago
    } catch {
      setError("Sin conexión. Probá de nuevo.");
      setCargando(null);
    }
  }

  function adherir() {
    if (!tieneEmail && !email.trim()) {
      setPedirEmail(true);
      return;
    }
    ir("debito", "/api/gym/mp/adherir-self", email.trim() ? { email: email.trim() } : undefined);
  }

  // Si no hay nada para ofrecer (al día y ya en débito), no renderizamos nada.
  if (!mostrarPago && debitoActivo) return null;

  return (
    <div className="mb-5 space-y-3">
      {mostrarPago && montoARS != null && (
        <button
          type="button"
          onClick={() => ir("pago", "/api/gym/mp/pagar-cuota")}
          disabled={cargando !== null}
          className="w-full rounded-full bg-accent py-3.5 text-sm font-bold text-white transition-colors hover:brightness-95 disabled:opacity-50"
        >
          {cargando === "pago" ? "Abriendo MercadoPago…" : `Pagar cuota ${monto} con MercadoPago`}
        </button>
      )}

      {!debitoActivo && (
        <div className="rounded-panel border border-line bg-surface p-4 shadow-card">
          <div className="text-[14px] font-bold">Débito automático</div>
          <p className="mt-0.5 text-[13px] text-muted">
            Adherite y se te cobra la cuota todos los meses sin que tengas que
            acordarte. Lo cancelás cuando quieras.
          </p>

          {pedirEmail && !tieneEmail && (
            <input
              type="email"
              inputMode="email"
              placeholder="Tu email para MercadoPago"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-3 w-full rounded-full border border-line bg-surface-2 px-4 py-2.5 text-sm outline-none focus:border-accent"
            />
          )}

          <button
            type="button"
            onClick={adherir}
            disabled={cargando !== null}
            className="mt-3 rounded-full bg-surface-2 px-4 py-2 text-[13px] font-semibold text-ink transition-colors hover:bg-accent hover:text-white disabled:opacity-50"
          >
            {cargando === "debito" ? "Abriendo MercadoPago…" : "Adherite al débito automático"}
          </button>
        </div>
      )}

      {error && <p className="text-[13px] font-semibold text-danger">{error}</p>}
    </div>
  );
}
