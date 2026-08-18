"use client";

import { useState } from "react";

// Vista de la rutina del alumno + registro de lo que hizo por ejercicio.
// Estructura recibida desde el server (la rutina que armó el staff) + el
// último registro por ejercicio (para ver el progreso).

interface Ejercicio {
  id: string;
  nombre: string;
  series: string;
  reps: string;
  peso: string;
  descanso: string;
  nota: string;
}
interface Dia {
  id: string;
  nombre: string;
  ejercicios: Ejercicio[];
}
export interface UltimoLog {
  fecha: string;
  peso: string | null;
  reps: string | null;
}

function fechaCorta(iso: string): string {
  const [y, m, d] = iso.split("-");
  return d && m ? `${d}/${m}/${y?.slice(2) ?? ""}` : iso;
}

function metaEjercicio(e: Ejercicio): string {
  const partes: string[] = [];
  if (e.series || e.reps) partes.push(`${e.series || "?"}×${e.reps || "?"}`);
  if (e.peso) partes.push(e.peso);
  if (e.descanso) partes.push(`descanso ${e.descanso}`);
  return partes.join(" · ");
}

export default function MiRutina({
  nombre,
  dias,
  ultimos,
}: {
  nombre: string;
  dias: Dia[];
  ultimos: Record<string, UltimoLog>;
}) {
  const [ult, setUlt] = useState<Record<string, UltimoLog>>(ultimos);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [peso, setPeso] = useState("");
  const [reps, setReps] = useState("");
  const [nota, setNota] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function abrir(e: Ejercicio) {
    setError(null);
    if (abierto === e.id) {
      setAbierto(null);
      return;
    }
    setAbierto(e.id);
    // Prellenar con lo último cargado, como referencia.
    setPeso(ult[e.id]?.peso ?? e.peso ?? "");
    setReps(ult[e.id]?.reps ?? e.reps ?? "");
    setNota("");
  }

  async function guardar(e: Ejercicio) {
    setError(null);
    setGuardando(true);
    try {
      const res = await fetch("/api/mi-cuenta/rutina-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ejercicioId: e.id,
          ejercicioNombre: e.nombre,
          peso,
          reps,
          nota,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo registrar.");
        return;
      }
      setUlt((u) => ({
        ...u,
        [e.id]: {
          fecha: data.log?.fecha ?? "",
          peso: peso.trim() || null,
          reps: reps.trim() || null,
        },
      }));
      setAbierto(null);
    } catch {
      setError("Sin conexión. Probá de nuevo.");
    } finally {
      setGuardando(false);
    }
  }

  const mini =
    "min-w-0 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-[13px] text-ink outline-none focus:border-accent";

  return (
    <div className="mt-6 space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[15px] font-bold">Mi rutina</h2>
        <span className="text-[12px] text-muted">{nombre}</span>
      </div>

      {dias.length === 0 && (
        <p className="text-[13px] text-muted">Tu rutina todavía no tiene ejercicios.</p>
      )}

      {dias.map((d) => (
        <div key={d.id} className="rounded-panel border border-line bg-surface p-4 shadow-card">
          <div className="text-[14px] font-bold">{d.nombre}</div>
          <ul className="mt-2 divide-y divide-line">
            {d.ejercicios.map((e) => (
              <li key={e.id} className="py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[14px] font-semibold text-ink">{e.nombre}</div>
                    {metaEjercicio(e) && (
                      <div className="text-[12px] text-muted">{metaEjercicio(e)}</div>
                    )}
                    {e.nota && <div className="text-[11px] text-faint">{e.nota}</div>}
                    {ult[e.id] && (
                      <div className="mt-0.5 text-[11px] font-semibold text-accent">
                        Última vez{ult[e.id].fecha ? ` (${fechaCorta(ult[e.id].fecha)})` : ""}:{" "}
                        {ult[e.id].peso ?? "—"}
                        {ult[e.id].reps ? ` · ${ult[e.id].reps} reps` : ""}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => abrir(e)}
                    className="shrink-0 rounded-full border border-line px-3 py-1 text-[12px] font-semibold text-muted hover:border-accent hover:text-ink"
                  >
                    {abierto === e.id ? "Cerrar" : "Registrar"}
                  </button>
                </div>

                {abierto === e.id && (
                  <div className="mt-2 space-y-2 rounded-card border border-line bg-surface-2 p-2.5">
                    <div className="grid grid-cols-2 gap-1.5">
                      <input
                        value={peso}
                        onChange={(ev) => setPeso(ev.target.value)}
                        placeholder="Peso que hiciste"
                        className={mini}
                      />
                      <input
                        value={reps}
                        onChange={(ev) => setReps(ev.target.value)}
                        placeholder="Reps"
                        className={mini}
                      />
                    </div>
                    <input
                      value={nota}
                      onChange={(ev) => setNota(ev.target.value)}
                      placeholder="Nota (opcional)"
                      className={`${mini} w-full`}
                    />
                    <button
                      onClick={() => guardar(e)}
                      disabled={guardando}
                      className="rounded-full bg-accent px-4 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
                    >
                      {guardando ? "Guardando…" : "Guardar"}
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      ))}

      {error && <p className="text-[13px] text-danger">{error}</p>}
    </div>
  );
}
