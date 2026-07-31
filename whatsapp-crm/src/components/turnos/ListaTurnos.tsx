"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getTurnosEnRango } from "@/lib/turnos";
import {
  arLocalToUtc,
  arDateKey,
  formatArHora,
  formatArFecha,
  hoyISOArgentina,
  sumarDiasISO,
} from "@/lib/tz";
import { ESTADO_LABEL, ESTADO_COLOR } from "@/lib/turnoEstado";
import { confirmarTurnoApi, waRecordatorioUrl } from "@/lib/turnosAcciones";
import { Toast, type ToastState } from "./Toast";
import type { TurnoConDetalle, TurnoEstado } from "@/lib/types";

type FiltroEstado = "todos" | "pendientes" | "confirmados";
const SEMANAS_STEP = 2; // cuántas semanas suma cada "Cargar más"

const FILTROS: { key: FiltroEstado; label: string }[] = [
  { key: "todos", label: "Todos" },
  { key: "pendientes", label: "Pendientes" },
  { key: "confirmados", label: "Confirmados" },
];

// Lista operativa: la vista de trabajo diario. Compacta, agrupada por día, con
// acciones inline de un tap. Los cancelados NUNCA se muestran acá.
export default function ListaTurnos({
  profesionalId,
  esOwner,
}: {
  profesionalId: string;
  esOwner: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [turnos, setTurnos] = useState<TurnoConDetalle[]>([]);
  const [cargando, setCargando] = useState(true);
  const [semanas, setSemanas] = useState(SEMANAS_STEP);
  const [verAnteriores, setVerAnteriores] = useState(false);
  const [filtro, setFiltro] = useState<FiltroEstado>("todos");
  const [procesando, setProcesando] = useState<string | null>(null);
  const [recienConfirmado, setRecienConfirmado] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const hoy = hoyISOArgentina();
  const desde = verAnteriores ? sumarDiasISO(hoy, -28) : hoy;
  const hasta = sumarDiasISO(hoy, semanas * 7);

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
  }, [supabase, desde, hasta, profesionalId]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Visibles: cancelados fuera siempre, luego el filtro de estado; agrupados
  // por día AR (solo días con turnos: sin filas vacías).
  const grupos = useMemo(() => {
    const visibles = turnos
      .filter((t) => t.estado !== "cancelado")
      .filter((t) =>
        filtro === "todos"
          ? true
          : filtro === "pendientes"
            ? t.estado === "pendiente"
            : t.estado === "confirmado",
      )
      .sort((a, b) => a.fecha_hora.localeCompare(b.fecha_hora));

    const map = new Map<string, TurnoConDetalle[]>();
    for (const t of visibles) {
      const k = arDateKey(t.fecha_hora);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(t);
    }
    return [...map.entries()];
  }, [turnos, filtro]);

  function etiquetaDia(key: string): string {
    if (key === hoy) return "Hoy";
    if (key === sumarDiasISO(hoy, 1)) return "Mañana";
    return formatArFecha(`${key}T12:00:00Z`, {
      weekday: "long",
      day: "2-digit",
      month: "long",
    });
  }

  // --- Acciones inline (optimistas) ---
  async function confirmar(t: TurnoConDetalle) {
    setProcesando(t.id);
    const r = await confirmarTurnoApi(t.id);
    setProcesando(null);
    if (!r.ok) {
      setToast({ tipo: "error", mensaje: r.error ?? "No se pudo confirmar." });
      return;
    }
    setTurnos((ts) =>
      ts.map((x) => (x.id === t.id ? { ...x, estado: "confirmado" } : x)),
    );
    // Gatilla la animación de la fila/chip por ~1.4s.
    setRecienConfirmado(t.id);
    setTimeout(
      () => setRecienConfirmado((id) => (id === t.id ? null : id)),
      1400,
    );
    setToast(
      r.warning
        ? { tipo: "error", mensaje: r.warning }
        : { tipo: "ok", mensaje: "Turno confirmado. Se avisó por WhatsApp." },
    );
  }

  async function marcar(t: TurnoConDetalle, estado: TurnoEstado) {
    setProcesando(t.id);
    const { error } = await supabase
      .from("turnos")
      .update({ estado })
      .eq("id", t.id);
    setProcesando(null);
    if (error) {
      setToast({ tipo: "error", mensaje: "No se pudo actualizar el turno." });
      return;
    }
    setTurnos((ts) => ts.map((x) => (x.id === t.id ? { ...x, estado } : x)));
  }

  function whatsapp(t: TurnoConDetalle) {
    const url = waRecordatorioUrl(t);
    if (!url) {
      setToast({ tipo: "error", mensaje: "El paciente no tiene teléfono cargado." });
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="space-y-3">
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-full bg-surface-2 p-1">
          {FILTROS.map((f) => (
            <button
              key={f.key}
              onClick={() => setFiltro(f.key)}
              className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                filtro === f.key ? "bg-ink text-white" : "text-muted hover:text-ink"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setVerAnteriores((v) => !v)}
          className={`ml-auto rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-colors ${
            verAnteriores
              ? "border-accent/30 bg-accent-soft/50 text-accent"
              : "border-line bg-surface text-muted hover:text-ink"
          }`}
        >
          {verAnteriores ? "Ocultar anteriores" : "Ver anteriores"}
        </button>
      </div>

      {cargando && turnos.length === 0 ? (
        <div className="rounded-panel border border-line bg-surface p-8 text-center text-sm text-muted shadow-card">
          Cargando turnos…
        </div>
      ) : grupos.length === 0 ? (
        <div className="rounded-panel border border-line bg-surface p-8 text-center text-sm text-muted shadow-card">
          No hay turnos {verAnteriores ? "en el rango" : "próximos"}
          {filtro !== "todos" ? " con ese estado" : ""}.
        </div>
      ) : (
        <div className="space-y-4">
          {grupos.map(([dia, filas]) => (
            <div key={dia}>
              <h3
                className={`mb-1.5 text-[13px] font-bold capitalize ${
                  dia === hoy ? "text-accent" : "text-muted"
                }`}
              >
                {etiquetaDia(dia)}
              </h3>
              <div className="overflow-hidden rounded-panel border border-line bg-surface shadow-card">
                <ul className="divide-y divide-line">
                  {filas.map((t) => (
                    <ItemTurno
                      key={t.id}
                      turno={t}
                      esOwner={esOwner}
                      procesando={procesando === t.id}
                      recienConfirmado={recienConfirmado === t.id}
                      onConfirmar={() => confirmar(t)}
                      onAtendido={() => marcar(t, "atendido")}
                      onAusente={() => marcar(t, "ausente")}
                      onWhatsApp={() => whatsapp(t)}
                    />
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Paginado hacia adelante */}
      {!cargando && grupos.length > 0 && (
        <div className="flex justify-center pt-1">
          <button
            onClick={() => setSemanas((s) => s + SEMANAS_STEP)}
            className="rounded-full border border-line bg-surface px-4 py-2 text-[13px] font-semibold text-muted transition-colors hover:text-ink"
          >
            Cargar más
          </button>
        </div>
      )}

      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

function ItemTurno({
  turno: t,
  esOwner,
  procesando,
  recienConfirmado,
  onConfirmar,
  onAtendido,
  onAusente,
  onWhatsApp,
}: {
  turno: TurnoConDetalle;
  esOwner: boolean;
  procesando: boolean;
  recienConfirmado: boolean;
  onConfirmar: () => void;
  onAtendido: () => void;
  onAusente: () => void;
  onWhatsApp: () => void;
}) {
  // Barra lateral: ámbar si está pendiente, verde si confirmado.
  const barra =
    t.estado === "pendiente"
      ? "#f2911f"
      : t.estado === "confirmado"
        ? "#2fae6b"
        : null;
  return (
    <li
      className="relative px-3 py-2.5"
      style={
        recienConfirmado
          ? { animation: "kfOkFlash 1.2s ease-out" }
          : undefined
      }
    >
      {barra && (
        <span
          aria-hidden
          className="absolute bottom-2 left-0 top-2 w-[3px] rounded-r"
          style={{
            background: barra,
            ...(t.estado === "confirmado" && recienConfirmado
              ? { transformOrigin: "top", animation: "kfBar .4s ease-out both" }
              : {}),
          }}
        />
      )}
      <div className="flex items-center gap-3">
        {/* Hora grande */}
        <div className="w-14 shrink-0 text-center">
          <div className="text-[17px] font-bold leading-none">
            {formatArHora(t.fecha_hora)}
          </div>
          <div className="mt-0.5 text-[10px] text-muted">{t.duracion_min}m</div>
        </div>

        {/* Paciente + servicio */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="truncate text-[14px] font-semibold">
              {t.paciente?.nombre ?? "—"}
            </span>
            {t.origen !== "manual" && (
              <span className="shrink-0 text-[10px]">
                {t.origen === "web" ? "🌐" : "🤖"}
              </span>
            )}
          </div>
          <div className="truncate text-[12px] text-muted">
            {t.servicio?.nombre ?? "Sin servicio"}
            {esOwner && t.profesional?.name ? ` · ${t.profesional.name}` : ""}
          </div>
        </div>

        {/* Chip de estado */}
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${ESTADO_COLOR[t.estado]}`}
          style={
            recienConfirmado
              ? { animation: "kfPop .45s cubic-bezier(.2,.8,.25,1)" }
              : undefined
          }
        >
          {recienConfirmado && t.estado === "confirmado" && (
            <span className="mr-0.5">✓</span>
          )}
          {ESTADO_LABEL[t.estado]}
        </span>
      </div>

      {/* Acciones: un tap por acción */}
      <div className="mt-2 flex flex-wrap gap-1.5 pl-[68px]">
        {t.estado === "pendiente" && (
          <AccionBtn
            onClick={onConfirmar}
            disabled={procesando}
            className="bg-ok/15 text-ok"
          >
            {procesando ? (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-3 w-3 rounded-full border-2 border-ok/30 border-t-ok"
                  style={{ animation: "kfSpin .7s linear infinite" }}
                />
                Confirmando…
              </span>
            ) : (
              "✓ Confirmar"
            )}
          </AccionBtn>
        )}
        <AccionBtn
          onClick={onWhatsApp}
          disabled={procesando}
          className="bg-ok/10 text-ok"
        >
          WhatsApp
        </AccionBtn>
        {t.estado !== "atendido" && (
          <AccionBtn onClick={onAtendido} disabled={procesando}>
            Atendió
          </AccionBtn>
        )}
        {t.estado !== "ausente" && (
          <AccionBtn onClick={onAusente} disabled={procesando}>
            No asistió
          </AccionBtn>
        )}
      </div>
    </li>
  );
}

function AccionBtn({
  children,
  onClick,
  disabled,
  className = "border border-line text-muted hover:text-ink",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition-transform active:scale-[.96] disabled:opacity-50 ${className}`}
    >
      {children}
    </button>
  );
}
