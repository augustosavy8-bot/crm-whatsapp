import { redirect } from "next/navigation";
import { currentUser } from "@/lib/agent";
import { currentAlumno } from "@/lib/alumno";
import { puntosHabilitadoParaAlumno } from "@/lib/gymPuntosPrueba";
import { getMisReservas, getHorariosDia } from "@/lib/gymCupo";
import { hoyISOArgentina, horaActualArgentina } from "@/lib/tz";
import { createServiceClient } from "@/lib/supabase/service";
import CheckinFlow, { type Clase } from "@/components/gimnasio/CheckinFlow";

export const dynamic = "force-dynamic";

// Pantalla a la que llega el socio al escanear el QR del gimnasio o tocar su chip
// NFC (ambos apuntan a /checkin). Resuelve sus clases de HOY y le deja marcar la
// asistencia. Si no tiene turno reservado, igual puede marcar "Vine a entrenar"
// contra la clase en curso. Gateada a las cuentas de prueba por ahora.
export default async function CheckinPage() {
  // Sin sesión: mandamos al login pero volvemos acá después de ingresar.
  const user = await currentUser();
  if (!user) redirect("/login?next=/checkin");

  // Con sesión pero sin ficha de socio (staff/owner/profe): el check-in por QR
  // es para socios. Mostramos un aviso claro en vez de rebotar al login.
  const alumno = await currentAlumno();
  if (!alumno) {
    return (
      <main className="mx-auto max-w-md px-4 pb-16 pt-6 sm:pt-8">
        <h1 className="text-xl font-bold tracking-tight">Check-in</h1>
        <div className="mt-5 rounded-panel border border-line bg-surface p-4 text-[13px] text-muted shadow-card">
          <p className="font-semibold text-ink">Esta cuenta no es de socio.</p>
          <p className="mt-1">
            El check-in por QR lo usan los socios para marcar su asistencia.
            Estás con una cuenta de staff: el ranking y el QR para imprimir los
            tenés en la pestaña <b className="text-ink">Puntos</b> del panel.
          </p>
          <div className="mt-3">
            <a
              href="/gym"
              className="inline-block rounded-full bg-ink px-4 py-2 text-[13px] font-bold text-white"
            >
              Ir al panel
            </a>
          </div>
        </div>
      </main>
    );
  }

  if (!puntosHabilitadoParaAlumno(alumno.telefono, alumno.email))
    redirect("/mi-cuenta");

  const hoy = hoyISOArgentina();
  const ahora = horaActualArgentina(); // "HH:MM:SS"
  const diaSemana = new Date(`${hoy}T12:00:00Z`).getUTCDay();

  // Reservas de hoy (fijo de hoy o suelta de hoy) + horarios activos del día.
  const [reservas, horariosHoy] = await Promise.all([
    alumno.telefono ? getMisReservas(alumno.telefono) : Promise.resolve([]),
    getHorariosDia(alumno.tenant_id, hoy),
  ]);
  const deHoy = reservas.filter(
    (r) =>
      (r.tipo === "suelta" && r.fecha === hoy) ||
      (r.tipo === "fijo" && r.dia_semana === diaSemana),
  );

  // Asistencias ya marcadas hoy (para no duplicar y mostrar "ya registraste").
  const svc = createServiceClient();
  const { data: yaMarcadas } = await svc
    .from("gym_asistencias")
    .select("horario_id, estado")
    .eq("alumno_id", alumno.id)
    .eq("fecha", hoy);
  const presentes = new Set(
    ((yaMarcadas ?? []) as { horario_id: string; estado: string }[])
      .filter((a) => a.estado === "presente")
      .map((a) => a.horario_id),
  );
  const yaRegistroHoy = presentes.size > 0;

  let clases: Clase[];
  if (deHoy.length > 0) {
    // Caso normal: tiene turno(s) reservado(s) hoy. Marca por clase.
    const porHorario = new Map<string, Clase>();
    for (const r of deHoy) {
      if (!porHorario.has(r.horario_id)) {
        porHorario.set(r.horario_id, {
          horarioId: r.horario_id,
          horaInicio: r.hora_inicio,
          horaFin: r.hora_fin,
          tipo: r.tipo,
          yaPresente: presentes.has(r.horario_id),
        });
      }
    }
    clases = [...porHorario.values()];
  } else {
    // Sin reserva: ofrece "Vine a entrenar" contra la clase en curso. Si no hay
    // clase justo ahora (fuera de horario), deja elegir entre las del día.
    const claseAhora = horariosHoy.find(
      (h) => h.hora_inicio <= ahora && ahora < h.hora_fin,
    );
    const base = claseAhora ? [claseAhora] : horariosHoy;
    clases = base.map((h) => ({
      horarioId: h.horario_id,
      horaInicio: h.hora_inicio,
      horaFin: h.hora_fin,
      tipo: "libre" as const,
      yaPresente: presentes.has(h.horario_id),
    }));
  }

  clases.sort((a, b) => a.horaInicio.localeCompare(b.horaInicio));

  return <CheckinFlow clases={clases} yaRegistroHoy={yaRegistroHoy} />;
}
