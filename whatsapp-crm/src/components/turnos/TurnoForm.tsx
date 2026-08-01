"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { arLocalToUtc, diaSemanaISO } from "@/lib/tz";

// "HH:MM[:SS]" -> minutos desde medianoche.
function horaAMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

interface PacienteOption {
  id: string;
  nombre: string;
}

interface AgenteOption {
  id: string;
  name: string | null;
  email: string | null;
}

interface Props {
  tenantId: string;
  pacientes: PacienteOption[];
  agentes: AgenteOption[];
  defaultProfesionalId: string;
  defaultPacienteId?: string;
  onSaved: () => void;
  onCancel: () => void;
}

const inputClass =
  "w-full rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-ink outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/20";

export default function TurnoForm({
  tenantId,
  pacientes,
  agentes,
  defaultProfesionalId,
  defaultPacienteId,
  onSaved,
  onCancel,
}: Props) {
  const router = useRouter();
  const supabase = createClient();

  const [pacienteId, setPacienteId] = useState(defaultPacienteId ?? "");
  const [profesionalId, setProfesionalId] = useState(defaultProfesionalId);
  const [fecha, setFecha] = useState("");
  const [hora, setHora] = useState("");
  const [duracion, setDuracion] = useState(30);
  const [notas, setNotas] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Aviso blando: el turno cae fuera del horario habitual o sobre un bloqueo.
  // No bloquea (el staff a veces agenda excepciones), pero exige un 2º click.
  const [aviso, setAviso] = useState<string | null>(null);

  // Limpia el aviso al editar cualquier campo que lo afecte: obliga a re-chequear.
  function reset<T>(setter: (v: T) => void) {
    return (v: T) => {
      setAviso(null);
      setter(v);
    };
  }

  // Chequeo blando contra la agenda del profesional (horarios + bloqueos).
  // Devuelve un texto de aviso o null si el turno cae dentro de su horario.
  async function chequearHorario(fechaHoraUtc: string): Promise<string | null> {
    if (!profesionalId) return null;
    const finUtc = new Date(
      new Date(fechaHoraUtc).getTime() + duracion * 60_000,
    ).toISOString();

    const { data: bloqueos } = await supabase
      .from("profesional_bloqueos")
      .select("desde, hasta")
      .eq("profesional_id", profesionalId)
      .lt("desde", finUtc)
      .gt("hasta", fechaHoraUtc);
    if (bloqueos && bloqueos.length > 0) {
      return "Ese horario cae sobre un bloqueo de la agenda del profesional.";
    }

    const { data: franjas } = await supabase
      .from("profesional_horarios")
      .select("hora_inicio, hora_fin")
      .eq("profesional_id", profesionalId)
      .eq("dia_semana", diaSemanaISO(fecha))
      .eq("activo", true);
    const inicioMin = horaAMin(hora);
    const finMin = inicioMin + duracion;
    const dentro = (franjas ?? []).some(
      (f) =>
        inicioMin >= horaAMin(f.hora_inicio as string) &&
        finMin <= horaAMin(f.hora_fin as string),
    );
    if (!dentro) {
      return "Queda fuera del horario de atención habitual del profesional.";
    }
    return null;
  }

  async function crearTurno(forzar: boolean) {
    setError(null);
    if (!pacienteId || !fecha || !hora) {
      setError("Faltan datos: paciente, fecha y hora son obligatorios.");
      return;
    }
    if (!Number.isFinite(duracion) || duracion <= 0) {
      setError("La duración debe ser mayor a 0.");
      return;
    }
    // El staff carga hora de Buenos Aires. Explícito, no depende de la zona
    // del browser (si no, en un server UTC quedaba corrido 3hs).
    const fechaHora = arLocalToUtc(fecha, hora);
    if (new Date(fechaHora).getTime() < Date.now()) {
      setError("No se puede crear un turno en una fecha/hora que ya pasó.");
      return;
    }

    setSaving(true);
    try {
      if (!forzar) {
        const av = await chequearHorario(fechaHora);
        if (av) {
          setAviso(av);
          return; // no inserta: el usuario decide con "Crear igual"
        }
      }
      const { error } = await supabase.from("turnos").insert({
        tenant_id: tenantId,
        paciente_id: pacienteId,
        profesional_id: profesionalId || null,
        fecha_hora: fechaHora,
        duracion_min: duracion,
        notas: notas.trim() || null,
        origen: "manual",
      });
      if (error) {
        // 23P01 = exclusion_violation del EXCLUDE turnos_sin_solape.
        setError(
          error.code === "23P01"
            ? "Ese profesional ya tiene un turno que se superpone con ese horario. Elegí otro."
            : error.message || "No se pudo crear el turno.",
        );
        return;
      }
      router.refresh();
      onSaved();
    } catch (err) {
      setError((err as Error).message || "No se pudo crear el turno.");
    } finally {
      setSaving(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    crearTurno(false);
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-panel border border-line bg-surface p-5 shadow-card"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs font-semibold text-muted">
            Paciente *
          </label>
          <select
            required
            value={pacienteId}
            onChange={(e) => setPacienteId(e.target.value)}
            className={inputClass}
          >
            <option value="">Seleccionar…</option>
            {pacientes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted">Fecha *</label>
          <input
            type="date"
            required
            value={fecha}
            onChange={(e) => reset(setFecha)(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted">Hora *</label>
          <input
            type="time"
            required
            value={hora}
            onChange={(e) => reset(setHora)(e.target.value)}
            className={inputClass}
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted">
            Duración (min)
          </label>
          <input
            type="number"
            min={5}
            step={5}
            value={duracion}
            onChange={(e) => reset(setDuracion)(Number(e.target.value))}
            className={inputClass}
          />
        </div>

        {agentes.length > 1 && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted">
              Profesional
            </label>
            <select
              value={profesionalId}
              onChange={(e) => reset(setProfesionalId)(e.target.value)}
              className={inputClass}
            >
              {agentes.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name || a.email}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs font-semibold text-muted">Notas</label>
          <textarea
            rows={2}
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
            className={inputClass}
          />
        </div>
      </div>

      {error && <p className="text-[13px] text-danger">{error}</p>}

      {aviso && !error && (
        <p className="rounded-xl border border-warn/40 bg-warn/10 px-3.5 py-2.5 text-[13px] text-warn">
          ⚠ {aviso} Revisá el horario, o crealo igual si es una excepción.
        </p>
      )}

      <div className="flex gap-2">
        {aviso ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => crearTurno(true)}
            className="rounded-full bg-warn px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-warn/90 disabled:opacity-60"
          >
            {saving ? "Guardando…" : "Crear igual"}
          </button>
        ) : (
          <button
            type="submit"
            disabled={saving}
            className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-ink/90 disabled:opacity-60"
          >
            {saving ? "Guardando…" : "Crear turno"}
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="rounded-full px-4 py-2.5 text-sm font-semibold text-muted hover:text-ink"
        >
          Cancelar
        </button>
      </div>
    </form>
  );
}
