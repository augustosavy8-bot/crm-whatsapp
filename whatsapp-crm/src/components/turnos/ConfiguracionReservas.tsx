"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { formatArFechaHora } from "@/lib/tz";
import { arLocalToUtc } from "@/lib/tz";
import type {
  ProfesionalHorario,
  ProfesionalBloqueo,
} from "@/lib/types";
import type {
  ProfesionalConNombre,
  ServicioConProfesional,
} from "@/lib/reservas";

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DIAS_ORDEN = [1, 2, 3, 4, 5, 6, 0]; // lun..dom

function hhmm(t: string): string {
  return t.slice(0, 5);
}

export default function ConfiguracionReservas({
  tenantId,
  esOwner,
  servicios,
  profesionales,
  horarios,
  bloqueos,
}: {
  tenantId: string;
  esOwner: boolean;
  servicios: ServicioConProfesional[];
  profesionales: ProfesionalConNombre[];
  horarios: ProfesionalHorario[];
  bloqueos: ProfesionalBloqueo[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const nombreProf = (id: string | null) =>
    profesionales.find((p) => p.id === id)?.name ?? "Sin asignar";

  return (
    <div className="space-y-8">
      {/* Servicios (duración, activo) es del owner; el profesional solo edita
          sus horarios y bloqueos. */}
      {esOwner && (
        <ServiciosSection
          servicios={servicios}
          supabase={supabase}
          onChange={() => router.refresh()}
        />
      )}
      <HorariosSection
        tenantId={tenantId}
        profesionales={profesionales}
        horarios={horarios}
        supabase={supabase}
        onChange={() => router.refresh()}
      />
      <BloqueosSection
        tenantId={tenantId}
        profesionales={profesionales}
        bloqueos={bloqueos}
        nombreProf={nombreProf}
        supabase={supabase}
        onChange={() => router.refresh()}
      />
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type SB = ReturnType<typeof createClient>;

// --- Servicios: duración + activo ---
function ServiciosSection({
  servicios,
  supabase,
  onChange,
}: {
  servicios: ServicioConProfesional[];
  supabase: SB;
  onChange: () => void;
}) {
  const [guardando, setGuardando] = useState<string | null>(null);

  async function actualizar(id: string, campos: Record<string, any>) {
    setGuardando(id);
    await supabase.from("servicios").update(campos).eq("id", id);
    setGuardando(null);
    onChange();
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-bold tracking-tight">Servicios</h2>
        <p className="text-sm text-muted">
          Duración del turno y disponibilidad de cada servicio.
        </p>
      </div>
      <div className="overflow-hidden rounded-panel border border-line bg-surface shadow-card">
        <ul className="divide-y divide-line">
          {servicios.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{s.nombre}</div>
                <div className="text-[12px] text-muted">
                  {s.profesional?.name ?? "Sin profesional"}
                </div>
              </div>
              <label className="flex items-center gap-1.5 text-[13px] text-muted">
                <input
                  type="number"
                  min={5}
                  step={5}
                  defaultValue={s.duracion_min}
                  onBlur={(e) => {
                    const v = Number(e.target.value);
                    if (v >= 5 && v !== s.duracion_min)
                      actualizar(s.id, { duracion_min: v });
                  }}
                  className="w-16 rounded-lg border border-line bg-surface-2 px-2 py-1 text-right text-ink outline-none focus:border-accent"
                />
                min
              </label>
              <button
                onClick={() => actualizar(s.id, { activo: !s.activo })}
                disabled={guardando === s.id}
                className={`rounded-full px-3 py-1 text-[12px] font-semibold ${
                  s.activo ? "bg-ok/15 text-ok" : "bg-surface-2 text-muted"
                }`}
              >
                {s.activo ? "Activo" : "Inactivo"}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

// --- Horarios de atención ---
function HorariosSection({
  tenantId,
  profesionales,
  horarios,
  supabase,
  onChange,
}: {
  tenantId: string;
  profesionales: ProfesionalConNombre[];
  horarios: ProfesionalHorario[];
  supabase: SB;
  onChange: () => void;
}) {
  const [profId, setProfId] = useState(profesionales[0]?.id ?? "");
  const [dia, setDia] = useState(1);
  const [inicio, setInicio] = useState("09:00");
  const [fin, setFin] = useState("13:00");
  const [error, setError] = useState<string | null>(null);

  const delProf = horarios.filter((h) => h.profesional_id === profId);

  async function agregar() {
    setError(null);
    if (fin <= inicio) {
      setError("La hora de fin debe ser mayor a la de inicio.");
      return;
    }
    const { error } = await supabase.from("profesional_horarios").insert({
      tenant_id: tenantId,
      profesional_id: profId,
      dia_semana: dia,
      hora_inicio: inicio,
      hora_fin: fin,
    });
    if (error) {
      setError(error.message);
      return;
    }
    onChange();
  }

  async function eliminar(id: string) {
    await supabase.from("profesional_horarios").delete().eq("id", id);
    onChange();
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-bold tracking-tight">Horarios de atención</h2>
        <p className="text-sm text-muted">
          Franjas por día de la semana. Podés cargar varias por día.
        </p>
      </div>

      {profesionales.length > 1 && (
        <select
          value={profId}
          onChange={(e) => setProfId(e.target.value)}
          className="rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold outline-none"
        >
          {profesionales.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      )}

      <div className="overflow-hidden rounded-panel border border-line bg-surface shadow-card">
        <ul className="divide-y divide-line">
          {DIAS_ORDEN.map((d) => {
            const franjas = delProf
              .filter((h) => h.dia_semana === d)
              .sort((a, b) => a.hora_inicio.localeCompare(b.hora_inicio));
            return (
              <li key={d} className="flex items-start gap-3 px-4 py-2.5">
                <span className="w-24 shrink-0 pt-1 text-[13px] font-semibold text-muted">
                  {DIAS[d]}
                </span>
                <div className="flex flex-1 flex-wrap gap-1.5">
                  {franjas.length === 0 && (
                    <span className="pt-1 text-[13px] text-faint">Cerrado</span>
                  )}
                  {franjas.map((f) => (
                    <span
                      key={f.id}
                      className="inline-flex items-center gap-1 rounded-full bg-surface-2 px-2.5 py-1 text-[12px] font-semibold"
                    >
                      {hhmm(f.hora_inicio)}–{hhmm(f.hora_fin)}
                      <button
                        onClick={() => eliminar(f.id)}
                        className="text-faint hover:text-danger"
                        aria-label="Quitar franja"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Alta de franja */}
      <div className="flex flex-wrap items-end gap-2 rounded-panel border border-line bg-surface-2 p-3">
        <select
          value={dia}
          onChange={(e) => setDia(Number(e.target.value))}
          className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none"
        >
          {DIAS_ORDEN.map((d) => (
            <option key={d} value={d}>
              {DIAS[d]}
            </option>
          ))}
        </select>
        <input
          type="time"
          value={inicio}
          onChange={(e) => setInicio(e.target.value)}
          className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none"
        />
        <input
          type="time"
          value={fin}
          onChange={(e) => setFin(e.target.value)}
          className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none"
        />
        <button
          onClick={agregar}
          className="rounded-full bg-ink px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-ink/90"
        >
          + Agregar franja
        </button>
        {error && <p className="w-full text-[13px] text-danger">{error}</p>}
      </div>
    </section>
  );
}

// --- Bloqueos / excepciones ---
function BloqueosSection({
  tenantId,
  profesionales,
  bloqueos,
  nombreProf,
  supabase,
  onChange,
}: {
  tenantId: string;
  profesionales: ProfesionalConNombre[];
  bloqueos: ProfesionalBloqueo[];
  nombreProf: (id: string | null) => string;
  supabase: SB;
  onChange: () => void;
}) {
  const [profId, setProfId] = useState(profesionales[0]?.id ?? "");
  const [fechaDesde, setFechaDesde] = useState("");
  const [horaDesde, setHoraDesde] = useState("00:00");
  const [fechaHasta, setFechaHasta] = useState("");
  const [horaHasta, setHoraHasta] = useState("23:59");
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function agregar() {
    setError(null);
    if (!fechaDesde || !fechaHasta) {
      setError("Elegí fecha de inicio y fin.");
      return;
    }
    const desde = arLocalToUtc(fechaDesde, horaDesde);
    const hasta = arLocalToUtc(fechaHasta, horaHasta);
    if (hasta <= desde) {
      setError("El fin debe ser posterior al inicio.");
      return;
    }
    const { error } = await supabase.from("profesional_bloqueos").insert({
      tenant_id: tenantId,
      profesional_id: profId,
      desde,
      hasta,
      motivo: motivo.trim() || null,
    });
    if (error) {
      setError(error.message);
      return;
    }
    setMotivo("");
    setFechaDesde("");
    setFechaHasta("");
    onChange();
  }

  async function eliminar(id: string) {
    await supabase.from("profesional_bloqueos").delete().eq("id", id);
    onChange();
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-bold tracking-tight">Bloqueos y excepciones</h2>
        <p className="text-sm text-muted">
          Vacaciones, feriados o franjas puntuales donde no se atiende.
        </p>
      </div>

      <div className="overflow-hidden rounded-panel border border-line bg-surface shadow-card">
        {bloqueos.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-muted">
            No hay bloqueos cargados.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {bloqueos.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold">
                    {nombreProf(b.profesional_id)}
                    {b.motivo ? ` · ${b.motivo}` : ""}
                  </div>
                  <div className="text-[12px] text-muted">
                    {formatArFechaHora(b.desde)} → {formatArFechaHora(b.hasta)}
                  </div>
                </div>
                <button
                  onClick={() => eliminar(b.id)}
                  className="rounded-full px-2.5 py-1 text-[12px] font-semibold text-danger hover:bg-danger/10"
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Alta de bloqueo */}
      <div className="space-y-2 rounded-panel border border-line bg-surface-2 p-3">
        {profesionales.length > 1 && (
          <select
            value={profId}
            onChange={(e) => setProfId(e.target.value)}
            className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none"
          >
            {profesionales.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-[12px] font-semibold text-muted">
            Desde
            <div className="mt-1 flex gap-1">
              <input
                type="date"
                value={fechaDesde}
                onChange={(e) => setFechaDesde(e.target.value)}
                className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none"
              />
              <input
                type="time"
                value={horaDesde}
                onChange={(e) => setHoraDesde(e.target.value)}
                className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none"
              />
            </div>
          </label>
          <label className="text-[12px] font-semibold text-muted">
            Hasta
            <div className="mt-1 flex gap-1">
              <input
                type="date"
                value={fechaHasta}
                onChange={(e) => setFechaHasta(e.target.value)}
                className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none"
              />
              <input
                type="time"
                value={horaHasta}
                onChange={(e) => setHoraHasta(e.target.value)}
                className="rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none"
              />
            </div>
          </label>
        </div>
        <input
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Motivo (opcional): vacaciones, feriado…"
          className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-accent"
        />
        <button
          onClick={agregar}
          className="rounded-full bg-ink px-3.5 py-1.5 text-[13px] font-semibold text-white hover:bg-ink/90"
        >
          + Agregar bloqueo
        </button>
        {error && <p className="text-[13px] text-danger">{error}</p>}
      </div>
    </section>
  );
}
