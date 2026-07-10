"use client";

import { useState } from "react";
import TurnoForm from "./TurnoForm";

interface PacienteOption {
  id: string;
  nombre: string;
}

interface AgenteOption {
  id: string;
  name: string | null;
  email: string | null;
}

interface Props {
  tenantId: string;
  pacientes: PacienteOption[];
  agentes: AgenteOption[];
  defaultProfesionalId: string;
  defaultPacienteId?: string;
}

// Botón "+ Nuevo turno" que despliega el form. Abierto de entrada si venimos
// de "Nuevo turno" en el detalle de un paciente (?paciente=<id>).
export default function NuevoTurnoPanel({
  tenantId,
  pacientes,
  agentes,
  defaultProfesionalId,
  defaultPacienteId,
}: Props) {
  const [open, setOpen] = useState(Boolean(defaultPacienteId));

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-ink/90"
      >
        + Nuevo turno
      </button>
    );
  }

  return (
    <TurnoForm
      tenantId={tenantId}
      pacientes={pacientes}
      agentes={agentes}
      defaultProfesionalId={defaultProfesionalId}
      defaultPacienteId={defaultPacienteId}
      onSaved={() => setOpen(false)}
      onCancel={() => setOpen(false)}
    />
  );
}
