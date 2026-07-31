"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { arLocalToUtc } from "@/lib/tz";

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

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!pacienteId || !fecha || !hora) {
      setError("Faltan datos: paciente, fecha y hora son obligatorios.");
      return;
    }
    setSaving(true);
    try {
      // El staff carga hora de Buenos Aires. Esto daba bien solo porque el
      // device está en AR; explícito, no depende de la zona del browser.
      const fechaHora = arLocalToUtc(fecha, hora);
      const { error } = await supabase.from("turnos").insert({
        tenant_id: tenantId,
        paciente_id: pacienteId,
        profesional_id: profesionalId || null,
        fecha_hora: fechaHora,
        duracion_min: duracion,
        notas: notas.trim() || null,
        origen: "manual",
      });
      if (error) throw error;
      router.refresh();
      onSaved();
    } catch (err) {
      setError((err as Error).message || "No se pudo crear el turno.");
    } finally {
      setSaving(false);
    }
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
            onChange={(e) => setFecha(e.target.value)}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-muted">Hora *</label>
          <input
            type="time"
            required
            value={hora}
            onChange={(e) => setHora(e.target.value)}
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
            onChange={(e) => setDuracion(Number(e.target.value))}
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
              onChange={(e) => setProfesionalId(e.target.value)}
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

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-ink/90 disabled:opacity-60"
        >
          {saving ? "Guardando…" : "Crear turno"}
        </button>
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
