// ============================================================
// Zona horaria: la app guarda SIEMPRE en UTC (timestamptz) y
// muestra SIEMPRE en hora de Buenos Aires.
//
// El bug que esto viene a cerrar: `new Date("2026-07-17T15:00")`
// (sin offset) se parsea en la zona LOCAL DEL RUNTIME. En el
// browser del staff eso da bien por casualidad (está en AR); en
// el server de Vercel, que corre en UTC, guardaba los turnos 3hs
// corridos. Toda conversión wall-clock AR -> UTC pasa por acá.
// ============================================================

export const AR_TZ = "America/Argentina/Buenos_Aires";

// Offset real de la zona para un instante dado, en minutos.
// Vía Intl en vez de una constante -03:00: así seguimos el mismo
// criterio que `at time zone` en Postgres y no se corrompe nada
// si Argentina vuelve a usar horario de verano.
function tzOffsetMinutes(date: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date);

  const at: Record<string, number> = {};
  for (const p of parts) {
    if (p.type !== "literal") at[p.type] = Number(p.value);
  }
  // `hour` puede venir 24 en el borde de medianoche con hour12:false.
  const asIfUtc = Date.UTC(
    at.year,
    at.month - 1,
    at.day,
    at.hour % 24,
    at.minute,
    at.second,
  );
  return (asIfUtc - date.getTime()) / 60_000;
}

/**
 * Wall-clock de Buenos Aires -> instante UTC (ISO).
 * @param fecha "YYYY-MM-DD"
 * @param hora  "HH:mm" (acepta "HH:mm:ss")
 */
export function arLocalToUtc(fecha: string, hora: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  const [hh, mm] = hora.split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d, hh, mm ?? 0, 0);

  // Dos pasadas: la primera estima el offset con la fecha ingenua, la
  // segunda lo corrige si esa estimación cayó del lado equivocado de un
  // salto de horario. Con AR fijo en UTC-3 converge en la primera.
  let ts = naive - tzOffsetMinutes(new Date(naive), AR_TZ) * 60_000;
  ts = naive - tzOffsetMinutes(new Date(ts), AR_TZ) * 60_000;

  return new Date(ts).toISOString();
}

/** Fecha de hoy en Buenos Aires, "YYYY-MM-DD" (en-CA -> ISO). */
export function hoyISOArgentina(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: AR_TZ });
}

/** "YYYY-MM-DD" del instante dado, en Buenos Aires. Sirve para agrupar por día. */
export function arDateKey(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("en-CA", { timeZone: AR_TZ });
}

// --- Formateo (siempre con timeZone pinneada) ---------------

export function formatArHora(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleTimeString("es-AR", {
    timeZone: AR_TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatArFecha(
  iso: string | Date,
  opts: Intl.DateTimeFormatOptions = { weekday: "long", day: "2-digit", month: "2-digit" },
): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleDateString("es-AR", { timeZone: AR_TZ, ...opts });
}

export function formatArFechaHora(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return d.toLocaleString("es-AR", {
    timeZone: AR_TZ,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
