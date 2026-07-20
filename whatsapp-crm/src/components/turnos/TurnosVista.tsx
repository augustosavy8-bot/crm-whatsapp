"use client";

import { useEffect, useState } from "react";
import NuevoTurnoPanel from "./NuevoTurnoPanel";
import ListaTurnos from "./ListaTurnos";
import AgendaAdmin from "./AgendaAdmin";
import type { ProfesionalHorario, ProfesionalBloqueo } from "@/lib/types";
import type { ProfesionalConNombre } from "@/lib/reservas";

type Tab = "lista" | "agenda";
const TAB_KEY = "foko:turnos-tab";

interface PacienteOption {
  id: string;
  nombre: string;
}
interface AgenteOption {
  id: string;
  name: string | null;
  email: string | null;
}

// Contenedor de /turnos con dos vistas de distinto propósito:
//   "Turnos" = lista operativa (trabajo diario, default/home)
//   "Agenda" = grilla con drag & drop (mover turnos, ver huecos)
// El filtro por profesional y el "+ Turno" son compartidos por ambas tabs.
export default function TurnosVista({
  tenantId,
  esOwner,
  pacientes,
  agentes,
  profesionales,
  defaultProfesionalId,
  defaultPacienteId,
  horarios,
  bloqueos,
}: {
  tenantId: string;
  esOwner: boolean;
  pacientes: PacienteOption[];
  agentes: AgenteOption[];
  profesionales: ProfesionalConNombre[];
  defaultProfesionalId: string;
  defaultPacienteId?: string;
  horarios: ProfesionalHorario[];
  bloqueos: ProfesionalBloqueo[];
}) {
  const [tab, setTab] = useState<Tab>("lista");
  const [profesionalId, setProfesionalId] = useState<string>("");

  // Preferencia de tab recordada en la sesión (default: lista operativa).
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TAB_KEY);
      if (saved === "agenda" || saved === "lista") setTab(saved);
    } catch {}
  }, []);
  function cambiarTab(t: Tab) {
    setTab(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {}
  }

  const mostrarSelectorProf = esOwner && profesionales.length > 1;

  return (
    <div className="space-y-4">
      {/* Barra: tabs + filtro de profesional (compartido) */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-full bg-surface-2 p-1">
          {(
            [
              { key: "lista", label: "Turnos" },
              { key: "agenda", label: "Agenda" },
            ] as { key: Tab; label: string }[]
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => cambiarTab(t.key)}
              className={`rounded-full px-4 py-1.5 text-[13px] font-semibold transition-colors ${
                tab === t.key ? "bg-ink text-white" : "text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {mostrarSelectorProf && (
          <select
            value={profesionalId}
            onChange={(e) => setProfesionalId(e.target.value)}
            className="ml-auto rounded-full border border-line bg-surface px-3 py-1.5 text-[13px] font-semibold text-ink outline-none"
          >
            <option value="">Todos los profesionales</option>
            {profesionales.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* "+ Turno": mismo componente para las dos tabs */}
      <NuevoTurnoPanel
        tenantId={tenantId}
        pacientes={pacientes}
        agentes={agentes}
        defaultProfesionalId={defaultProfesionalId}
        defaultPacienteId={defaultPacienteId}
      />

      {tab === "lista" ? (
        <ListaTurnos profesionalId={profesionalId} esOwner={esOwner} />
      ) : (
        <AgendaAdmin
          profesionalId={profesionalId}
          horarios={horarios}
          bloqueos={bloqueos}
        />
      )}
    </div>
  );
}
