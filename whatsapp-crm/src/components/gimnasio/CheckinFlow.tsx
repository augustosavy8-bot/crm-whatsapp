"use client";

import { useEffect, useState } from "react";

interface Clase {
  horarioId: string;
  horaInicio: string; // "HH:MM:SS"
  horaFin: string;
  tipo: "fijo" | "suelta";
  yaPresente: boolean;
}

const hhmm = (h: string) => h.slice(0, 5);

// Ubicación actual del socio (para el anti-trampa). null si no se puede obtener
// (sin permiso / sin GPS); el server decide si hace falta.
function obtenerUbicacion(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
    );
  });
}

// Overlay a pantalla completa que confirma, sin lugar a dudas, que la asistencia
// quedó registrada. Aparece ni bien el server responde OK.
function OverlayExito({
  hora,
  onCerrarAria,
}: {
  hora: string;
  onCerrarAria: () => void;
}) {
  // Vibración de confirmación (si el teléfono la soporta).
  useEffect(() => {
    try {
      navigator.vibrate?.([30, 40, 30]);
    } catch {
      /* no pasa nada */
    }
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-ok/95 px-6 text-center text-white animate-[fadeIn_200ms_ease-out]"
      role="status"
      aria-live="assertive"
    >
      <div className="animate-[pop_320ms_cubic-bezier(.17,.67,.3,1.33)]">
        <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full bg-white/20 ring-4 ring-white/40">
          <span className="text-6xl leading-none">✓</span>
        </div>
      </div>
      <div className="mt-6 text-3xl font-black tracking-tight">
        ¡Asistencia registrada!
      </div>
      <p className="mt-2 text-[15px] font-semibold text-white/90">
        Clase de las {hora} hs · sumaste tus puntos 🎉
      </p>
      <button
        type="button"
        onClick={onCerrarAria}
        className="mt-8 rounded-full bg-white px-6 py-2.5 text-[14px] font-bold text-ok shadow-lg"
      >
        Listo
      </button>

      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes pop {
          0% { transform: scale(.4); opacity: 0 }
          60% { transform: scale(1.08); opacity: 1 }
          100% { transform: scale(1) }
        }
      `}</style>
    </div>
  );
}

// Pantalla a la que llega el socio al escanear el QR del gym o tocar su chip.
// Muestra sus clases de hoy y le deja marcar la asistencia (suma puntos).
export default function CheckinFlow({ clases }: { clases: Clase[] }) {
  const [estado, setEstado] = useState<Record<string, "ok" | "cargando">>(
    Object.fromEntries(
      clases.filter((c) => c.yaPresente).map((c) => [c.horarioId, "ok"]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  // Clase recién marcada → dispara el overlay de confirmación.
  const [exito, setExito] = useState<{ hora: string } | null>(null);

  async function marcar(horarioId: string, hora: string) {
    setError(null);
    setEstado((s) => ({ ...s, [horarioId]: "cargando" }));
    try {
      const coords = await obtenerUbicacion();
      const res = await fetch("/api/gym/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ horarioId, ...(coords ?? {}) }),
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
      setExito({ hora });
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
      {exito && (
        <OverlayExito hora={exito.hora} onCerrarAria={() => setExito(null)} />
      )}

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
          <p className="font-semibold text-ink">
            No tenés una clase reservada para hoy.
          </p>
          <p className="mt-1">
            El check-in marca la asistencia de una clase que tengas reservada.
            Reservá tu turno de hoy y después volvé a escanear el QR.
          </p>
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
                className={`flex items-center justify-between gap-3 rounded-panel border p-4 shadow-card transition-colors ${
                  listo
                    ? "border-ok/40 bg-ok/10"
                    : "border-line bg-surface"
                }`}
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
                  <span className="shrink-0 rounded-full bg-ok px-3 py-1.5 text-[13px] font-bold text-white">
                    ✓ Registrada
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => marcar(c.horarioId, hhmm(c.horaInicio))}
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
        <div className="mt-5 rounded-panel border border-ok/40 bg-ok/10 p-4 text-[13px] font-semibold text-ink shadow-card">
          ✓ Tu asistencia de hoy quedó registrada y sumaste tus puntos.
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
