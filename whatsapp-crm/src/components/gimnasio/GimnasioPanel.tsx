"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  crearGymHorario,
  getGymHorarios,
  getGymOcupacion,
  setGymHorarioActivo,
  type GymHorario,
  type GymOcupacionHorario,
} from "@/lib/gymCupoAdmin";
import { hoyISOArgentina, sumarDiasISO } from "@/lib/tz";

// ============================================================
// Panel admin del gimnasio (owner / gym_admin). Dos tabs:
//   - Agenda: por día, cada horario con quién va (fijo/suelto) y cupo.
//   - Horarios: alta y activar/desactivar los horarios semanales.
// Todo con el cliente de sesión del browser (RLS + gate owner/gym_admin),
// salvo agregar un alumno a mano, que va por /api/gym/admin/agregar
// (reusa el upsert por teléfono + trigger de cupo del flujo del alumno).
// ============================================================

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const DIAS_CORTO = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

const hhmm = (h: string) => h.slice(0, 5);

function fechaTitulo(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    weekday: "long",
    day: "2-digit",
    month: "long",
  }).format(new Date(`${iso}T12:00:00Z`));
}

export default function GimnasioPanel({ tenantId }: { tenantId: string }) {
  const [tab, setTab] = useState<"agenda" | "horarios">("agenda");

  return (
    <div className="space-y-4">
      <div className="flex rounded-full bg-surface-2 p-1">
        {(["agenda", "horarios"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              "flex-1 rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors",
              tab === t ? "bg-ink text-white" : "text-muted hover:text-ink",
            ].join(" ")}
          >
            {t === "agenda" ? "Agenda" : "Horarios"}
          </button>
        ))}
      </div>

      {tab === "agenda" ? <Agenda /> : <Horarios tenantId={tenantId} />}
    </div>
  );
}

// ------------------------------------------------------------
// Tab Agenda: ocupación por día
// ------------------------------------------------------------
function Agenda() {
  const sb = createClient();
  const [fecha, setFecha] = useState(hoyISOArgentina);
  const [data, setData] = useState<GymOcupacionHorario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agregarA, setAgregarA] = useState<string | null>(null); // horario_id

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setData(await getGymOcupacion(sb, fecha));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la agenda.");
      setData([]);
    } finally {
      setCargando(false);
    }
  }, [sb, fecha]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const hoy = hoyISOArgentina();

  async function quitarSuelta(reservaId: string) {
    if (!confirm("¿Quitar esta reserva del día?")) return;
    const { error } = await sb
      .from("gym_reservas_sueltas")
      .update({ estado: "cancelada" })
      .eq("id", reservaId);
    if (error) setError(error.message);
    else cargar();
  }

  async function noVieneHoy(turnoFijoId: string) {
    if (!confirm("¿Marcar que hoy no viene? Libera su lugar solo este día.")) return;
    const { error } = await sb
      .from("gym_excepciones_fijo")
      .upsert(
        { turno_fijo_id: turnoFijoId, fecha },
        { onConflict: "turno_fijo_id,fecha", ignoreDuplicates: true },
      );
    if (error) setError(error.message);
    else cargar();
  }

  return (
    <div className="space-y-4">
      {/* Navegación de día */}
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={() => setFecha((f) => sumarDiasISO(f, -1))}
          className="rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-muted hover:text-ink"
        >
          ← Ayer
        </button>
        <div className="text-center">
          <div className="text-[15px] font-bold capitalize">{fechaTitulo(fecha)}</div>
          {fecha !== hoy && (
            <button
              onClick={() => setFecha(hoy)}
              className="text-[12px] font-semibold text-accent"
            >
              Volver a hoy
            </button>
          )}
        </div>
        <button
          onClick={() => setFecha((f) => sumarDiasISO(f, 1))}
          className="rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-muted hover:text-ink"
        >
          Mañana →
        </button>
      </div>

      {error && <p className="text-[13px] text-danger">{error}</p>}

      {cargando && <p className="py-8 text-center text-sm text-muted">Cargando…</p>}

      {!cargando && data.length === 0 && (
        <p className="py-8 text-center text-sm text-muted">
          No hay clases este día. Cargá horarios en la pestaña “Horarios”.
        </p>
      )}

      {!cargando &&
        data.map((h) => {
          const lleno = h.cupo_usado >= h.capacidad_max;
          return (
            <div
              key={h.horario_id}
              className="rounded-panel border border-line bg-surface p-4 shadow-card"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="text-[15px] font-bold">
                  {hhmm(h.hora_inicio)} a {hhmm(h.hora_fin)}
                </div>
                <span
                  className={[
                    "rounded-full px-2.5 py-1 text-[12px] font-bold",
                    lleno ? "bg-warn/15 text-warn" : "bg-accent-soft text-accent",
                  ].join(" ")}
                >
                  {h.cupo_usado}/{h.capacidad_max}
                </span>
              </div>

              {h.alumnos.length > 0 ? (
                <ul className="mt-3 divide-y divide-line">
                  {h.alumnos.map((a) => (
                    <li
                      key={`${a.tipo}-${a.alumno_id}-${a.turno_fijo_id ?? a.reserva_id}`}
                      className="flex items-center justify-between gap-2 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[14px] font-medium text-ink">
                          {a.nombre}
                        </span>
                        <span
                          className={[
                            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
                            a.tipo === "fijo"
                              ? "bg-accent-soft text-accent"
                              : "bg-surface-2 text-muted",
                          ].join(" ")}
                        >
                          {a.tipo === "fijo" ? "Fijo" : "Suelto"}
                        </span>
                      </div>
                      {a.tipo === "fijo" && a.turno_fijo_id ? (
                        <button
                          onClick={() => noVieneHoy(a.turno_fijo_id!)}
                          className="shrink-0 text-[12px] font-semibold text-muted hover:text-danger"
                        >
                          No viene hoy
                        </button>
                      ) : a.reserva_id ? (
                        <button
                          onClick={() => quitarSuelta(a.reserva_id!)}
                          className="shrink-0 text-[12px] font-semibold text-muted hover:text-danger"
                        >
                          Quitar
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-[13px] text-faint">Nadie anotado todavía.</p>
              )}

              <div className="mt-3">
                {agregarA === h.horario_id ? (
                  <AgregarAlumno
                    horarioId={h.horario_id}
                    fecha={fecha}
                    onListo={() => {
                      setAgregarA(null);
                      cargar();
                    }}
                    onCancelar={() => setAgregarA(null)}
                  />
                ) : (
                  <button
                    onClick={() => setAgregarA(h.horario_id)}
                    className="text-[13px] font-semibold text-accent hover:brightness-90"
                  >
                    + Agregar alumno
                  </button>
                )}
              </div>
            </div>
          );
        })}
    </div>
  );
}

function AgregarAlumno({
  horarioId,
  fecha,
  onListo,
  onCancelar,
}: {
  horarioId: string;
  fecha: string;
  onListo: () => void;
  onCancelar: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [tipo, setTipo] = useState<"suelta" | "fijo">("suelta");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const input =
    "w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-[14px] text-ink outline-none focus:border-accent";

  async function guardar() {
    setError(null);
    if (!nombre.trim() || !telefono.trim()) {
      setError("Nombre y WhatsApp obligatorios.");
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch("/api/gym/admin/agregar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          horarioId,
          fecha,
          tipo,
          nombre: nombre.trim(),
          telefono: telefono.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "No se pudo agregar.");
        return;
      }
      onListo();
    } catch {
      setError("No se pudo agregar. Revisá la conexión.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="space-y-2 rounded-card border border-line bg-surface-2 p-3">
      <div className="flex gap-2">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre"
          className={input}
        />
        <input
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          placeholder="WhatsApp"
          inputMode="tel"
          className={input}
        />
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex rounded-full bg-surface p-0.5">
          {(["suelta", "fijo"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTipo(t)}
              className={[
                "rounded-full px-3 py-1 text-[12px] font-semibold",
                tipo === t ? "bg-ink text-white" : "text-muted",
              ].join(" ")}
            >
              {t === "suelta" ? "Este día" : "Fijo"}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={onCancelar}
            className="text-[13px] font-semibold text-muted hover:text-ink"
          >
            Cancelar
          </button>
          <button
            onClick={guardar}
            disabled={enviando}
            className="rounded-full bg-accent px-4 py-1.5 text-[13px] font-bold text-white disabled:opacity-50"
          >
            {enviando ? "…" : "Agregar"}
          </button>
        </div>
      </div>
      {error && <p className="text-[12px] text-danger">{error}</p>}
    </div>
  );
}

// ------------------------------------------------------------
// Tab Horarios: alta y activar/desactivar
// ------------------------------------------------------------
function Horarios({ tenantId }: { tenantId: string }) {
  const sb = createClient();
  const [horarios, setHorarios] = useState<GymHorario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form de alta
  const [dia, setDia] = useState(1); // lunes por defecto
  const [inicio, setInicio] = useState("18:00");
  const [fin, setFin] = useState("19:00");
  const [cap, setCap] = useState(10);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      setHorarios(await getGymHorarios(sb));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar.");
    } finally {
      setCargando(false);
    }
  }, [sb]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function crear() {
    setError(null);
    if (fin <= inicio) {
      setError("La hora de fin tiene que ser mayor a la de inicio.");
      return;
    }
    if (cap < 1) {
      setError("La capacidad tiene que ser al menos 1.");
      return;
    }
    setGuardando(true);
    try {
      await crearGymHorario(sb, {
        tenantId,
        diaSemana: dia,
        horaInicio: inicio,
        horaFin: fin,
        capacidadMax: cap,
      });
      cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear el horario.");
    } finally {
      setGuardando(false);
    }
  }

  async function toggle(h: GymHorario) {
    const { error } = await setGymHorarioActivo(sb, h.id, !h.activo).then(
      () => ({ error: null }),
      (e) => ({ error: e as Error }),
    );
    if (error) setError(error.message);
    else cargar();
  }

  const input =
    "rounded-lg border border-line bg-surface-2 px-3 py-2 text-[14px] text-ink outline-none focus:border-accent";

  return (
    <div className="space-y-4">
      {/* Alta */}
      <div className="space-y-3 rounded-panel border border-line bg-surface p-4 shadow-card">
        <div className="text-[14px] font-bold">Nuevo horario</div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted">
            Día
            <select
              value={dia}
              onChange={(e) => setDia(Number(e.target.value))}
              className={input}
            >
              {DIAS.map((d, i) => (
                <option key={i} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted">
            Desde
            <input
              type="time"
              value={inicio}
              onChange={(e) => setInicio(e.target.value)}
              className={input}
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted">
            Hasta
            <input
              type="time"
              value={fin}
              onChange={(e) => setFin(e.target.value)}
              className={input}
            />
          </label>
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted">
            Cupo
            <input
              type="number"
              min={1}
              value={cap}
              onChange={(e) => setCap(Number(e.target.value))}
              className={input}
            />
          </label>
        </div>
        {error && <p className="text-[12px] text-danger">{error}</p>}
        <button
          onClick={crear}
          disabled={guardando}
          className="rounded-full bg-accent px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
        >
          {guardando ? "Creando…" : "Agregar horario"}
        </button>
      </div>

      {/* Lista */}
      {cargando ? (
        <p className="py-8 text-center text-sm text-muted">Cargando…</p>
      ) : horarios.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">
          Todavía no hay horarios. Creá el primero arriba.
        </p>
      ) : (
        <div className="space-y-2">
          {horarios.map((h) => (
            <div
              key={h.id}
              className={[
                "flex items-center justify-between gap-3 rounded-card border bg-surface p-3",
                h.activo ? "border-line" : "border-line opacity-60",
              ].join(" ")}
            >
              <div>
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-bold text-muted">
                  {DIAS_CORTO[h.dia_semana]}
                </span>
                <span className="ml-2 text-[14px] font-bold">
                  {hhmm(h.hora_inicio)} a {hhmm(h.hora_fin)}
                </span>
                <span className="ml-2 text-[13px] text-muted">
                  · {h.capacidad_max} cupos
                </span>
              </div>
              <button
                onClick={() => toggle(h)}
                className="shrink-0 text-[12px] font-semibold text-muted hover:text-ink"
              >
                {h.activo ? "Desactivar" : "Activar"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
