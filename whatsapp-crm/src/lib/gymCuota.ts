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
