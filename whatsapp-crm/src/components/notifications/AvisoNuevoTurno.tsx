"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Aviso in-app (FYI) para el staff del gimnasio: cuando un alumno se anota a una
// clase, entra un banner con el nombre y el horario. La reserva ya queda
// confirmada sola (auto-confirmación), así que esto es informativo — sin botón
// de aceptar. Complementa al push (panel cerrado) y a la campana de la agenda.
//
// Escucha los INSERT de gym_reservas_sueltas / gym_turnos_fijos por Realtime.

const MUTE_KEY = "kinactiva_notif_muted";
const DIAS = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];
const hhmm = (h: string) => h.slice(0, 5);

type Tipo = "suelta" | "fijo";

interface Aviso {
  key: number;
  tipo: Tipo;
  id: string;
  nombre: string;
  detalle: string;
}

interface InsertRow {
  id?: string;
  alumno_id?: string;
  horario_id?: string;
  fecha?: string;
}

function fechaBonita(fecha: string): string {
  // "2026-08-03" -> "lun 03 ago". Mediodía local para no cruzar el día por tz.
  const d = new Date(`${fecha}T12:00:00`);
  return d.toLocaleDateString("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
}

export default function AvisoNuevoTurno() {
  const router = useRouter();
  const supabase = useRef(createClient()).current;

  const [aviso, setAviso] = useState<Aviso | null>(null);
  const [salir, setSalir] = useState(false);

  const seq = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const audioRef = useRef<AudioContext | null>(null);

  const limpiarTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);
  const luego = useCallback((ms: number, fn: () => void) => {
    timers.current.push(setTimeout(fn, ms));
  }, []);

  // Beep corto respetando el mute compartido con el resto del CRM.
  const beep = useCallback(() => {
    try {
      if (localStorage.getItem(MUTE_KEY) === "1") return;
    } catch {}
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = audioRef.current || new AC();
      audioRef.current = ctx;
      if (ctx.state === "suspended") ctx.resume();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.connect(g);
      g.connect(ctx.destination);
      o.type = "sine";
      o.frequency.value = 880;
      const t = ctx.currentTime;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
      o.start(t);
      o.stop(t + 0.26);
    } catch {}
  }, []);

  const cerrar = useCallback(() => {
    setSalir((yaSale) => {
      if (yaSale) return yaSale;
      luego(320, () => {
        setAviso(null);
        setSalir(false);
      });
      return true;
    });
  }, [luego]);

  const mostrar = useCallback(
    (tipo: Tipo, row: InsertRow) => {
      limpiarTimers();
      seq.current += 1;
      const key = seq.current;
      beep();

      // Base inmediata; enriquezco nombre + horario abajo (async).
      setAviso({ key, tipo, id: row.id ?? "", nombre: "Un alumno", detalle: "Se anotó a una clase" });
      setSalir(false);

      (async () => {
        let nombre = "Un alumno";
        if (row.alumno_id) {
          const { data: a } = await supabase
            .from("gym_alumnos")
            .select("nombre")
            .eq("id", row.alumno_id)
            .maybeSingle();
          if (a?.nombre) nombre = a.nombre as string;
        }
        let detalle = "Se anotó a una clase";
        if (row.horario_id) {
          const { data: h } = await supabase
            .from("gym_horarios")
            .select("dia_semana, hora_inicio, hora_fin")
            .eq("id", row.horario_id)
            .maybeSingle();
          if (h) {
            const franja = `${hhmm(h.hora_inicio as string)} hs`;
            detalle =
              tipo === "suelta" && row.fecha
                ? `${fechaBonita(row.fecha)} · ${franja}`
                : `Fijo semanal · ${DIAS[h.dia_semana as number]} ${franja}`;
          }
        }
        // Solo actualizo si sigue siendo el mismo aviso en pantalla.
        setAviso((prev) => (prev && prev.key === key ? { ...prev, nombre, detalle } : prev));
      })();

      // Autocierre a los 5.2 s (coincide con la barra de vida).
      luego(5200, cerrar);
    },
    [supabase, beep, limpiarTimers, luego, cerrar],
  );

  const mostrarRef = useRef(mostrar);
  useEffect(() => {
    mostrarRef.current = mostrar;
  }, [mostrar]);

  // Suscripción Realtime a las dos tablas de reservas del gimnasio.
  useEffect(() => {
    const onSuelta = (payload: { new?: InsertRow }) =>
      mostrarRef.current("suelta", payload.new ?? {});
    const onFijo = (payload: { new?: InsertRow }) =>
      mostrarRef.current("fijo", payload.new ?? {});
    const ch = supabase
      .channel("aviso-nuevo-turno")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "gym_reservas_sueltas" },
        onSuelta,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "gym_turnos_fijos" },
        onFijo,
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [supabase]);

  useEffect(() => () => limpiarTimers(), [limpiarTimers]);

  const verEnAgenda = useCallback(() => {
    limpiarTimers();
    router.push("/gym");
    cerrar();
  }, [limpiarTimers, router, cerrar]);

  if (!aviso) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-2 z-[60] flex justify-center px-3"
      aria-live="polite"
    >
      <div
        key={aviso.key}
        className="pointer-events-auto w-full max-w-sm"
        style={{
          animation: salir
            ? "avSale .3s cubic-bezier(.4,0,1,1) both"
            : "avBaja .55s cubic-bezier(.2,.9,.3,1) both",
        }}
      >
        <div className="relative flex flex-col gap-2.5 overflow-hidden rounded-panel border border-line bg-surface p-3.5 shadow-pop">
          <div className="flex items-start gap-3">
            {/* Ícono calendario+ */}
            <span
              className="grid size-[38px] shrink-0 place-items-center rounded-[14px]"
              style={{
                background: "var(--color-accent-soft)",
                color: "var(--color-accent)",
                animation: "kfPop .45s cubic-bezier(.2,.8,.25,1) both",
              }}
            >
              <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
                <path d="M4.5 6.5h15v13h-15z" />
                <path d="M8 3.5v3M16 3.5v3M4.5 10.5h15" />
                <path d="M12 13.5v4M10 15.5h4" />
              </svg>
            </span>

            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span
                className="text-[10px] font-bold uppercase tracking-[0.1em]"
                style={{ color: "var(--color-accent)" }}
              >
                Nueva reserva
              </span>
              <span className="text-[15px] font-bold tracking-tight text-ink">
                {aviso.nombre} se anotó
              </span>
              <span className="text-xs text-muted text-pretty">{aviso.detalle}</span>
            </div>

            <button
              type="button"
              onClick={cerrar}
              aria-label="Cerrar"
              className="shrink-0 px-1 text-[13px] text-faint transition-colors hover:text-ink"
            >
              ✕
            </button>
          </div>

          <div className="flex gap-1.5 pl-[49px]">
            <button
              type="button"
              onClick={verEnAgenda}
              className="rounded-full border border-line px-3.5 py-2 text-xs font-bold text-muted transition hover:border-faint hover:text-ink active:scale-95"
            >
              Ver en la agenda
            </button>
          </div>

          {/* Barra de vida: se agota en 5.2 s y el aviso se cierra solo. */}
          {!salir && (
            <span
              className="absolute inset-x-0 bottom-0 h-[3px] origin-left"
              style={{
                background: "linear-gradient(90deg, var(--color-accent), var(--color-warn))",
                animation: "avBarra 5.2s linear both",
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
