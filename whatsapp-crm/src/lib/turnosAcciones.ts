import { normalizeArPhone } from "./phone";
import { formatArFecha, formatArHora } from "./tz";

// Acciones de turno compartidas por la lista operativa y la agenda. Client-side
// (usan fetch/window). Reúsan el flujo existente: la confirmación pasa por
// /api/turnos/confirmar (que además avisa por WhatsApp), no por un update suelto.

export interface ConfirmarResult {
  ok: boolean;
  warning?: string;
  error?: string;
}

// Confirma un turno vía la ruta que también dispara el WhatsApp al paciente.
export async function confirmarTurnoApi(
  turnoId: string,
): Promise<ConfirmarResult> {
  try {
    const res = await fetch("/api/turnos/confirmar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ turnoId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok)
      return { ok: false, error: data?.error || "No se pudo confirmar el turno." };
    return { ok: true, warning: data?.warning };
  } catch {
    return { ok: false, error: "Error de red al confirmar." };
  }
}

// Forma mínima que necesitan los links de WhatsApp (sirve para TurnoConDetalle
// y cualquier turno con paciente + servicio).
interface TurnoWa {
  fecha_hora: string;
  paciente?: { nombre: string | null; telefono: string | null } | null;
  servicio?: { nombre: string | null } | null;
}

function waUrl(tel: string, mensaje: string): string {
  return `https://wa.me/${tel}?text=${encodeURIComponent(mensaje)}`;
}

// Link de recordatorio (lista operativa). Devuelve null si no hay teléfono.
export function waRecordatorioUrl(t: TurnoWa): string | null {
  const tel = normalizeArPhone(t.paciente?.telefono);
  if (!tel) return null;
  const nombre = t.paciente?.nombre ?? "";
  const servicio = t.servicio?.nombre ?? "tu turno";
  const fecha = formatArFecha(t.fecha_hora, {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
  const hora = formatArHora(t.fecha_hora);
  const msg =
    `Hola ${nombre}! Te recordamos tu turno de ${servicio} el ${fecha} a las ` +
    `${hora}. Cualquier cosa avisanos por acá.`;
  return waUrl(tel, msg);
}

// Link de aviso de reprogramación (agenda). `nuevoUtc` es el nuevo instante.
export function waReprogramadoUrl(t: TurnoWa, nuevoUtc: string): string | null {
  const tel = normalizeArPhone(t.paciente?.telefono);
  if (!tel) return null;
  const nombre = t.paciente?.nombre ?? "";
  const servicio = t.servicio?.nombre ?? "tu turno";
  const fecha = formatArFecha(nuevoUtc, {
    weekday: "long",
    day: "2-digit",
    month: "long",
  });
  const hora = formatArHora(nuevoUtc);
  const msg =
    `Hola ${nombre}! Tu turno de ${servicio} se reprogramó para el ${fecha} a ` +
    `las ${hora}. Cualquier cosa avisanos por acá.`;
  return waUrl(tel, msg);
}
