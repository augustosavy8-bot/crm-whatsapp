"use client";

import { useEffect, useMemo, useState } from "react";
import {
  diaSemanaISO,
  hoyISOArgentina,
  sumarDiasISO,
} from "@/lib/tz";

// ============================================================
// Reserva de clases del gimnasio (cupo). Sin login: el alumno se
// identifica por WhatsApp. Dos formas que conviven: suelta (una fecha)
// y fijo (todas las semanas). Espeja el estilo de ReservaFlow.
// ============================================================

interface HorarioDia {
  horario_id: string;
  dia_semana: number;
  hora_inicio: string; // "HH:MM:SS"
  hora_fin: string;
  capacidad_max: number;
  cupo_usado: number;
}

interface MiReserva {
  tipo: "fijo" | "suelta";
  id: string;
  horario_id: string;
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
  fecha: string | null;
  fecha_desde: string | null;
  activo: boolean | null;
  estado: string | null;
}

interface DiaOpcion {
  iso: string;
  diaSemana: string;
  diaNum: string;
  mes: string;
  esHoy: boolean;
}

const DIAS_A_MOSTRAR = 21;
const DIAS_SEMANA = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

const cardBase = "w-full rounded-card border bg-surface p-4 text-left transition-all";
const inputClass =
  "w-full rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-ink outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/20";

function construirDias(): DiaOpcion[] {
  const hoy = hoyISOArgentina();
  const base = new Date(`${hoy}T12:00:00Z`);
  const dias: DiaOpcion[] = [];
  for (let i = 0; i < DIAS_A_MOSTRAR; i++) {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + i);
    const fmt = new Intl.DateTimeFormat("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      weekday: "short",
      day: "2-digit",
      month: "short",
    }).formatToParts(d);
    const get = (t: string) => fmt.find((p) => p.type === t)?.value ?? "";
    dias.push({
      iso: d.toISOString().slice(0, 10),
      diaSemana: get("weekday").replace(".", ""),
      diaNum: get("day"),
      mes: get("month").replace(".", ""),
      esHoy: i === 0,
    });
  }
  return dias;
}

// "HH:MM:SS" -> "HH:MM"
function hhmm(hora: string): string {
  return hora.slice(0, 5);
}

// Próximas N fechas (desde hoy AR) que caen en `dia`. Para elegir qué día
// avisar que no voy a mi fijo.
function proximasFechas(dia: number, n: number): string[] {
  const out: string[] = [];
  let iso = hoyISOArgentina();
  for (let guard = 0; guard < 60 && out.length < n; guard++) {
    if (diaSemanaISO(iso) === dia) out.push(iso);
    iso = sumarDiasISO(iso, 1);
  }
  return out;
}

function fechaLarga(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date(`${iso}T12:00:00Z`));
}

// Cuando el alumno está logueado, su nombre y WhatsApp salen de la sesión:
// no se re-piden, y las reservas van por los endpoints /api/mi-cuenta/*.
export interface SesionAlumno {
  nombre: string;
  telefono: string;
}

export default function ClasesFlow({
  gimnasioNombre,
  sesion,
}: {
  gimnasioNombre: string;
  sesion?: SesionAlumno;
}) {
  const [modo, setModo] = useState<"reservar" | "mis">("reservar");

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Clases de {gimnasioNombre}</h1>
        <p className="text-sm text-muted">Reservá tu lugar. Cupos limitados.</p>
      </header>

      <div className="flex rounded-full bg-surface-2 p-1">
        {(["reservar", "mis"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setModo(m)}
            className={[
              "flex-1 rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors",
              modo === m ? "bg-ink text-white" : "text-muted hover:text-ink",
            ].join(" ")}
          >
            {m === "reservar" ? "Reservar" : "Mis reservas"}
          </button>
        ))}
      </div>

      {modo === "reservar" ? (
        <Reservar sesion={sesion} />
      ) : (
        <MisReservas sesion={sesion} />
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Reservar (suelta o fijo)
// ------------------------------------------------------------
function Reservar({ sesion }: { sesion?: SesionAlumno }) {
  const dias = useMemo(construirDias, []);
  const [diaSel, setDiaSel] = useState<string | null>(null);
  const [horarios, setHorarios] = useState<HorarioDia[]>([]);
  const [cargando, setCargando] = useState(false);
  const [refetch, setRefetch] = useState(0);

  const [sel, setSel] = useState<HorarioDia | null>(null);
  const [tipo, setTipo] = useState<"suelta" | "fijo">("suelta");
  const [nombre, setNombre] = useState(sesion?.nombre ?? "");
  const [telefono, setTelefono] = useState(sesion?.telefono ?? "");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<{ tipo: "suelta" | "fijo" } | null>(null);

  useEffect(() => {
    if (!diaSel) return;
    let vigente = true;
    setCargando(true);
    setSel(null);
    setError(null);
    fetch(`/api/gym/horarios?fecha=${diaSel}`)
      .then((r) => r.json())
      .then((d) => {
        if (!vigente) return;
        setHorarios(Array.isArray(d.horarios) ? d.horarios : []);
      })
      .catch(() => vigente && setHorarios([]))
      .finally(() => vigente && setCargando(false));
    return () => {
      vigente = false;
    };
  }, [diaSel, refetch]);

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!sel || !diaSel) return;
    if (!sesion && (!nombre.trim() || !telefono.trim())) {
      setError("Necesitamos tu nombre y tu WhatsApp.");
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch(
        sesion ? "/api/mi-cuenta/reservar" : "/api/gym/reservar",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            sesion
              ? { horarioId: sel.horario_id, fecha: diaSel, tipo }
              : {
                  horarioId: sel.horario_id,
                  fecha: diaSel,
                  tipo,
                  nombre: nombre.trim(),
                  telefono: telefono.trim(),
                },
          ),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        if (res.status === 409) {
          // Se llenó mientras completaba: volver a la grilla actualizada.
          setError(data.error);
          setSel(null);
          setRefetch((n) => n + 1);
          return;
        }
        setError(data.error || "No se pudo reservar.");
        return;
      }
      setListo({ tipo });
    } catch {
      setError("No se pudo reservar. Revisá tu conexión.");
    } finally {
      setEnviando(false);
    }
  }

  function reset() {
    setListo(null);
    setSel(null);
    if (!sesion) {
      setNombre("");
      setTelefono("");
    }
    setTipo("suelta");
    setRefetch((n) => n + 1);
  }

  // --- Listo ---
  if (listo && sel && diaSel) {
    return (
      <div className="flex flex-col items-center gap-4 pt-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-ok/15 text-3xl">
          ✓
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-bold tracking-tight">¡Reserva enviada!</h2>
          <p className="text-sm text-muted">
            {listo.tipo === "fijo"
              ? `Todas las semanas, ${DIAS_SEMANA[sel.dia_semana].toLowerCase()} de ${hhmm(sel.hora_inicio)} a ${hhmm(sel.hora_fin)}.`
              : `${fechaLarga(diaSel)} · ${hhmm(sel.hora_inicio)} hs.`}
          </p>
          <p className="pt-1 text-[13px] font-semibold text-warn">
            Queda pendiente de confirmación del gimnasio.
          </p>
        </div>
        <button
          onClick={reset}
          className="w-full rounded-full bg-ink py-3 text-sm font-bold text-white hover:bg-ink/90"
        >
          Reservar otra
        </button>
      </div>
    );
  }

  // --- Datos (tras elegir horario) ---
  if (sel && diaSel) {
    const lugares = sel.capacidad_max - sel.cupo_usado;
    return (
      <form onSubmit={confirmar} className="space-y-5">
        <button
          type="button"
          onClick={() => setSel(null)}
          className="text-[13px] font-semibold text-accent"
        >
          ← Cambiar horario
        </button>

        <div className="rounded-card border border-line bg-surface-2 p-4 text-sm">
          <div className="font-bold capitalize">{fechaLarga(diaSel)}</div>
          <div className="mt-0.5 font-semibold text-accent">
            {hhmm(sel.hora_inicio)} a {hhmm(sel.hora_fin)} hs
          </div>
          <div className="mt-1 text-[13px] text-muted">
            {lugares} {lugares === 1 ? "lugar disponible" : "lugares disponibles"}
          </div>
        </div>

        {/* Tipo de reserva */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setTipo("suelta")}
            className={[
              cardBase,
              "text-center",
              tipo === "suelta" ? "border-accent ring-2 ring-accent/20" : "border-line",
            ].join(" ")}
          >
            <div className="text-[14px] font-bold">Solo este día</div>
            <div className="mt-0.5 text-[12px] text-muted">Reserva puntual</div>
          </button>
          <button
            type="button"
            onClick={() => setTipo("fijo")}
            className={[
              cardBase,
              "text-center",
              tipo === "fijo" ? "border-accent ring-2 ring-accent/20" : "border-line",
            ].join(" ")}
          >
            <div className="text-[14px] font-bold">Todas las semanas</div>
            <div className="mt-0.5 text-[12px] text-muted">Lugar fijo</div>
          </button>
        </div>

        {!sesion && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted">Nombre y apellido *</label>
              <input
                required
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Tu nombre"
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted">WhatsApp *</label>
              <input
                required
                type="tel"
                inputMode="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="Ej: 11 2345 6789"
                className={inputClass}
              />
              <p className="text-[11px] text-faint">
                Con este número gestionás tus reservas después.
              </p>
            </div>
          </div>
        )}

        {error && <p className="text-[13px] text-danger">{error}</p>}

        <button
          type="submit"
          disabled={enviando}
          className="w-full rounded-full bg-accent py-3.5 text-sm font-bold text-white transition-colors hover:brightness-95 disabled:opacity-50"
        >
          {enviando
            ? "Reservando…"
            : tipo === "fijo"
              ? "Anotarme fijo"
              : "Reservar este día"}
        </button>
      </form>
    );
  }

  // --- Elegir día + horario ---
  return (
    <div className="space-y-5">
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {dias.map((d) => {
          const activo = d.iso === diaSel;
          return (
            <button
              key={d.iso}
              onClick={() => setDiaSel(d.iso)}
              className={[
                "flex min-w-[58px] shrink-0 flex-col items-center rounded-card border px-2 py-2.5 transition-colors",
                activo
                  ? "border-accent bg-accent text-white"
                  : "border-line bg-surface text-ink hover:border-accent",
              ].join(" ")}
            >
              <span
                className={`text-[11px] font-semibold uppercase ${activo ? "text-white/80" : "text-muted"}`}
              >
                {d.esHoy ? "hoy" : d.diaSemana}
              </span>
              <span className="text-lg font-bold leading-tight">{d.diaNum}</span>
              <span className={`text-[10px] ${activo ? "text-white/80" : "text-faint"}`}>
                {d.mes}
              </span>
            </button>
          );
        })}
      </div>

      <div className="min-h-[120px]">
        {!diaSel && (
          <p className="pt-6 text-center text-sm text-muted">
            Elegí un día para ver las clases.
          </p>
        )}
        {diaSel && cargando && (
          <p className="pt-6 text-center text-sm text-muted">Buscando clases…</p>
        )}
        {diaSel && !cargando && horarios.length === 0 && (
          <p className="pt-6 text-center text-sm text-muted">
            No hay clases ese día. Probá con otro.
          </p>
        )}
        {diaSel && !cargando && horarios.length > 0 && (
          <div className="space-y-2">
            {horarios.map((h) => {
              const lugares = h.capacidad_max - h.cupo_usado;
              const lleno = lugares <= 0;
              return (
                <button
                  key={h.horario_id}
                  disabled={lleno}
                  onClick={() => setSel(h)}
                  className={[
                    cardBase,
                    "flex items-center justify-between gap-3",
                    lleno
                      ? "border-line opacity-60"
                      : "border-line shadow-card hover:border-accent hover:shadow-pop",
                  ].join(" ")}
                >
                  <div>
                    <div className="text-[15px] font-bold">
                      {hhmm(h.hora_inicio)} a {hhmm(h.hora_fin)}
                    </div>
                    <div className="text-[12px] text-muted">
                      {lleno ? "Completo" : `${lugares} de ${h.capacidad_max} lugares`}
                    </div>
                  </div>
                  <span
                    className={[
                      "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold",
                      lleno ? "bg-surface-2 text-faint" : "bg-accent-soft text-accent",
                    ].join(" ")}
                  >
                    {lleno ? "Sin cupo" : "Reservar →"}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Mis reservas (buscar por WhatsApp)
// ------------------------------------------------------------
function MisReservas({ sesion }: { sesion?: SesionAlumno }) {
  const [telefono, setTelefono] = useState(sesion?.telefono ?? "");
  const [buscado, setBuscado] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [reservas, setReservas] = useState<MiReserva[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [excepcionDe, setExcepcionDe] = useState<string | null>(null); // turno_fijo_id

  // Logueado: cargamos sus reservas al entrar, sin pedir el número.
  useEffect(() => {
    if (sesion) buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function buscar(e?: React.FormEvent) {
    e?.preventDefault();
    if (!sesion && !telefono.trim()) return;
    setCargando(true);
    setError(null);
    setBuscado(true);
    setExcepcionDe(null);
    try {
      const res = await fetch(
        sesion
          ? "/api/mi-cuenta/reservas"
          : `/api/gym/mis-reservas?telefono=${encodeURIComponent(telefono.trim())}`,
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo buscar.");
        setReservas([]);
        return;
      }
      setReservas(Array.isArray(data.reservas) ? data.reservas : []);
    } catch {
      setError("No se pudo buscar. Revisá tu conexión.");
    } finally {
      setCargando(false);
    }
  }

  async function cancelar(r: MiReserva) {
    const label = r.tipo === "fijo" ? "tu lugar fijo" : "esta reserva";
    if (!confirm(`¿Dar de baja ${label}?`)) return;
    const res = await fetch(sesion ? "/api/mi-cuenta/cancelar" : "/api/gym/cancelar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(
        sesion
          ? { tipo: r.tipo, id: r.id }
          : { tipo: r.tipo, id: r.id, telefono: telefono.trim() },
      ),
    });
    if (res.ok) buscar();
    else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "No se pudo cancelar.");
    }
  }

  async function avisarNoVoy(turnoFijoId: string, fecha: string) {
    const res = await fetch("/api/gym/excepcion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turnoFijoId, fecha, telefono: telefono.trim() }),
    });
    if (res.ok) {
      setExcepcionDe(null);
      alert("Listo, avisamos que ese día no vas. Liberaste tu lugar.");
    } else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "No se pudo registrar.");
    }
  }

  return (
    <div className="space-y-5">
      {!sesion && (
        <form onSubmit={buscar} className="space-y-2">
          <label className="text-xs font-semibold text-muted">
            Tu WhatsApp
          </label>
          <div className="flex gap-2">
            <input
              type="tel"
              inputMode="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="Ej: 11 2345 6789"
              className={inputClass}
            />
            <button
              type="submit"
              disabled={cargando || !telefono.trim()}
              className="shrink-0 rounded-xl bg-ink px-4 text-sm font-bold text-white hover:bg-ink/90 disabled:opacity-40"
            >
              Buscar
            </button>
          </div>
        </form>
      )}

      {error && <p className="text-[13px] text-danger">{error}</p>}

      {cargando && <p className="text-center text-sm text-muted">Buscando…</p>}

      {buscado && !cargando && reservas.length === 0 && !error && (
        <p className="pt-4 text-center text-sm text-muted">
          {sesion
            ? "Todavía no tenés reservas. Reservá tu lugar en la pestaña “Reservar”."
            : "No encontramos reservas con ese número."}
        </p>
      )}

      {reservas.length > 0 && (
        <div className="space-y-2">
          {reservas.map((r) => (
            <div
              key={`${r.tipo}-${r.id}`}
              className="rounded-card border border-line bg-surface p-4 shadow-card"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-[15px] font-bold">
                    {r.tipo === "fijo"
                      ? `${DIAS_SEMANA[r.dia_semana]} (fijo)`
                      : (r.fecha ? fechaLarga(r.fecha) : "")}
                  </div>
                  <div className="text-[13px] text-muted">
                    {hhmm(r.hora_inicio)} a {hhmm(r.hora_fin)} hs
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {r.estado === "pendiente" ? (
                    <span className="rounded-full bg-warn/15 px-2.5 py-1 text-[11px] font-bold text-warn">
                      Pendiente
                    </span>
                  ) : (
                    <span className="rounded-full bg-ok/15 px-2.5 py-1 text-[11px] font-bold text-ok">
                      Confirmada
                    </span>
                  )}
                  <span
                    className={[
                      "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                      r.tipo === "fijo"
                        ? "bg-accent-soft text-accent"
                        : "bg-surface-2 text-muted",
                    ].join(" ")}
                  >
                    {r.tipo === "fijo" ? "Fijo" : "Suelta"}
                  </span>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                {r.tipo === "fijo" && (
                  <button
                    onClick={() =>
                      setExcepcionDe(excepcionDe === r.id ? null : r.id)
                    }
                    className="rounded-full border border-line px-3 py-1.5 text-[12px] font-semibold text-ink hover:border-accent"
                  >
                    Un día no voy
                  </button>
                )}
                <button
                  onClick={() => cancelar(r)}
                  className="rounded-full border border-line px-3 py-1.5 text-[12px] font-semibold text-danger hover:border-danger"
                >
                  {r.tipo === "fijo" ? "Darme de baja" : "Cancelar"}
                </button>
              </div>

              {r.tipo === "fijo" && excepcionDe === r.id && (
                <div className="mt-3 border-t border-line pt-3">
                  <p className="mb-2 text-[12px] font-semibold text-muted">
                    ¿Qué día no vas? Liberás tu lugar solo ese día.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {proximasFechas(r.dia_semana, 6).map((f) => (
                      <button
                        key={f}
                        onClick={() => avisarNoVoy(r.id, f)}
                        className="rounded-full bg-surface-2 px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-accent hover:text-white"
                      >
                        {new Intl.DateTimeFormat("es-AR", {
                          timeZone: "America/Argentina/Buenos_Aires",
                          day: "2-digit",
                          month: "short",
                        }).format(new Date(`${f}T12:00:00Z`))}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
