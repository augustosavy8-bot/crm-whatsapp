import { redirect } from "next/navigation";
import { createServiceClient } from "@/lib/supabase/service";
import { currentAlumno } from "@/lib/alumno";
import { getGymContext } from "@/lib/gym";
import { hoyISOArgentina } from "@/lib/tz";
import { cuotaPorVencer } from "@/lib/gymCuota";
import { mpHabilitadoParaAlumno } from "@/lib/gymMpPrueba";
import { mpGymConectado } from "@/lib/mpCuentas";
import { puntosHabilitadoParaAlumno } from "@/lib/gymPuntosPrueba";
import { calcularRankingMes, type FilaPuntos } from "@/lib/gymPuntos";
import PuntosSocio from "@/components/gimnasio/PuntosSocio";
import PuntosTabla from "@/components/gimnasio/PuntosTabla";
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
  const [gym, alPlan, mpConectado] = await Promise.all([
    getGymContext(),
    svc
      .from("gym_alumnos")
      .select("plan:gym_planes(precio)")
      .eq("id", alumno.id)
      .maybeSingle()
      .then((r) => r.data),
    mpGymConectado(alumno.tenant_id),
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

  // Puntos (gateado a la cuenta de prueba): ranking del mes desde la asistencia
  // que ya se registra (gym_asistencias, 'presente'). Se calcula server-side con
  // el service client porque arma el ranking de todos los socios del tenant.
  let puntos: { ranking: FilaPuntos[]; mesLabel: string } | null = null;
  if (puntosHabilitadoParaAlumno(alumno.telefono)) {
    const hoy = hoyISOArgentina();
    const anio = Number(hoy.slice(0, 4));
    const mes = Number(hoy.slice(5, 7));
    const inicio = `${anio}-${String(mes).padStart(2, "0")}-01`;
    const nAnio = mes === 12 ? anio + 1 : anio;
    const nMes = mes === 12 ? 1 : mes + 1;
    const fin = `${nAnio}-${String(nMes).padStart(2, "0")}-01`;
    const [asisRes, alumnosRes] = await Promise.all([
      svc
        .from("gym_asistencias")
        .select("alumno_id, fecha")
        .eq("tenant_id", alumno.tenant_id)
        .eq("estado", "presente")
        .gte("fecha", inicio)
        .lt("fecha", fin),
      svc.from("gym_alumnos").select("id, nombre").eq("tenant_id", alumno.tenant_id),
    ]);
    const nombres = new Map(
      ((alumnosRes.data ?? []) as { id: string; nombre: string }[]).map((a) => [
        a.id,
        a.nombre,
      ]),
    );
    const ranking = calcularRankingMes(
      ((asisRes.data ?? []) as { alumno_id: string; fecha: string }[]).map((r) => ({
        alumno_id: r.alumno_id,
        fecha: r.fecha,
        nombre: nombres.get(r.alumno_id) ?? "Socio",
      })),
    );
    const mesLabel = new Intl.DateTimeFormat("es-AR", {
      timeZone: "America/Argentina/Buenos_Aires",
      month: "long",
      year: "numeric",
    }).format(new Date(`${hoy}T12:00:00Z`));
    puntos = { ranking, mesLabel };
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
          mpHabilitadoParaAlumno(alumno.telefono) &&
          mpConectado
        }
      />

      {puntos && (
        <PuntosSocio
          ranking={puntos.ranking}
          miAlumnoId={alumno.id}
          mesLabel={puntos.mesLabel}
        />
      )}

      {alumno.telefono ? (
        <ClasesFlow
          gimnasioNombre={gym?.nombre ?? "KINACTIVA"}
          sesion={{ nombre: alumno.nombre, telefono: alumno.telefono }}
        />
      ) : (
        <CompletarTelefono />
      )}

      {puntos && (
        <PuntosTabla ranking={puntos.ranking} miAlumnoId={alumno.id} />
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
