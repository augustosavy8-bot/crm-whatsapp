import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgent } from "@/lib/agent";
import GimnasioPanel from "@/components/gimnasio/GimnasioPanel";

// Panel del gimnasio (cupo grupal). Acceso: owner o gym_admin (Mariano). Un
// profesional cualquiera no entra. RLS igual sella los datos por tenant/gate;
// esto es la barrera de UI.
export default async function GymPanelPage() {
  const supabase = await createClient();
  const agent = await getCurrentAgent(supabase);
  if (!agent) redirect("/login");
  if (agent.role !== "owner" && !agent.gym_admin) redirect("/turnos");

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Gimnasio</h1>
          <p className="text-sm text-muted">
            Clases con cupo: quién va cada día y los horarios disponibles.
          </p>
        </header>
        <GimnasioPanel tenantId={agent.tenant_id} />
      </div>
    </div>
  );
}
