import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgent } from "@/lib/agent";
import { getCamposConfig } from "@/lib/camposConfig";
import PacienteForm from "@/components/pacientes/PacienteForm";

export default async function NuevoPacientePage() {
  const supabase = await createClient();
  const agent = await getCurrentAgent(supabase);
  if (!agent) redirect("/login");

  const { data: tenant } = await supabase
    .from("tenants")
    .select("rubro_slug")
    .eq("id", agent.tenant_id)
    .single();

  const campos = await getCamposConfig(
    supabase,
    tenant?.rubro_slug ?? "otro",
    "paciente",
    agent.tenant_id,
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
        <h1 className="text-2xl font-bold tracking-tight">Nuevo paciente</h1>
        <PacienteForm tenantId={agent.tenant_id} campos={campos} />
      </div>
    </div>
  );
}
