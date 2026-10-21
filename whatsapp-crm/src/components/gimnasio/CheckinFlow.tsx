"use client";

import { useState } from "react";

interface Clase {
  horarioId: string;
  horaInicio: string; // "HH:MM:SS"
  horaFin: string;
  tipo: "fijo" | "suelta";
  yaPresente: boolean;
}

const hhmm = (h: string) => h.slice(0, 5);

// Pantalla a la que llega el socio al escanear el QR del gym o tocar su chip.
// Muestra sus clases de hoy y le deja marcar la asistencia (suma puntos).
export default function CheckinFlow({ clases }: { clases: Clase[] }) {
  const [estado, setEstado] = useState<Record<string, "ok" | "cargando">>(
    Object.fromEntries(
      clases.filter((c) => c.yaPresente).map((c) => [c.horarioId, "ok"]),
    ),
  );
  const [error, setError] = useState<string | null>(null);

  async function marcar(horarioId: string) {
    setError(null);
    setEstado((s) => ({ ...s, [horarioId]: "cargando" }));
    try {
      const res = await fetch("/api/gym/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ horarioId }),
      });
      const d = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !d.ok) {
        setError(d.error ?? "No se pudo registrar. Probá de nuevo.");
        setEstado((s) => {
          const n = { ...s };
          delete n[horarioId];
          return n;
        });
        return;
      }
      setEstado((s) => ({ ...s, [horarioId]: "ok" }));
    } catch {
      setError("Sin conexión. Probá de nuevo.");
      setEstado((s) => {
        const n = { ...s };
        delete n[horarioId];
        return n;
      });
    }
  }

  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-6 sm:pt-8">
      <h1 className="text-xl font-bold tracking-tight">Check-in</h1>
      <p className="mt-0.5 text-[13px] text-muted">
        Marcá tu asistencia de hoy y sumá tus puntos.
      </p>

      {error && (
        <p className="mt-4 rounded-card bg-danger/10 px-3 py-2 text-[13px] font-semibold text-danger">
          {error}
        </p>
      )}

      {clases.length === 0 ? (
        <div className="mt-5 rounded-panel border border-line bg-surface p-4 text-[13px] text-muted shadow-card">
          No tenés una clase reservada para hoy. Reservá tu turno y después marcás
          el check-in.
          <div className="mt-3">
            <a
              href="/mi-cuenta"
              className="inline-block rounded-full bg-ink px-4 py-2 text-[13px] font-bold text-white"
            >
              Ir a reservar
            </a>
          </div>
        </div>
      ) : (
        <ul className="mt-5 space-y-3">
          {clases.map((c) => {
            const st = estado[c.horarioId];
            const listo = st === "ok";
            return (
              <li
                key={c.horarioId}
                className="flex items-center justify-between gap-3 rounded-panel border border-line bg-surface p-4 shadow-card"
              >
                <div>
                  <div className="font-semibold text-ink">
                    {hhmm(c.horaInicio)}–{hhmm(c.horaFin)} hs
                  </div>
                  <div className="text-[12px] text-muted">
                    {c.tipo === "fijo" ? "Turno fijo" : "Reserva de hoy"}
                  </div>
                </div>
                {listo ? (
                  <span className="shrink-0 rounded-full bg-ok/15 px-3 py-1.5 text-[13px] font-bold text-ok">
                    ✓ Registrada
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => marcar(c.horarioId)}
                    disabled={st === "cargando"}
                    className="shrink-0 rounded-full bg-accent px-4 py-2 text-[13px] font-bold text-white transition-colors hover:brightness-95 disabled:opacity-50"
                  >
                    {st === "cargando" ? "Registrando…" : "Marcar asistencia"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {clases.some((c) => estado[c.horarioId] === "ok") && (
        <div className="mt-5 rounded-panel border border-line bg-surface-2 p-4 text-[13px] shadow-card">
          🎉 ¡Listo! Tu asistencia quedó registrada y sumaste tus puntos.
          <div className="mt-3">
            <a
              href="/mi-cuenta"
              className="inline-block rounded-full bg-ink px-4 py-2 text-[13px] font-bold text-white"
            >
              Ver mis puntos
            </a>
          </div>
        </div>
      )}
    </main>
  );
}
