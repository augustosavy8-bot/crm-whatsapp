import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getPacientes } from "@/lib/pacientes";
import PacientesTable from "@/components/pacientes/PacientesTable";

export default async function PacientesPage() {
  const supabase = await createClient();
  const pacientes = await getPacientes(supabase);

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Pacientes</h1>
            <p className="text-sm text-muted">
              {pacientes.length} paciente{pacientes.length === 1 ? "" : "s"}
            </p>
          </div>
          <Link
            href="/pacientes/nuevo"
            className="shrink-0 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-ink/90"
          >
            + Nuevo paciente
          </Link>
        </div>

        <PacientesTable pacientes={pacientes} />
      </div>
    </div>
  );
}
