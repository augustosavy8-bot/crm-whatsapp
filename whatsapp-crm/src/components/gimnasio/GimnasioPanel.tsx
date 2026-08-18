"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuBell } from "react-icons/lu";
import { createClient } from "@/lib/supabase/client";
import { Toast } from "@/components/turnos/Toast";
import {
  crearGymHorario,
  getAsistencias,
  getDeudaResumen,
  getDiasCerrados,
  getGymAlumnos,
  getGymHorarios,
  getGymOcupacion,
  getPagosSocio,
  getPlanes,
  marcarAsistencia,
  marcarDiaCerrado,
  quitarDiaCerrado,
  registrarPagoGym,
  setGymHorarioActivo,
  updateGymSocio,
  type AsistenciaEstado,
  type GymAlumnoEnClase,
  type GymCuotaAdeudada,
  type GymDiaCerrado,
  type GymHorario,
  type GymOcupacionHorario,
  type GymPago,
  type GymPlan,
  type GymSocio,
  type MetodoPago,
} from "@/lib/gymCupoAdmin";
import { hoyISOArgentina, sumarDiasISO } from "@/lib/tz";
import { cuotaProporcional, proximoVencimientoISO } from "@/lib/gymCuota";
import {
  getRutinaAlumno,
  guardarRutinaAlumno,
  type RutinaDia,
} from "@/lib/gymRutina";
import { rutinaHabilitadaParaAlumno } from "@/lib/gymRutinaPrueba";
import { normalizeArPhone } from "@/lib/phone";
import { appBaseUrl } from "@/lib/appUrl";

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

const TABS = [
  { key: "agenda", label: "Agenda" },
  { key: "rutinas", label: "Rutinas" },
  { key: "socios", label: "Socios" },
  { key: "planes", label: "Planes" },
  { key: "horarios", label: "Horarios" },
] as const;
type Tab = (typeof TABS)[number]["key"];

// Precio en pesos -> "$15.000"
function precioAR(n: number): string {
  return "$" + n.toLocaleString("es-AR");
}

function planLabel(p: Pick<GymPlan, "nombre" | "precio" | "dias_semana">): string {
  return `${p.nombre} · ${precioAR(p.precio)}`;
}

export default function GimnasioPanel({
  tenantId,
  puedeCobros = true,
  puedeRutinas = false,
}: {
  tenantId: string;
  // Acceso a cobros (socios y planes). Un profe "solo agenda" (sin gym_admin)
  // ve la agenda y los horarios, pero no los pagos ni los precios.
  puedeCobros?: boolean;
  // Acceso a armar rutinas (en prueba: solo el staff habilitado).
  puedeRutinas?: boolean;
}) {
  const [tab, setTab] = useState<Tab>("agenda");

  // Filtra las pestañas según permisos: cobros (socios/planes) y rutinas.
  const tabs = TABS.filter((t) => {
    if (t.key === "socios" || t.key === "planes") return puedeCobros;
    if (t.key === "rutinas") return puedeRutinas;
    return true;
  });
  const tabActual = tabs.some((t) => t.key === tab) ? tab : "agenda";

  return (
    <div className="space-y-4">
      <div className="flex rounded-full bg-surface-2 p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={[
              "flex-1 rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors",
              tabActual === t.key ? "bg-ink text-white" : "text-muted hover:text-ink",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tabActual === "agenda" && <Agenda tenantId={tenantId} />}
      {tabActual === "rutinas" && puedeRutinas && <Rutinas tenantId={tenantId} />}
      {tabActual === "socios" && puedeCobros && <Socios tenantId={tenantId} />}
      {tabActual === "planes" && puedeCobros && <Planes />}
      {tabActual === "horarios" && <Horarios tenantId={tenantId} />}
    </div>
  );
}

// ------------------------------------------------------------
// Planes (cuota por días/semana). El admin crea y edita los precios de cada plan.
// ------------------------------------------------------------
function Planes() {
  const sb = useMemo(() => createClient(), []);
  const [planes, setPlanes] = useState<GymPlan[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [nombre, setNombre] = useState("");
  const [dias, setDias] = useState("");
  const [precio, setPrecio] = useState("");
  const [guardando, setGuardando] = useState(false);

  // Edición inline del precio por plan.
  const [editId, setEditId] = useState<string | null>(null);
  const [editPrecio, setEditPrecio] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setPlanes(await getPlanes(sb));
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
    if (!nombre.trim() || !precio.trim()) {
      setError("Nombre y precio obligatorios.");
      return;
    }
    setGuardando(true);
    const res = await fetch("/api/gym/planes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nombre: nombre.trim(),
        dias_semana: dias.trim() || null,
        precio: precio.trim(),
      }),
    });
    setGuardando(false);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "No se pudo crear el plan.");
      return;
    }
    setNombre("");
    setDias("");
    setPrecio("");
    cargar();
  }

  async function guardarPrecio(p: GymPlan) {
    setError(null);
    const res = await fetch("/api/gym/planes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, precio: editPrecio.trim() }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "No se pudo actualizar.");
      return;
    }
    setEditId(null);
    cargar();
  }

  async function toggleActivo(p: GymPlan) {
    setError(null);
    const res = await fetch("/api/gym/planes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: p.id, activo: !p.activo }),
    });
    if (res.ok) cargar();
  }

  const input =
    "rounded-lg border border-line bg-surface-2 px-3 py-2 text-[14px] text-ink outline-none focus:border-accent";

  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-panel border border-line bg-surface p-4 shadow-card">
        <div className="text-[14px] font-bold">Nuevo plan</div>
        <div className="flex flex-wrap gap-2">
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre (ej. 3 días)"
            className={`${input} min-w-0 flex-1`}
          />
          <input
            value={dias}
            onChange={(e) => setDias(e.target.value)}
            placeholder="Días/sem"
            inputMode="numeric"
            className={`${input} w-24`}
          />
          <input
            value={precio}
            onChange={(e) => setPrecio(e.target.value)}
            placeholder="Precio $"
            inputMode="numeric"
            className={`${input} w-28`}
          />
          <button
            onClick={crear}
            disabled={guardando}
            className="rounded-full bg-accent px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
          >
            {guardando ? "…" : "Agregar"}
          </button>
        </div>
        <p className="text-[11px] text-faint">
          Días/semana es opcional (dejalo vacío para “libre”).
        </p>
      </div>

      {error && <p className="text-[13px] text-danger">{error}</p>}

      {cargando ? (
        <p className="py-8 text-center text-sm text-muted">Cargando…</p>
      ) : planes.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">
          Todavía no hay planes. Creá el primero arriba.
        </p>
      ) : (
        <div className="space-y-2">
          {planes.map((p) => (
            <div
              key={p.id}
              className={[
                "rounded-card border bg-surface p-3 shadow-card",
                p.activo ? "border-line" : "border-line opacity-60",
              ].join(" ")}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-[15px] font-bold">{p.nombre}</div>
                  <div className="text-[12px] text-muted">
                    {p.dias_semana ? `${p.dias_semana} días/semana` : "Libre"}
                  </div>
                </div>

                {editId === p.id ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={editPrecio}
                      onChange={(e) => setEditPrecio(e.target.value)}
                      inputMode="numeric"
                      className={`${input} w-28`}
                    />
                    <button
                      onClick={() => guardarPrecio(p)}
                      className="rounded-full bg-ink px-3 py-1.5 text-[12px] font-bold text-white"
                    >
                      Guardar
                    </button>
                    <button
                      onClick={() => setEditId(null)}
                      className="text-[12px] font-semibold text-muted"
                    >
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <span className="text-[15px] font-bold text-accent">
                      {precioAR(p.precio)}
                    </span>
                    <button
                      onClick={() => {
                        setEditId(p.id);
                        setEditPrecio(String(p.precio));
                      }}
                      className="text-[12px] font-semibold text-accent hover:brightness-90"
                    >
                      Editar precio
                    </button>
                    <button
                      onClick={() => toggleActivo(p)}
                      className="text-[12px] font-semibold text-muted hover:text-ink"
                    >
                      {p.activo ? "Desactivar" : "Activar"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Estado de cuota de un alumno para la fecha de hoy.
function cuotaVencida(esSocio: boolean, cuotaHasta: string | null): boolean {
  if (!esSocio) return true;
  if (!cuotaHasta) return true;
  return cuotaHasta < hoyISOArgentina();
}

// ------------------------------------------------------------
// Tab Agenda: ocupación por día
// ------------------------------------------------------------
function Agenda({ tenantId }: { tenantId: string }) {
  const sb = useMemo(() => createClient(), []);
  const [fecha, setFecha] = useState(hoyISOArgentina);
  const [data, setData] = useState<GymOcupacionHorario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agregarA, setAgregarA] = useState<string | null>(null); // horario_id
  const [novedad, setNovedad] = useState(false); // campana con aviso
  const [aviso, setAviso] = useState<string | null>(null); // toast realtime
  // Asistencia del día: clave `${alumnoId}|${horarioId}` -> presente/ausente.
  const [asist, setAsist] = useState<Record<string, AsistenciaEstado>>({});
  // Días cerrados (feriados) de hoy en adelante, por fecha.
  const [cerrados, setCerrados] = useState<Record<string, GymDiaCerrado>>({});

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [ocup, asis, dias] = await Promise.all([
        getGymOcupacion(sb, fecha),
        getAsistencias(sb, fecha),
        getDiasCerrados(sb, hoyISOArgentina()),
      ]);
      setData(ocup);
      setAsist(asis);
      setCerrados(
        Object.fromEntries(dias.map((d) => [d.fecha, d])),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar la agenda.");
      setData([]);
    } finally {
      setCargando(false);
    }
  }, [sb, fecha]);

  const cerrado = cerrados[fecha];

  // Declara el día que se está viendo como cerrado (feriado): cancela las
  // reservas sueltas de ese día y bloquea nuevas.
  async function marcarCerrado() {
    const motivo = window.prompt(
      "¿Por qué cierra ese día? (feriado, cierre…). Opcional:",
      "Feriado",
    );
    if (motivo === null) return; // canceló
    try {
      await marcarDiaCerrado(sb, fecha, motivo.trim() || null);
      cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo marcar el día.");
    }
  }

  async function reabrirDia() {
    if (!cerrado) return;
    try {
      await quitarDiaCerrado(sb, cerrado.id);
      cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo reabrir el día.");
    }
  }

  // Marca presente/ausente (toggle: volver a tocar el mismo estado lo quita).
  async function marcar(
    alumnoId: string,
    horarioId: string,
    estado: AsistenciaEstado,
  ) {
    const key = `${alumnoId}|${horarioId}`;
    const previo = asist[key];
    const nuevo = previo === estado ? undefined : estado;
    setAsist((prev) => {
      const copia = { ...prev };
      if (nuevo) copia[key] = nuevo;
      else delete copia[key];
      return copia;
    });
    try {
      if (nuevo) {
        await marcarAsistencia(sb, {
          tenantId,
          alumnoId,
          horarioId,
          fecha,
          estado: nuevo,
        });
      } else {
        // Se "destildó": borro el registro (queda sin marcar).
        const { error } = await sb
          .from("gym_asistencias")
          .delete()
          .eq("alumno_id", alumnoId)
          .eq("horario_id", horarioId)
          .eq("fecha", fecha);
        if (error) throw error;
      }
    } catch (e) {
      // Revierto.
      setAsist((prev) => {
        const copia = { ...prev };
        if (previo) copia[key] = previo;
        else delete copia[key];
        return copia;
      });
      setError(e instanceof Error ? e.message : "No se pudo marcar la asistencia.");
    }
  }

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Ref a cargar para usarlo en el canal realtime sin re-suscribir por fecha.
  const cargarRef = useRef(cargar);
  useEffect(() => {
    cargarRef.current = cargar;
  }, [cargar]);

  // Realtime: un alumno se anota -> entra en vivo, campana + toast.
  useEffect(() => {
    async function onInsert(payload: { new?: { alumno_id?: string } }) {
      setNovedad(true);
      let nombre = "un alumno";
      const alumnoId = payload.new?.alumno_id;
      if (alumnoId) {
        const { data: a } = await sb
          .from("gym_alumnos")
          .select("nombre")
          .eq("id", alumnoId)
          .maybeSingle();
        if (a?.nombre) nombre = a.nombre as string;
      }
      setAviso(`Nuevo turno · ${nombre}`);
      cargarRef.current();
      setTimeout(() => setNovedad(false), 6000);
    }
    const ch = sb
      .channel("gym-reservas-realtime")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "gym_reservas_sueltas" },
        onInsert,
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "gym_turnos_fijos" },
        onInsert,
      )
      .subscribe();
    return () => {
      sb.removeChannel(ch);
    };
  }, [sb]);

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

  // Confirmar/rechazar una reserva pendiente. Al confirmar, el alumno recibe un
  // push (si lo activó). El aviso por WhatsApp es aparte y manual (botón Avisar).
  async function decidir(
    tipo: "suelta" | "fijo",
    id: string,
    accion: "confirmar" | "rechazar",
  ) {
    if (accion === "rechazar" && !confirm("¿Rechazar esta reserva?")) return;
    const res = await fetch("/api/gym/admin/decidir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo, id, accion }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "No se pudo procesar.");
      return;
    }
    cargar();
  }

  // Aviso MANUAL por WhatsApp de que el turno quedó confirmado: abre WhatsApp
  // con el mensaje listo para que el staff lo mande (útil para el que no tiene
  // la app / no activó las notificaciones). No manda nada solo.
  async function avisarConfirmado(a: GymAlumnoEnClase, h: GymOcupacionHorario) {
    const { data } = await sb
      .from("gym_alumnos")
      .select("telefono")
      .eq("id", a.alumno_id)
      .maybeSingle();
    const tel = normalizeArPhone((data?.telefono as string | null) ?? null);
    if (!tel) {
      setError("Ese alumno no tiene WhatsApp cargado.");
      return;
    }
    const [, m, d] = fecha.split("-");
    const franja = `${h.hora_inicio.slice(0, 5)} a ${h.hora_fin.slice(0, 5)} hs`;
    const msg =
      `¡Hola ${a.nombre.split(" ")[0]}! Tu turno en KINACTIVA quedó confirmado ` +
      `para el ${d}/${m} de ${franja}. Te esperamos.`;
    window.open(`https://wa.me/${tel}?text=${encodeURIComponent(msg)}`, "_blank");
  }

  return (
    <div className="space-y-4">
      {/* Campana de novedades en vivo */}
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-muted">
          Agenda del día
        </span>
        <button
          onClick={() => {
            setNovedad(false);
            cargar();
          }}
          title={novedad ? "Nuevo turno recibido" : "Avisos en vivo"}
          className={[
            "relative flex h-9 w-9 items-center justify-center rounded-full transition-colors",
            novedad
              ? "bg-accent-soft text-accent"
              : "bg-surface-2 text-muted hover:text-ink",
          ].join(" ")}
        >
          <span
            className="flex"
            style={novedad ? { animation: "kfBell .9s ease-in-out 2" } : undefined}
          >
            <LuBell size={17} />
          </span>
          {novedad && (
            <span
              className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-surface bg-accent"
              style={{ animation: "kfPop .4s" }}
            />
          )}
        </button>
      </div>

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

      {/* Día cerrado (feriado): declarar / reabrir */}
      <div className="flex items-center justify-center gap-2">
        {cerrado ? (
          <>
            <span className="rounded-full bg-danger/15 px-3 py-1 text-[12px] font-bold text-danger">
              Cerrado{cerrado.motivo ? ` · ${cerrado.motivo}` : ""}
            </span>
            <button
              onClick={reabrirDia}
              className="text-[12px] font-semibold text-accent hover:brightness-90"
            >
              Reabrir
            </button>
          </>
        ) : (
          <button
            onClick={marcarCerrado}
            className="rounded-full border border-line px-3 py-1 text-[12px] font-semibold text-muted hover:border-faint hover:text-ink"
          >
            Marcar día cerrado (feriado)
          </button>
        )}
      </div>

      {error && <p className="text-[13px] text-danger">{error}</p>}

      {cargando && <p className="py-8 text-center text-sm text-muted">Cargando…</p>}

      {!cargando && cerrado && (
        <p className="py-8 text-center text-sm text-muted">
          Gimnasio cerrado este día
          {cerrado.motivo ? ` (${cerrado.motivo})` : ""}. No hay clases ni reservas.
        </p>
      )}

      {!cargando && !cerrado && data.length === 0 && (
        <p className="py-8 text-center text-sm text-muted">
          No hay clases este día. Cargá horarios en la pestaña “Horarios”.
        </p>
      )}

      {!cargando &&
        !cerrado &&
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
                  {h.alumnos.map((a) => {
                    const pendiente = a.estado === "pendiente";
                    const vencida = cuotaVencida(a.es_socio, a.cuota_hasta);
                    return (
                      <li
                        key={`${a.tipo}-${a.alumno_id}-${a.turno_fijo_id ?? a.reserva_id}`}
                        className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                      >
                        <div className="flex flex-wrap items-center gap-1.5">
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
                          {pendiente && (
                            <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[10px] font-bold uppercase text-warn">
                              Pendiente
                            </span>
                          )}
                          {vencida && (
                            <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[10px] font-bold uppercase text-danger">
                              {a.es_socio ? "Cuota vencida" : "No socio"}
                            </span>
                          )}
                          {/* Asistencia: presente / ausente (solo confirmados). */}
                          {!pendiente && (
                            <span className="flex overflow-hidden rounded-full border border-line">
                              {(["presente", "ausente"] as const).map((es) => {
                                const activo =
                                  asist[`${a.alumno_id}|${h.horario_id}`] === es;
                                return (
                                  <button
                                    key={es}
                                    onClick={() => marcar(a.alumno_id, h.horario_id, es)}
                                    className={[
                                      "px-2 py-0.5 text-[10px] font-bold uppercase transition-colors",
                                      activo
                                        ? es === "presente"
                                          ? "bg-ok text-white"
                                          : "bg-danger text-white"
                                        : "text-muted hover:text-ink",
                                    ].join(" ")}
                                  >
                                    {es === "presente" ? "Presente" : "Ausente"}
                                  </button>
                                );
                              })}
                            </span>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          {pendiente ? (
                            <>
                              <button
                                onClick={() =>
                                  decidir(
                                    a.tipo === "fijo" ? "fijo" : "suelta",
                                    (a.turno_fijo_id ?? a.reserva_id)!,
                                    "confirmar",
                                  )
                                }
                                className="rounded-full bg-accent px-3 py-1 text-[12px] font-bold text-white hover:brightness-95"
                              >
                                Confirmar
                              </button>
                              <button
                                onClick={() =>
                                  decidir(
                                    a.tipo === "fijo" ? "fijo" : "suelta",
                                    (a.turno_fijo_id ?? a.reserva_id)!,
                                    "rechazar",
                                  )
                                }
                                className="text-[12px] font-semibold text-muted hover:text-danger"
                              >
                                Rechazar
                              </button>
                            </>
                          ) : (
                            <>
                              {/* Aviso manual: abre WhatsApp con el mensaje listo. */}
                              <button
                                onClick={() => avisarConfirmado(a, h)}
                                title="Avisar por WhatsApp que quedó confirmado"
                                className="text-[12px] font-semibold text-ok hover:brightness-90"
                              >
                                Avisar
                              </button>
                              {a.tipo === "fijo" && a.turno_fijo_id ? (
                                <button
                                  onClick={() => noVieneHoy(a.turno_fijo_id!)}
                                  className="text-[12px] font-semibold text-muted hover:text-danger"
                                >
                                  No viene hoy
                                </button>
                              ) : a.reserva_id ? (
                                <button
                                  onClick={() => quitarSuelta(a.reserva_id!)}
                                  className="text-[12px] font-semibold text-muted hover:text-danger"
                                >
                                  Quitar
                                </button>
                              ) : null}
                            </>
                          )}
                        </div>
                      </li>
                    );
                  })}
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

      {aviso && (
        <Toast
          toast={{ tipo: "ok", mensaje: aviso }}
          onClose={() => setAviso(null)}
        />
      )}
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
    if (!nombre.trim()) {
      setError("El nombre es obligatorio.");
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
          placeholder="WhatsApp (opcional)"
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
  const sb = useMemo(() => createClient(), []);
  const [horarios, setHorarios] = useState<GymHorario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form de alta
  const [dia, setDia] = useState(1); // lunes por defecto
  const [inicio, setInicio] = useState("18:00");
  const [fin, setFin] = useState("19:00");
  const [cap, setCap] = useState(10);
  const [guardando, setGuardando] = useState(false);

  // Días cerrados / feriados
  const [diasCerrados, setDiasCerrados] = useState<GymDiaCerrado[]>([]);
  const [nuevoCierre, setNuevoCierre] = useState("");
  const [motivoCierre, setMotivoCierre] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [hs, dias] = await Promise.all([
        getGymHorarios(sb),
        getDiasCerrados(sb, hoyISOArgentina()),
      ]);
      setHorarios(hs);
      setDiasCerrados(dias);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar.");
    } finally {
      setCargando(false);
    }
  }, [sb]);

  async function agregarCierre() {
    setError(null);
    if (!nuevoCierre) {
      setError("Elegí una fecha para cerrar.");
      return;
    }
    try {
      await marcarDiaCerrado(sb, nuevoCierre, motivoCierre.trim() || null);
      setNuevoCierre("");
      setMotivoCierre("");
      cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo marcar el día.");
    }
  }

  async function quitarCierre(id: string) {
    setError(null);
    try {
      await quitarDiaCerrado(sb, id);
      cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo reabrir el día.");
    }
  }

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

      {/* Días cerrados / feriados */}
      <div className="space-y-3 rounded-panel border border-line bg-surface p-4 shadow-card">
        <div className="text-[14px] font-bold">Días cerrados (feriados)</div>
        <p className="text-[12px] text-muted">
          Marcá los días que el gimnasio no abre. Esos días no se pueden reservar
          y se cancelan las reservas sueltas que hubiera.
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted">
            Fecha
            <input
              type="date"
              value={nuevoCierre}
              min={hoyISOArgentina()}
              onChange={(e) => setNuevoCierre(e.target.value)}
              className={input}
            />
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1 text-[11px] font-semibold text-muted">
            Motivo (opcional)
            <input
              value={motivoCierre}
              onChange={(e) => setMotivoCierre(e.target.value)}
              placeholder="Feriado, cierre…"
              className={`${input} w-full`}
            />
          </label>
          <button
            onClick={agregarCierre}
            className="rounded-full bg-accent px-4 py-2 text-[13px] font-bold text-white"
          >
            Cerrar día
          </button>
        </div>
        {diasCerrados.length > 0 && (
          <ul className="space-y-1.5">
            {diasCerrados.map((d) => (
              <li
                key={d.id}
                className="flex items-center justify-between gap-2 rounded-card border border-line bg-surface-2 px-3 py-2"
              >
                <span className="text-[13px]">
                  <span className="font-bold">{fechaCorta(d.fecha)}</span>
                  {d.motivo ? (
                    <span className="text-muted"> · {d.motivo}</span>
                  ) : null}
                </span>
                <button
                  onClick={() => quitarCierre(d.id)}
                  className="shrink-0 text-[12px] font-semibold text-accent hover:brightness-90"
                >
                  Reabrir
                </button>
              </li>
            ))}
          </ul>
        )}
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

// ------------------------------------------------------------
// Tab Socios: padrón + estado de cuota
// ------------------------------------------------------------
function fechaCorta(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(new Date(`${iso}T12:00:00Z`));
}

// Métodos de pago que se pueden anotar en el libro (más amplios que el débito
// recurrente): el profe carga cómo pagó realmente cada uno.
const METODOS_PAGO: { key: MetodoPago; label: string }[] = [
  { key: "efectivo", label: "Efectivo" },
  { key: "transferencia", label: "Transferencia" },
  { key: "mercadopago", label: "MercadoPago" },
  { key: "debito", label: "Débito" },
  { key: "otro", label: "Otro" },
];
const metodoLabel = (m: MetodoPago) =>
  METODOS_PAGO.find((x) => x.key === m)?.label ?? m;

// 15000 -> "$15.000"
function montoAR(n: number | null): string {
  if (n == null) return "—";
  return "$" + Number(n).toLocaleString("es-AR");
}

const MESES = [
  "ene", "feb", "mar", "abr", "may", "jun",
  "jul", "ago", "sep", "oct", "nov", "dic",
];
const mesLabel = (anio: number, mes: number) =>
  `${MESES[mes - 1] ?? mes} ${anio}`;

// Deuda estimada en pesos: meses adeudados × precio del plan del socio. El
// monto real no está cargado mes a mes (viene de la planilla), así que es una
// estimación con el plan actual — por eso se muestra con "≈".
function deudaPesos(
  meses: GymCuotaAdeudada[] | undefined,
  plan: GymSocio["plan"],
): number | null {
  if (!meses?.length || !plan) return null;
  return meses.length * plan.precio;
}

function Socios({ tenantId }: { tenantId: string }) {
  const sb = useMemo(() => createClient(), []);
  const [socios, setSocios] = useState<GymSocio[]>([]);
  const [planes, setPlanes] = useState<GymPlan[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [guardando, setGuardando] = useState(false);
  // Links de invitación (crear cuenta) generados en esta sesión, por socio.
  const [inviteLinks, setInviteLinks] = useState<Record<string, string>>({});
  // Links de recuperación de contraseña generados en esta sesión, por socio.
  const [recuperLinks, setRecuperLinks] = useState<Record<string, string>>({});
  const [copiado, setCopiado] = useState<string | null>(null);
  // Edición inline del email por socio (necesario para MercadoPago).
  const [editEmailId, setEditEmailId] = useState<string | null>(null);
  const [emailVal, setEmailVal] = useState("");
  // Registro de pagos (libro por socio): historial cargado y cuál está abierto.
  const [pagosPorSocio, setPagosPorSocio] = useState<Record<string, GymPago[]>>({});
  const [pagosAbierto, setPagosAbierto] = useState<string | null>(null);
  const [cargandoPagos, setCargandoPagos] = useState(false);
  // Formulario de pago manual: cuál socio está abierto y sus campos.
  const [pagoManualId, setPagoManualId] = useState<string | null>(null);
  const [pmMonto, setPmMonto] = useState("");
  const [pmMetodo, setPmMetodo] = useState<MetodoPago>("efectivo");
  const [pmFecha, setPmFecha] = useState("");
  const [pmHasta, setPmHasta] = useState("");
  const [pmNota, setPmNota] = useState("");
  const [pmGuardando, setPmGuardando] = useState(false);
  // Generación masiva de links de acceso (para el padrón importado).
  const [bulkCargando, setBulkCargando] = useState(false);
  const [bulkTexto, setBulkTexto] = useState<string | null>(null);
  // Deuda: meses adeudados por socio (planilla de cuotas), y cuál está abierto.
  const [deuda, setDeuda] = useState<Record<string, GymCuotaAdeudada[]>>({});
  const [saldoAbierto, setSaldoAbierto] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [s, p, d] = await Promise.all([
        getGymAlumnos(sb),
        getPlanes(sb),
        getDeudaResumen(sb),
      ]);
      setSocios(s);
      setPlanes(p);
      setDeuda(d);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar.");
    } finally {
      setCargando(false);
    }
  }, [sb]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function cambiarPlan(socioId: string, planId: string) {
    setError(null);
    const res = await fetch("/api/gym/socio-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ socioId, planId: planId || null }),
    });
    if (res.ok) cargar();
    else {
      const d = await res.json().catch(() => ({}));
      setError(d.error || "No se pudo cambiar el plan.");
    }
  }

  async function guardarEmail(s: GymSocio) {
    setError(null);
    try {
      await updateGymSocio(sb, s.id, { email: emailVal.trim() || null });
      setEditEmailId(null);
      cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar el email.");
    }
  }

  async function alta() {
    setError(null);
    if (!nombre.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    // El WhatsApp es OPCIONAL: de muchos socios no se tiene. Si lo cargan, se
    // valida; si no, la ficha queda sin teléfono y se le manda link de acceso
    // para que el propio socio lo complete al crear su cuenta.
    let tel: string | null = null;
    if (telefono.trim()) {
      tel = normalizeArPhone(telefono.trim());
      if (tel.length < 10) {
        setError("WhatsApp inválido.");
        return;
      }
    }
    setGuardando(true);
    const { error } = await sb
      .from("gym_alumnos")
      .insert({ tenant_id: tenantId, nombre: nombre.trim(), telefono: tel });
    setGuardando(false);
    if (error) {
      setError(
        /duplicate|unique/i.test(error.message)
          ? "Ya existe un alumno con ese WhatsApp."
          : error.message,
      );
      return;
    }
    setNombre("");
    setTelefono("");
    cargar();
  }

  // Refleja un pago en la tarjeta del socio y, si el historial está cargado,
  // le agrega el asiento arriba de todo. Sin recargar la lista.
  function aplicarPago(pago: GymPago) {
    setSocios((prev) =>
      prev.map((x) =>
        x.id === pago.alumno_id
          ? { ...x, es_socio: true, cuota_hasta: pago.cuota_hasta }
          : x,
      ),
    );
    setPagosPorSocio((prev) =>
      prev[pago.alumno_id]
        ? { ...prev, [pago.alumno_id]: [pago, ...prev[pago.alumno_id]] }
        : prev,
    );
  }

  async function registrarPago(s: GymSocio) {
    // Registra el pago y deja la cuota paga hasta el 10 del mes que viene
    // (nunca el día en que pagó). Si el socio es nuevo (nunca pagó) y tiene
    // plan, el primer pago es proporcional a los días que quedan del mes.
    const hoy = hoyISOArgentina();
    const nuevaCuota = proximoVencimientoISO(s.cuota_hasta, hoy);
    const esNuevo = !s.cuota_hasta;
    const monto =
      esNuevo && s.plan
        ? cuotaProporcional(s.plan.precio, hoy).monto
        : (s.plan?.precio ?? null);
    // Optimista: actualizo la tarjeta en el momento; el RPC confirma la fecha.
    const previo = { es_socio: s.es_socio, cuota_hasta: s.cuota_hasta };
    setError(null);
    setSocios((prev) =>
      prev.map((x) =>
        x.id === s.id ? { ...x, es_socio: true, cuota_hasta: nuevaCuota } : x,
      ),
    );
    try {
      const metodo: MetodoPago =
        s.metodo_pago === "mercadopago" ? "mercadopago" : "efectivo";
      const pago = await registrarPagoGym(sb, {
        alumnoId: s.id,
        monto,
        metodo,
        cuotaHasta: nuevaCuota,
      });
      aplicarPago(pago);
    } catch (e) {
      // Revierto la tarjeta a como estaba y aviso.
      setSocios((prev) =>
        prev.map((x) => (x.id === s.id ? { ...x, ...previo } : x)),
      );
      setError(e instanceof Error ? e.message : "No se pudo registrar el pago.");
    }
  }

  function abrirPagoManual(s: GymSocio) {
    setError(null);
    setPagoManualId(s.id);
    const hoy = hoyISOArgentina();
    // Nuevo socio con plan: sugiere el proporcional del mes. Si no, la cuota
    // completa del plan.
    const esNuevo = !s.cuota_hasta;
    const sugerido =
      esNuevo && s.plan
        ? cuotaProporcional(s.plan.precio, hoy).monto
        : (s.plan?.precio ?? null);
    setPmMonto(sugerido ? String(sugerido) : "");
    setPmMetodo(s.metodo_pago === "mercadopago" ? "mercadopago" : "efectivo");
    setPmFecha(hoy);
    // Vencimiento sugerido: el 10 del mes que viene.
    setPmHasta(proximoVencimientoISO(s.cuota_hasta, hoy));
    setPmNota("");
  }

  async function guardarPagoManual(s: GymSocio) {
    setError(null);
    const montoNum = pmMonto.trim() ? Number(pmMonto.replace(/\./g, "").trim()) : null;
    if (montoNum != null && (Number.isNaN(montoNum) || montoNum < 0)) {
      setError("Monto inválido.");
      return;
    }
    setPmGuardando(true);
    try {
      const pago = await registrarPagoGym(sb, {
        alumnoId: s.id,
        monto: montoNum,
        metodo: pmMetodo,
        fecha: pmFecha || null,
        cuotaHasta: pmHasta || null,
        nota: pmNota.trim() || null,
      });
      aplicarPago(pago);
      setPagoManualId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el pago.");
    } finally {
      setPmGuardando(false);
    }
  }

  async function togglePagos(s: GymSocio) {
    if (pagosAbierto === s.id) {
      setPagosAbierto(null);
      return;
    }
    setPagosAbierto(s.id);
    if (pagosPorSocio[s.id]) return; // ya cargado
    setCargandoPagos(true);
    try {
      const lista = await getPagosSocio(sb, s.id);
      setPagosPorSocio((prev) => ({ ...prev, [s.id]: lista }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron cargar los pagos.");
    } finally {
      setCargandoPagos(false);
    }
  }

  async function setMetodo(s: GymSocio, metodo: "efectivo" | "mercadopago") {
    const previo = s.metodo_pago;
    setError(null);
    setSocios((prev) =>
      prev.map((x) => (x.id === s.id ? { ...x, metodo_pago: metodo } : x)),
    );
    try {
      await updateGymSocio(sb, s.id, { metodo_pago: metodo });
    } catch (e) {
      setSocios((prev) =>
        prev.map((x) => (x.id === s.id ? { ...x, metodo_pago: previo } : x)),
      );
      setError(e instanceof Error ? e.message : "No se pudo actualizar.");
    }
  }


  // Genera (o regenera) el link de invitación para que el alumno cree su
  // cuenta, y lo copia al portapapeles. Sin este link nadie puede registrarse.
  async function invitar(s: GymSocio) {
    setError(null);
    const res = await fetch("/api/gym/admin/invitar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alumnoId: s.id }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "No se pudo generar la invitación.");
      return;
    }
    const link = `${appBaseUrl(window.location.origin)}/registro?token=${data.token}`;
    setInviteLinks((m) => ({ ...m, [s.id]: link }));
    await copiar(s.id, link);
    cargar();
  }

  // Genera links de acceso para TODOS los socios que aún no tienen cuenta y arma
  // un texto "Nombre — link" por línea, listo para copiar y mandar por WhatsApp.
  async function invitarTodos() {
    setError(null);
    setBulkTexto(null);
    setBulkCargando(true);
    try {
      const res = await fetch("/api/gym/admin/invitar-todos", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "No se pudieron generar los links.");
        return;
      }
      const invites = (data.invites ?? []) as { nombre: string; token: string }[];
      if (invites.length === 0) {
        setBulkTexto("Todos los socios ya tienen cuenta. No hay links para generar.");
      } else {
        const base = appBaseUrl(window.location.origin);
        const texto = invites
          .map((i) => `${i.nombre}: ${base}/registro?token=${i.token}`)
          .join("\n");
        setBulkTexto(texto);
      }
      cargar();
    } catch {
      setError("Sin conexión. Probá de nuevo.");
    } finally {
      setBulkCargando(false);
    }
  }

  // Genera un link de recuperación de contraseña (sin email) para un socio que
  // ya tiene cuenta y se lo copia, para mandarlo por WhatsApp.
  async function recuperar(s: GymSocio) {
    setError(null);
    if (!s.email) {
      setError("Ese socio no tiene email cargado: agregalo primero.");
      return;
    }
    const res = await fetch("/api/admin/recuperar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: s.email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "No se pudo generar el link de recuperación.");
      return;
    }
    setRecuperLinks((m) => ({ ...m, [s.id]: data.link }));
    await copiar(s.id, data.link);
  }

  async function copiar(id: string, texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(id);
      setTimeout(() => setCopiado((c) => (c === id ? null : c)), 2000);
    } catch {
      // Clipboard bloqueado: el link igual queda visible para copiar a mano.
    }
  }

  const filtrados = socios.filter(
    (s) =>
      !q.trim() ||
      s.nombre.toLowerCase().includes(q.toLowerCase()) ||
      (s.telefono ?? "").includes(q),
  );

  // Resumen de deuda del padrón (cabecera).
  const sociosConDeuda = socios.filter((s) => (deuda[s.id]?.length ?? 0) > 0);
  const totalDeudaPesos = sociosConDeuda.reduce(
    (acc, s) => acc + (deudaPesos(deuda[s.id], s.plan) ?? 0),
    0,
  );

  const input =
    "rounded-lg border border-line bg-surface-2 px-3 py-2 text-[14px] text-ink outline-none focus:border-accent";

  return (
    <div className="space-y-4">
      {/* Alta */}
      <div className="space-y-2 rounded-panel border border-line bg-surface p-4 shadow-card">
        <div className="text-[14px] font-bold">Agregar socio</div>
        <div className="flex flex-wrap gap-2">
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            placeholder="Nombre y apellido"
            className={`${input} min-w-0 flex-1`}
          />
          <input
            value={telefono}
            onChange={(e) => setTelefono(e.target.value)}
            placeholder="WhatsApp (opcional)"
            inputMode="tel"
            className={`${input} min-w-0 flex-1`}
          />
          <button
            onClick={alta}
            disabled={guardando}
            className="rounded-full bg-accent px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
          >
            {guardando ? "…" : "Agregar"}
          </button>
        </div>
        <p className="text-[11px] text-faint">
          Si no tenés el WhatsApp, dejalo vacío: podés mandarle igual el link de
          acceso y lo completa el socio al crear su cuenta.
        </p>
      </div>

      {/* Invitación masiva: un link de acceso por cada socio sin cuenta. */}
      <div className="space-y-2 rounded-panel border border-line bg-surface p-4 shadow-card">
        <div className="text-[14px] font-bold">Links de acceso para los socios</div>
        <p className="text-[12px] text-muted">
          Genera un link por cada socio que todavía no tiene cuenta
          {" "}({socios.filter((s) => !s.auth_user_id).length} sin cuenta). Copiás
          la lista y le mandás a cada uno el suyo para que se registre.
        </p>
        <button
          onClick={invitarTodos}
          disabled={bulkCargando}
          className="rounded-full bg-accent px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
        >
          {bulkCargando ? "Generando…" : "Generar links de acceso"}
        </button>
        {bulkTexto !== null && (
          <div className="space-y-2 pt-1">
            <textarea
              readOnly
              value={bulkTexto}
              rows={6}
              onFocus={(e) => e.currentTarget.select()}
              className={`${input} w-full font-mono text-[11px] leading-relaxed`}
            />
            <button
              onClick={() => copiar("bulk", bulkTexto)}
              className="rounded-full bg-surface-2 px-3 py-1.5 text-[12px] font-semibold text-ink hover:bg-accent hover:text-white"
            >
              {copiado === "bulk" ? "¡Copiado!" : "Copiar toda la lista"}
            </button>
          </div>
        )}
      </div>

      {/* Resumen de deuda del padrón. */}
      {sociosConDeuda.length > 0 && (
        <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-panel border border-danger/30 bg-danger/5 px-4 py-3">
          <span className="text-[13px] font-bold text-danger">
            {sociosConDeuda.length} socio{sociosConDeuda.length === 1 ? "" : "s"} con
            deuda
          </span>
          {totalDeudaPesos > 0 && (
            <span className="text-[13px] font-semibold text-danger">
              Total ≈ {montoAR(totalDeudaPesos)}
            </span>
          )}
        </div>
      )}

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por nombre o WhatsApp…"
        className={`${input} w-full`}
      />

      {error && <p className="text-[13px] text-danger">{error}</p>}

      {cargando ? (
        <p className="py-8 text-center text-sm text-muted">Cargando…</p>
      ) : filtrados.length === 0 ? (
        <p className="py-4 text-center text-sm text-muted">
          {socios.length === 0
            ? "Todavía no hay alumnos. Aparecen acá cuando reservan, o agregalos arriba."
            : "Sin resultados."}
        </p>
      ) : (
        <div className="space-y-2">
          {filtrados.map((s) => {
            const vencida = cuotaVencida(s.es_socio, s.cuota_hasta);
            const mesesDebe = deuda[s.id];
            const saldoPesos = deudaPesos(mesesDebe, s.plan);
            const hoyISO = hoyISOArgentina();
            // Nuevo (nunca pagó): el 1er pago es proporcional al mes en curso.
            const esNuevo = !s.cuota_hasta;
            const prop =
              esNuevo && s.plan ? cuotaProporcional(s.plan.precio, hoyISO) : null;
            return (
              <div
                key={s.id}
                className="rounded-card border border-line bg-surface p-3 shadow-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-[14px] font-bold">{s.nombre}</div>
                    <div className="text-[12px] text-muted">{s.telefono}</div>
                  </div>
                  <span
                    className={[
                      "shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold",
                      !vencida
                        ? "bg-ok/15 text-ok"
                        : s.es_socio
                          ? "bg-danger/15 text-danger"
                          : "bg-surface-2 text-muted",
                    ].join(" ")}
                  >
                    {!vencida
                      ? `Al día · vence ${fechaCorta(s.cuota_hasta as string)}`
                      : s.es_socio
                        ? s.cuota_hasta
                          ? `Vencida ${fechaCorta(s.cuota_hasta)}`
                          : "Sin pago"
                        : "No socio"}
                  </span>
                </div>

                {/* Saldo: si debe meses, chip que abre el detalle exacto. */}
                {mesesDebe && mesesDebe.length > 0 && (
                  <div className="mt-2">
                    <button
                      onClick={() =>
                        setSaldoAbierto((cur) => (cur === s.id ? null : s.id))
                      }
                      className="flex items-center gap-2 rounded-full bg-danger/10 px-3 py-1.5 text-[12px] font-bold text-danger hover:bg-danger/15"
                    >
                      <span>
                        Debe {mesesDebe.length} mes{mesesDebe.length === 1 ? "" : "es"}
                        {saldoPesos ? ` ≈ ${montoAR(saldoPesos)}` : ""}
                      </span>
                      <span className="text-[10px]">
                        {saldoAbierto === s.id ? "▲" : "▼"}
                      </span>
                    </button>
                    {saldoAbierto === s.id && (
                      <ul className="mt-1.5 flex flex-wrap gap-1.5">
                        {mesesDebe.map((m) => (
                          <li
                            key={`${m.anio}-${m.mes}`}
                            className={[
                              "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                              m.estado === "parcial"
                                ? "bg-warn/15 text-warn"
                                : "bg-danger/15 text-danger",
                            ].join(" ")}
                          >
                            {mesLabel(m.anio, m.mes)}
                            {m.estado === "parcial" ? " · parcial" : ""}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {/* Plan (define el precio de la cuota) */}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-[12px] font-semibold text-muted">
                    Plan
                  </span>
                  <select
                    value={s.plan_id ?? ""}
                    onChange={(e) => cambiarPlan(s.id, e.target.value)}
                    className="rounded-lg border border-line bg-surface-2 px-2 py-1 text-[12px] text-ink outline-none focus:border-accent"
                  >
                    <option value="">Sin plan</option>
                    {planes
                      .filter((p) => p.activo || p.id === s.plan_id)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {planLabel(p)}
                        </option>
                      ))}
                  </select>
                  {s.plan && (
                    <span className="text-[12px] text-muted">
                      cuota {precioAR(s.plan.precio)}/mes
                    </span>
                  )}
                </div>

                {/* Email (lo usa MercadoPago como pagador) */}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="text-[12px] font-semibold text-muted">
                    Email
                  </span>
                  {editEmailId === s.id ? (
                    <>
                      <input
                        type="email"
                        value={emailVal}
                        onChange={(e) => setEmailVal(e.target.value)}
                        placeholder="email@ejemplo.com"
                        className="min-w-0 flex-1 rounded-lg border border-line bg-surface-2 px-2 py-1 text-[12px] text-ink outline-none focus:border-accent"
                      />
                      <button
                        onClick={() => guardarEmail(s)}
                        className="rounded-full bg-ink px-3 py-1 text-[11px] font-bold text-white"
                      >
                        Guardar
                      </button>
                      <button
                        onClick={() => setEditEmailId(null)}
                        className="text-[11px] font-semibold text-muted"
                      >
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-[12px] text-muted">
                        {s.email || "—"}
                      </span>
                      <button
                        onClick={() => {
                          setEditEmailId(s.id);
                          setEmailVal(s.email ?? "");
                        }}
                        className="text-[11px] font-semibold text-accent hover:brightness-90"
                      >
                        Editar
                      </button>
                    </>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button
                    onClick={() => registrarPago(s)}
                    title={
                      prop
                        ? `1er pago proporcional: ${prop.diasRestantes} de ${prop.diasMes} días`
                        : "Registra el pago; la cuota vence el 10 del mes que viene"
                    }
                    className="rounded-full bg-accent px-3 py-1.5 text-[12px] font-bold text-white hover:brightness-95"
                  >
                    {prop
                      ? `Registrar 1er pago · ${montoAR(prop.monto)}`
                      : "Registrar pago"}
                  </button>
                  <button
                    onClick={() =>
                      pagoManualId === s.id ? setPagoManualId(null) : abrirPagoManual(s)
                    }
                    className="rounded-full border border-line px-3 py-1.5 text-[12px] font-semibold text-ink hover:border-faint"
                  >
                    Pago manual
                  </button>
                  <button
                    onClick={() => togglePagos(s)}
                    className="rounded-full border border-line px-3 py-1.5 text-[12px] font-semibold text-muted hover:border-faint hover:text-ink"
                  >
                    {pagosAbierto === s.id ? "Ocultar pagos" : "Ver pagos"}
                  </button>
                  <div className="flex rounded-full bg-surface-2 p-0.5">
                    {(["efectivo", "mercadopago"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setMetodo(s, m)}
                        className={[
                          "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                          s.metodo_pago === m ? "bg-ink text-white" : "text-muted",
                        ].join(" ")}
                      >
                        {m === "efectivo" ? "Efectivo" : "MercadoPago"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pago manual: monto/método/fecha/vencimiento a mano. Para
                    quienes pagan distinto a lo que hay cargado en el sistema. */}
                {pagoManualId === s.id && (
                  <div className="mt-2 space-y-2 rounded-lg border border-line bg-surface-2 p-3">
                    <div className="flex flex-wrap gap-2">
                      <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted">
                        Monto
                        <input
                          value={pmMonto}
                          onChange={(e) => setPmMonto(e.target.value)}
                          inputMode="numeric"
                          placeholder="$"
                          className="w-28 rounded-lg border border-line bg-surface px-2 py-1.5 text-[13px] text-ink outline-none focus:border-accent"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted">
                        Método
                        <select
                          value={pmMetodo}
                          onChange={(e) => setPmMetodo(e.target.value as MetodoPago)}
                          className="rounded-lg border border-line bg-surface px-2 py-1.5 text-[13px] text-ink outline-none focus:border-accent"
                        >
                          {METODOS_PAGO.map((m) => (
                            <option key={m.key} value={m.key}>
                              {m.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    {/* Atajos de monto: proporcional (si arranca ahora) o cuota
                        completa del plan. */}
                    {s.plan && (
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        {prop && (
                          <button
                            type="button"
                            onClick={() => setPmMonto(String(prop.monto))}
                            className="rounded-full bg-accent-soft px-2.5 py-1 font-bold text-accent"
                          >
                            Proporcional {montoAR(prop.monto)} · {prop.diasRestantes}/
                            {prop.diasMes} días
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setPmMonto(String(s.plan!.precio))}
                          className="rounded-full bg-surface px-2.5 py-1 font-semibold text-muted hover:text-ink"
                        >
                          Cuota completa {montoAR(s.plan.precio)}
                        </button>
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted">
                        Fecha del pago
                        <input
                          type="date"
                          value={pmFecha}
                          onChange={(e) => setPmFecha(e.target.value)}
                          className="rounded-lg border border-line bg-surface px-2 py-1.5 text-[13px] text-ink outline-none focus:border-accent"
                        />
                      </label>
                      <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted">
                        Cuota paga hasta
                        <input
                          type="date"
                          value={pmHasta}
                          onChange={(e) => setPmHasta(e.target.value)}
                          className="rounded-lg border border-line bg-surface px-2 py-1.5 text-[13px] text-ink outline-none focus:border-accent"
                        />
                      </label>
                    </div>
                    <input
                      value={pmNota}
                      onChange={(e) => setPmNota(e.target.value)}
                      placeholder="Nota (opcional): ej. pagó 2 semanas, seña…"
                      className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-[13px] text-ink outline-none focus:border-accent"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => guardarPagoManual(s)}
                        disabled={pmGuardando}
                        className="rounded-full bg-accent px-4 py-1.5 text-[12px] font-bold text-white disabled:opacity-50"
                      >
                        {pmGuardando ? "Guardando…" : "Guardar pago"}
                      </button>
                      <button
                        onClick={() => setPagoManualId(null)}
                        className="text-[12px] font-semibold text-muted"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {/* Registro de pagos del socio. */}
                {pagosAbierto === s.id && (
                  <div className="mt-2 rounded-lg border border-line bg-surface-2 p-3">
                    <div className="mb-1.5 text-[12px] font-bold text-ink">
                      Registro de pagos
                    </div>
                    {cargandoPagos && !pagosPorSocio[s.id] ? (
                      <p className="text-[12px] text-muted">Cargando…</p>
                    ) : (pagosPorSocio[s.id]?.length ?? 0) === 0 ? (
                      <p className="text-[12px] text-muted">Todavía no hay pagos.</p>
                    ) : (
                      <ul className="divide-y divide-line">
                        {pagosPorSocio[s.id]?.map((p) => (
                          <li
                            key={p.id}
                            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5"
                          >
                            <div className="flex items-baseline gap-2">
                              <span className="text-[13px] font-semibold text-ink">
                                {fechaCorta(p.fecha)}
                              </span>
                              <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-bold text-muted">
                                {metodoLabel(p.metodo)}
                              </span>
                              {p.nota && (
                                <span className="text-[11px] text-muted">{p.nota}</span>
                              )}
                            </div>
                            <div className="flex items-baseline gap-2">
                              <span className="text-[13px] font-bold text-ink">
                                {montoAR(p.monto)}
                              </span>
                              {p.cuota_hasta && (
                                <span className="text-[11px] text-muted">
                                  → {fechaCorta(p.cuota_hasta)}
                                </span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
                {/* Acceso: link de invitación para crear cuenta */}
                <div className="mt-2 border-t border-line pt-2">
                  {s.auth_user_id ? (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[12px] font-semibold text-ok">
                          ✓ Tiene cuenta de alumno
                        </span>
                        <button
                          onClick={() => recuperar(s)}
                          className="text-[12px] font-semibold text-accent hover:brightness-90"
                        >
                          {recuperLinks[s.id]
                            ? "Nuevo link de recuperación"
                            : "Recuperar contraseña"}
                        </button>
                        {copiado === s.id && (
                          <span className="text-[11px] font-semibold text-ok">
                            ¡Copiado!
                          </span>
                        )}
                      </div>
                      {recuperLinks[s.id] && (
                        <div className="flex items-center gap-2">
                          <input
                            readOnly
                            value={recuperLinks[s.id]}
                            onFocus={(e) => e.currentTarget.select()}
                            className="min-w-0 flex-1 truncate rounded-lg bg-surface-2 px-2 py-1.5 text-[11px] text-muted"
                          />
                          <button
                            onClick={() => copiar(s.id, recuperLinks[s.id])}
                            className="shrink-0 rounded-full bg-ink px-3 py-1 text-[11px] font-bold text-white"
                          >
                            Copiar
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => invitar(s)}
                          className="text-[12px] font-semibold text-accent hover:brightness-90"
                        >
                          {inviteLinks[s.id]
                            ? "Generar nuevo link de acceso"
                            : "Generar link de acceso"}
                        </button>
                        {copiado === s.id && (
                          <span className="text-[11px] font-semibold text-ok">
                            ¡Copiado!
                          </span>
                        )}
                        {!inviteLinks[s.id] && s.invite_token && (
                          <span className="text-[11px] text-muted">
                            · invitación pendiente
                          </span>
                        )}
                      </div>
                      {inviteLinks[s.id] && (
                        <div className="flex items-center gap-2">
                          <input
                            readOnly
                            value={inviteLinks[s.id]}
                            onFocus={(e) => e.currentTarget.select()}
                            className="min-w-0 flex-1 truncate rounded-lg bg-surface-2 px-2 py-1.5 text-[11px] text-muted"
                          />
                          <button
                            onClick={() => copiar(s.id, inviteLinks[s.id])}
                            className="shrink-0 rounded-full bg-ink px-3 py-1 text-[11px] font-bold text-white"
                          >
                            Copiar
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Tab Rutinas: el staff arma la rutina estructurada de un alumno.
// ------------------------------------------------------------
function nuevoEjercicio(): RutinaDia["ejercicios"][number] {
  return {
    id: crypto.randomUUID(),
    nombre: "",
    series: "",
    reps: "",
    peso: "",
    descanso: "",
    nota: "",
  };
}

function Rutinas({ tenantId }: { tenantId: string }) {
  const sb = useMemo(() => createClient(), []);
  const [alumnos, setAlumnos] = useState<GymSocio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const [sel, setSel] = useState<GymSocio | null>(null);
  const [nombre, setNombre] = useState("Rutina");
  const [dias, setDias] = useState<RutinaDia[]>([]);
  const [abriendo, setAbriendo] = useState(false);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setAlumnos(await getGymAlumnos(sb));
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo cargar.");
      } finally {
        setCargando(false);
      }
    })();
  }, [sb]);

  async function elegir(a: GymSocio) {
    setError(null);
    setOkMsg(null);
    setAbriendo(true);
    try {
      const r = await getRutinaAlumno(sb, a.id);
      setNombre(r?.nombre ?? "Rutina");
      setDias(r?.dias ?? []);
      setSel(a);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir la rutina.");
    } finally {
      setAbriendo(false);
    }
  }

  function volver() {
    setSel(null);
    setDias([]);
    setNombre("Rutina");
    setOkMsg(null);
    setError(null);
  }

  const setDia = (id: string, patch: Partial<RutinaDia>) =>
    setDias((ds) => ds.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  const addDia = () =>
    setDias((ds) => [
      ...ds,
      { id: crypto.randomUUID(), nombre: `Día ${ds.length + 1}`, ejercicios: [] },
    ]);
  const delDia = (id: string) => setDias((ds) => ds.filter((d) => d.id !== id));
  const addEj = (diaId: string) =>
    setDias((ds) =>
      ds.map((d) =>
        d.id === diaId ? { ...d, ejercicios: [...d.ejercicios, nuevoEjercicio()] } : d,
      ),
    );
  const delEj = (diaId: string, ejId: string) =>
    setDias((ds) =>
      ds.map((d) =>
        d.id === diaId
          ? { ...d, ejercicios: d.ejercicios.filter((e) => e.id !== ejId) }
          : d,
      ),
    );
  const setEj = (
    diaId: string,
    ejId: string,
    campo: keyof RutinaDia["ejercicios"][number],
    valor: string,
  ) =>
    setDias((ds) =>
      ds.map((d) =>
        d.id === diaId
          ? {
              ...d,
              ejercicios: d.ejercicios.map((e) =>
                e.id === ejId ? { ...e, [campo]: valor } : e,
              ),
            }
          : d,
      ),
    );

  async function guardar() {
    if (!sel) return;
    setError(null);
    setOkMsg(null);
    setGuardando(true);
    try {
      await guardarRutinaAlumno(sb, {
        tenantId,
        alumnoId: sel.id,
        nombre,
        dias,
      });
      setOkMsg("Rutina guardada. El alumno ya la ve en su cuenta.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  }

  const input =
    "rounded-lg border border-line bg-surface-2 px-3 py-2 text-[14px] text-ink outline-none focus:border-accent";
  const mini =
    "min-w-0 rounded-lg border border-line bg-surface px-2 py-1.5 text-[13px] text-ink outline-none focus:border-accent";

  // --- Selección de alumno ---
  if (!sel) {
    // En prueba: solo se puede armar la rutina del alumno habilitado.
    const habilitados = alumnos.filter((a) => rutinaHabilitadaParaAlumno(a.telefono));
    const filtrados = habilitados.filter(
      (a) =>
        !q.trim() ||
        a.nombre.toLowerCase().includes(q.toLowerCase()) ||
        (a.telefono ?? "").includes(q),
    );
    return (
      <div className="space-y-3">
        <p className="text-[13px] text-muted">
          Elegí un alumno para armar o editar su rutina.
        </p>
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-[12px] text-muted">
          En prueba: por ahora solo disponible para el alumno de prueba.
        </p>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre o WhatsApp…"
          className={`${input} w-full`}
        />
        {error && <p className="text-[13px] text-danger">{error}</p>}
        {cargando ? (
          <p className="py-8 text-center text-sm text-muted">Cargando…</p>
        ) : filtrados.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted">Sin resultados.</p>
        ) : (
          <div className="space-y-2">
            {filtrados.slice(0, 40).map((a) => (
              <button
                key={a.id}
                onClick={() => elegir(a)}
                disabled={abriendo}
                className="flex w-full items-center justify-between gap-3 rounded-card border border-line bg-surface p-3 text-left shadow-card hover:border-accent disabled:opacity-50"
              >
                <div>
                  <div className="text-[14px] font-bold">{a.nombre}</div>
                  <div className="text-[12px] text-muted">{a.telefono ?? "sin WhatsApp"}</div>
                </div>
                <span className="shrink-0 text-[12px] font-semibold text-accent">
                  Rutina →
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  // --- Editor de rutina ---
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <button
          onClick={volver}
          className="text-[13px] font-semibold text-accent hover:brightness-90"
        >
          ← Volver
        </button>
        <span className="text-[13px] font-bold">{sel.nombre}</span>
      </div>

      <div className="space-y-2 rounded-panel border border-line bg-surface p-4 shadow-card">
        <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted">
          Nombre de la rutina
          <input
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            className={input}
          />
        </label>
      </div>

      {dias.map((d, i) => (
        <div
          key={d.id}
          className="space-y-3 rounded-panel border border-line bg-surface p-4 shadow-card"
        >
          <div className="flex items-center gap-2">
            <input
              value={d.nombre}
              onChange={(e) => setDia(d.id, { nombre: e.target.value })}
              placeholder={`Día ${i + 1}`}
              className={`${input} min-w-0 flex-1 font-bold`}
            />
            <button
              onClick={() => delDia(d.id)}
              className="shrink-0 text-[12px] font-semibold text-muted hover:text-danger"
            >
              Quitar día
            </button>
          </div>

          {d.ejercicios.map((e) => (
            <div key={e.id} className="space-y-1.5 rounded-card border border-line bg-surface-2 p-2.5">
              <div className="flex items-center gap-2">
                <input
                  value={e.nombre}
                  onChange={(ev) => setEj(d.id, e.id, "nombre", ev.target.value)}
                  placeholder="Ejercicio (ej. Sentadilla)"
                  className={`${mini} flex-1 font-semibold`}
                />
                <button
                  onClick={() => delEj(d.id, e.id)}
                  aria-label="Quitar ejercicio"
                  className="shrink-0 px-1 text-[13px] text-faint hover:text-danger"
                >
                  ✕
                </button>
              </div>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                <input
                  value={e.series}
                  onChange={(ev) => setEj(d.id, e.id, "series", ev.target.value)}
                  placeholder="Series"
                  className={mini}
                />
                <input
                  value={e.reps}
                  onChange={(ev) => setEj(d.id, e.id, "reps", ev.target.value)}
                  placeholder="Reps"
                  className={mini}
                />
                <input
                  value={e.peso}
                  onChange={(ev) => setEj(d.id, e.id, "peso", ev.target.value)}
                  placeholder="Peso"
                  className={mini}
                />
                <input
                  value={e.descanso}
                  onChange={(ev) => setEj(d.id, e.id, "descanso", ev.target.value)}
                  placeholder="Descanso"
                  className={mini}
                />
              </div>
              <input
                value={e.nota}
                onChange={(ev) => setEj(d.id, e.id, "nota", ev.target.value)}
                placeholder="Nota (opcional)"
                className={`${mini} w-full`}
              />
            </div>
          ))}

          <button
            onClick={() => addEj(d.id)}
            className="text-[13px] font-semibold text-accent hover:brightness-90"
          >
            + Agregar ejercicio
          </button>
        </div>
      ))}

      <button
        onClick={addDia}
        className="w-full rounded-panel border border-dashed border-line py-3 text-[13px] font-semibold text-muted hover:border-accent hover:text-ink"
      >
        + Agregar día
      </button>

      {error && <p className="text-[13px] text-danger">{error}</p>}
      {okMsg && <p className="text-[13px] text-ok">{okMsg}</p>}

      <div className="sticky bottom-2 flex justify-end">
        <button
          onClick={guardar}
          disabled={guardando}
          className="rounded-full bg-accent px-6 py-2.5 text-[14px] font-bold text-white shadow-pop disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Guardar rutina"}
        </button>
      </div>
    </div>
  );
}
