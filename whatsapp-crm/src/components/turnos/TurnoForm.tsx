"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { InterpretedTurno } from "@/lib/types";

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

  const [showIA, setShowIA] = useState(false);
  const [textoIA, setTextoIA] = useState("");
  const [interpretando, setInterpretando] = useState(false);
  const [resultadoIA, setResultadoIA] = useState<InterpretedTurno | null>(null);
  const [usoIA, setUsoIA] = useState(false);

  async function interpretarConIA() {
    if (!textoIA.trim()) return;
    setInterpretando(true);
    setResultadoIA(null);
    try {
      const res = await fetch("/api/ai/interpretar-turno", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texto: textoIA }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo interpretar el texto.");
        return;
      }
      const interpretado = data.interpretado as InterpretedTurno;
      setResultadoIA(interpretado);
      setUsoIA(true);

      if (interpretado.fecha) setFecha(interpretado.fecha);
      if (interpretado.hora) setHora(interpretado.hora);
      if (interpretado.duracion_min) setDuracion(interpretado.duracion_min);
      if (interpretado.notas) setNotas(interpretado.notas);

      if (interpretado.paciente_nombre) {
        const nombreBuscado = interpretado.paciente_nombre.toLowerCase();
        const matches = pacientes.filter((p) =>
          p.nombre.toLowerCase().includes(nombreBuscado),
        );
        if (matches.length === 1) setPacienteId(matches[0].id);
      }
    } catch {
      setError("No se pudo interpretar el texto.");
    } finally {
      setInterpretando(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!pacienteId || !fecha || !hora) {
      setError("Faltan datos: paciente, fecha y hora son obligatorios.");
      return;
    }
    setSaving(true);
    try {
      const fechaHora = new Date(`${fecha}T${hora}`).toISOString();
      const { error } = await supabase.from("turnos").insert({
        tenant_id: tenantId,
        paciente_id: pacienteId,
        profesional_id: profesionalId || null,
        fecha_hora: fechaHora,
        duracion_min: duracion,
        notas: notas.trim() || null,
        origen: usoIA ? "ia_manual" : "manual",
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
      <div className="rounded-xl border border-line bg-surface-2 p-3">
        <button
          type="button"
          onClick={() => setShowIA((v) => !v)}
          className="text-[13px] font-semibold text-accent"
        >
          ✨ Interpretar con IA
        </button>
        {showIA && (
          <div className="mt-2 space-y-2">
            <textarea
              rows={2}
              value={textoIA}
              onChange={(e) => setTextoIA(e.target.value)}
              placeholder="Ej: turno con Juan el jueves a las 15hs por dolor de rodilla"
              className={inputClass}
            />
            <button
              type="button"
              onClick={interpretarConIA}
              disabled={interpretando || !textoIA.trim()}
              className="rounded-full border border-line bg-surface px-3.5 py-1.5 text-[13px] font-semibold text-ink transition-colors hover:bg-surface-2 disabled:opacity-60"
            >
              {interpretando ? "Interpretando…" : "Interpretar"}
            </button>
            {resultadoIA && !resultadoIA.es_pedido_turno && (
              <p className="text-[13px] text-muted">
                No parece un pedido de turno claro — revisá los campos a mano.
              </p>
            )}
            {resultadoIA && resultadoIA.ambiguedades.length > 0 && (
              <p className="text-[13px] text-warn">
                {resultadoIA.ambiguedades.join(" · ")}
              </p>
            )}
          </div>
        )}
      </div>

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
