import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { getCurrentAlumno } from "@/lib/alumno";
import { getGymContext } from "@/lib/gym";
import { hoyISOArgentina } from "@/lib/tz";
import { cuotaPorVencer } from "@/lib/gymCuota";
import ClasesFlow from "@/components/gimnasio/ClasesFlow";
import CompletarTelefono from "@/components/gimnasio/CompletarTelefono";
import CuotaAcciones from "@/components/gimnasio/CuotaAcciones";
import InstruccionesInstalar from "@/components/gimnasio/InstruccionesInstalar";

export const dynamic = "force-dynamic";

// "YYYY-MM-DD" -> "DD/MM/YYYY" (sin líos de zona horaria).
function fmtFecha(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

interface EstadoCuota {
  tono: "ok" | "warn" | "neutral";
  titulo: string;
  detalle: string;
}

function estadoCuota(cuotaHasta: string | null): EstadoCuota {
  if (!cuotaHasta) {
    return {
      tono: "neutral",
      titulo: "Cuota sin registrar",
      detalle: "Todavía no cargamos tu cuota. Consultá en el gimnasio.",
    };
  }
  const alDia = cuotaHasta >= hoyISOArgentina();
  if (!alDia) {
    return {
      tono: "warn",
      titulo: "Cuota vencida",
      detalle: `Venció el ${fmtFecha(cuotaHasta)}. Regularizá para seguir reservando.`,
    };
  }
  return {
    tono: "ok",
    titulo: "Cuota al día",
    detalle: `Al día hasta el ${fmtFecha(cuotaHasta)}.`,
  };
}

const TONO: Record<EstadoCuota["tono"], string> = {
  ok: "border-ok/30 bg-ok/10",
  warn: "border-danger/30 bg-danger/10",
  neutral: "border-line bg-surface-2",
};

export default async function MiCuentaPage() {
  const supabase = await createClient();
  const alumno = await getCurrentAlumno(supabase);
  if (!alumno) redirect("/login");

  const gym = await getGymContext();
  const cuota = estadoCuota(alumno.cuota_hasta);
  const primerNombre = alumno.nombre.split(" ")[0];

  // Precio del plan del socio (fuente confiable server-side), para mostrar el
  // monto en el botón de pago. El alumno puede no tener RLS sobre gym_planes.
  const svc = createServiceClient();
  const { data: alPlan } = await svc
    .from("gym_alumnos")
    .select("plan:gym_planes(precio)")
    .eq("id", alumno.id)
    .maybeSingle();
  const montoARS =
    (alPlan?.plan as unknown as { precio: number } | null)?.precio ?? null;

  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-6 sm:pt-8">
      <div className="mb-5 space-y-4">
        <h1 className="text-xl font-bold tracking-tight">Hola, {primerNombre} 👋</h1>

        <div className={`rounded-panel border p-4 ${TONO[cuota.tono]}`}>
          <div className="text-[15px] font-bold">{cuota.titulo}</div>
          <p className="mt-0.5 text-[13px] text-muted">{cuota.detalle}</p>
        </div>
      </div>

      <CuotaAcciones
        montoARS={montoARS}
        mostrarPago={cuotaPorVencer(alumno.cuota_hasta)}
      />

      {alumno.telefono ? (
        <ClasesFlow
          gimnasioNombre={gym?.nombre ?? "KINACTIVA"}
          sesion={{ nombre: alumno.nombre, telefono: alumno.telefono }}
        />
      ) : (
        <CompletarTelefono />
      )}

      <InstruccionesInstalar />
    </main>
  );
}
