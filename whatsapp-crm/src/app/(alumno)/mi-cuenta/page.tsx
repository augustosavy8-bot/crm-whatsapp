import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { currentAlumno } from "@/lib/alumno";
import { getGymContext } from "@/lib/gym";
import { hoyISOArgentina } from "@/lib/tz";
import { cuotaPorVencer } from "@/lib/gymCuota";
import { mpHabilitadoParaAlumno } from "@/lib/gymMpPrueba";
import ClasesFlow from "@/components/gimnasio/ClasesFlow";
import CompletarTelefono from "@/components/gimnasio/CompletarTelefono";
import MiRutina, { type UltimoLog } from "@/components/gimnasio/MiRutina";
import type { RutinaDia } from "@/lib/gymRutina";
import { rutinaHabilitadaParaAlumno } from "@/lib/gymRutinaPrueba";
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
  const alumno = await currentAlumno();
  if (!alumno) redirect("/login");

  const cuota = estadoCuota(alumno.cuota_hasta);
  const primerNombre = alumno.nombre.split(" ")[0];

  // Contexto del gym y precio del plan en paralelo (son independientes).
  const svc = createServiceClient();
  const [gym, alPlan] = await Promise.all([
    getGymContext(),
    svc
      .from("gym_alumnos")
      .select("plan:gym_planes(precio)")
      .eq("id", alumno.id)
      .maybeSingle()
      .then((r) => r.data),
  ]);
  const montoARS =
    (alPlan?.plan as unknown as { precio: number } | null)?.precio ?? null;

  // Rutina del alumno (si el staff le armó una) + último registro por ejercicio.
  // En prueba: solo se muestra para el perfil de alumno habilitado.
  const ultimosLogs: Record<string, UltimoLog> = {};
  let rutina: { nombre: string; dias: unknown } | null = null;
  if (rutinaHabilitadaParaAlumno(alumno.telefono)) {
    const { data } = await svc
      .from("gym_rutinas")
      .select("nombre, dias")
      .eq("alumno_id", alumno.id)
      .maybeSingle();
    rutina = data as { nombre: string; dias: unknown } | null;

    if (rutina) {
      const { data: logs } = await svc
        .from("gym_rutina_logs")
        .select("ejercicio_id, fecha, peso, reps, created_at")
        .eq("alumno_id", alumno.id)
        .order("fecha", { ascending: false })
        .order("created_at", { ascending: false });
      for (const l of (logs ?? []) as {
        ejercicio_id: string;
        fecha: string;
        peso: string | null;
        reps: string | null;
      }[]) {
        // El primero que aparece por ejercicio es el más reciente (orden desc).
        if (!ultimosLogs[l.ejercicio_id]) {
          ultimosLogs[l.ejercicio_id] = { fecha: l.fecha, peso: l.peso, reps: l.reps };
        }
      }
    }
  }

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
        mostrarPago={
          cuotaPorVencer(alumno.cuota_hasta) &&
          mpHabilitadoParaAlumno(alumno.telefono)
        }
      />

      {alumno.telefono ? (
        <ClasesFlow
          gimnasioNombre={gym?.nombre ?? "KINACTIVA"}
          sesion={{ nombre: alumno.nombre, telefono: alumno.telefono }}
        />
      ) : (
        <CompletarTelefono />
      )}

      {rutina && (
        <MiRutina
          nombre={(rutina.nombre as string) ?? "Rutina"}
          dias={((rutina.dias as unknown as RutinaDia[]) ?? [])}
          ultimos={ultimosLogs}
        />
      )}

      <InstruccionesInstalar />
    </main>
  );
}
