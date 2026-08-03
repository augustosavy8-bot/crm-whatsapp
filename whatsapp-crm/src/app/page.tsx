import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentAgent } from "@/lib/agent";
import { getCurrentAlumno } from "@/lib/alumno";
import { getModulosTenant } from "@/lib/modulos";

// La raíz separa los mundos por rol:
//   sin sesión   -> login (la página principal del sitio es el ingreso)
//   alumno       -> su panel (mis reservas / cuota)
//   profesional  -> panel del gimnasio (staff)
//   owner        -> dashboard de mensajes, o la agenda si el tenant
//                   no tiene el módulo de inbox
export default async function Home() {
  const supabase = await createClient();
  const agent = await getCurrentAgent(supabase);
  if (agent) {
    // El dueño con panel de estadísticas cae ahí (puede navegar al resto).
    if (agent.panel_stats) redirect("/panel");
    // Staff del gym que no es owner (profesional) aterriza en el panel de gym.
    if (agent.role === "profesional") redirect("/gym");
    const { inbox } = await getModulosTenant(supabase);
    redirect(inbox ? "/dashboard" : "/turnos");
  }

  // Sin agente: puede ser un alumno logueado o alguien sin sesión.
  const alumno = await getCurrentAlumno(supabase);
  if (alumno) redirect("/mi-cuenta");
  // Sin sesión: la página principal es el login (la landing pública sigue en
  // /gimnasio para quien tenga el link directo).
  redirect("/login");
}
