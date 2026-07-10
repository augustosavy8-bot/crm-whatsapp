import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgent } from "@/lib/agent";
import { getTurnosProximos } from "@/lib/turnos";
import { getPacientes } from "@/lib/pacientes";
import TurnosAgenda from "@/components/turnos/TurnosAgenda";
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

  const [turnos, pacientes, { data: agentes }] = await Promise.all([
    getTurnosProximos(supabase),
    getPacientes(supabase),
    supabase.from("agents").select("id, name, email"),
  ]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Turnos</h1>
          <p className="text-sm text-muted">Próximos turnos, desde hoy.</p>
        </div>

        <NuevoTurnoPanel
          tenantId={agent.tenant_id}
          pacientes={pacientes.map((p) => ({ id: p.id, nombre: p.nombre }))}
          agentes={agentes ?? []}
          defaultProfesionalId={agent.id}
          defaultPacienteId={pacientePreseleccionado}
        />

        <TurnosAgenda turnos={turnos} />
      </div>
    </div>
  );
}
