import Link from "next/link";
import type { Paciente } from "@/lib/types";

export default function PacientesTable({
  pacientes,
}: {
  pacientes: Paciente[];
}) {
  if (pacientes.length === 0) {
    return (
      <div className="rounded-panel border border-line bg-surface p-8 text-center text-sm text-muted shadow-card">
        Todavía no cargaste ningún paciente.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-panel border border-line bg-surface shadow-card">
      <ul className="divide-y divide-line">
        {pacientes.map((p) => (
          <li key={p.id}>
            <Link
              href={`/pacientes/${p.id}`}
              className="flex items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-surface-2"
            >
              <div className="min-w-0">
                <div className="truncate text-[15px] font-semibold">
                  {p.nombre}
                </div>
                <div className="truncate text-[13px] text-muted">
                  {[p.telefono, p.obra_social].filter(Boolean).join(" · ") ||
                    "—"}
                </div>
              </div>
              {p.contact_id && (
                <span className="shrink-0 rounded-full bg-accent-soft px-2.5 py-1 text-[11px] font-semibold text-accent">
                  WhatsApp
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
