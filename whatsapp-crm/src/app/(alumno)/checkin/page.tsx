import { redirect } from "next/navigation";
import { currentAlumno } from "@/lib/alumno";
import { puntosHabilitadoParaAlumno } from "@/lib/gymPuntosPrueba";
import { getMisReservas } from "@/lib/gymCupo";
import { hoyISOArgentina } from "@/lib/tz";
import { createServiceClient } from "@/lib/supabase/service";
import CheckinFlow from "@/components/gimnasio/CheckinFlow";

export const dynamic = "force-dynamic";

// Pantalla a la que llega el socio al escanear el QR del gimnasio o tocar su chip
// NFC (ambos apuntan a /checkin). Resuelve sus clases de HOY y le deja marcar la
// asistencia. Gateada a la cuenta de prueba por ahora.
export default async function CheckinPage() {
  const alumno = await currentAlumno();
  if (!alumno) redirect("/login");
  if (!puntosHabilitadoParaAlumno(alumno.telefono)) redirect("/mi-cuenta");

  const hoy = hoyISOArgentina();
  const diaSemana = new Date(`${hoy}T12:00:00Z`).getUTCDay();

  const reservas = alumno.telefono ? await getMisReservas(alumno.telefono) : [];
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

  // Dedup por horario (por si hay fijo + suelta en el mismo horario).
  const porHorario = new Map<
    string,
    { horarioId: string; horaInicio: string; horaFin: string; tipo: "fijo" | "suelta"; yaPresente: boolean }
  >();
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
  const clases = [...porHorario.values()].sort((a, b) =>
    a.horaInicio.localeCompare(b.horaInicio),
  );

  return <CheckinFlow clases={clases} />;
}
