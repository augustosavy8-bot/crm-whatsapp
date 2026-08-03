import { hoyISOArgentina } from "./tz";

// Regla de reserva por pago: para reservar hay que estar al día. Si no (debés,
// o sos nuevo sin pagar todavía), hay una gracia del 1 al 20 del mes; del 21 en
// adelante queda bloqueado hasta regularizar. Aplica a todos por igual.
// El alta manual del staff NO pasa por acá (es un override).
export function reservaBloqueadaPorDeuda(cuotaHasta: string | null): boolean {
  const hoy = hoyISOArgentina(); // "YYYY-MM-DD" en hora de Argentina
  const alDia = !!cuotaHasta && cuotaHasta >= hoy;
  if (alDia) return false;
  const diaDelMes = Number(hoy.slice(8, 10));
  return diaDelMes > 20;
}

export const MENSAJE_DEUDA =
  "Tenés la cuota pendiente. Podés reservar del 1 al 20 del mes; pasado el 20, hay que regularizar el pago para seguir reservando.";
