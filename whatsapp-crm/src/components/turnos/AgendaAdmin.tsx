"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  pointerWithin,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { createClient } from "@/lib/supabase/client";
import { getTurnosEnRango } from "@/lib/turnos";
import {
  AR_TZ,
  arLocalToUtc,
  arDateKey,
  formatArHora,
  formatArFecha,
  hoyISOArgentina,
  sumarDiasISO,
  diaSemanaISO,
} from "@/lib/tz";
import { ESTADOS, ESTADO_LABEL, ESTADO_COLOR } from "@/lib/turnoEstado";
import { confirmarTurnoApi, waReprogramadoUrl } from "@/lib/turnosAcciones";
import { Toast, type ToastState } from "./Toast";
import type {
  TurnoConDetalle,
  TurnoEstado,
  ProfesionalHorario,
  ProfesionalBloqueo,
} from "@/lib/types";

// Estilo de la tarjeta en la grilla, por estado (borde izquierdo de color).
const CARD_ACCENT: Record<TurnoEstado, string> = {
  pendiente: "border-l-warn bg-warn/5",
  confirmado: "border-l-ok bg-ok/5",
  cancelado: "border-l-danger bg-surface-2",
  atendido: "border-l-muted bg-surface-2",
  ausente: "border-l-danger bg-danger/5",
};

type Vista = "dia" | "semana";

// --- Grilla ---
const SLOT_MIN = 30; // paso de la grilla (snap): media hora
const SLOT_PX = 48; // alto de cada slot de 30' en px
const DEFAULT_START_H = 8;
const DEFAULT_END_H = 20;
const MOSTRAR_CANCELADOS_KEY = "foko:agenda-mostrar-cancelados";

// --- Helpers de fecha ---
function lunesDe(iso: string): string {
  const dow = diaSemanaISO(iso);
  const offset = dow === 0 ? -6 : 1 - dow;
  return sumarDiasISO(iso, offset);
}
function tituloDia(iso: string, corto = false): string {
  const d = new Date(`${iso}T12:00:00Z`);
  const hoy = hoyISOArgentina();
  const prefijo = iso === hoy ? "Hoy · " : "";
  return (
    prefijo +
    new Intl.DateTimeFormat("es-AR", {
      timeZone: AR_TZ,
      weekday: corto ? "short" : "long",
      day: "2-digit",
      month: corto ? undefined : "long",
    }).format(d)
  );
}

// Minutos desde medianoche (hora AR) de un instante UTC.
function minutosDelDiaAR(iso: string): number {
  const hhmm = new Date(iso).toLocaleTimeString("es-AR", {
    timeZone: AR_TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const [hh, mm] = hhmm.split(":").map(Number);
  return (hh % 24) * 60 + mm;
}
function minutosAHHMM(min: number): string {
  const hh = Math.floor(min / 60);
  const mm = min % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
// "HH:MM:SS" | "HH:MM" -> minutos.
function horaAMin(t: string): number {
  const [hh, mm] = t.split(":").map(Number);
  return hh * 60 + (mm ?? 0);
}

export default function AgendaAdmin({
  profesionalId,
  horarios,
  bloqueos,
}: {
  profesionalId: string;
  horarios: ProfesionalHorario[];
  bloqueos: ProfesionalBloqueo[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [vista, setVista] = useState<Vista>("dia");
  const [ancla, setAncla] = useState<string>(hoyISOArgentina());
  const [turnos, setTurnos] = useState<TurnoConDetalle[]>([]);
  const [cargando, setCargando] = useState(true);
  const [mostrarCancelados, setMostrarCancelados] = useState(false);

  // Interacción
  const [activeId, setActiveId] = useState<string | null>(null);
  const [pendiente, setPendiente] = useState<MovimientoPendiente | null>(null);
  const [detalle, setDetalle] = useState<TurnoConDetalle | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  // Evita que el "click" que dispara dnd-kit al soltar abra el detalle.
  const arrastroReciente = useRef(false);
  // Contenedor scrolleable de la grilla (para el auto-scroll a la hora actual).
  const scrollRef = useRef<HTMLDivElement>(null);

  const desde = vista === "dia" ? ancla : lunesDe(ancla);
  const dias = vista === "dia" ? 1 : 7;
  const hasta = sumarDiasISO(desde, dias);
  const columnas = useMemo(
    () => Array.from({ length: dias }, (_, i) => sumarDiasISO(desde, i)),
    [desde, dias],
  );

  // Preferencia de "mostrar cancelados": recordada en la sesión.
  useEffect(() => {
    try {
      setMostrarCancelados(
        sessionStorage.getItem(MOSTRAR_CANCELADOS_KEY) === "1",
      );
    } catch {}
  }, []);
  function toggleCancelados() {
    setMostrarCancelados((v) => {
      const next = !v;
      try {
        sessionStorage.setItem(MOSTRAR_CANCELADOS_KEY, next ? "1" : "0");
      } catch {}
      return next;
    });
  }

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

  // --- Rango horario visible: primera hora con disponibilidad del día -> última. ---
  const [startMin, endMin] = useMemo(() => {
    // Solo las franjas de los días visibles (y del profesional filtrado): la
    // grilla arranca en la primera hora con disponibilidad y termina en la
    // última, sin filas muertas de madrugada.
    const diasVisibles = new Set(columnas.map(diaSemanaISO));
    const inicios: number[] = [];
    const fines: number[] = [];
    for (const h of horarios) {
      if (profesionalId && h.profesional_id !== profesionalId) continue;
      if (!diasVisibles.has(h.dia_semana)) continue;
      inicios.push(horaAMin(h.hora_inicio));
      fines.push(horaAMin(h.hora_fin));
    }
    // Los turnos existentes siempre entran, aunque caigan fuera de la franja.
    for (const t of turnos) {
      const m = minutosDelDiaAR(t.fecha_hora);
      inicios.push(m);
      fines.push(m + (t.duracion_min || SLOT_MIN));
    }
    if (inicios.length === 0) return [DEFAULT_START_H * 60, DEFAULT_END_H * 60];
    const ini = Math.max(0, Math.floor(Math.min(...inicios) / 60) * 60);
    let fin = Math.min(24 * 60, Math.ceil(Math.max(...fines) / 60) * 60);
    if (fin <= ini) fin = ini + 60;
    return [ini, fin];
  }, [horarios, turnos, columnas, profesionalId]);

  const slots = useMemo(() => {
    const out: number[] = [];
    for (let m = startMin; m < endMin; m += SLOT_MIN) out.push(m);
    return out;
  }, [startMin, endMin]);
  const totalPx = slots.length * SLOT_PX;

  // Turnos visibles (según toggle de cancelados) agrupados por día AR.
  const porDia = useMemo(() => {
    const map = new Map<string, TurnoConDetalle[]>();
    for (const t of turnos) {
      if (!mostrarCancelados && t.estado === "cancelado") continue;
      const k = arDateKey(t.fecha_hora);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }
    return map;
  }, [turnos, mostrarCancelados]);

  // Auto-scroll a la hora actual (o al primer turno si es más temprano) cuando
  // la vista incluye el día de hoy.
  useEffect(() => {
    if (cargando) return;
    const hoy = hoyISOArgentina();
    if (!columnas.includes(hoy)) return;
    const el = scrollRef.current;
    if (!el) return;
    const nowMin = minutosDelDiaAR(new Date().toISOString());
    const turnosHoy = porDia.get(hoy) ?? [];
    const earliest = turnosHoy.length
      ? Math.min(...turnosHoy.map((t) => minutosDelDiaAR(t.fecha_hora)))
      : Infinity;
    let target = Math.min(nowMin, earliest);
    target = Math.max(startMin, Math.min(target, endMin));
    el.scrollTop = Math.max(0, ((target - startMin) / SLOT_MIN) * SLOT_PX - 12);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cargando, ancla, vista, startMin]);

  const activeTurno = activeId
    ? turnos.find((t) => t.id === activeId) ?? null
    : null;

  // --- dnd-kit: mouse directo (8px) + touch long-press (300ms) ---
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 300, tolerance: 6 },
    }),
  );

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      try {
        navigator.vibrate(15);
      } catch {}
    }
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    arrastroReciente.current = true;
    setTimeout(() => (arrastroReciente.current = false), 250);

    const over = e.over;
    if (!over) return;
    const data = over.data.current as
      | { dayISO: string; minutes: number }
      | undefined;
    if (!data) return;

    const turno = turnos.find((t) => t.id === String(e.active.id));
    if (!turno) return;

    const nuevaFecha = data.dayISO;
    const nuevaHora = minutosAHHMM(data.minutes);
    const mismoDia = arDateKey(turno.fecha_hora) === nuevaFecha;
    const mismaHora = minutosDelDiaAR(turno.fecha_hora) === data.minutes;
    if (mismoDia && mismaHora) return;

    setPendiente({
      turno,
      nuevaFecha,
      nuevaHora,
      nuevoUtc: arLocalToUtc(nuevaFecha, nuevaHora),
      aviso: avisoDisponibilidad(turno, nuevaFecha, data.minutes),
    });
  }

  // --- Aviso: destino fuera del horario habitual o sobre un bloqueo ---
  function avisoDisponibilidad(
    turno: TurnoConDetalle,
    dayISO: string,
    minutes: number,
  ): string | null {
    const profId = turno.profesional_id;
    if (!profId) return null;
    const dur = turno.duracion_min || SLOT_MIN;
    const finMin = minutes + dur;
    const nombreProf = turno.profesional?.name ?? "el profesional";

    const startUtc = arLocalToUtc(dayISO, minutosAHHMM(minutes));
    const endUtc = new Date(
      new Date(startUtc).getTime() + dur * 60_000,
    ).toISOString();
    const enBloqueo = bloqueos.some(
      (b) =>
        b.profesional_id === profId && startUtc < b.hasta && endUtc > b.desde,
    );
    if (enBloqueo) return `⚠ Cae sobre un bloqueo de ${nombreProf}`;

    const dow = diaSemanaISO(dayISO);
    const franjas = horarios.filter(
      (h) => h.profesional_id === profId && h.dia_semana === dow,
    );
    const dentro = franjas.some(
      (f) => minutes >= horaAMin(f.hora_inicio) && finMin <= horaAMin(f.hora_fin),
    );
    if (!dentro) return `⚠ Fuera del horario habitual de ${nombreProf}`;

    return null;
  }

  // --- Guardado optimista con rollback ---
  async function confirmarMovimiento() {
    if (!pendiente) return;
    const { turno, nuevoUtc } = pendiente;
    setPendiente(null);

    const prev = turnos;
    setTurnos((ts) =>
      ts.map((t) => (t.id === turno.id ? { ...t, fecha_hora: nuevoUtc } : t)),
    );

    const { data, error } = await supabase
      .from("turnos")
      .update({ fecha_hora: nuevoUtc })
      .eq("id", turno.id)
      .select("id");

    if (error) {
      setTurnos(prev); // rollback
      setToast({
        tipo: "error",
        mensaje:
          error.code === "23P01"
            ? "Ese horario ya está ocupado."
            : "No se pudo mover el turno.",
      });
      return;
    }
    // Sin error pero 0 filas = la RLS lo rechazó (turno ajeno): mismo aviso.
    if (!data || data.length === 0) {
      setTurnos(prev);
      setToast({ tipo: "error", mensaje: "No se pudo mover el turno." });
      return;
    }

    // Éxito: ofrecer avisar por WhatsApp.
    const waUrl = waReprogramadoUrl(turno, nuevoUtc);
    setToast({
      tipo: "ok",
      mensaje: "Turno reprogramado.",
      accion: waUrl
        ? {
            label: "Avisar por WhatsApp",
            onClick: () => window.open(waUrl, "_blank", "noopener,noreferrer"),
          }
        : undefined,
    });
  }

  // --- Cambio de estado (se mantiene el flujo de confirmar por WhatsApp) ---
  async function cambiarEstado(id: string, estado: TurnoEstado) {
    if (estado === "confirmado") {
      const r = await confirmarTurnoApi(id);
      if (!r.ok) {
        setToast({ tipo: "error", mensaje: r.error ?? "No se pudo confirmar." });
        return;
      }
      if (r.warning) setToast({ tipo: "error", mensaje: r.warning });
      setDetalle(null);
      cargar();
      return;
    }

    const { error } = await supabase.from("turnos").update({ estado }).eq("id", id);
    if (error) {
      setToast({
        tipo: "error",
        mensaje:
          error.code === "23P01"
            ? "Se superpone con otro turno de ese profesional."
            : "No se pudo actualizar el turno.",
      });
      return;
    }
    setDetalle(null);
    cargar();
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
            onClick={() => setAncla(sumarDiasISO(ancla, -dias))}
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
            onClick={() => setAncla(sumarDiasISO(ancla, dias))}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-line bg-surface text-muted hover:text-ink"
            aria-label="Siguiente"
          >
            ›
          </button>
        </div>

        <button
          onClick={toggleCancelados}
          title="Mostrar u ocultar los turnos cancelados"
          className={`ml-auto rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
            mostrarCancelados
              ? "border-danger/30 bg-danger/10 text-danger"
              : "border-line bg-surface text-muted hover:text-ink"
          }`}
        >
          {mostrarCancelados ? "Ocultar cancelados" : "Mostrar cancelados"}
        </button>
      </div>

      {cargando && (
        <div className="rounded-panel border border-line bg-surface p-8 text-center text-sm text-muted shadow-card">
          Cargando agenda…
        </div>
      )}

      {/* Grilla */}
      {!cargando && (
        <DndContext
          sensors={sensors}
          collisionDetection={pointerWithin}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          onDragCancel={() => setActiveId(null)}
        >
          <div className="rounded-panel border border-line bg-surface shadow-card">
            <div ref={scrollRef} className="max-h-[70vh] overflow-auto">
              <div
                className="grid"
                style={{
                  gridTemplateColumns: `3rem repeat(${columnas.length}, minmax(96px, 1fr))`,
                  minWidth:
                    vista === "semana"
                      ? 3 * 16 + columnas.length * 96
                      : undefined,
                }}
              >
                {/* Cabecera de días (sticky arriba) */}
                <div className="sticky left-0 top-0 z-20 border-b border-line bg-surface" />
                {columnas.map((dia) => (
                  <div
                    key={dia}
                    className={`sticky top-0 z-20 border-b border-l border-line bg-surface px-2 py-2 text-center text-[12px] font-bold capitalize ${
                      dia === hoyISOArgentina() ? "text-accent" : "text-muted"
                    }`}
                  >
                    {tituloDia(dia, vista === "semana")}
                  </div>
                ))}

                {/* Gutter de horas */}
                <div className="relative" style={{ height: totalPx }}>
                  {slots.map((m) => (
                    <div
                      key={m}
                      className="absolute right-1 -translate-y-1/2 text-[10px] font-semibold text-faint"
                      style={{ top: ((m - startMin) / SLOT_MIN) * SLOT_PX }}
                    >
                      {m % 60 === 0 ? minutosAHHMM(m) : ""}
                    </div>
                  ))}
                </div>

                {columnas.map((dia) => (
                  <ColumnaDia
                    key={dia}
                    dia={dia}
                    slots={slots}
                    startMin={startMin}
                    turnos={porDia.get(dia) ?? []}
                    profesionalId={profesionalId}
                    activeId={activeId}
                    onCardClick={(t) => {
                      if (arrastroReciente.current) return;
                      setDetalle(t);
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Tarjeta elevada mientras se arrastra */}
          <DragOverlay
            dropAnimation={{ duration: 180, easing: "cubic-bezier(0.2,0,0,1)" }}
          >
            {activeTurno ? (
              <TarjetaContenido
                turno={activeTurno}
                profesionalId={profesionalId}
                heightPx={
                  Math.max(
                    1,
                    (activeTurno.duracion_min || SLOT_MIN) / SLOT_MIN,
                  ) * SLOT_PX
                }
                elevada
              />
            ) : null}
          </DragOverlay>
        </DndContext>
      )}

      {!cargando && porDia.size === 0 && (
        <p className="text-center text-[13px] text-muted">
          No hay turnos {vista === "dia" ? "este día" : "esta semana"}
          {!mostrarCancelados ? " (los cancelados están ocultos)" : ""}.
        </p>
      )}

      {/* Modal de confirmación de movimiento */}
      {pendiente && (
        <ConfirmarMovimiento
          pendiente={pendiente}
          profesionalId={profesionalId}
          onConfirm={confirmarMovimiento}
          onCancel={() => setPendiente(null)}
        />
      )}

      {/* Detalle del turno (estado + acciones) */}
      {detalle && (
        <DetalleTurno
          turno={detalle}
          onEstado={(es) => cambiarEstado(detalle.id, es)}
          onClose={() => setDetalle(null)}
        />
      )}

      {/* Toast */}
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

// ============================================================
// Columna de un día: slots droppables + tarjetas posicionadas.
// ============================================================
function ColumnaDia({
  dia,
  slots,
  startMin,
  turnos,
  profesionalId,
  activeId,
  onCardClick,
}: {
  dia: string;
  slots: number[];
  startMin: number;
  turnos: TurnoConDetalle[];
  profesionalId: string;
  activeId: string | null;
  onCardClick: (t: TurnoConDetalle) => void;
}) {
  const totalPx = slots.length * SLOT_PX;
  return (
    <div className="relative border-l border-line" style={{ height: totalPx }}>
      {/* Slots droppables + líneas de grilla */}
      {slots.map((m) => (
        <SlotCell
          key={m}
          dayISO={dia}
          minutes={m}
          startMin={startMin}
          activeId={activeId}
        />
      ))}

      {/* Tarjetas */}
      {turnos.map((t) => {
        const top =
          ((minutosDelDiaAR(t.fecha_hora) - startMin) / SLOT_MIN) * SLOT_PX;
        const height =
          Math.max(1, (t.duracion_min || SLOT_MIN) / SLOT_MIN) * SLOT_PX;
        return (
          <TurnoCard
            key={t.id}
            turno={t}
            top={top}
            height={height}
            profesionalId={profesionalId}
            oculta={activeId === t.id}
            onClick={() => onCardClick(t)}
          />
        );
      })}
    </div>
  );
}

function SlotCell({
  dayISO,
  minutes,
  startMin,
  activeId,
}: {
  dayISO: string;
  minutes: number;
  startMin: number;
  activeId: string | null;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: `${dayISO}__${minutes}`,
    data: { dayISO, minutes },
  });
  const arrastrando = activeId !== null;
  return (
    <div
      ref={setNodeRef}
      className={`absolute inset-x-0 border-t border-line/60 ${
        minutes % 60 === 0 ? "border-t-line" : "border-dashed"
      } ${isOver && arrastrando ? "bg-accent/15" : ""}`}
      style={{ top: ((minutes - startMin) / SLOT_MIN) * SLOT_PX, height: SLOT_PX }}
    />
  );
}

function TurnoCard({
  turno,
  top,
  height,
  profesionalId,
  oculta,
  onClick,
}: {
  turno: TurnoConDetalle;
  top: number;
  height: number;
  profesionalId: string;
  oculta: boolean;
  onClick: () => void;
}) {
  const cancelado = turno.estado === "cancelado";
  // Los cancelados se muestran de referencia pero no se arrastran.
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: turno.id,
    disabled: cancelado,
  });

  return (
    <div
      ref={setNodeRef}
      {...(cancelado ? {} : listeners)}
      {...attributes}
      onClick={onClick}
      // Sin `touch-action: none`: el TouchSensor usa el delay de long-press, así
      // el scroll normal gana si el dedo se mueve antes de levantar la tarjeta.
      className="absolute inset-x-1 z-[1] cursor-pointer"
      style={{
        top: top + 1,
        height: Math.max(SLOT_PX - 2, height - 2),
        opacity: oculta || isDragging ? 0.35 : 1,
      }}
    >
      <TarjetaContenido
        turno={turno}
        profesionalId={profesionalId}
        heightPx={Math.max(SLOT_PX - 2, height - 2)}
      />
    </div>
  );
}

// Contenido visual de la tarjeta (compartido por la grilla y el DragOverlay).
function TarjetaContenido({
  turno,
  profesionalId,
  heightPx,
  elevada = false,
}: {
  turno: TurnoConDetalle;
  profesionalId: string;
  heightPx: number;
  elevada?: boolean;
}) {
  const cancelado = turno.estado === "cancelado";
  const compacta = heightPx < SLOT_PX * 1.3;
  return (
    <div
      className={`h-full overflow-hidden rounded-lg border border-l-[3px] border-line px-2 py-1 ${
        CARD_ACCENT[turno.estado]
      } ${cancelado ? "opacity-60" : ""} ${
        elevada ? "scale-[1.03] shadow-lg ring-1 ring-accent/40" : "shadow-sm"
      } transition-shadow`}
    >
      <div
        className={`flex items-center gap-1 text-[12px] font-semibold ${
          cancelado ? "text-muted line-through" : "text-ink"
        }`}
      >
        <span>{formatArHora(turno.fecha_hora)}</span>
        <span className="truncate">{turno.paciente?.nombre ?? "—"}</span>
        {turno.origen !== "manual" && (
          <span className="shrink-0 text-[9px]">
            {turno.origen === "web" ? "🌐" : "🤖"}
          </span>
        )}
      </div>
      {!compacta && (
        <div
          className={`truncate text-[10px] ${cancelado ? "text-faint line-through" : "text-muted"}`}
        >
          {turno.servicio?.nombre ?? "Sin servicio"}
          {!profesionalId && turno.profesional?.name
            ? ` · ${turno.profesional.name}`
            : ""}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Modal: confirmar movimiento
// ============================================================
function ConfirmarMovimiento({
  pendiente,
  profesionalId,
  onConfirm,
  onCancel,
}: {
  pendiente: MovimientoPendiente;
  profesionalId: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { turno, nuevoUtc, aviso } = pendiente;
  const actual = formatArFecha(turno.fecha_hora, {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
  const nuevo = formatArFecha(nuevoUtc, {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
  return (
    <Overlay onClose={onCancel}>
      <h2 className="text-[15px] font-bold">Mover turno</h2>
      <p className="mt-1 text-[13px] text-muted">
        {turno.paciente?.nombre ?? "Paciente"} ·{" "}
        {turno.servicio?.nombre ?? "Sin servicio"}
        {!profesionalId && turno.profesional?.name
          ? ` · ${turno.profesional.name}`
          : ""}
      </p>

      <div className="mt-3 space-y-1.5 rounded-xl border border-line bg-surface-2 p-3 text-[13px]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted">Actual</span>
          <span className="font-semibold capitalize">
            {actual} · {formatArHora(turno.fecha_hora)}
          </span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="text-muted">Nuevo</span>
          <span className="font-semibold capitalize text-accent">
            {nuevo} · {formatArHora(nuevoUtc)}
          </span>
        </div>
      </div>

      {aviso && (
        <p className="mt-2 rounded-lg bg-warn/10 px-2.5 py-1.5 text-[12px] font-semibold text-warn">
          {aviso}
        </p>
      )}

      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-full px-3.5 py-2 text-[13px] font-semibold text-muted hover:text-ink"
        >
          Cancelar
        </button>
        <button
          onClick={onConfirm}
          className="rounded-full bg-ink px-4 py-2 text-[13px] font-semibold text-white hover:bg-ink/90"
        >
          Confirmar
        </button>
      </div>
    </Overlay>
  );
}

// ============================================================
// Modal: detalle del turno (estado)
// ============================================================
function DetalleTurno({
  turno,
  onEstado,
  onClose,
}: {
  turno: TurnoConDetalle;
  onEstado: (estado: TurnoEstado) => void;
  onClose: () => void;
}) {
  return (
    <Overlay onClose={onClose}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-bold">
            {turno.paciente?.nombre ?? "Paciente"}
          </h2>
          <p className="text-[13px] text-muted">
            {formatArFecha(turno.fecha_hora, {
              weekday: "long",
              day: "2-digit",
              month: "long",
            })}{" "}
            · {formatArHora(turno.fecha_hora)} · {turno.duracion_min} min
          </p>
          <p className="text-[12px] text-muted">
            {turno.servicio?.nombre ?? "Sin servicio"}
            {turno.profesional?.name ? ` · ${turno.profesional.name}` : ""}
          </p>
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${ESTADO_COLOR[turno.estado]}`}
        >
          {ESTADO_LABEL[turno.estado]}
        </span>
      </div>

      <div className="mt-4">
        <p className="mb-1.5 text-[12px] font-semibold text-muted">Cambiar estado</p>
        <div className="flex flex-wrap gap-1.5">
          {ESTADOS.map((es) => (
            <button
              key={es}
              onClick={() => onEstado(es)}
              disabled={es === turno.estado}
              className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                es === turno.estado
                  ? `${ESTADO_COLOR[es]} cursor-default`
                  : "border border-line text-muted hover:text-ink"
              }`}
            >
              {ESTADO_LABEL[es]}
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-faint">
          Para reprogramar, arrastrá el turno a otro horario en la agenda.
        </p>
      </div>

      <div className="mt-4 flex justify-end">
        <button
          onClick={onClose}
          className="rounded-full px-3.5 py-2 text-[13px] font-semibold text-muted hover:text-ink"
        >
          Cerrar
        </button>
      </div>
    </Overlay>
  );
}

// Contenedor de modal centrado (sheet en mobile).
function Overlay({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-t-2xl border border-line bg-surface p-4 shadow-card sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

// --- Tipos locales ---
interface MovimientoPendiente {
  turno: TurnoConDetalle;
  nuevaFecha: string;
  nuevaHora: string;
  nuevoUtc: string;
  aviso: string | null;
}
