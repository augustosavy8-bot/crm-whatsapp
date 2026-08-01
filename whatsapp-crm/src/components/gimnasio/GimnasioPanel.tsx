"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LuBell } from "react-icons/lu";
import { createClient } from "@/lib/supabase/client";
import { Toast } from "@/components/turnos/Toast";
import {
  crearGymHorario,
  getGymAlumnos,
  getGymHorarios,
  getGymOcupacion,
  getPlanes,
  setGymHorarioActivo,
  updateGymSocio,
  type GymAlumnoEnClase,
  type GymHorario,
  type GymOcupacionHorario,
  type GymPlan,
  type GymSocio,
} from "@/lib/gymCupoAdmin";
import { hoyISOArgentina, sumarDiasISO } from "@/lib/tz";
import { normalizeArPhone } from "@/lib/phone";

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

export default function GimnasioPanel({ tenantId }: { tenantId: string }) {
  const [tab, setTab] = useState<Tab>("agenda");

  return (
    <div className="space-y-4">
      <div className="flex rounded-full bg-surface-2 p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={[
              "flex-1 rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors",
              tab === t.key ? "bg-ink text-white" : "text-muted hover:text-ink",
            ].join(" ")}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "agenda" && <Agenda />}
      {tab === "socios" && <Socios tenantId={tenantId} />}
      {tab === "planes" && <Planes />}
      {tab === "horarios" && <Horarios tenantId={tenantId} />}
    </div>
  );
}

// ------------------------------------------------------------
// Planes (cuota por días/semana). El admin crea y edita precios; al cambiar un
// precio, la API actualiza el débito automático de los socios ya adheridos.
// ------------------------------------------------------------
function Planes() {
  const sb = useMemo(() => createClient(), []);
  const [planes, setPlanes] = useState<GymPlan[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

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
    setAviso(null);
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
    setAviso(null);
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
    if (data.actualizados > 0 || data.fallidos > 0) {
      setAviso(
        `Débito automático: ${data.actualizados} actualizado(s)` +
          (data.fallidos ? `, ${data.fallidos} con error` : "") +
          ".",
      );
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
      {aviso && <p className="text-[13px] text-ok">{aviso}</p>}

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
function Agenda() {
  const sb = useMemo(() => createClient(), []);
  const [fecha, setFecha] = useState(hoyISOArgentina);
  const [data, setData] = useState<GymOcupacionHorario[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [agregarA, setAgregarA] = useState<string | null>(null); // horario_id
  const [novedad, setNovedad] = useState(false); // campana con aviso
  const [aviso, setAviso] = useState<string | null>(null); // toast realtime

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

// ------------------------------------------------------------
// Tab Socios: padrón + estado de cuota
// ------------------------------------------------------------
function sumarMesISO(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString().slice(0, 10);
}

function fechaCorta(iso: string): string {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).format(new Date(`${iso}T12:00:00Z`));
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
  // Links de adhesión MP generados en esta sesión, por socio.
  const [mpLinks, setMpLinks] = useState<Record<string, string>>({});
  // Links de invitación (crear cuenta) generados en esta sesión, por socio.
  const [inviteLinks, setInviteLinks] = useState<Record<string, string>>({});
  // Links de recuperación de contraseña generados en esta sesión, por socio.
  const [recuperLinks, setRecuperLinks] = useState<Record<string, string>>({});
  const [copiado, setCopiado] = useState<string | null>(null);
  // Edición inline del email por socio (necesario para MercadoPago).
  const [editEmailId, setEditEmailId] = useState<string | null>(null);
  const [emailVal, setEmailVal] = useState("");

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [s, p] = await Promise.all([getGymAlumnos(sb), getPlanes(sb)]);
      setSocios(s);
      setPlanes(p);
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
    if (!nombre.trim() || !telefono.trim()) {
      setError("Nombre y WhatsApp obligatorios.");
      return;
    }
    const tel = normalizeArPhone(telefono.trim());
    if (tel.length < 10) {
      setError("WhatsApp inválido.");
      return;
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

  async function registrarPago(s: GymSocio) {
    // Extiende un mes: desde su vencimiento si sigue vigente, o desde hoy.
    const hoy = hoyISOArgentina();
    const base = s.cuota_hasta && s.cuota_hasta > hoy ? s.cuota_hasta : hoy;
    try {
      await updateGymSocio(sb, s.id, { es_socio: true, cuota_hasta: sumarMesISO(base) });
      cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo registrar el pago.");
    }
  }

  async function setMetodo(s: GymSocio, metodo: "efectivo" | "mercadopago") {
    try {
      await updateGymSocio(sb, s.id, { metodo_pago: metodo });
      cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo actualizar.");
    }
  }

  // Genera el link de adhesión al débito automático de MercadoPago para el
  // socio. Requiere email (si no lo tiene, lo pedimos). Si MP no está
  // configurado todavía, la ruta devuelve 503 con un mensaje claro.
  async function adherirMp(s: GymSocio) {
    setError(null);
    let email = s.email ?? "";
    if (!email) {
      email = window.prompt(`Email de ${s.nombre} para MercadoPago:`)?.trim() ?? "";
      if (!email) return;
    }
    const res = await fetch("/api/gym/mp/adherir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alumnoId: s.id, email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error || "No se pudo generar la adhesión.");
      return;
    }
    if (data.initPoint) {
      setMpLinks((m) => ({ ...m, [s.id]: data.initPoint }));
    }
    cargar();
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
    const link = `${window.location.origin}/registro?token=${data.token}`;
    setInviteLinks((m) => ({ ...m, [s.id]: link }));
    await copiar(s.id, link);
    cargar();
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
      s.telefono.includes(q),
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
            placeholder="WhatsApp"
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
      </div>

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

                {/* Plan (define el precio de la cuota / débito automático) */}
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
                    className="rounded-full bg-accent px-3 py-1.5 text-[12px] font-bold text-white hover:brightness-95"
                  >
                    Registrar pago (+1 mes)
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
                {s.metodo_pago === "mercadopago" && (
                  <div className="mt-2 border-t border-line pt-2">
                    {s.mp_estado === "authorized" ? (
                      <span className="text-[12px] font-semibold text-ok">
                        ✓ Débito automático activo
                      </span>
                    ) : (
                      <div className="space-y-2">
                        <button
                          onClick={() => adherirMp(s)}
                          className="text-[12px] font-semibold text-accent hover:brightness-90"
                        >
                          Generar link de adhesión (débito automático)
                        </button>
                        {mpLinks[s.id] && (
                          <a
                            href={mpLinks[s.id]}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block truncate rounded-lg bg-surface-2 px-2 py-1.5 text-[11px] text-accent underline"
                          >
                            {mpLinks[s.id]}
                          </a>
                        )}
                        {s.mp_estado && s.mp_estado !== "authorized" && (
                          <p className="text-[11px] text-muted">
                            Estado MP: {s.mp_estado}
                          </p>
                        )}
                      </div>
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
