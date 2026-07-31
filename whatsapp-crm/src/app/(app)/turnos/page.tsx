import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgent } from "@/lib/agent";
import { getPacientes } from "@/lib/pacientes";
import {
  getProfesionales,
  getHorarios,
  getBloqueosFuturos,
} from "@/lib/reservas";
import TurnosVista from "@/components/turnos/TurnosVista";

export default async function TurnosPage({
  searchParams,
}: {
  searchParams: Promise<{ paciente?: string }>;
}) {
  const { paciente: pacientePreseleccionado } = await searchParams;
  const supabase = await createClient();
  const agent = await getCurrentAgent(supabase);
  if (!agent) redirect("/login");

  const esProfesional = agent.role === "profesional";

  // Para el profesional, todo se fuerza a sí mismo: sin selector de profesional
  // (RLS ya lo aisla, pero evitamos mostrar/ofrecer a los demás), y su servicio
  // para el título. Los owners ven la agenda completa como hasta ahora.
  const [
    pacientes,
    profesionales,
    { data: agentes },
    servicioProp,
    horarios,
    bloqueos,
  ] = await Promise.all([
      getPacientes(supabase),
      esProfesional
        ? Promise.resolve([{ id: agent.id, name: agent.name }])
        : getProfesionales(supabase),
      esProfesional
        ? Promise.resolve({ data: [{ id: agent.id, name: agent.name, email: agent.email }] })
        : supabase.from("agents").select("id, name, email"),
      esProfesional
        ? supabase
            .from("servicios")
            .select("nombre")
            .eq("profesional_id", agent.id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      // Para avisar en el modal de reprogramación si el destino cae fuera del
      // horario habitual o sobre un bloqueo (RLS ya scopea al profesional).
      getHorarios(supabase),
      getBloqueosFuturos(supabase),
    ]);

  const servicioNombre =
    (servicioProp?.data as { nombre?: string } | null)?.nombre ?? null;

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {esProfesional ? `Agenda de ${agent.name ?? "mis turnos"}` : "Turnos"}
            </h1>
            <p className="text-sm text-muted">
              {esProfesional && servicioNombre
                ? `${servicioNombre} · lista y agenda.`
                : "Tu lista de trabajo y la agenda para reprogramar."}
            </p>
          </div>
          <Link
            href="/turnos/configuracion"
            className="shrink-0 rounded-full border border-line bg-surface px-3.5 py-2 text-[13px] font-semibold text-muted transition-colors hover:text-ink"
          >
            ⚙ Configuración
          </Link>
        </div>

        <TurnosVista
          tenantId={agent.tenant_id}
          esOwner={!esProfesional}
          pacientes={pacientes.map((p) => ({ id: p.id, nombre: p.nombre }))}
          agentes={agentes ?? []}
          profesionales={profesionales}
          defaultProfesionalId={agent.id}
          defaultPacienteId={pacientePreseleccionado}
          horarios={horarios}
          bloqueos={bloqueos}
        />
      </div>
    </div>
  );
}
