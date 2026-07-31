import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAlumno } from "@/lib/alumno";
import { getGymContext } from "@/lib/gym";
import { hoyISOArgentina } from "@/lib/tz";
import ClasesFlow from "@/components/gimnasio/ClasesFlow";
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

function estadoCuota(
  cuotaHasta: string | null,
  metodoPago: "efectivo" | "mercadopago",
  mpEstado: string | null,
): EstadoCuota {
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
  const debito =
    metodoPago === "mercadopago" && mpEstado === "authorized"
      ? " · Débito automático activo"
      : "";
  return {
    tono: "ok",
    titulo: "Cuota al día",
    detalle: `Al día hasta el ${fmtFecha(cuotaHasta)}${debito}.`,
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
  const cuota = estadoCuota(alumno.cuota_hasta, alumno.metodo_pago, alumno.mp_estado);
  const primerNombre = alumno.nombre.split(" ")[0];

  return (
    <main className="mx-auto max-w-md px-4 pb-16 pt-6 sm:pt-8">
      <div className="mb-5 space-y-4">
        <h1 className="text-xl font-bold tracking-tight">Hola, {primerNombre} 👋</h1>

        <div className={`rounded-panel border p-4 ${TONO[cuota.tono]}`}>
          <div className="text-[15px] font-bold">{cuota.titulo}</div>
          <p className="mt-0.5 text-[13px] text-muted">{cuota.detalle}</p>
        </div>
      </div>

      <ClasesFlow
        gimnasioNombre={gym?.nombre ?? "KINACTIVA"}
        sesion={{ nombre: alumno.nombre, telefono: alumno.telefono }}
      />

      <InstruccionesInstalar />
    </main>
  );
}
