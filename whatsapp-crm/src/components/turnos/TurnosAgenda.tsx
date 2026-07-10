"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
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

function formatHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-AR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDiaLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const tomorrow = new Date();
  tomorrow.setDate(today.getDate() + 1);
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
  if (sameDay(d, today)) return "Hoy";
  if (sameDay(d, tomorrow)) return "Mañana";
  return d.toLocaleDateString("es-AR", {
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
  });
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
    const key = new Date(t.fecha_hora).toDateString();
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
                    <div className="text-[15px] font-semibold">
                      {formatHora(t.fecha_hora)} · {t.paciente?.nombre ?? "—"}
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
