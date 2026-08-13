import { hoyISOArgentina } from "./tz";

// ¿Mostrarle al alumno la opción de pagar la cuota? Sí cuando falta poco para
// vencer (dentro de `dias`) o ya venció. Si no hay cuota registrada, también
// (para que un socio nuevo pueda ponerse al día). Un socio que pagó con
// anticipación (vence dentro de más de `dias`) no ve el botón: no molesta.
export function cuotaPorVencer(cuotaHasta: string | null, dias = 7): boolean {
  if (!cuotaHasta) return true;
  return hoyISOArgentina() >= restarDiasISO(cuotaHasta, dias);
}

// Débito automático realmente activo (adherido y autorizado por MP).
export function debitoActivo(
  metodoPago: string | null,
  mpEstado: string | null,
): boolean {
  return metodoPago === "mercadopago" && mpEstado === "authorized";
}

// Resta días a un "YYYY-MM-DD" vía mediodía UTC (estable ante DST).
function restarDiasISO(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dias);
  return d.toISOString().slice(0, 10);
}

// ============================================================
// Vencimiento y proporcional de la cuota.
//
// - El vencimiento SIEMPRE cae el día 10 (del 1 al 10 es la ventana de pago).
//   Nunca se ancla al día en que se pagó: al registrar un pago, la cuota queda
//   paga hasta el 10 del mes siguiente al mes cubierto.
// - Reservar tiene gracia hasta el 20 aunque esté vencida (ver gymDeuda.ts).
// - Si alguien arranca con el mes empezado, el primer pago es proporcional a
//   los días que quedan del mes.
// ============================================================

// Día fijo de vencimiento de la cuota (dentro de la ventana 1–10).
export const DIA_VENCIMIENTO = 10;

// Próximo vencimiento (el 10) a partir del estado actual de la cuota.
//   - Si sigue al día (cuota_hasta >= hoy): el 10 del mes SIGUIENTE al de su
//     vencimiento vigente (paga por adelantado, se le suma un mes).
//   - Si está vencida o es nueva: el 10 del mes siguiente al actual (cubre el
//     mes en curso; el próximo pago vence el 10 que viene).
// Devuelve "YYYY-MM-DD". `hoyISO` y `cuotaHasta` son fechas locales AR.
export function proximoVencimientoISO(
  cuotaHasta: string | null,
  hoyISO: string,
): string {
  const alDia = !!cuotaHasta && cuotaHasta >= hoyISO;
  const base = alDia ? (cuotaHasta as string) : hoyISO;
  const anio = Number(base.slice(0, 4));
  const mes = Number(base.slice(5, 7)); // 1–12
  const nAnio = mes === 12 ? anio + 1 : anio;
  const nMes = mes === 12 ? 1 : mes + 1;
  return `${nAnio}-${String(nMes).padStart(2, "0")}-${String(DIA_VENCIMIENTO).padStart(2, "0")}`;
}

// Proporcional del mes en curso: precio del plan × días que quedan / días del
// mes (contando el día de hoy). Para el primer pago de quien arranca con el mes
// empezado.
export function cuotaProporcional(
  precio: number,
  hoyISO: string,
): { monto: number; diasRestantes: number; diasMes: number } {
  const anio = Number(hoyISO.slice(0, 4));
  const mes = Number(hoyISO.slice(5, 7)); // 1–12
  const dia = Number(hoyISO.slice(8, 10));
  // Día 0 del mes siguiente = último día del mes actual.
  const diasMes = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const diasRestantes = diasMes - dia + 1;
  const monto = Math.round((precio * diasRestantes) / diasMes);
  return { monto, diasRestantes, diasMes };
}
