import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgent } from "@/lib/agent";
import {
  getServiciosAdmin,
  getProfesionales,
  getHorarios,
  getBloqueosFuturos,
} from "@/lib/reservas";
import ConfiguracionReservas from "@/components/turnos/ConfiguracionReservas";

export default async function ConfiguracionPage() {
  const supabase = await createClient();
  const agent = await getCurrentAgent(supabase);
  if (!agent) redirect("/login");

  const esOwner = agent.role !== "profesional";

  const [servicios, profesionales, horarios, bloqueos] = await Promise.all([
    esOwner ? getServiciosAdmin(supabase) : Promise.resolve([]),
    getProfesionales(supabase),
    getHorarios(supabase),
    getBloqueosFuturos(supabase),
  ]);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-2xl space-y-5 p-4 sm:p-6">
        <div>
          <Link
            href="/turnos"
            className="mb-2 inline-flex text-[13px] font-semibold text-muted transition-colors hover:text-ink"
          >
            ← Volver a la agenda
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">
            Configuración de turnos
          </h1>
          <p className="text-sm text-muted">
            Servicios, horarios de atención y bloqueos por profesional.
          </p>
        </div>

        <ConfiguracionReservas
          tenantId={agent.tenant_id}
          esOwner={esOwner}
          servicios={servicios}
          profesionales={profesionales}
          horarios={horarios}
          bloqueos={bloqueos}
        />
      </div>
    </div>
  );
}
