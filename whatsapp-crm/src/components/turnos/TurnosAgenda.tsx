"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { arDateKey, formatArFecha, formatArHora, hoyISOArgentina } from "@/lib/tz";
import type { TurnoConPaciente, TurnoEstado } from "@/lib/types";

const ESTADOS: TurnoEstado[] = [
  "pendiente",
  "confirmado",
  "cancelado",
  "atendido",
  "ausente",
];

const ESTADO_LABEL: Record<TurnoEstado, string> = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  cancelado: "Cancelado",
  atendido: "Atendido",
  ausente: "Ausente",
};

const ESTADO_COLOR: Record<TurnoEstado, string> = {
  pendiente: "bg-warn/15 text-warn",
  confirmado: "bg-ok/15 text-ok",
  cancelado: "bg-danger/15 text-danger",
  atendido: "bg-surface-2 text-muted",
  ausente: "bg-danger/15 text-danger",
};

// "Hoy"/"Mañana" se comparan contra el día de Buenos Aires, no contra el del
// device: si no, cerca de medianoche un turno cae en el día equivocado.
function formatDiaLabel(iso: string): string {
  const key = arDateKey(iso);
  const hoy = hoyISOArgentina();
  if (key === hoy) return "Hoy";

  const manana = new Date(`${hoy}T12:00:00Z`);
  manana.setUTCDate(manana.getUTCDate() + 1);
  if (key === manana.toISOString().slice(0, 10)) return "Mañana";

  return formatArFecha(iso);
}

export default function TurnosAgenda({
  turnos,
}: {
  turnos: TurnoConPaciente[];
}) {
  const router = useRouter();
  const supabase = createClient();

  async function cambiarEstado(id: string, estado: TurnoEstado) {
    await supabase.from("turnos").update({ estado }).eq("id", id);
    router.refresh();
  }

  if (turnos.length === 0) {
    return (
      <div className="rounded-panel border border-line bg-surface p-8 text-center text-sm text-muted shadow-card">
        No hay turnos próximos.
      </div>
    );
  }

  const groups = new Map<string, TurnoConPaciente[]>();
  for (const t of turnos) {
    const key = arDateKey(t.fecha_hora);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(t);
  }

  return (
    <div className="space-y-5">
      {[...groups.entries()].map(([key, rows]) => (
        <div key={key}>
          <h3 className="mb-2 text-[13px] font-bold capitalize text-muted">
            {formatDiaLabel(rows[0].fecha_hora)}
          </h3>
          <div className="overflow-hidden rounded-panel border border-line bg-surface shadow-card">
            <ul className="divide-y divide-line">
              {rows.map((t) => (
                <li
                  key={t.id}
                  className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[15px] font-semibold">
                      <span>
                        {formatArHora(t.fecha_hora)} · {t.paciente?.nombre ?? "—"}
                      </span>
                      {t.origen === "web" && (
                        <span
                          title="Reserva hecha desde la web"
                          className="shrink-0 rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-bold text-accent"
                        >
                          Web
                        </span>
                      )}
                    </div>
                    {t.notas && (
                      <div className="truncate text-[13px] text-muted">
                        {t.notas}
                      </div>
                    )}
                  </div>
                  <select
                    value={t.estado}
                    onChange={(e) =>
                      cambiarEstado(t.id, e.target.value as TurnoEstado)
                    }
                    className={`shrink-0 rounded-full border-0 px-2.5 py-1 text-[11px] font-semibold outline-none ${ESTADO_COLOR[t.estado]}`}
                  >
                    {ESTADOS.map((es) => (
                      <option key={es} value={es}>
                        {ESTADO_LABEL[es]}
                      </option>
                    ))}
                  </select>
                </li>
              ))}
            </ul>
          </div>
        </div>
      ))}
    </div>
  );
}
