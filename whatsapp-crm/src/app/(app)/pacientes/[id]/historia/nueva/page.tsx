import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgent } from "@/lib/agent";
import { getCamposConfig } from "@/lib/camposConfig";
import { getPaciente } from "@/lib/pacientes";
import HistoriaForm from "@/components/historias/HistoriaForm";

export default async function NuevaHistoriaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const agent = await getCurrentAgent(supabase);
  if (!agent) redirect("/login");

  const paciente = await getPaciente(supabase, id);
  if (!paciente) notFound();

  const { data: tenant } = await supabase
    .from("tenants")
    .select("rubro_slug")
    .eq("id", agent.tenant_id)
    .single();

  const campos = await getCamposConfig(
    supabase,
    tenant?.rubro_slug ?? "otro",
    "historia_clinica",
    agent.tenant_id,
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Nueva entrada
          </h1>
          <p className="text-sm text-muted">Historia clínica de {paciente.nombre}</p>
        </div>
        <HistoriaForm
          tenantId={agent.tenant_id}
          pacienteId={paciente.id}
          profesionalId={agent.id}
          campos={campos}
        />
      </div>
    </div>
  );
}
