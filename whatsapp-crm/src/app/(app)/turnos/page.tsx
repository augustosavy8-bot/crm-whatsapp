import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgent } from "@/lib/agent";
import { getTurnosPendientesIA } from "@/lib/turnos";
import { getPacientes } from "@/lib/pacientes";
import { getProfesionales } from "@/lib/reservas";
import AgendaAdmin from "@/components/turnos/AgendaAdmin";
import TurnosPendientesIA from "@/components/turnos/TurnosPendientesIA";
import NuevoTurnoPanel from "@/components/turnos/NuevoTurnoPanel";

export default async function TurnosPage({
  searchParams,
}: {
  searchParams: Promise<{ paciente?: string }>;
}) {
  const { paciente: pacientePreseleccionado } = await searchParams;
  const supabase = await createClient();
  const agent = await getCurrentAgent(supabase);
  if (!agent) redirect("/login");

  const [pendientesIA, pacientes, profesionales, { data: agentes }] =
    await Promise.all([
      getTurnosPendientesIA(supabase),
      getPacientes(supabase),
      getProfesionales(supabase),
      supabase.from("agents").select("id, name, email"),
    ]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Turnos</h1>
            <p className="text-sm text-muted">Agenda del día y de la semana.</p>
          </div>
          <Link
            href="/turnos/configuracion"
            className="shrink-0 rounded-full border border-line bg-surface px-3.5 py-2 text-[13px] font-semibold text-muted transition-colors hover:text-ink"
          >
            ⚙ Configuración
          </Link>
        </div>

        <TurnosPendientesIA turnos={pendientesIA} />

        <NuevoTurnoPanel
          tenantId={agent.tenant_id}
          pacientes={pacientes.map((p) => ({ id: p.id, nombre: p.nombre }))}
          agentes={agentes ?? []}
          defaultProfesionalId={agent.id}
          defaultPacienteId={pacientePreseleccionado}
        />

        <AgendaAdmin profesionales={profesionales} />
      </div>
    </div>
  );
}
