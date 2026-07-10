"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { TurnoConPaciente, TurnoEstado } from "@/lib/types";

function formatFechaHora(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TurnosPendientesIA({
  turnos,
}: {
  turnos: TurnoConPaciente[];
}) {
  const router = useRouter();
  const supabase = createClient();

  async function resolver(id: string, estado: TurnoEstado) {
    await supabase.from("turnos").update({ estado }).eq("id", id);
    router.refresh();
  }

  if (turnos.length === 0) return null;

  return (
    <div className="space-y-2.5 rounded-panel border border-accent/30 bg-accent-soft/40 p-4">
      <div className="flex items-center gap-1.5 text-[13px] font-bold text-accent">
        <span>🤖</span>
        <span>Pendientes de aprobar ({turnos.length})</span>
      </div>
      <ul className="space-y-2">
        {turnos.map((t) => (
          <li
            key={t.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5"
          >
            <div className="min-w-0">
              <div className="text-[14px] font-semibold">
                {t.paciente?.nombre ?? "—"} · {formatFechaHora(t.fecha_hora)}
              </div>
              {t.ia_notas_originales && (
                <div
                  className="truncate text-[12px] text-muted"
                  title={t.ia_notas_originales}
                >
                  &quot;{t.ia_notas_originales}&quot;
                </div>
              )}
            </div>
            <div className="flex shrink-0 gap-1.5">
              <button
                onClick={() => resolver(t.id, "confirmado")}
                className="rounded-full bg-ok/15 px-3 py-1 text-[12px] font-semibold text-ok"
              >
                Confirmar
              </button>
              <button
                onClick={() => resolver(t.id, "cancelado")}
                className="rounded-full bg-danger/15 px-3 py-1 text-[12px] font-semibold text-danger"
              >
                Rechazar
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
