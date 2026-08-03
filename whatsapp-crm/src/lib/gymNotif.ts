import { createServiceClient } from "@/lib/supabase/service";
import { sendPushToTenant } from "@/lib/push/send";

// Aviso al staff del gimnasio cuando un alumno se anota (informativo: la reserva
// ya queda confirmada sola). Web Push a las suscripciones del tenant;
// best-effort (nunca rompe la reserva). No-op si no hay VAPID configurado.

const DIAS = [
  "domingo",
  "lunes",
  "martes",
  "miércoles",
  "jueves",
  "viernes",
  "sábado",
];

// "YYYY-MM-DD" -> "DD/MM"
function fechaCorta(iso: string): string {
  const [, m, d] = iso.split("-");
  return d && m ? `${d}/${m}` : iso;
}

export async function notificarReservaGym(args: {
  tenantId: string;
  nombre: string;
  horarioId: string;
  fecha: string; // YYYY-MM-DD
  tipo: "suelta" | "fijo";
}): Promise<void> {
  try {
    const sb = createServiceClient();
    const { data: h } = await sb
      .from("gym_horarios")
      .select("dia_semana, hora_inicio")
      .eq("id", args.horarioId)
      .maybeSingle();

    const hora = h?.hora_inicio ? String(h.hora_inicio).slice(0, 5) : "";
    const dia =
      typeof h?.dia_semana === "number" ? DIAS[h.dia_semana] : "";
    const cuando =
      args.tipo === "fijo"
        ? `${dia} ${hora} hs (fijo)`
        : `${fechaCorta(args.fecha)} ${hora} hs`;

    await sendPushToTenant(args.tenantId, {
      title: "Nueva reserva",
      body: `${args.nombre} se anotó · ${cuando}.`,
      url: "/gym",
      tag: "gym-reserva",
    });
  } catch {
    // best-effort: el aviso nunca debe afectar la reserva.
  }
}
