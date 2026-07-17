"use client";

import { useEffect, useMemo, useState } from "react";
import { formatArHora, hoyISOArgentina } from "@/lib/tz";
import type { ServicioPublico } from "@/lib/types";

type Paso = "servicio" | "cuando" | "datos" | "listo";

interface DiaOpcion {
  iso: string; // YYYY-MM-DD
  diaSemana: string; // "mar"
  diaNum: string; // "15"
  mes: string; // "jul"
  esHoy: boolean;
}

const DIAS_A_MOSTRAR = 21;

// Próximos N días como fechas de Buenos Aires. Se avanza sobre el mediodía UTC
// para no tropezar con bordes de día / DST.
function construirDias(): DiaOpcion[] {
  const hoy = hoyISOArgentina();
  const base = new Date(`${hoy}T12:00:00Z`);
  const dias: DiaOpcion[] = [];
  for (let i = 0; i < DIAS_A_MOSTRAR; i++) {
    const d = new Date(base);
    d.setUTCDate(base.getUTCDate() + i);
    const iso = d.toISOString().slice(0, 10);
    const fmt = new Intl.DateTimeFormat("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      weekday: "short",
      day: "2-digit",
      month: "short",
    }).formatToParts(d);
    const get = (t: string) => fmt.find((p) => p.type === t)?.value ?? "";
    dias.push({
      iso,
      diaSemana: get("weekday").replace(".", ""),
      diaNum: get("day"),
      mes: get("month").replace(".", ""),
      esHoy: i === 0,
    });
  }
  return dias;
}

const cardBase =
  "w-full rounded-card border bg-surface p-4 text-left transition-all";
const inputClass =
  "w-full rounded-xl border border-line bg-surface-2 px-3.5 py-3 text-ink outline-none placeholder:text-faint focus:border-accent focus:ring-2 focus:ring-accent/20";

export default function ReservaFlow({
  servicios,
  servicioInicial,
}: {
  servicios: ServicioPublico[];
  servicioInicial: string | null;
}) {
  const preseleccion =
    servicios.find((s) => s.slug === servicioInicial || s.id === servicioInicial) ??
    null;

  const [paso, setPaso] = useState<Paso>(preseleccion ? "cuando" : "servicio");
  const [servicio, setServicio] = useState<ServicioPublico | null>(preseleccion);

  const dias = useMemo(construirDias, []);
  const [diaSel, setDiaSel] = useState<string | null>(null);
  const [slots, setSlots] = useState<string[]>([]);
  const [cargandoSlots, setCargandoSlots] = useState(false);
  const [slotSel, setSlotSel] = useState<string | null>(null);
  // Se incrementa para forzar un refetch de disponibilidad sin cambiar el día
  // (ej. cuando un slot se ocupó y volvemos a la grilla).
  const [refetch, setRefetch] = useState(0);

  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [email, setEmail] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Trae la disponibilidad cada vez que cambia el día (o el servicio).
  useEffect(() => {
    if (!servicio || !diaSel) return;
    let vigente = true;
    setCargandoSlots(true);
    setSlotSel(null);
    setError(null);
    fetch(
      `/api/reservas/disponibilidad?servicio=${encodeURIComponent(
        servicio.slug,
      )}&fecha=${diaSel}`,
    )
      .then((r) => r.json())
      .then((d) => {
        if (!vigente) return;
        setSlots(Array.isArray(d.slots) ? d.slots : []);
      })
      .catch(() => vigente && setSlots([]))
      .finally(() => vigente && setCargandoSlots(false));
    return () => {
      vigente = false;
    };
  }, [servicio, diaSel, refetch]);

  function elegirServicio(s: ServicioPublico) {
    setServicio(s);
    setDiaSel(null);
    setSlots([]);
    setSlotSel(null);
    setPaso("cuando");
  }

  async function confirmar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!servicio || !slotSel) return;
    if (!nombre.trim() || !telefono.trim()) {
      setError("Necesitamos tu nombre y tu WhatsApp.");
      return;
    }
    setEnviando(true);
    try {
      const res = await fetch("/api/reservas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          servicio: servicio.slug,
          inicio: slotSel,
          nombre: nombre.trim(),
          telefono: telefono.trim(),
          email: email.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        // 409: el slot se ocupó mientras completaba. Lo mando de vuelta a elegir.
        if (res.status === 409) {
          setError(data.error);
          setPaso("cuando");
          setSlotSel(null);
          setRefetch((n) => n + 1); // vuelve a pedir los horarios del día
          return;
        }
        setError(data.error || "No se pudo confirmar el turno.");
        return;
      }
      setPaso("listo");
    } catch {
      setError("No se pudo confirmar el turno. Revisá tu conexión.");
    } finally {
      setEnviando(false);
    }
  }

  // --- PASO: elegir servicio ---
  if (paso === "servicio") {
    return (
      <div className="space-y-5">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">¿Qué querés reservar?</h1>
          <p className="text-sm text-muted">Elegí el servicio para ver la agenda.</p>
        </header>
        <div className="space-y-3">
          {servicios.map((s) => (
            <button
              key={s.id}
              onClick={() => elegirServicio(s)}
              className={`${cardBase} border-line shadow-card hover:border-accent hover:shadow-pop`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-[15px] font-bold">{s.nombre}</div>
                  {s.profesional_nombre && (
                    <div className="text-[13px] text-muted">
                      con {s.profesional_nombre}
                    </div>
                  )}
                  {s.descripcion && (
                    <p className="mt-1 line-clamp-2 text-[13px] text-muted">
                      {s.descripcion}
                    </p>
                  )}
                </div>
                <span className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-semibold text-muted">
                  {s.duracion_min} min
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // --- PASO: elegir día y horario ---
  if (paso === "cuando" && servicio) {
    return (
      <div className="space-y-5">
        <header className="space-y-1">
          <button
            onClick={() => setPaso("servicio")}
            className="text-[13px] font-semibold text-accent"
          >
            {servicio.nombre}
            {servicio.profesional_nombre ? ` · ${servicio.profesional_nombre}` : ""} ✎
          </button>
          <h1 className="text-2xl font-bold tracking-tight">Elegí día y hora</h1>
        </header>

        {/* Selector de días: scroll horizontal */}
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
                <span
                  className={`text-[10px] ${activo ? "text-white/80" : "text-faint"}`}
                >
                  {d.mes}
                </span>
              </button>
            );
          })}
        </div>

        {/* Slots */}
        <div className="min-h-[120px]">
          {!diaSel && (
            <p className="pt-6 text-center text-sm text-muted">
              Elegí un día para ver los horarios.
            </p>
          )}
          {diaSel && cargandoSlots && (
            <p className="pt-6 text-center text-sm text-muted">Buscando horarios…</p>
          )}
          {diaSel && !cargandoSlots && slots.length === 0 && (
            <p className="pt-6 text-center text-sm text-muted">
              No hay horarios disponibles ese día. Probá con otro.
            </p>
          )}
          {diaSel && !cargandoSlots && slots.length > 0 && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {slots.map((iso) => {
                const activo = iso === slotSel;
                return (
                  <button
                    key={iso}
                    onClick={() => setSlotSel(iso)}
                    className={[
                      "rounded-xl border py-2.5 text-sm font-semibold transition-colors",
                      activo
                        ? "border-accent bg-accent text-white"
                        : "border-line bg-surface text-ink hover:border-accent",
                    ].join(" ")}
                  >
                    {formatArHora(iso)}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {error && <p className="text-[13px] text-danger">{error}</p>}

        <button
          disabled={!slotSel}
          onClick={() => setPaso("datos")}
          className="w-full rounded-full bg-ink py-3.5 text-sm font-bold text-white transition-colors hover:bg-ink/90 disabled:opacity-40"
        >
          Continuar
        </button>
      </div>
    );
  }

  // --- PASO: datos ---
  if (paso === "datos" && servicio && slotSel) {
    return (
      <form onSubmit={confirmar} className="space-y-5">
        <header className="space-y-1">
          <button
            type="button"
            onClick={() => setPaso("cuando")}
            className="text-[13px] font-semibold text-accent"
          >
            ← Cambiar horario
          </button>
          <h1 className="text-2xl font-bold tracking-tight">Tus datos</h1>
        </header>

        <div className="rounded-card border border-line bg-surface-2 p-4 text-sm">
          <div className="font-bold">{servicio.nombre}</div>
          {servicio.profesional_nombre && (
            <div className="text-muted">con {servicio.profesional_nombre}</div>
          )}
          <div className="mt-1 font-semibold capitalize text-accent">
            {new Intl.DateTimeFormat("es-AR", {
              timeZone: "America/Argentina/Buenos_Aires",
              weekday: "long",
              day: "2-digit",
              month: "long",
            }).format(new Date(slotSel))}{" "}
            · {formatArHora(slotSel)} hs
          </div>
        </div>

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
              Te vamos a confirmar el turno por acá.
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted">
              Email <span className="font-normal text-faint">(opcional)</span>
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com"
              className={inputClass}
            />
          </div>
        </div>

        {error && <p className="text-[13px] text-danger">{error}</p>}

        <button
          type="submit"
          disabled={enviando}
          className="w-full rounded-full bg-accent py-3.5 text-sm font-bold text-white transition-colors hover:brightness-95 disabled:opacity-50"
        >
          {enviando ? "Reservando…" : "Confirmar turno"}
        </button>
      </form>
    );
  }

  // --- PASO: listo ---
  if (paso === "listo" && servicio && slotSel) {
    return (
      <div className="flex flex-col items-center gap-4 pt-8 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-ok/15 text-3xl">
          ✓
        </div>
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">¡Turno reservado!</h1>
          <p className="text-sm text-muted">
            Te esperamos. Si necesitás reprogramar, escribinos por WhatsApp.
          </p>
        </div>
        <div className="w-full rounded-card border border-line bg-surface-2 p-4 text-left text-sm">
          <div className="font-bold">{servicio.nombre}</div>
          {servicio.profesional_nombre && (
            <div className="text-muted">con {servicio.profesional_nombre}</div>
          )}
          <div className="mt-1 font-semibold capitalize text-accent">
            {new Intl.DateTimeFormat("es-AR", {
              timeZone: "America/Argentina/Buenos_Aires",
              weekday: "long",
              day: "2-digit",
              month: "long",
            }).format(new Date(slotSel))}{" "}
            · {formatArHora(slotSel)} hs
          </div>
        </div>
        <p className="text-[13px] text-muted">
          Tu turno queda <strong>pendiente de confirmación</strong> del gimnasio.
        </p>
      </div>
    );
  }

  return null;
}
