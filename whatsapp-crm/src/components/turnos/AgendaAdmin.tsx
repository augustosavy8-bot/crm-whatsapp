"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getTurnosEnRango } from "@/lib/turnos";
import {
  arLocalToUtc,
  arDateKey,
  formatArHora,
  hoyISOArgentina,
} from "@/lib/tz";
import type { TurnoConDetalle, TurnoEstado } from "@/lib/types";
import type { ProfesionalConNombre } from "@/lib/reservas";

const ESTADOS: TurnoEstado[] = [
  "pendiente",
  "confirmado",
  "cancelado",
  "atendido",
  "ausente",
];
const ESTADO_LABEL: Record<TurnoEstado, string> = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  cancelado: "Cancelado",
  atendido: "Atendió",
  ausente: "No asistió",
};
const ESTADO_COLOR: Record<TurnoEstado, string> = {
  pendiente: "bg-warn/15 text-warn",
  confirmado: "bg-ok/15 text-ok",
  cancelado: "bg-danger/15 text-danger",
  atendido: "bg-surface-2 text-muted",
  ausente: "bg-danger/15 text-danger",
};

type Vista = "dia" | "semana";

// "YYYY-MM-DD" -> día de la semana (0=dom..6=sáb) en AR, estable vía mediodía UTC.
function diaSemanaDe(iso: string): number {
  return new Date(`${iso}T12:00:00Z`).getUTCDay();
}
function sumarDias(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
// Lunes de la semana que contiene `iso`.
function lunesDe(iso: string): string {
  const dow = diaSemanaDe(iso); // 0=dom
  const offset = dow === 0 ? -6 : 1 - dow;
  return sumarDias(iso, offset);
}
function tituloDia(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const hoy = hoyISOArgentina();
  const prefijo = iso === hoy ? "Hoy · " : "";
  return (
    prefijo +
    new Intl.DateTimeFormat("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      weekday: "long",
      day: "2-digit",
      month: "long",
    }).format(d)
  );
}

export default function AgendaAdmin({
  profesionales,
}: {
  profesionales: ProfesionalConNombre[];
}) {
  const supabase = createClient();
  const [vista, setVista] = useState<Vista>("dia");
  const [ancla, setAncla] = useState<string>(hoyISOArgentina());
  const [profesionalId, setProfesionalId] = useState<string>("");
  const [turnos, setTurnos] = useState<TurnoConDetalle[]>([]);
  const [cargando, setCargando] = useState(true);
  const [reprogramando, setReprogramando] = useState<string | null>(null);

  const desde = vista === "dia" ? ancla : lunesDe(ancla);
  const dias = vista === "dia" ? 1 : 7;
  const hasta = sumarDias(desde, dias);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const rango = await getTurnosEnRango(
        supabase,
        arLocalToUtc(desde, "00:00"),
        arLocalToUtc(hasta, "00:00"),
      );
      setTurnos(
        profesionalId
          ? rango.filter((t) => t.profesional_id === profesionalId)
          : rango,
      );
    } finally {
      setCargando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desde, hasta, profesionalId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function cambiarEstado(id: string, estado: TurnoEstado) {
    const { error } = await supabase.from("turnos").update({ estado }).eq("id", id);
    if (error) {
      alert(
        error.code === "23P01"
          ? "No se puede: se superpone con otro turno de ese profesional."
          : `No se pudo actualizar: ${error.message}`,
      );
      return;
    }
    cargar();
  }

  async function reprogramar(id: string, fecha: string, hora: string) {
    const { error } = await supabase
      .from("turnos")
      .update({ fecha_hora: arLocalToUtc(fecha, hora) })
      .eq("id", id);
    if (error) {
      alert(
        error.code === "23P01"
          ? "Ese horario se superpone con otro turno del profesional."
          : `No se pudo reprogramar: ${error.message}`,
      );
      return;
    }
    setReprogramando(null);
    cargar();
  }

  // Agrupar por día (para vista semana).
  const grupos = new Map<string, TurnoConDetalle[]>();
  for (const t of turnos) {
    const k = arDateKey(t.fecha_hora);
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k)!.push(t);
  }

  return (
    <div className="space-y-4">
      {/* Controles */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-full bg-surface-2 p-1">
          {(["dia", "semana"] as Vista[]).map((v) => (
            <button
              key={v}
              onClick={() => setVista(v)}
              className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                vista === v ? "bg-ink text-white" : "text-muted hover:text-ink"
              }`}
            >
              {v === "dia" ? "Día" : "Semana"}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => setAncla(sumarDias(ancla, -dias))}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-muted hover:text-ink"
            aria-label="Anterior"
          >
            ‹
          </button>
          <button
            onClick={() => setAncla(hoyISOArgentina())}
            className="rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-muted hover:text-ink"
          >
            Hoy
          </button>
          <button
            onClick={() => setAncla(sumarDias(ancla, dias))}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-muted hover:text-ink"
            aria-label="Siguiente"
          >
            ›
          </button>
        </div>

        {profesionales.length > 1 && (
          <select
            value={profesionalId}
            onChange={(e) => setProfesionalId(e.target.value)}
            className="ml-auto rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-ink outline-none"
          >
            <option value="">Todos los profesionales</option>
            {profesionales.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {cargando && (
        <div className="rounded-panel border border-line bg-surface p-8 text-center text-sm text-muted shadow-card">
          Cargando agenda…
        </div>
      )}

      {!cargando && turnos.length === 0 && (
        <div className="rounded-panel border border-line bg-surface p-8 text-center text-sm text-muted shadow-card">
          No hay turnos {vista === "dia" ? "este día" : "esta semana"}.
        </div>
      )}

      {!cargando &&
        [...grupos.entries()].map(([dia, filas]) => (
          <div key={dia}>
            <h3 className="mb-2 text-[13px] font-bold capitalize text-muted">
              {tituloDia(dia)}
            </h3>
            <div className="overflow-hidden rounded-panel border border-line bg-surface shadow-card">
              <ul className="divide-y divide-line">
                {filas.map((t) => (
                  <li key={t.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-[15px] font-semibold">
                          <span>{formatArHora(t.fecha_hora)}</span>
                          <span className="text-muted">·</span>
                          <span className="truncate">
                            {t.paciente?.nombre ?? "—"}
                          </span>
                          {t.origen !== "manual" && (
                            <span
                              title={
                                t.ia_notas_originales
                                  ? `Original: "${t.ia_notas_originales}"`
                                  : "Sugerido por IA"
                              }
                              className="shrink-0 rounded-full bg-accent-soft px-1.5 py-0.5 text-[10px] font-bold text-accent"
                            >
                              {t.origen === "web" ? "🌐 web" : "🤖 IA"}
                            </span>
                          )}
                        </div>
                        <div className="text-[12px] text-muted">
                          {t.servicio?.nombre ?? "Sin servicio"}
                          {!profesionalId && t.profesional?.name
                            ? ` · ${t.profesional.name}`
                            : ""}
                          {" · "}
                          {t.duracion_min} min
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() =>
                            setReprogramando(reprogramando === t.id ? null : t.id)
                          }
                          className="rounded-full border border-line px-2.5 py-1 text-[11px] font-semibold text-muted hover:text-ink"
                        >
                          Reprogramar
                        </button>
                        <select
                          value={t.estado}
                          onChange={(e) =>
                            cambiarEstado(t.id, e.target.value as TurnoEstado)
                          }
                          className={`rounded-full border-0 px-2.5 py-1 text-[11px] font-semibold outline-none ${ESTADO_COLOR[t.estado]}`}
                        >
                          {ESTADOS.map((es) => (
                            <option key={es} value={es}>
                              {ESTADO_LABEL[es]}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {reprogramando === t.id && (
                      <ReprogramarInline
                        fechaHora={t.fecha_hora}
                        onCancel={() => setReprogramando(null)}
                        onSave={(f, h) => reprogramar(t.id, f, h)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
    </div>
  );
}

function ReprogramarInline({
  fechaHora,
  onSave,
  onCancel,
}: {
  fechaHora: string;
  onSave: (fecha: string, hora: string) => void;
  onCancel: () => void;
}) {
  // Prefill con la fecha/hora actual en AR.
  const fechaAR = arDateKey(fechaHora);
  const horaAR = new Date(fechaHora)
    .toLocaleTimeString("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
    .slice(0, 5);
  const [fecha, setFecha] = useState(fechaAR);
  const [hora, setHora] = useState(horaAR);

  return (
    <div className="mt-2 flex flex-wrap items-end gap-2 rounded-xl border border-line bg-surface-2 p-2.5">
      <input
        type="date"
        value={fecha}
        onChange={(e) => setFecha(e.target.value)}
        className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
      />
      <input
        type="time"
        value={hora}
        onChange={(e) => setHora(e.target.value)}
        className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
      />
      <button
        onClick={() => onSave(fecha, hora)}
        className="rounded-full bg-ink px-3 py-1.5 text-[12px] font-semibold text-white hover:bg-ink/90"
      >
        Guardar
      </button>
      <button
        onClick={onCancel}
        className="rounded-full px-2.5 py-1.5 text-[12px] font-semibold text-muted hover:text-ink"
      >
        Cancelar
      </button>
    </div>
  );
}
