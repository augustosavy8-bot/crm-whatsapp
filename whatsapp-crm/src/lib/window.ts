// Ventana de 24hs de WhatsApp: se puede mandar texto libre solo si el último
// mensaje INBOUND del contacto fue hace menos de 24hs. Lógica pura compartida
// por el cliente (deshabilitar input) y el endpoint de envío (hacerla cumplir).

export const WINDOW_MS = 24 * 60 * 60 * 1000;

export function isWindowOpen(
  lastInboundAt: string | null,
  now: number = Date.now(),
): boolean {
  if (!lastInboundAt) return false;
  const t = new Date(lastInboundAt).getTime();
  if (!Number.isFinite(t)) return false;
  return now - t < WINDOW_MS;
}
